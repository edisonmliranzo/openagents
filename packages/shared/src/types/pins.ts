/**
 * Pinned Messages Types for OpenAgents
 * Persistent sidebar panel for reference messages
 */

export interface PinnedMessage {
  id: string;
  messageId: string;
  userId: string;
  workspaceId?: string;
  title?: string;
  note?: string;
  pinnedAt: Date;
  position: number;
  isArchived: boolean;
}

export interface PinGroup {
  id: string;
  userId: string;
  name: string;
  description?: string;
  messageIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PinnedMessageWithContext {
  pinnedMessage: PinnedMessage;
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    sessionId: string;
    metadata?: Record<string, unknown>;
  };
}

export interface PinFilter {
  userId?: string;
  workspaceId?: string;
  isArchived?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  searchQuery?: string;
}

export interface PinReorderRequest {
  pinId: string;
  newPosition: number;
}

export interface BulkPinRequest {
  messageIds: string[];
  groupId?: string;
}

export interface PinMetrics {
  totalPins: number;
  activePins: number;
  archivedPins: number;
  pinsByGroup: number;
  averagePinsPerSession: number;
}

export interface SidebarConfig {
  isVisible: boolean;
  position: 'left' | 'right';
  width: number;
  defaultView: 'all' | 'groups' | 'recent';
  maxPinsVisible: number;
  compactMode: boolean;
}

export type PinEventType =
  | 'pin.added'
  | 'pin.removed'
  | 'pin.archived'
  | 'pin.unarchived'
  | 'pin.reordered'
  | 'pin.grouped';

export interface PinEvent {
  type: PinEventType;
  pinId: string;
  messageId: string;
  userId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
