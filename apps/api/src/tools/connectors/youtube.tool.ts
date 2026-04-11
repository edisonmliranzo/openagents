import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  const clean = input.trim()
  // Full URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^&]*&)*v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = clean.match(p)
    if (m) return m[1]
  }
  // Bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return clean
  return null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\n/g, ' ')
    .trim()
}

/** Parse YouTube timed-text XML into [{start, duration, text}] */
function parseTranscriptXml(xml: string): Array<{ start: number; duration: number; text: string }> {
  const entries: Array<{ start: number; duration: number; text: string }> = []
  const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(xml)) !== null) {
    entries.push({
      start: parseFloat(m[1]),
      duration: parseFloat(m[2]),
      text: decodeHtmlEntities(m[3]),
    })
  }
  return entries
}

function secondsToTimestamp(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch YouTube page HTML and extract the timedtext (caption) URL */
async function fetchCaptionUrl(videoId: string): Promise<{ captionUrl: string; title: string; channel: string } | null> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`
  const res = await fetchWithTimeout(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) return null

  const html = await res.text()

  // Extract title
  const titleMatch = html.match(/"title":"([^"]+)"/)
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : ''

  // Extract channel name
  const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/)
  const channel = channelMatch ? decodeHtmlEntities(channelMatch[1]) : ''

  // Extract ytInitialPlayerResponse JSON blob
  const jsonMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*(?:var|window|if)[\s({]|$)/s)
  if (!jsonMatch) return null

  let playerResponse: any
  try {
    playerResponse = JSON.parse(jsonMatch[1])
  } catch {
    return null
  }

  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(captions) || captions.length === 0) return null

  // Prefer English, fall back to first available
  const en = captions.find((c: any) => c.languageCode?.startsWith('en')) ?? captions[0]
  const baseUrl: string = en?.baseUrl
  if (!baseUrl) return null

  // Force fmt=xml and lang=en for consistency
  const url = new URL(baseUrl)
  url.searchParams.set('fmt', 'xml')
  url.searchParams.set('lang', en.languageCode ?? 'en')

  return { captionUrl: url.toString(), title, channel }
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

@Injectable()
export class YoutubeTool {

  get summarizeDef(): ToolDefinition {
    return {
      name: 'youtube_summarize',
      displayName: 'YouTube Summarizer',
      description: 'Fetch the transcript of any YouTube video and return timestamped text chunks so the agent can summarize it. Works without an API key.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          url:   { type: 'string', description: 'YouTube URL or video ID' },
          chunk_minutes: { type: 'number', description: 'Group transcript into N-minute chunks (default 2)' },
        },
        required: ['url'],
      },
    }
  }

  async summarize(
    input: { url: string; chunk_minutes?: number },
    _userId: string,
  ): Promise<ToolResult> {
    const videoId = extractVideoId(input.url ?? '')
    if (!videoId) {
      return { success: false, output: null, error: 'Could not extract a valid YouTube video ID from the provided URL.' }
    }

    const chunkSecs = Math.max(30, (Number(input.chunk_minutes ?? 2)) * 60)

    let captionMeta: Awaited<ReturnType<typeof fetchCaptionUrl>>
    try {
      captionMeta = await fetchCaptionUrl(videoId)
    } catch (err: any) {
      return { success: false, output: null, error: `Failed to load YouTube page: ${err?.message ?? 'unknown error'}` }
    }

    if (!captionMeta) {
      return {
        success: false,
        output: null,
        error: 'No captions/transcript available for this video. The video may be private, age-restricted, or captions may be disabled.',
      }
    }

    let xmlText: string
    try {
      const xmlRes = await fetchWithTimeout(captionMeta.captionUrl)
      if (!xmlRes.ok) {
        return { success: false, output: null, error: `Transcript fetch failed: HTTP ${xmlRes.status}` }
      }
      xmlText = await xmlRes.text()
    } catch (err: any) {
      return { success: false, output: null, error: `Transcript fetch error: ${err?.message ?? 'unknown'}` }
    }

    const entries = parseTranscriptXml(xmlText)
    if (entries.length === 0) {
      return { success: false, output: null, error: 'Transcript parsed but contained no text entries.' }
    }

    // Group into chunks
    const chunks: Array<{ timestamp: string; start: number; text: string }> = []
    let chunkStart = 0
    let chunkBuf: string[] = []

    for (const entry of entries) {
      if (entry.start >= chunkStart + chunkSecs && chunkBuf.length > 0) {
        chunks.push({ timestamp: secondsToTimestamp(chunkStart), start: chunkStart, text: chunkBuf.join(' ') })
        chunkStart = entry.start
        chunkBuf = []
      }
      if (entry.text.trim()) chunkBuf.push(entry.text.trim())
    }
    if (chunkBuf.length > 0) {
      chunks.push({ timestamp: secondsToTimestamp(chunkStart), start: chunkStart, text: chunkBuf.join(' ') })
    }

    const totalSeconds = entries[entries.length - 1].start + entries[entries.length - 1].duration
    const duration = secondsToTimestamp(totalSeconds)

    return {
      success: true,
      output: {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: captionMeta.title,
        channel: captionMeta.channel,
        duration,
        totalWords: entries.reduce((n, e) => n + e.text.split(/\s+/).length, 0),
        chunks,
        instruction: 'Summarize this transcript in 5 bullet points. For each bullet, include the most relevant timestamp in [MM:SS] format.',
      },
    }
  }

  // ── Transcript only (raw, no chunking) ─────────────────────────────────────

  get transcriptDef(): ToolDefinition {
    return {
      name: 'youtube_transcript',
      displayName: 'YouTube Transcript',
      description: 'Get the full raw transcript of a YouTube video with timestamps.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'YouTube URL or video ID' },
        },
        required: ['url'],
      },
    }
  }

  async transcript(input: { url: string }, _userId: string): Promise<ToolResult> {
    const videoId = extractVideoId(input.url ?? '')
    if (!videoId) return { success: false, output: null, error: 'Invalid YouTube URL or video ID.' }

    let captionMeta: Awaited<ReturnType<typeof fetchCaptionUrl>>
    try {
      captionMeta = await fetchCaptionUrl(videoId)
    } catch (err: any) {
      return { success: false, output: null, error: `Failed to load YouTube page: ${err?.message ?? 'unknown error'}` }
    }
    if (!captionMeta) return { success: false, output: null, error: 'No captions available for this video.' }

    const xmlRes = await fetchWithTimeout(captionMeta.captionUrl)
    if (!xmlRes.ok) return { success: false, output: null, error: `HTTP ${xmlRes.status} fetching transcript.` }
    const xmlText = await xmlRes.text()
    const entries = parseTranscriptXml(xmlText)

    return {
      success: true,
      output: {
        videoId,
        title: captionMeta.title,
        channel: captionMeta.channel,
        transcript: entries.map((e) => ({ t: secondsToTimestamp(e.start), text: e.text })),
      },
    }
  }
}
