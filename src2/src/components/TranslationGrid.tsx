import React, { useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import type { GridRow, CellChange } from '@/types/grid';
import type { LanguageLocale } from '@/types/dataverse';

interface TranslationGridProps {
  rows: GridRow[];
  installedLanguages: LanguageLocale[];
  baseLanguage: number;
  userLanguage: number;
  onCellChange: (change: CellChange) => void;
  loading?: boolean;
}

/** Flatten hierarchical GridRow[] into flat array with treePath for AG Grid Tree Data */
interface FlatGridRow extends GridRow {
  treePath: string[];
}

function flattenRows(rows: GridRow[], parentPath: string[] = []): FlatGridRow[] {
  const result: FlatGridRow[] = [];
  for (const row of rows) {
    const treePath = [...parentPath, row.schemaName];
    result.push({ ...row, treePath });
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
        editable: true,
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

  // Tree data config
  const autoGroupColumnDef = useMemo<ColDef<FlatGridRow>>(() => ({
    headerName: 'Component',
    minWidth: 300,
    cellRendererParams: { suppressCount: true },
  }), []);

  const getDataPath = useCallback((data: FlatGridRow) => data.treePath, []);

  const treeDataProps = isTree ? {
    treeData: true as const,
    getDataPath,
    groupDefaultExpanded: -1,
    autoGroupColumnDef,
  } : {};

  return (
    <div className="ag-theme-alpine" style={{ flex: 1, width: '100%' }}>
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        pinnedBottomRowData={pinnedBottomRowData}
        onCellValueChanged={onCellValueChanged}
        onGridReady={onGridReady}
        loading={loading}
        getRowId={(params) => params.data.id}
        animateRows={false}
        {...treeDataProps}
      />
    </div>
  );
};
