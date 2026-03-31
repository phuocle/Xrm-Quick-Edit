import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow, MetadataComponent } from '@/types/grid';
import type { AttributeMetadata, Label, LocalizedLabel } from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

function getExcludedColumns(attributes: AttributeMetadata[]): Set<string> {
  const excluded = new Set<string>();

  for (const attribute of attributes) {
    if (attribute.FormulaDefinition) {
      if (attribute.AttributeType === 'Money') {
        excluded.add(`${attribute.SchemaName}_Base`);
        excluded.add(`${attribute.SchemaName}_Date`);
        excluded.add(`${attribute.SchemaName}_State`);
      } else {
        excluded.add(`${attribute.SchemaName}_Date`);
        excluded.add(`${attribute.SchemaName}_State`);
      }
    } else if (attribute.IsRenameable && !attribute.IsRenameable.Value) {
      excluded.add(attribute.SchemaName);
    } else if (attribute.AttributeType === 'BigInt') {
      excluded.add(attribute.SchemaName);
    }
  }

  return excluded;
}

function getLabelContainer(attribute: AttributeMetadata, component: MetadataComponent): Label | null {
  return attribute[component] ?? null;
}

function getLocalizedLabelsForUpdate(
  attribute: AttributeMetadata,
  component: MetadataComponent
): LocalizedLabel[] | null {
  const container = getLabelContainer(attribute, component);
  if (!container) {
    return null;
  }

  if (!container.LocalizedLabels) {
    container.LocalizedLabels = [];
  }

  return container.LocalizedLabels;
}

function buildRows(attributes: AttributeMetadata[], component: MetadataComponent): GridRow[] {
  const excluded = getExcludedColumns(attributes);
  const rows: GridRow[] = [];

  for (const attribute of attributes) {
    if (excluded.has(attribute.SchemaName)) {
      continue;
    }

    const labels = getLabelContainer(attribute, component)?.LocalizedLabels;
    if (!labels || labels.length === 0) {
      continue;
    }

    rows.push({
      id: attribute.MetadataId,
      schemaName: attribute.SchemaName,
      labels: localizedLabelsToMap(labels),
      meta: { attribute },
    });
  }

  return rows;
}

export const attributeHandler: IHandler = {
  async load(context: HandlerContext) {
    const attributes = await dataverseService.getAttributes(context.entityLogicalName);
    const customizable = attributes.filter(a => a.IsCustomizable?.Value !== false);
    customizable.sort((a, b) => a.SchemaName.localeCompare(b.SchemaName));

    return {
      rows: buildRows(customizable, context.selectedComponent),
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
      const attribute = row?.meta?.attribute as AttributeMetadata | undefined;
      if (!attribute) {
        continue;
      }

      const labels = getLocalizedLabelsForUpdate(attribute, context.selectedComponent);
      if (!labels) {
        continue;
      }

      const hasAttributeUpdate = applyChanges(rowChanges, labels);
      if (!hasAttributeUpdate) {
        continue;
      }

      await dataverseService.updateAttribute(
        context.entityLogicalName,
        attribute.MetadataId,
        attribute
      );
      hasUpdates = true;
    }

    if (hasUpdates) {
      await publishService.publishEntity(context.entityLogicalName);
    }
  },
};
