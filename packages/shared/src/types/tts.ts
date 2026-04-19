/**
 * Text-to-Speech Types for OpenAgents
 * Voice output capabilities for agent responses
 */

export enum TTSProvider {
  ELEVENLABS = 'elevenlabs',
  OPENAI = 'openai',
  GOOGLE = 'google',
  AZURE = 'azure',
  COQUI = 'coqui',
  MIMIC3 = 'mimic3',
}

export enum VoiceGender {
  MALE = 'male',
  FEMALE = 'female',
  NEUTRAL = 'neutral',
}

export interface TTSVoiceConfig {
  provider: TTSProvider;
  voiceId?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  gender?: VoiceGender;
}

export interface TTSRequest {
  text: string;
  voice?: TTSVoiceConfig;
  outputFormat?: 'mp3' | 'wav' | 'ogg' | 'webm';
  sampleRate?: number;
  sessionId?: string;
  userId?: string;
}

export interface TTSResponse {
  audioUrl: string;
  duration: number;
  format: string;
  provider: TTSProvider;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

export interface VoicePreset {
  id: string;
  name: string;
  provider: TTSProvider;
  voiceId: string;
  language: string;
  speed: number;
  pitch: number;
  isDefault?: boolean;
}

export interface StreamingTTSChunk {
  audioData: string; // base64 encoded audio chunk
  timestamp: number;
  isFinal: boolean;
}

export interface TTSSession {
  id: string;
  userId: string;
  isActive: boolean;
  currentVoice?: TTSVoiceConfig;
  startedAt: Date;
  lastActivityAt: Date;
}

export interface TTSSettings {
  enabled: boolean;
  autoPlay: boolean;
  defaultVoice?: VoicePreset;
  volume: number;
  playbackSpeed: number;
  interruptOnKeypress: boolean;
  showTranscription: boolean;
}

export interface VoiceActivityDetection {
  enabled: boolean;
  silenceThreshold: number;
  maxSilenceDuration: number;
  wakeWord?: string;
}

export interface TTSMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  mostUsedVoice?: string;
  usageByProvider: Record<TTSProvider, number>;
}

export type TTSEventType = 
  | 'tts.started'
  | 'tts.completed'
  | 'tts.error'
  | 'tts.streaming'
  | 'tts.interrupted';

export interface TTSEvent {
  type: TTSEventType;
  sessionId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
