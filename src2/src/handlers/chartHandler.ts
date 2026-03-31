import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow } from '@/types/grid';
import type { Label, SavedQueryVisualization } from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

function toGridRow(chart: SavedQueryVisualization, labels: Label): GridRow | null {
  const localizedLabels = labels.LocalizedLabels ?? [];
  if (localizedLabels.length === 0) {
    return null;
  }

  return {
    id: chart.savedqueryvisualizationid,
    schemaName: 'Chart',
    labels: localizedLabelsToMap(localizedLabels),
    meta: {
      labels,
    },
  };
}

export const chartHandler: IHandler = {
  async load(context: HandlerContext) {
    const charts = await dataverseService.getSavedQueryVisualizations(context.entityLogicalName);

    const rows = await Promise.all(
      charts.map(async chart => {
        const response = await dataverseService.retrieveLocLabels(
          'savedqueryvisualizations',
          chart.savedqueryvisualizationid,
          'name',
          true
        );
        return toGridRow(chart, response.Label);
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
          '@odata.type': 'Microsoft.Dynamics.CRM.savedqueryvisualization',
          savedqueryvisualizationid: rowId,
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
