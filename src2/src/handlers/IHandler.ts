import type { GridRow, CellChange, LoadResult } from '@/types/grid';

/**
 * Moi handler implement interface nay.
 * Handler la PURE — khong goi UI, chi nhan context va tra ve data.
 */
export interface IHandler {
  /** Load data tu Dataverse, tra ve rows cho grid */
  load(context: HandlerContext): Promise<LoadResult>;

  /** Save changes nguoc lai Dataverse */
  save(
    rows: GridRow[],
    changes: CellChange[],
    context: HandlerContext
  ): Promise<void>;

  /**
   * (Optional) Co cho phep chon component cu the khong?
   * Vi du: FormHandler cho chon form, ContentSnippetHandler cho chon record
   */
  supportsComponentSelection?: boolean;

  /**
   * (Optional) Load danh sach components de user chon
   * Vi du: danh sach forms, danh sach views
   */
  loadComponents?(context: HandlerContext): Promise<ComponentOption[]>;
}

/** Option cho component selector */
export interface ComponentOption {
  id: string;
  name: string;
  type?: number;   // Form type, view type, etc.
}

/** Context passed to handlers — subset of AppContext relevant to data operations */
export interface HandlerContext {
  entityLogicalName: string;
  installedLanguages: number[];
  baseLanguage: number;
  solutionId?: string;
  selectedComponentId?: string;
}
