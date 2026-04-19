/**
 * Email Inbound (Catch-All) Types for OpenAgents
 * Dedicated email address for triggering agent runs
 */

export enum EmailProvider {
  SENDGRID = 'sendgrid',
  MAILGUN = 'mailgun',
  POSTMARK = 'postmark',
  AWS_SES = 'aws_ses',
  SMTP = 'smtp',
}

export enum EmailDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum EmailStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  FILTERED = 'filtered',
  SPAM = 'spam',
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content: string; // base64 encoded
  contentId?: string;
}

export interface Email {
  id: string;
  messageId: string;
  threadId?: string;
  
  // Addresses
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  
  // Content
  subject: string;
  body: {
    text: string;
    html?: string;
  };
  
  // Metadata
  direction: EmailDirection;
  status: EmailStatus;
  priority: 'low' | 'normal' | 'high';
  
  // Attachments
  attachments: EmailAttachment[];
  hasAttachments: boolean;
  
  // Context
  agentRunId?: string;
  sessionId?: string;
  userId?: string;
  
  // Headers
  headers: Record<string, string>;
  inReplyTo?: string;
  references?: string[];
  
  // Timestamps
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface InboundEmail {
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  attachments: EmailAttachment[];
  headers: Record<string, string>;
  envelope?: {
    from: string;
    to: string[];
  };
  messageId: string;
  timestamp: number;
}

export interface EmailConfig {
  provider: EmailProvider;
  apiKey?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  smtpConfig?: SMTPConfig;
  catchAllDomain: string;
  bounceAddress?: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailWorkflowTrigger {
  id: string;
  name: string;
  isActive: boolean;
  
  // Matching
  matchSubject?: string;
  matchFrom?: string;
  matchTo?: string;
  matchHasAttachment?: boolean;
  matchAttachmentTypes?: string[];
  
  // Action
  agentPrompt: string;
  createSession: boolean;
  replyWithResult: boolean;
  notifyChannels?: ('email' | 'push' | 'in_app')[];
  
  // Filter
  maxEmailsPerHour?: number;
  requireVerification?: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailProcessingResult {
  emailId: string;
  agentRunId?: string;
  sessionId?: string;
  replyEmail?: {
    to: EmailAddress;
    subject: string;
    body: string;
  };
  error?: string;
  processedAt: Date;
}

export interface EmailMetrics {
  totalEmails: number;
  inboundEmails: number;
  outboundEmails: number;
  processedEmails: number;
  failedEmails: number;
  spamEmails: number;
  workflowTriggers: number;
  averageProcessingTime: number;
  emailsByStatus: Record<EmailStatus, number>;
}

export interface EmailFilter {
  direction?: EmailDirection[];
  status?: EmailStatus[];
  userId?: string;
  sessionId?: string;
  subject?: string;
  fromEmail?: string;
  hasAttachments?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: {
    name: string;
    description: string;
    defaultValue?: string;
  }[];
  isActive: boolean;
  createdAt: Date;
}

export interface CatchAllConfig {
  domain: string;
  isActive: boolean;
  defaultWorkflowTriggerId?: string;
  blockList: string[];
  allowList: string[];
  spamFilterEnabled: boolean;
  maxAttachmentSize: number; // in bytes
  allowedAttachmentTypes: string[];
}

export interface EmailForwardingRule {
  id: string;
  fromEmail: string;
  toEmail: string;
  isActive: boolean;
  createdAt: Date;
}

export type EmailEventType =
  | 'email.received'
  | 'email.processing'
  | 'email.processed'
  | 'email.failed'
  | 'email.reply_sent'
  | 'email.workflow.triggered'
  | 'email.spam.detected';

export interface EmailEvent {
  type: EmailEventType;
  emailId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
