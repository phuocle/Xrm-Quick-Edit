import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow } from '@/types/grid';
import type {
  Label,
  RelationshipMenuConfiguration,
} from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

const ENTITY_RELATIONSHIP_COMPONENT_TYPE = 10;

type MenuConfigKey = 'AssociatedMenuConfiguration' | 'Entity1AssociatedMenuConfiguration';
type ODataRelationshipType = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata' | 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata';

interface RelationshipRowMeta {
  relationshipId: string;
  schemaName: string;
  navEntity: string;
  pluralNames: Record<number, string>;
  menuConfig: RelationshipMenuConfiguration;
  menuConfigKey: MenuConfigKey;
  odataType: ODataRelationshipType;
}

function isMenuConfigCustomizable(menuConfig?: RelationshipMenuConfiguration): boolean {
  return menuConfig?.IsCustomizable !== false;
}

function isRelationshipCustomizable(isCustomizable?: { Value: boolean }): boolean {
  return isCustomizable?.Value !== false;
}

function isUsingCollectionName(menuConfig?: RelationshipMenuConfiguration): boolean {
  return !menuConfig?.Behavior || menuConfig.Behavior === 'UseCollectionName';
}

function buildLabels(menuConfig: RelationshipMenuConfiguration | undefined, pluralNames: Record<number, string>): Record<number, string> {
  const customLabels = menuConfig?.Label?.LocalizedLabels ?? [];
  if (customLabels.length > 0) {
    return localizedLabelsToMap(customLabels);
  }

  if (isUsingCollectionName(menuConfig)) {
    return { ...pluralNames };
  }

  return {};
}

function toRow(
  relationshipId: string,
  schemaName: string,
  relType: string,
  navEntity: string,
  menuConfig: RelationshipMenuConfiguration | undefined,
  menuConfigKey: MenuConfigKey,
  odataType: ODataRelationshipType,
  pluralNameMap: Record<string, Record<number, string>>,
): GridRow {
  const navEntityKey = navEntity.toLowerCase();
  const pluralNames = pluralNameMap[navEntityKey] ?? {};
  const effectiveMenuConfig = menuConfig ?? {};

  return {
    id: relationshipId,
    schemaName: `${schemaName} (${relType})`,
    labels: buildLabels(effectiveMenuConfig, pluralNames),
    meta: {
      relationshipId,
      schemaName,
      navEntity: navEntityKey,
      pluralNames,
      menuConfig: effectiveMenuConfig,
      menuConfigKey,
      odataType,
    } as unknown as Record<string, unknown>,
  };
}

function prePopulateLabelsFromPluralNames(label: Label, pluralNames: Record<number, string>): void {
  for (const [languageCode, pluralName] of Object.entries(pluralNames)) {
    const lcid = Number.parseInt(languageCode, 10);
    if (Number.isNaN(lcid)) {
      continue;
    }

    const existing = label.LocalizedLabels.find(l => l.LanguageCode === lcid);
    if (!existing) {
      label.LocalizedLabels.push({
        LanguageCode: lcid,
        Label: pluralName,
        HasChanged: false,
        IsManaged: false,
        MetadataId: '',
      });
    }
  }
}

function buildUpdatePayload(meta: RelationshipRowMeta, label: Label): Record<string, unknown> {
  const menuConfigPayload: RelationshipMenuConfiguration = {
    ...meta.menuConfig,
    Behavior: 'UseLabel',
    Label: label,
  };

  return {
    '@odata.type': meta.odataType,
    SchemaName: meta.schemaName,
    [meta.menuConfigKey]: menuConfigPayload,
  };
}

export const relationshipHandler: IHandler = {
  async load(context: HandlerContext) {
    const relationships = await dataverseService.getRelationships(context.entityLogicalName);

    const oneToMany = relationships.oneToMany
      .filter(rel => isRelationshipCustomizable(rel.IsCustomizable) && isMenuConfigCustomizable(rel.AssociatedMenuConfiguration))
      .map(rel => ({
        rel,
        relType: `1:N -> ${rel.ReferencingEntity}`,
        navEntity: rel.ReferencingEntity,
        menuConfig: rel.AssociatedMenuConfiguration,
        menuConfigKey: 'AssociatedMenuConfiguration' as const,
        odataType: 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata' as const,
      }));

    const manyToOne = relationships.manyToOne
      .filter(rel => isRelationshipCustomizable(rel.IsCustomizable) && isMenuConfigCustomizable(rel.AssociatedMenuConfiguration))
      .map(rel => ({
        rel,
        relType: `N:1 <- ${rel.ReferencedEntity}`,
        navEntity: context.entityLogicalName,
        menuConfig: rel.AssociatedMenuConfiguration,
        menuConfigKey: 'AssociatedMenuConfiguration' as const,
        odataType: 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata' as const,
      }));

    const manyToMany = relationships.manyToMany
      .filter(rel => isRelationshipCustomizable(rel.IsCustomizable) && isMenuConfigCustomizable(rel.Entity1AssociatedMenuConfiguration))
      .map(rel => ({
        rel,
        relType: `N:N <-> ${rel.Entity2LogicalName}`,
        navEntity: rel.Entity2LogicalName,
        menuConfig: rel.Entity1AssociatedMenuConfiguration,
        menuConfigKey: 'Entity1AssociatedMenuConfiguration' as const,
        odataType: 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata' as const,
      }));

    const all = [...oneToMany, ...manyToOne, ...manyToMany].sort((a, b) => a.rel.SchemaName.localeCompare(b.rel.SchemaName));
    const navEntities = Array.from(new Set(all.map(item => item.navEntity.toLowerCase())));
    const pluralNameMap = await dataverseService.getEntityPluralNames(navEntities);

    const rows = all.map(item =>
      toRow(
        item.rel.MetadataId,
        item.rel.SchemaName,
        item.relType,
        item.navEntity,
        item.menuConfig,
        item.menuConfigKey,
        item.odataType,
        pluralNameMap,
      )
    );

    return { rows };
  },

  async save(rows, changes, context) {
    if (changes.length === 0) {
      return;
    }

    const changesByRow = groupChangesByRow(changes);
    const updatedIds = new Set<string>();

    for (const [rowId, rowChanges] of changesByRow) {
      const row = rows.find(r => r.id === rowId);
      const meta = row?.meta as RelationshipRowMeta | undefined;
      if (!meta || !isMenuConfigCustomizable(meta.menuConfig)) {
        continue;
      }

      const label: Label = {
        LocalizedLabels: [...(meta.menuConfig.Label?.LocalizedLabels ?? [])],
        UserLocalizedLabel: meta.menuConfig.Label?.UserLocalizedLabel ?? null,
      };

      if (isUsingCollectionName(meta.menuConfig)) {
        prePopulateLabelsFromPluralNames(label, meta.pluralNames);
      }

      const hasRowUpdates = applyChanges(rowChanges, label.LocalizedLabels);
      if (!hasRowUpdates) {
        continue;
      }

      const payload = buildUpdatePayload(meta, label);
      await dataverseService.updateRelationship(meta.relationshipId, payload);
      updatedIds.add(meta.relationshipId);
    }

    if (updatedIds.size === 0) {
      return;
    }

    await publishService.publishEntity(context.entityLogicalName);

    if (!context.solutionName) {
      return;
    }

    await dataverseService.addSolutionComponents({
      componentIds: Array.from(updatedIds),
      componentType: ENTITY_RELATIONSHIP_COMPONENT_TYPE,
      solutionUniqueName: context.solutionName,
    });
  },
};
