/**
 * Stripe Webhook Listener Types for OpenAgents
 * Payment event handling and workflow triggering
 */

export enum StripeEventType {
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED = 'payment_intent.failed',
  PAYMENT_INTENT_CREATED = 'payment_intent.created',
  CHARGE_SUCCEEDED = 'charge.succeeded',
  CHARGE_FAILED = 'charge.failed',
  CHARGE_REFUNDED = 'charge.refunded',
  CUSTOMER_SUBSCRIPTION_CREATED = 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_UPDATED = 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED = 'customer.subscription.deleted',
  INVOICE_CREATED = 'invoice.created',
  INVOICE_PAYMENT_SUCCEEDED = 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
  CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed',
}

export enum StripeObjectType {
  PAYMENT_INTENT = 'payment_intent',
  CHARGE = 'charge',
  CUSTOMER = 'customer',
  SUBSCRIPTION = 'subscription',
  INVOICE = 'invoice',
  CHECKOUT_SESSION = 'checkout_session',
  REFUND = 'refund',
}

export interface StripeWebhookEvent {
  id: string;
  type: StripeEventType;
  created: Date;
  objectType: StripeObjectType;
  data: StripeEventData;
  processedAt?: Date;
  status: 'received' | 'processed' | 'failed';
  error?: string;
  workflowTriggered?: string;
  workflowResult?: string;
}

export interface StripeEventData {
  object: StripePaymentObject;
  previousAttributes?: Record<string, unknown>;
}

export interface StripePaymentObject {
  id: string;
  object: StripeObjectType | string;
  amount: number;
  currency: string;
  status: string;
  customer?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, string>;
  created: number;
  livemode: boolean;
  receiptUrl?: string;
}

export interface PaymentIntent extends StripePaymentObject {
  object: 'payment_intent';
  paymentMethod?: string;
  paymentMethodTypes: string[];
  clientSecret?: string;
  cancelAt?: number;
  cancellationReason?: string;
  captureMethod: 'automatic' | 'manual';
  confirmationMethod: 'automatic' | 'manual';
  lastPaymentError?: {
    code: string;
    message: string;
    type: string;
  };
}

export interface Charge extends StripePaymentObject {
  object: 'charge';
  paymentMethod: string;
  receiptNumber?: string;
  refunded: boolean;
  refunds?: {
    data: Refund[];
  };
  billingDetails?: {
    address?: {
      city?: string;
      country?: string;
      line1?: string;
      line2?: string;
      postalCode?: string;
      state?: string;
    };
    email?: string;
    name?: string;
    phone?: string;
  };
}

export interface Refund {
  id: string;
  amount: number;
  currency: string;
  status: string;
  charge: string;
  reason?: string;
  created: number;
}

export interface Subscription {
  id: string;
  object: 'subscription';
  customer: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  plan: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
  };
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, string>;
}

export interface StripeConfig {
  webhookSecret: string;
  apiKey: string;
  endpointSecret?: string;
}

export interface StripeWorkflowTrigger {
  id: string;
  eventType: StripeEventType;
  agentPrompt: string;
  isActive: boolean;
  filter?: {
    customerId?: string;
    amountMin?: number;
    amountMax?: number;
    currency?: string;
  };
  createdAt: Date;
}

export interface StripeMetrics {
  totalEvents: number;
  eventsByType: Record<StripeEventType, number>;
  processedEvents: number;
  failedEvents: number;
  workflowTriggers: number;
  totalPaymentVolume: number;
  successfulPayments: number;
  failedPayments: number;
}

export interface PaymentAnalytics {
  totalRevenue: number;
  successfulPayments: number;
  failedPayments: number;
  refundedAmount: number;
  averageTransactionValue: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByCustomer: { customerId: string; revenue: number }[];
}

export interface StripeFilter {
  eventType?: StripeEventType[];
  status?: ('received' | 'processed' | 'failed')[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  customerId?: string;
}

export type StripeEventStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'failed';

export interface StripeWebhookLog {
  id: string;
  eventId: string;
  eventType: StripeEventType;
  receivedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  status: StripeEventStatus;
  error?: string;
  retryCount: number;
  requestPayload?: string;
  responsePayload?: string;
}
