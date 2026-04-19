/**
 * Notion Connector Types for OpenAgents
 * Read pages, create/update database entries
 */

export enum NotionObjectType {
  PAGE = 'page',
  DATABASE = 'database',
  BLOCK = 'block',
}

export interface NotionConfig {
  apiKey: string;
  integrationName: string;
}

export interface NotionPage {
  id: string;
  url: string;
  title: string;
  properties: Record<string, NotionProperty>;
  createdTime: Date;
  lastEditedTime: Date;
  archived: boolean;
  parent: NotionParent;
  cover?: NotionFile;
  icon?: NotionIcon;
  children?: NotionBlock[];
}

export interface NotionDatabase {
  id: string;
  url: string;
  title: string;
  properties: Record<string, NotionProperty>;
  createdTime: Date;
  lastEditedTime: Date;
  archived: boolean;
  parent: NotionParent;
  cover?: NotionFile;
  icon?: NotionIcon;
}

export interface NotionParent {
  type: 'page_id' | 'database_id' | 'workspace';
  pageId?: string;
  databaseId?: string;
}

export interface NotionProperty {
  id: string;
  type: NotionPropertyType;
  name: string;
}

export type NotionPropertyType = 
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'relation'
  | 'lookup'
  | 'formula'
  | 'rollup'
  | 'created_time'
  | 'last_edited_time'
  | 'created_by'
  | 'last_edited_by'
  | 'files'
  | 'person'
  | 'people';

export interface NotionPropertyValue {
  type: NotionPropertyType;
  title?: { text: { content: string } }[];
  rich_text?: { text: { content: string } }[];
  number?: number;
  select?: { name: string; color?: string };
  multi_select?: { name: string; color?: string }[];
  date?: { start: string; end?: string };
  checkbox?: boolean;
  url?: string;
  email?: string;
  phone_number?: string;
  files?: NotionFile[];
  person?: { name: string; email?: string };
  people?: { name: string; email?: string }[];
  created_time?: string;
  last_edited_time?: string;
  created_by?: { name: string };
  last_edited_by?: { name: string };
}

export interface NotionFile {
  type: 'file' | 'external';
  name: string;
  url: string;
  expiryTime?: Date;
}

export interface NotionIcon {
  type: 'emoji' | 'external';
  emoji?: string;
  external?: { url: string };
}

export interface NotionBlock {
  id: string;
  type: NotionBlockType;
  hasChildren: boolean;
  children?: NotionBlock[];
  content?: Record<string, unknown>;
}

export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'toggle'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'table'
  | 'table_row'
  | 'image'
  | 'video'
  | 'bookmark'
  | 'link_to_page'
  | 'child_page'
  | 'child_database';

export interface DatabaseQuery {
  databaseId: string;
  filter?: NotionFilter;
  sorts?: NotionSort[];
  startCursor?: string;
  pageSize?: number;
}

export interface NotionFilter {
  property: string;
  type: NotionPropertyType;
  filter: {
    operator: 'equals' | 'does_not_equal' | 'contains' | 'does_not_contain' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
    value: unknown;
  };
}

export interface NotionSort {
  property: string;
  direction: 'ascending' | 'descending';
}

export interface NotionDatabaseRow {
  id: string;
  url: string;
  properties: Record<string, NotionPropertyValue>;
  createdTime: Date;
  lastEditedTime: Date;
}

export interface NotionMetrics {
  totalPages: number;
  totalDatabases: number;
  totalBlocks: number;
  pagesByParent: Record<string, number>;
}

export interface NotionSearchFilter {
  filter: {
    value: string;
    property: 'title' | 'object';
  };
  sort: {
    direction: 'ascending' | 'descending';
    timestamp: 'last_edited_time';
  };
  pageSize: number;
}

export type NotionEventType =
  | 'notion.page.created'
  | 'notion.page.updated'
  | 'notion.page.deleted'
  | 'notion.database.row_created'
  | 'notion.database.row_updated'
  | 'notion.block.created'
  | 'notion.block.updated';

export interface NotionEvent {
  type: NotionEventType;
  objectId: string;
  objectType: NotionObjectType;
  timestamp: Date;
  data?: Record<string, unknown>;
}
