import React, { useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellValueChangedEvent,
  FirstDataRenderedEvent,
  GridReadyEvent,
  GridSizeChangedEvent,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import type { GridRow, CellChange } from '@/types/grid';
import type { LanguageLocale } from '@/types/dataverse';
import './TranslationGrid.css';

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
      : `value = ${row.schemaName}`;

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
        editable: false,
        minWidth: 170,
        flex: 1,
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
        minWidth: 120,
        flex: 1,
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

  const fitColumns = useCallback(() => {
    gridRef.current?.api.sizeColumnsToFit();
  }, []);

  const onGridReady = useCallback((_event: GridReadyEvent) => {
    fitColumns();
  }, [fitColumns]);

  const onFirstDataRendered = useCallback((_event: FirstDataRenderedEvent) => {
    fitColumns();
  }, [fitColumns]);

  const onGridSizeChanged = useCallback((_event: GridSizeChangedEvent) => {
    fitColumns();
  }, [fitColumns]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
    filter: true,
  }), []);

  // Keep hierarchical rows flattened for compatibility with PPTB-hosted webview.
  const treeDataProps = {};

  const rowClassRules = useMemo(() => ({
    'xqt-parent-row': (params: { data?: FlatGridRow }) => {
      if (!params.data || params.data.id === '__summary__') {
        return false;
      }

      return !!params.data.children && params.data.children.length > 0;
    },
  }), []);

  return (
    <div className="ag-theme-quartz xqt-grid-theme">
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowClassRules={rowClassRules}
        pinnedBottomRowData={pinnedBottomRowData}
        onCellValueChanged={onCellValueChanged}
        onGridReady={onGridReady}
        onFirstDataRendered={onFirstDataRendered}
        onGridSizeChanged={onGridSizeChanged}
        loading={loading}
        overlayNoRowsTemplate="<span style='padding:8px;color:#475467;'>No data</span>"
        getRowId={(params) => params.data.id}
        animateRows={false}
        suppressHorizontalScroll
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
