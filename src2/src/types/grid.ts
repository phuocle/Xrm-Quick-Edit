/** Mot row trong AG Grid */
export interface GridRow {
  id: string;                          // Unique row ID
  schemaName: string;                  // Display name / schema name
  labels: Record<number, string>;      // LCID -> Label text
  children?: GridRow[];                // Hierarchical data (Form, BPF)
  meta?: Record<string, unknown>;      // Original metadata de dung khi Save
  type?: string;                       // Handler type (dung cho AllInOne)
}

/** Thay doi cua 1 cell */
export interface CellChange {
  rowId: string;
  lcid: number;
  oldValue: string;
  newValue: string;
}

/** Ket qua cua handler load */
export interface LoadResult {
  rows: GridRow[];
  columns?: ColumnDef[];               // Override columns neu can
}

/** Column definition cho AG Grid */
export interface ColumnDef {
  field: string;
  headerName: string;
  editable: boolean;
  width?: number;
  pinned?: 'left' | 'right';
}

/** Translation type enum */
export type TranslationType =
  | 'attributes'
  | 'options'
  | 'globalOptionSets'
  | 'forms'
  | 'dashboards'
  | 'formMeta'
  | 'entityMeta'
  | 'views'
  | 'charts'
  | 'relationships'
  | 'bpf'
  | 'sitemap'
  | 'content'
  | 'webresources'
  | 'allInOne';

/** Metadata label component selector used by multiple handlers */
export type MetadataComponent =
  | 'DisplayName'
  | 'Description';

/** Property editor property type */
export type PropertyType =
  | 'attributes'
  | 'entities';
