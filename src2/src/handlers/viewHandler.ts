import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow } from '@/types/grid';
import type { Label, SavedQuery } from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

const VIEW_TYPE_MAP: Record<number, string> = {
  0: 'Public',
  1: 'Advanced Find',
  2: 'Associated',
  4: 'Quick Find',
  16: 'Address Book',
  32: 'Sub Grid',
  64: 'Lookup',
  128: 'Offline Filters',
  256: 'Offline Template',
  1024: 'Saved Filters',
  2048: 'Multi-entity Lookup',
  4096: 'Custom Defined',
  8192: 'Outlook',
  32768: 'Service Appointment Book',
  131072: 'Power BI',
  262144: 'Modern Search',
  1048576: 'Copilot',
};

function toGridRow(view: SavedQuery, labels: Label): GridRow | null {
  const localizedLabels = labels.LocalizedLabels ?? [];
  if (localizedLabels.length === 0) {
    return null;
  }

  return {
    id: view.savedqueryid,
    schemaName: VIEW_TYPE_MAP[view.querytype] ?? `Type ${view.querytype}`,
    labels: localizedLabelsToMap(localizedLabels),
    meta: {
      querytype: view.querytype,
      labels,
    },
  };
}

export const viewHandler: IHandler = {
  async load(context: HandlerContext) {
    const views = await dataverseService.getSavedQueries(context.entityLogicalName);

    const rows = await Promise.all(
      views.map(async view => {
        const response = await dataverseService.retrieveLocLabels(
          'savedqueries',
          view.savedqueryid,
          'name',
          true
        );
        return toGridRow(view, response.Label);
      })
    );

    return {
      rows: rows.filter((row): row is GridRow => row !== null),
    };
  },

  async save(rows, changes, context) {
    if (changes.length === 0) {
      return;
    }

    const changesByRow = groupChangesByRow(changes);
    let hasUpdates = false;

    for (const [rowId, rowChanges] of changesByRow) {
      const row = rows.find(r => r.id === rowId);
      const labels = row?.meta?.labels as Label | undefined;
      const localizedLabels = labels?.LocalizedLabels;
      if (!localizedLabels) {
        continue;
      }

      const hasRowUpdates = applyChanges(rowChanges, localizedLabels);
      if (!hasRowUpdates) {
        continue;
      }

      await dataverseService.setLocLabels({
        labels: localizedLabels,
        entityMoniker: {
          '@odata.type': 'Microsoft.Dynamics.CRM.savedquery',
          savedqueryid: rowId,
        },
        attributeName: 'name',
      });

      hasUpdates = true;
    }

    if (hasUpdates) {
      await publishService.publishEntity(context.entityLogicalName);
    }
  },
};
