import type { CellChange } from '@/types/grid';
import type { LocalizedLabel } from '@/types/dataverse';

export function groupChangesByRow(changes: CellChange[]): Map<string, CellChange[]> {
  const byRow = new Map<string, CellChange[]>();

  for (const change of changes) {
    const rowChanges = byRow.get(change.rowId);
    if (rowChanges) {
      rowChanges.push(change);
    } else {
      byRow.set(change.rowId, [change]);
    }
  }

  return byRow;
}

export function applyChanges(changes: CellChange[], labels: LocalizedLabel[]): boolean {
  let hasAppliedChanges = false;

  for (const change of changes) {
    // Keep legacy behavior: empty labels are skipped.
    if (!change.newValue) {
      continue;
    }

    const existing = labels.find(l => l.LanguageCode === change.lcid);
    if (existing) {
      if (existing.Label !== change.newValue) {
        existing.Label = change.newValue;
        existing.HasChanged = true;
        hasAppliedChanges = true;
      }
      continue;
    }

    labels.push({
      LanguageCode: change.lcid,
      Label: change.newValue,
      HasChanged: true,
      IsManaged: false,
      MetadataId: '',
    });
    hasAppliedChanges = true;
  }

  return hasAppliedChanges;
}

export function localizedLabelsToMap(labels?: LocalizedLabel[] | null): Record<number, string> {
  const result: Record<number, string> = {};
  for (const label of labels ?? []) {
    result[label.LanguageCode] = label.Label;
  }
  return result;
}
