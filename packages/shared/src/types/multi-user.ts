/**
 * Multi-User Support Types for OpenAgents
 * Team management with role-based access control
 */

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  GUEST = 'guest',
}

export enum TeamStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  status: TeamStatus;
  ownerId: string;
  settings: TeamSettings;
  limits: TeamLimits;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSettings {
  defaultRole: UserRole;
  allowPublicSharing: boolean;
  requireApprovalForNewMembers: boolean;
  enableTeamMemory: boolean;
  enableTeamAnalytics: boolean;
  notificationSettings: NotificationSettings;
}

export interface TeamLimits {
  maxMembers: number;
  maxWorkspaces: number;
  maxStorage: number; // in bytes
  maxApiCallsPerMonth: number;
  maxConcurrentAgents: number;
}

export interface NotificationSettings {
  emailOnNewMember: boolean;
  emailOnRoleChange: boolean;
  emailOnTeamUpdate: boolean;
  pushOnMentions: boolean;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: UserRole;
  status: 'active' | 'invited' | 'suspended';
  joinedAt: Date;
  invitedBy?: string;
  lastActiveAt?: Date;
  personalMemoryEnabled: boolean;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export interface TeamWorkspace {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description?: string;
  isDefault: boolean;
  members: TeamWorkspaceMember[];
  settings: TeamWorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamWorkspaceMember {
  userId: string;
  role: UserRole;
  addedAt: Date;
  addedBy: string;
}

export interface TeamWorkspaceSettings {
  defaultAgentPreset?: string;
  defaultTheme?: string;
  enableSharing: boolean;
  allowGuestAccess: boolean;
}

export interface RolePermissions {
  [key: string]: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canAdmin: boolean;
  };
}

export interface TeamAnalytics {
  teamId: string;
  period: {
    start: Date;
    end: Date;
  };
  activeUsers: number;
  totalSessions: number;
  totalTokenUsage: number;
  totalCost: number;
  mostUsedAgents: { agentId: string; count: number }[];
  userEngagement: {
    veryActive: number;
    active: number;
    occasional: number;
    inactive: number;
  };
}

export interface MemberMetrics {
  userId: string;
  teamId: string;
  totalSessions: number;
  totalTokenUsage: number;
  totalCost: number;
  lastActiveAt: Date;
  role: UserRole;
}

export interface TeamFilter {
  status?: TeamStatus[];
  searchQuery?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface MemberFilter {
  teamId?: string;
  role?: UserRole[];
  status?: string[];
  isPersonalMemoryEnabled?: boolean;
}

export type TeamEventType =
  | 'team.created'
  | 'team.updated'
  | 'team.member.added'
  | 'team.member.removed'
  | 'team.member.role_changed'
  | 'team.invitation.sent'
  | 'team.invitation.accepted'
  | 'team.workspace.created';

export interface TeamEvent {
  type: TeamEventType;
  teamId: string;
  userId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
