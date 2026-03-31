import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { CellChange, GridRow, MetadataComponent } from '@/types/grid';
import type {
  AttributeMetadata,
  Label,
  LocalizedLabel,
  OptionMetadata,
  OptionSetMetadata,
  UpdateOptionValueRequest,
} from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

const ID_SEPARATOR = '|';
const ATTRIBUTE_COMPONENT_TYPE = 2;
const OPTION_SET_COMPONENT_TYPE = 9;
const OPTION_ATTRIBUTE_TYPES = new Set([
  'Picklist',
  'Boolean',
  'Status',
  'State',
  'MultiSelectPicklist',
]);

type OptionComponent = 'Label' | 'Description';

function getOptionComponent(component: MetadataComponent): OptionComponent {
  return component === 'DisplayName' ? 'Label' : 'Description';
}

function getOptionValues(optionSet: OptionSetMetadata): OptionMetadata[] {
  if (optionSet.TrueOption && optionSet.FalseOption) {
    return [optionSet.TrueOption, optionSet.FalseOption];
  }

  return optionSet.Options ?? [];
}

function getLocalizedLabels(option: OptionMetadata, component: OptionComponent): LocalizedLabel[] {
  return option[component]?.LocalizedLabels ?? [];
}

function toLabelFromChanges(changes: CellChange[]): Label | null {
  const localizedLabels: LocalizedLabel[] = [];

  for (const change of changes) {
    if (!change.newValue) {
      continue;
    }

    localizedLabels.push({
      LanguageCode: change.lcid,
      Label: change.newValue,
      HasChanged: true,
      IsManaged: false,
      MetadataId: '',
    });
  }

  if (localizedLabels.length === 0) {
    return null;
  }

  return {
    LocalizedLabels: localizedLabels,
    UserLocalizedLabel: null,
  };
}

function buildRows(attributes: AttributeMetadata[], selectedComponent: MetadataComponent): GridRow[] {
  const optionComponent = getOptionComponent(selectedComponent);
  const rows: GridRow[] = [];

  for (const attribute of attributes) {
    const optionSet = attribute.OptionSet ?? attribute.GlobalOptionSet;
    if (!optionSet) {
      continue;
    }

    const options = getOptionValues(optionSet);
    if (options.length === 0) {
      continue;
    }

    const children: GridRow[] = options.map(option => ({
      id: `${attribute.MetadataId}${ID_SEPARATOR}${option.Value}`,
      schemaName: String(option.Value),
      labels: localizedLabelsToMap(getLocalizedLabels(option, optionComponent)),
      meta: {
        optionValue: option.Value,
      },
    }));

    rows.push({
      id: attribute.MetadataId,
      schemaName: attribute.LogicalName,
      labels: {},
      children,
      meta: {
        attribute,
      },
    });
  }

  return rows;
}

function parseCompoundId(id: string): { parentId: string; optionValue: number } | null {
  const separatorIndex = id.indexOf(ID_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }

  const parentId = id.slice(0, separatorIndex);
  const optionValue = Number.parseInt(id.slice(separatorIndex + 1), 10);
  if (Number.isNaN(optionValue)) {
    return null;
  }

  return { parentId, optionValue };
}

function isOptionSetAttribute(attribute: AttributeMetadata): boolean {
  const typeName = attribute.AttributeTypeName?.Value;
  if (typeName && OPTION_ATTRIBUTE_TYPES.has(typeName)) {
    return true;
  }

  if (attribute.AttributeType && OPTION_ATTRIBUTE_TYPES.has(attribute.AttributeType)) {
    return true;
  }

  return false;
}

function uniqueByMetadataId(attributes: AttributeMetadata[]): AttributeMetadata[] {
  const seen = new Set<string>();
  const result: AttributeMetadata[] = [];

  for (const attribute of attributes) {
    if (!attribute.MetadataId || seen.has(attribute.MetadataId)) {
      continue;
    }
    seen.add(attribute.MetadataId);
    result.push(attribute);
  }

  return result;
}

export const optionSetHandler: IHandler = {
  async load(context: HandlerContext) {
    const typedResults = await Promise.allSettled([
      dataverseService.getTypedAttributes(context.entityLogicalName, 'PicklistAttributeMetadata'),
      dataverseService.getTypedAttributes(context.entityLogicalName, 'BooleanAttributeMetadata'),
      dataverseService.getTypedAttributes(context.entityLogicalName, 'StatusAttributeMetadata'),
      dataverseService.getTypedAttributes(context.entityLogicalName, 'StateAttributeMetadata'),
      dataverseService.getTypedAttributes(context.entityLogicalName, 'MultiSelectPicklistAttributeMetadata'),
    ]);

    let attributes = uniqueByMetadataId(
      typedResults
        .filter((result): result is PromiseFulfilledResult<AttributeMetadata[]> => result.status === 'fulfilled')
        .flatMap(result => result.value)
    );

    if (attributes.length === 0) {
      const fallbackAttributes = await dataverseService.getAllOptionSetAttributes(context.entityLogicalName);
      attributes = uniqueByMetadataId(fallbackAttributes.filter(isOptionSetAttribute));
    }

    attributes = attributes
      .filter(attribute => attribute.IsCustomizable?.Value !== false)
      .sort((a, b) => a.SchemaName.localeCompare(b.SchemaName));

    return {
      rows: buildRows(attributes, context.selectedComponent),
    };
  },

  async save(rows, changes, context) {
    if (changes.length === 0) {
      return;
    }

    const rowsById = new Map(rows.map(row => [row.id, row]));
    const changesByRow = groupChangesByRow(changes);

    const localAttributeIds = new Set<string>();
    const globalOptionSetIds = new Set<string>();
    const globalOptionSetNames = new Set<string>();
    let hasUpdates = false;

    const optionComponent = getOptionComponent(context.selectedComponent);

    for (const [rowId, rowChanges] of changesByRow) {
      const parsedId = parseCompoundId(rowId);
      if (!parsedId) {
        continue;
      }

      const parentRow = rowsById.get(parsedId.parentId);
      const attribute = parentRow?.meta?.attribute as AttributeMetadata | undefined;
      if (!attribute) {
        continue;
      }

      const label = toLabelFromChanges(rowChanges);
      if (!label) {
        continue;
      }

      const update: UpdateOptionValueRequest = {
        Value: parsedId.optionValue,
        MergeLabels: true,
        [optionComponent]: label,
      };

      const globalOptionSet = attribute.GlobalOptionSet;
      if (globalOptionSet?.IsGlobal && globalOptionSet.Name) {
        update.OptionSetName = globalOptionSet.Name;
        globalOptionSetNames.add(globalOptionSet.Name);
        if (globalOptionSet.MetadataId) {
          globalOptionSetIds.add(globalOptionSet.MetadataId);
        }
      } else {
        update.EntityLogicalName = context.entityLogicalName.toLowerCase();
        update.AttributeLogicalName = attribute.LogicalName;
        localAttributeIds.add(attribute.MetadataId);
      }

      await dataverseService.updateOptionValue(update);
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return;
    }

    await publishService.publishEntity(context.entityLogicalName, Array.from(globalOptionSetNames));

    if (!context.solutionName) {
      return;
    }

    if (localAttributeIds.size > 0) {
      await dataverseService.addSolutionComponents({
        componentIds: Array.from(localAttributeIds),
        componentType: ATTRIBUTE_COMPONENT_TYPE,
        solutionUniqueName: context.solutionName,
      });
    }

    if (globalOptionSetIds.size > 0) {
      await dataverseService.addSolutionComponents({
        componentIds: Array.from(globalOptionSetIds),
        componentType: OPTION_SET_COMPONENT_TYPE,
        solutionUniqueName: context.solutionName,
        includeComponentSettings: true,
        includeSubComponents: true,
        addRequiredComponents: true,
      });
    }
  },
};
