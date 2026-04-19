/**
 * Streaming Types for OpenAgents
 * Real-time token-by-token streaming for tool results and agent responses
 */

export enum StreamFormat {
  SSE = 'sse',
  WEBSOCKET = 'websocket',
  WebSocket = 'webSocket',
  POLLING = 'polling',
}

export enum StreamEventType {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  
  // Token streaming
  TOKEN = 'token',
  TOOL_TOKEN = 'tool_token',
  
  // Tool events
  TOOL_CALL_START = 'tool_call_start',
  TOOL_CALL_PROGRESS = 'tool_call_progress',
  TOOL_CALL_COMPLETE = 'tool_call_complete',
  TOOL_CALL_ERROR = 'tool_call_error',
  
  // Message events
  MESSAGE_START = 'message_start',
  MESSAGE_DELTA = 'message_delta',
  MESSAGE_COMPLETE = 'message_complete',
  
  // Status events
  THINKING = 'thinking',
  PROCESSING = 'processing',
  IDLE = 'idle',
  
  // Control events
  ABORT = 'abort',
  PAUSE = 'pause',
  RESUME = 'resume',
}

export interface StreamConfig {
  format: StreamFormat;
  chunkSize?: number;
  enableBackpressure?: boolean;
  reconnectOnError?: boolean;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface StreamConnection {
  id: string;
  sessionId: string;
  userId: string;
  format: StreamFormat;
  isActive: boolean;
  connectedAt: Date;
  lastActivityAt: Date;
  bytesSent: number;
  tokensSent: number;
}

export interface StreamToken {
  value: string;
  index: number;
  isFinal: boolean;
  metadata?: {
    type?: 'text' | 'reasoning' | 'tool_call' | 'tool_result';
    toolName?: string;
    confidence?: number;
  };
}

export interface ToolStreamEvent {
  toolName: string;
  toolCallId: string;
  eventType: StreamEventType;
  data?: unknown;
  timestamp: Date;
  progress?: number; // 0-100
}

export interface StreamMessage {
  type: StreamEventType;
  sessionId: string;
  timestamp: Date;
  data?: unknown;
  sequenceNumber: number;
}

export interface StreamingMetrics {
  activeConnections: number;
  totalBytesSent: number;
  totalTokensSent: number;
  averageLatency: number;
  connectionsByFormat: Record<StreamFormat, number>;
  errorsByType: Record<string, number>;
}

export interface StreamingSession {
  id: string;
  sessionId: string;
  userId: string;
  isStreaming: boolean;
  bufferSize: number;
  droppedTokens: number;
  lastTokenAt?: Date;
}

export interface StreamFilter {
  includeTypes?: StreamEventType[];
  excludeTypes?: StreamEventType[];
  includeTools?: string[];
  excludeTools?: string[];
  minTokenLength?: number;
}

export interface StreamSubscription {
  id: string;
  connectionId: string;
  sessionId: string;
  filter?: StreamFilter;
  createdAt: Date;
}

export interface StreamingPolicy {
  maxConnectionsPerUser: number;
  maxConnectionsPerSession: number;
  maxBufferSize: number;
  defaultChunkSize: number;
  enableMetrics: boolean;
  rateLimitPerSecond: number;
}

export interface StreamMetrics {
  bytesPerSecond: number;
  tokensPerSecond: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  errorRate: number;
}
