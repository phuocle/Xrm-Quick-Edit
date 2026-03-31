import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow, MetadataComponent } from '@/types/grid';
import type { EntityMetadata, Label, LocalizedLabel } from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

type EntityEditableField = 'DisplayName' | 'Description' | 'DisplayCollectionName';

function fieldLabel(field: EntityEditableField): string {
  if (field === 'Description') {
    return 'Description';
  }
  if (field === 'DisplayCollectionName') {
    return 'Collection Name';
  }
  return 'Display Name';
}

function getLabelContainer(entity: EntityMetadata, field: EntityEditableField): Label | null {
  return entity[field] ?? null;
}

function getLocalizedLabelsForUpdate(entity: EntityMetadata, field: EntityEditableField): LocalizedLabel[] | null {
  const container = getLabelContainer(entity, field);
  if (!container) {
    return null;
  }

  if (!container.LocalizedLabels) {
    container.LocalizedLabels = [];
  }

  return container.LocalizedLabels;
}

function buildRows(entity: EntityMetadata, selectedComponent: MetadataComponent): GridRow[] {
  const rows: GridRow[] = [];

  const firstField: EntityEditableField = selectedComponent;
  rows.push({
    id: `${entity.MetadataId}|1`,
    schemaName: fieldLabel(firstField),
    labels: localizedLabelsToMap(getLabelContainer(entity, firstField)?.LocalizedLabels),
    meta: { field: firstField },
  });

  rows.push({
    id: `${entity.MetadataId}|2`,
    schemaName: fieldLabel('DisplayCollectionName'),
    labels: localizedLabelsToMap(entity.DisplayCollectionName?.LocalizedLabels),
    meta: { field: 'DisplayCollectionName' },
  });

  return rows;
}

export const entityHandler: IHandler = {
  async load(context: HandlerContext) {
    const entity = await dataverseService.getEntityMetadata(context.entityLogicalName);
    return {
      rows: buildRows(entity, context.selectedComponent),
    };
  },

  async save(rows, changes, context) {
    if (changes.length === 0) {
      return;
    }

    const entity = await dataverseService.getEntityMetadata(context.entityLogicalName);
    const changesByRow = groupChangesByRow(changes);
    let hasUpdates = false;

    for (const [rowId, rowChanges] of changesByRow) {
      const row = rows.find(r => r.id === rowId);
      const field = row?.meta?.field as EntityEditableField | undefined;
      if (!field) {
        continue;
      }

      const labels = getLocalizedLabelsForUpdate(entity, field);
      if (!labels) {
        continue;
      }

      const hasRowUpdates = applyChanges(rowChanges, labels);
      if (hasRowUpdates) {
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      return;
    }

    await dataverseService.updateEntity(entity.MetadataId, entity);
    await publishService.publishEntity(context.entityLogicalName);
  },
};
