import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { CellChange, GridRow, MetadataComponent } from '@/types/grid';
import type {
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
const OPTION_SET_COMPONENT_TYPE = 9;

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

function buildRows(optionSets: OptionSetMetadata[], selectedComponent: MetadataComponent): GridRow[] {
  const optionComponent = getOptionComponent(selectedComponent);
  const rows: GridRow[] = [];

  for (const optionSet of optionSets) {
    const options = getOptionValues(optionSet);
    if (options.length === 0) {
      continue;
    }

    const children: GridRow[] = options.map(option => ({
      id: `${optionSet.MetadataId}${ID_SEPARATOR}${option.Value}`,
      schemaName: String(option.Value),
      labels: localizedLabelsToMap(getLocalizedLabels(option, optionComponent)),
      meta: {
        optionValue: option.Value,
      },
    }));

    rows.push({
      id: optionSet.MetadataId,
      schemaName: optionSet.Name,
      labels: {},
      children,
      meta: {
        optionSet,
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

async function runPublishAsBaseLanguage(context: HandlerContext, action: () => Promise<void>): Promise<void> {
  if (!context.userId || context.userLanguage === context.baseLanguage) {
    await action();
    return;
  }

  await dataverseService.setUserLanguage(context.userId, context.baseLanguage);
  try {
    await action();
  } finally {
    await dataverseService.setUserLanguage(context.userId, context.userLanguage);
  }
}

export const globalOptionSetHandler: IHandler = {
  async load(context: HandlerContext) {
    const optionSets = await dataverseService.getGlobalOptionSets();
    return {
      rows: buildRows(optionSets, context.selectedComponent),
    };
  },

  async save(rows, changes, context) {
    if (changes.length === 0) {
      return;
    }

    const rowsById = new Map(rows.map(row => [row.id, row]));
    const changesByRow = groupChangesByRow(changes);

    const optionSetIds = new Set<string>();
    const optionSetNames = new Set<string>();
    const optionComponent = getOptionComponent(context.selectedComponent);
    let hasUpdates = false;

    for (const [rowId, rowChanges] of changesByRow) {
      const parsedId = parseCompoundId(rowId);
      if (!parsedId) {
        continue;
      }

      const parentRow = rowsById.get(parsedId.parentId);
      const optionSet = parentRow?.meta?.optionSet as OptionSetMetadata | undefined;
      if (!optionSet?.Name) {
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
        OptionSetName: optionSet.Name,
      };

      await dataverseService.updateOptionValue(update);
      hasUpdates = true;

      optionSetNames.add(optionSet.Name);
      if (optionSet.MetadataId) {
        optionSetIds.add(optionSet.MetadataId);
      }
    }

    if (!hasUpdates) {
      return;
    }

    await runPublishAsBaseLanguage(context, async () => {
      await publishService.publishGlobalOptionSets(Array.from(optionSetNames));
    });

    if (!context.solutionName || optionSetIds.size === 0) {
      return;
    }

    await dataverseService.addSolutionComponents({
      componentIds: Array.from(optionSetIds),
      componentType: OPTION_SET_COMPONENT_TYPE,
      solutionUniqueName: context.solutionName,
      includeComponentSettings: true,
      includeSubComponents: true,
      addRequiredComponents: true,
    });
  },
};
