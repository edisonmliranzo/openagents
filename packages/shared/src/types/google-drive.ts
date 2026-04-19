/**
 * Google Drive Connector Types for OpenAgents
 * Read/write documents, sheets, and slides
 */

export enum GoogleDriveFileType {
  DOCUMENT = 'document',
  SPREADSHEET = 'spreadsheet',
  PRESENTATION = 'presentation',
  FOLDER = 'folder',
  FILE = 'file',
}

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  type: GoogleDriveFileType;
  size: number;
  createdTime: Date;
  modifiedTime: Date;
  shared: boolean;
  parents: string[];
  thumbnailUrl?: string;
  webViewUrl?: string;
  webContentLink?: string;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  parentId?: string;
  createdTime: Date;
  modifiedTime: Date;
}

export interface GoogleDriveQuery {
  query?: string;
  folderId?: string;
  fileTypes?: GoogleDriveFileType[];
  mimeTypes?: string[];
  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface GoogleDocContent {
  documentId: string;
  title: string;
  body: {
    content: DocElement[];
  };
  revisionId?: string;
  lastRevisionTime?: Date;
}

export interface DocElement {
  type: string;
  text?: string;
  content?: DocElement[];
  paragraph?: {
    elements?: DocElement[];
    bullet?: {
      listId?: string;
    };
  };
  table?: {
    tableRows?: {
      tableCells?: {
        content?: DocElement[];
      }[];
    }[];
  };
}

export interface GoogleSheetContent {
  spreadsheetId: string;
  title: string;
  sheets: Sheet[];
}

export interface Sheet {
  sheetId: number;
  title: string;
  index: number;
  gridProperties?: {
    rowCount: number;
    columnCount: number;
    frozenRowCount?: number;
    frozenColumnCount?: number;
  };
  data: GridData[];
}

export interface GridData {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
  rowData?: RowData[];
}

export interface RowData {
  values: CellData[];
}

export interface CellData {
  formattedValue?: string;
  note?: string;
  hyperlink?: string;
  effectiveFormat?: CellFormat;
}

export interface CellFormat {
  backgroundColor?: { red: number; green: number; blue: number };
  textFormat?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    fontSize?: number;
    fontFamily?: string;
    foregroundColor?: { red: number; green: number; blue: number };
  };
}

export interface GoogleSlideContent {
  presentationId: string;
  title: string;
  slides: Slide[];
}

export interface Slide {
  slideId: string;
  position: number;
  title?: string;
  elements: Element[];
}

export interface Element {
  type: string;
  id: string;
  transform: {
    scaleX: number;
    scaleY: number;
    translateX: number;
    translateY: number;
    unit: string;
  };
  content?: {
    text?: string;
    imageUrl?: string;
  };
}

export interface FileUploadOptions {
  name: string;
  mimeType: string;
  parentFolderId?: string;
  description?: string;
}

export interface FileUpdateOptions {
  name?: string;
  description?: string;
  parentFolderId?: string;
}

export interface GoogleDriveMetrics {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  byType: Record<GoogleDriveFileType, number>;
}

export type GoogleDriveEventType =
  | 'drive.file.created'
  | 'drive.file.updated'
  | 'drive.file.deleted'
  | 'drive.file.shared'
  | 'drive.folder.created';

export interface GoogleDriveEvent {
  type: GoogleDriveEventType;
  fileId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
