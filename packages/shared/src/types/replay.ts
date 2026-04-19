/**
 * Session Replay Types for OpenAgents
 * Step-through debugging of past conversations
 */

export enum ReplayState {
  LOADING = 'loading',
  READY = 'ready',
  PLAYING = 'playing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

export interface ReplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sequenceNumber: number;
}

export interface ReplayToolCall {
  id: string;
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  output?: ToolOutput;
  error?: string;
  duration?: number;
}

export interface ToolOutput {
  toolCallId: string;
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReplaySession {
  id: string;
  originalSessionId: string;
  userId: string;
  workspaceId?: string;
  
  // Messages
  messages: ReplayMessage[];
  totalMessages: number;
  currentMessageIndex: number;
  
  // Tool calls
  toolCalls: ReplayToolCall[];
  currentToolCallIndex: number;
  
  // State
  state: ReplayState;
  playbackSpeed: number;
  isAutoPlay: boolean;
  
  // Context
  agentPreset?: string;
  systemPrompt?: string;
  contextWindow?: number;
  
  // Metadata
  startedAt: Date;
  completedAt?: Date;
  totalDuration?: number;
}

export interface ReplayFrame {
  sessionId: string;
  index: number;
  type: 'message' | 'tool_call_start' | 'tool_call_output' | 'tool_call_error';
  timestamp: Date;
  data: ReplayMessage | ReplayToolCall;
  context: {
    tokenCount: number;
    totalTokens: number;
    availableTokens: number;
  };
}

export interface ReplayBreakpoint {
  id: string;
  sessionId: string;
  index: number;
  type: 'message' | 'tool_call' | 'all';
  condition?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ReplayVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  value: unknown;
  scope: 'global' | 'local';
}

export interface ReplayContext {
  sessionId: string;
  variables: ReplayVariable[];
  messages: ReplayMessage[];
  toolCalls: ReplayToolCall[];
  currentIndex: number;
}

export interface ReplayFilter {
  userId?: string;
  sessionId?: string;
  agentPreset?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  hasErrors?: boolean;
}

export interface ReplayMetrics {
  totalReplays: number;
  averageReplayDuration: number;
  mostReplayedSessions: string[];
  errorsEncountered: number;
}

export interface ReplayAnnotation {
  id: string;
  sessionId: string;
  index: number;
  type: 'note' | 'flag' | 'bookmark';
  content: string;
  author: string;
  createdAt: Date;
}

export type ReplayEventType =
  | 'replay.loaded'
  | 'replay.play'
  | 'replay.pause'
  | 'replay.seek'
  | 'replay.breakpoint.hit'
  | 'replay.completed';

export interface ReplayEvent {
  type: ReplayEventType;
  sessionId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
