/**
 * Pure ffmpeg argument construction for the narration-video renderer.
 * Dependency-free so the test suite can cover arg-building and escaping
 * without shelling out to ffmpeg.
 */

export const VIDEO_ORIENTATIONS = {
  vertical: { width: 1080, height: 1920, label: 'Vertical (9:16 — TikTok/Reels/Stories)' },
  square: { width: 1080, height: 1080, label: 'Square (1:1 — feed posts)' },
  landscape: { width: 1920, height: 1080, label: 'Landscape (16:9 — YouTube)' },
} as const

export type VideoOrientation = keyof typeof VIDEO_ORIENTATIONS

const ORIENTATION_VALUES = new Set(Object.keys(VIDEO_ORIENTATIONS))

export function resolveOrientation(input?: string): VideoOrientation {
  const value = String(input ?? '').trim().toLowerCase()
  return ORIENTATION_VALUES.has(value) ? (value as VideoOrientation) : 'vertical'
}

/**
 * Escape text for ffmpeg's drawtext filter. The filter argument is inside a
 * single-quoted -vf value, so we must survive: quotes, colons, backslashes,
 * and percent-expansion.
 */
export function escapeDrawText(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, ' ')
    .trim()
}

export function truncateTitle(text: string, max = 90): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.max(1, max - 3))}...`
}

export interface VideoRenderSpec {
  orientation: VideoOrientation
  audioPath: string
  outputPath: string
  backgroundImagePath?: string | null
  titleText?: string | null
  /** Solid background color (hex, no #) used when no image is provided. */
  fallbackColor?: string
  /** Font family passed to drawtext (Windows-safe default). */
  fontName?: string
}

const DEFAULT_COLOR = '0x111827'

/** Build the ffmpeg argv that renders still-background + narration -> mp4. */
export function buildRenderArgs(spec: VideoRenderSpec): string[] {
  const dims = VIDEO_ORIENTATIONS[spec.orientation]
  const color = /^0x[0-9a-fA-F]{6}$/.test(String(spec.fallbackColor)) ? spec.fallbackColor! : DEFAULT_COLOR
  const args: string[] = ['-y']

  if (spec.backgroundImagePath) {
    args.push('-loop', '1', '-i', spec.backgroundImagePath)
  } else {
    args.push('-f', 'lavfi', '-i', `color=c=${color}:s=${dims.width}x${dims.height}:r=30`)
  }
  args.push('-i', spec.audioPath)

  args.push('-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest')

  const title = truncateTitle(spec.titleText ?? '')
  if (title) {
    const font = spec.fontName ?? 'Arial'
    const filter =
      `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,` +
      `pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2,` +
      `drawtext=text='${escapeDrawText(title)}':font='${font}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h*0.14`
    args.push('-vf', filter)
  } else {
    args.push('-vf', `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2`)
  }

  args.push('-s', `${dims.width}x${dims.height}`, spec.outputPath)
  return args
}
