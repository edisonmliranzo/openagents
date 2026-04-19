/**
 * Conversation Search Types for OpenAgents
 * Full-text search across all past conversations
 */

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  pagination?: PaginationOptions;
  sortBy?: SortOption;
}

export interface SearchFilters {
  userId?: string;
  workspaceId?: string;
  sessionIds?: string[];
  agentPresets?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  messageRoles?: ('user' | 'assistant' | 'system')[];
  hasAttachments?: boolean;
  hasTools?: boolean;
  minTokenLength?: number;
  maxTokenLength?: number;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
  offset?: number;
}

export interface SortOption {
  field: 'timestamp' | 'relevance' | 'tokenCount';
  order: 'asc' | 'desc';
}

export interface SearchResult {
  messageId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  highlightedSnippets: HighlightedSnippet[];
  relevanceScore: number;
  metadata?: {
    tokenCount?: number;
    toolsUsed?: string[];
    attachments?: string[];
  };
}

export interface HighlightedSnippet {
  text: string;
  matchStart: number;
  matchEnd: number;
  contextBefore?: string;
  contextAfter?: string;
}

export interface SearchResultSet {
  query: string;
  totalResults: number;
  results: SearchResult[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  searchDuration: number;
  facets?: SearchFacets;
}

export interface SearchFacets {
  byDate: Record<string, number>;
  byRole: Record<string, number>;
  byAgentPreset: Record<string, number>;
  byWorkspace: Record<string, number>;
}

export interface SearchIndexEntry {
  messageId: string;
  sessionId: string;
  userId: string;
  workspaceId?: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata: {
    agentPreset?: string;
    tokenCount: number;
    toolsUsed?: string[];
    attachments?: string[];
  };
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  query: SearchQuery;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export interface SearchMetrics {
  totalSearches: number;
  averageResultsPerSearch: number;
  averageSearchDuration: number;
  topQueries: { query: string; count: number }[];
  zeroResultQueries: number;
}

export interface SearchSuggestion {
  type: 'query' | 'filter' | 'recent';
  value: string;
  score: number;
}

export type SearchEventType =
  | 'search.executed'
  | 'search.saved'
  | 'search.deleted'
  | 'search.result_clicked';

export interface SearchEvent {
  type: SearchEventType;
  userId: string;
  query: string;
  resultCount: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}
