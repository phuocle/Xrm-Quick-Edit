import React, { useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import type { GridRow, CellChange } from '@/types/grid';
import type { LanguageLocale } from '@/types/dataverse';

interface TranslationGridProps {
  rows: GridRow[];
  installedLanguages: LanguageLocale[];
  baseLanguage: number;
  userLanguage: number;
  onCellChange: (change: CellChange) => void;
  loading?: boolean;
  emptyMessage?: string;
}

/** Flatten hierarchical GridRow[] into flat array with treePath for AG Grid Tree Data */
interface FlatGridRow extends GridRow {
  treePath: string[];
}

function flattenRows(rows: GridRow[], parentPath: string[] = []): FlatGridRow[] {
  const result: FlatGridRow[] = [];
  for (const row of rows) {
    const level = parentPath.length;
    const treePath = [...parentPath, row.schemaName];
    const visibleSchemaName = level === 0
      ? row.schemaName
      : `${' '.repeat(level * 2)}↳ ${row.schemaName}`;

    result.push({ ...row, schemaName: visibleSchemaName, treePath });
    if (row.children) {
      result.push(...flattenRows(row.children, treePath));
    }
  }
  return result;
}

function hasHierarchy(rows: GridRow[]): boolean {
  return rows.some(r => r.children && r.children.length > 0);
}

export const TranslationGrid: React.FC<TranslationGridProps> = ({
  rows,
  installedLanguages,
  baseLanguage,
  userLanguage,
  onCellChange,
  loading,
  emptyMessage,
}) => {
  const gridRef = useRef<AgGridReact>(null);

  // Build column definitions from installed languages
  const columnDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        field: 'schemaName',
        headerName: 'Schema Name',
        pinned: 'left',
        editable: false,
        width: 250,
        lockPosition: true,
      },
    ];

    for (const lang of installedLanguages) {
      const isBase = lang.localeid === baseLanguage;
      cols.push({
        field: `labels.${lang.localeid}`,
        headerName: `${lang.name} (${lang.code})${isBase ? ' [Base]' : ''}`,
        editable: (params) => {
          if (!params.data || params.data.id === '__summary__') {
            return false;
          }

          return !params.data.children || params.data.children.length === 0;
        },
        width: 200,
        cellClassRules: {
          'changed-cell': (params) => {
            const original = params.data?._original?.[lang.localeid];
            const current = params.value;
            return original !== undefined && original !== current;
          },
        },
      });
    }

    return cols;
  }, [installedLanguages, baseLanguage, userLanguage]);

  // Transform rows for AG Grid
  const isTree = useMemo(() => hasHierarchy(rows), [rows]);
  const rowData = useMemo(() => {
    const flat: FlatGridRow[] = isTree
      ? flattenRows(rows)
      : rows.map(r => ({ ...r, treePath: [r.schemaName] }));
    // Store original values for change highlighting
    return flat.map(row => ({
      ...row,
      _original: { ...row.labels },
    }));
  }, [rows, isTree]);

  // Summary row
  const pinnedBottomRowData = useMemo(() => {
    if (rows.length === 0) return [];
    const flatRows = isTree ? flattenRows(rows) : rows;
    const leafRows = flatRows.filter(r => !r.children || r.children.length === 0);
    return [{
      id: '__summary__',
      schemaName: `Summary (${leafRows.length} rows)`,
      labels: Object.fromEntries(
        installedLanguages.map(lang => {
          const filled = leafRows.filter(r => r.labels[lang.localeid]?.trim()).length;
          return [lang.localeid, `${filled}/${leafRows.length}`];
        })
      ),
    }];
  }, [rows, installedLanguages, isTree]);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const field = event.colDef.field;
    if (!field?.startsWith('labels.')) return;

    const lcid = parseInt(field.replace('labels.', ''));
    const change: CellChange = {
      rowId: event.data.id,
      lcid,
      oldValue: event.oldValue ?? '',
      newValue: event.newValue ?? '',
    };
    onCellChange(change);
  }, [onCellChange]);

  const onGridReady = useCallback((_event: GridReadyEvent) => {
    // Auto-size columns on first load
    // gridRef.current?.api.sizeColumnsToFit();
  }, []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
    filter: true,
  }), []);

  // Keep hierarchical rows flattened for compatibility with PPTB-hosted webview.
  const treeDataProps = {};

  const gridThemeStyle = useMemo(() => ({
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    minHeight: '360px',
    flex: 1,
    width: '100%',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #d0d7de',
    '--ag-background-color': '#ffffff',
    '--ag-foreground-color': '#1f2937',
    '--ag-header-background-color': '#f8fafc',
    '--ag-header-foreground-color': '#1f2937',
    '--ag-border-color': '#d0d7de',
    '--ag-row-hover-color': '#eef6ff',
  }), []);

  return (
    <div className="ag-theme-quartz" style={gridThemeStyle}>
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        pinnedBottomRowData={pinnedBottomRowData}
        onCellValueChanged={onCellValueChanged}
        onGridReady={onGridReady}
        loading={loading}
        overlayNoRowsTemplate="<span style='padding:8px;color:#475467;'>No data</span>"
        getRowId={(params) => params.data.id}
        animateRows={false}
        {...treeDataProps}
      />
      {!loading && rowData.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: '44px 0 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#667085',
            fontSize: '14px',
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '0 16px',
          }}
        >
          {emptyMessage ?? 'No data available.'}
        </div>
      )}
    </div>
  );
};
