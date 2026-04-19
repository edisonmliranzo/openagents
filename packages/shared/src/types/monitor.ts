/**
 * RSS / Web Monitor Types for OpenAgents
 * Watch URLs and feeds for changes, send alerts
 */

export enum MonitorType {
  RSS = 'rss',
  ATOM = 'atom',
  JSON = 'json',
  HTML = 'html',
  API = 'api',
}

export enum MonitorStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
  DISABLED = 'disabled',
}

export enum AlertChannel {
  EMAIL = 'email',
  PUSH = 'push',
  WEBHOOK = 'webhook',
  SMS = 'sms',
  IN_APP = 'in_app',
}

export interface Monitor {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: MonitorType;
  url: string;
  status: MonitorStatus;
  
  // Configuration
  checkInterval: number; // in minutes
  lastCheckAt?: Date;
  nextCheckAt?: Date;
  
  // Content tracking
  lastContent?: string;
  lastContentHash?: string;
  contentChanges: number;
  lastChangeAt?: Date;
  
  // Alerting
  alertChannels: AlertChannel[];
  alertRecipients: string[];
  webhookUrl?: string;
  alertOnChange: boolean;
  alertOnError: boolean;
  
  // Statistics
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  lastError?: string;
  
  // Metadata
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MonitorCheck {
  id: string;
  monitorId: string;
  status: 'success' | 'error' | 'changed';
  checkedAt: Date;
  duration: number;
  responseCode?: number;
  contentHash?: string;
  contentLength?: number;
  error?: string;
}

export interface FeedEntry {
  id: string;
  title: string;
  link: string;
  description?: string;
  content?: string;
  author?: string;
  publishedAt: Date;
  categories?: string[];
}

export interface MonitoredFeed {
  monitorId: string;
  title: string;
  link: string;
  description?: string;
  entries: FeedEntry[];
  lastUpdated: Date;
}

export interface WebPageContent {
  monitorId: string;
  url: string;
  title?: string;
  content: string;
  selectors?: string[];
  hash: string;
  checkedAt: Date;
}

export interface APIContent {
  monitorId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  hash: string;
  checkedAt: Date;
}

export interface ChangeAlert {
  id: string;
  monitorId: string;
  alertType: 'new_content' | 'removed_content' | 'error' | 'threshold_exceeded';
  oldContent?: string;
  newContent?: string;
  changeSummary: string;
  sentAt: Date;
  recipients: string[];
  status: 'sent' | 'failed' | 'pending';
}

export interface MonitorMetrics {
  totalMonitors: number;
  activeMonitors: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  totalAlerts: number;
  monitorsByType: Record<MonitorType, number>;
  monitorsByStatus: Record<MonitorStatus, number>;
}

export interface MonitorFilter {
  userId?: string;
  type?: MonitorType[];
  status?: MonitorStatus[];
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface CronExpression {
  expression: string;
  description: string;
  nextRunAt: Date;
}

export type MonitorEventType =
  | 'monitor.created'
  | 'monitor.check.completed'
  | 'monitor.change.detected'
  | 'monitor.alert.sent'
  | 'monitor.error'
  | 'monitor.paused'
  | 'monitor.resumed';

export interface MonitorEvent {
  type: MonitorEventType;
  monitorId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
