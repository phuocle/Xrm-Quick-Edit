/// <reference types="@pptb/types" />

import type {
  AttributeMetadata,
  EntityMetadata,
  ManyToOneRelationshipMetadata,
  OneToManyRelationshipMetadata,
  ManyToManyRelationshipMetadata,
  OptionSetMetadata,
  SystemForm,
  LanguageLocale,
  UserSettings,
  Solution,
  Label,
  LocalizedLabel,
  SavedQuery,
  SavedQueryVisualization,
  UpdateOptionValueRequest,
} from '@/types/dataverse';

export interface EntityOption {
  logicalName: string;
  displayName: string;
}

/** Common LCID -> ISO code mapping */
const LCID_CODES: Record<number, string> = {
  1025: 'ar', 1026: 'bg', 1027: 'ca', 1028: 'zh-TW', 1029: 'cs',
  1030: 'da', 1031: 'de', 1032: 'el', 1033: 'en', 1034: 'es',
  1035: 'fi', 1036: 'fr', 1037: 'he', 1038: 'hu', 1040: 'it',
  1041: 'ja', 1042: 'ko', 1043: 'nl', 1044: 'nb', 1045: 'pl',
  1046: 'pt-BR', 1048: 'ro', 1049: 'ru', 1050: 'hr', 1051: 'sk',
  1053: 'sv', 1054: 'th', 1055: 'tr', 1057: 'id', 1058: 'uk',
  1060: 'sl', 1061: 'et', 1062: 'lv', 1063: 'lt', 1066: 'vi',
  1069: 'eu', 1081: 'hi', 1086: 'ms', 1087: 'kk', 1110: 'gl',
  2052: 'zh-CN', 2070: 'pt-PT', 3076: 'zh-HK', 3082: 'es-ES',
  1164: 'prs',
};

/** Common LCID -> display name mapping */
const LCID_NAMES: Record<number, string> = {
  1025: 'Arabic', 1026: 'Bulgarian', 1027: 'Catalan', 1028: 'Chinese (Traditional)',
  1029: 'Czech', 1030: 'Danish', 1031: 'German', 1032: 'Greek',
  1033: 'English', 1034: 'Spanish', 1035: 'Finnish', 1036: 'French',
  1037: 'Hebrew', 1038: 'Hungarian', 1040: 'Italian', 1041: 'Japanese',
  1042: 'Korean', 1043: 'Dutch', 1044: 'Norwegian', 1045: 'Polish',
  1046: 'Portuguese (Brazil)', 1048: 'Romanian', 1049: 'Russian',
  1050: 'Croatian', 1051: 'Slovak', 1053: 'Swedish', 1054: 'Thai',
  1055: 'Turkish', 1057: 'Indonesian', 1058: 'Ukrainian', 1060: 'Slovenian',
  1061: 'Estonian', 1062: 'Latvian', 1063: 'Lithuanian', 1066: 'Vietnamese',
  1069: 'Basque', 1081: 'Hindi', 1086: 'Malay', 1087: 'Kazakh',
  1110: 'Galician', 2052: 'Chinese (Simplified)', 2070: 'Portuguese (Portugal)',
  3076: 'Chinese (Hong Kong)', 3082: 'Spanish (Spain)', 1164: 'Dari',
};

function lcidToCode(lcid: number): string {
  return LCID_CODES[lcid] ?? `lcid-${lcid}`;
}

function lcidToName(lcid: number): string {
  return LCID_NAMES[lcid] ?? `Language ${lcid}`;
}

function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function isMissingMetadataPropertyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Could not find a property named')
    || error.message.includes('0x80060888')
  );
}

export const dataverseService = {
  // ---- Metadata queries ----

  async getAttributes(entityLogicalName: string): Promise<AttributeMetadata[]> {
    const preferredFields = [
      'MetadataId',
      'LogicalName',
      'SchemaName',
      'DisplayName',
      'Description',
      'AttributeType',
      'AttributeTypeName',
      'IsCustomizable',
      'IsRenameable',
      'FormulaDefinition',
    ];

    const fallbackFields = [
      'MetadataId',
      'LogicalName',
      'SchemaName',
      'DisplayName',
      'Description',
      'AttributeType',
      'AttributeTypeName',
      'IsCustomizable',
      'IsRenameable',
    ];

    try {
      const result = await window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'Attributes',
        preferredFields
      );
      return result.value as unknown as AttributeMetadata[];
    } catch (error) {
      if (!isMissingMetadataPropertyError(error)) {
        throw error;
      }

      const fallbackResult = await window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'Attributes',
        fallbackFields
      );
      return fallbackResult.value as unknown as AttributeMetadata[];
    }
  },

  async getTypedAttributes(entityLogicalName: string, metadataType: string): Promise<AttributeMetadata[]> {
    const relatedPath = `Attributes/Microsoft.Dynamics.CRM.${metadataType}?$expand=OptionSet,GlobalOptionSet`;

    try {
      const metadataResult = await (window.dataverseAPI.getEntityRelatedMetadata as unknown as (
        entityLogicalName: string,
        relatedPath: string
      ) => Promise<{ value: Record<string, unknown>[] }>)(entityLogicalName, relatedPath);

      return (metadataResult.value ?? []) as unknown as AttributeMetadata[];
    } catch {
      // Fall through to OData queryData path for environments where relatedPath with $expand is not supported.
    }

    const logicalName = escapeODataLiteral(entityLogicalName.toLowerCase());
    const result = await window.dataverseAPI.queryData(
      `EntityDefinitions(LogicalName='${logicalName}')/Attributes/Microsoft.Dynamics.CRM.${metadataType}?$expand=OptionSet,GlobalOptionSet`
    );

    return (result.value ?? []) as unknown as AttributeMetadata[];
  },

  async getAllOptionSetAttributes(entityLogicalName: string): Promise<AttributeMetadata[]> {
    const logicalName = escapeODataLiteral(entityLogicalName.toLowerCase());
    const result = await window.dataverseAPI.queryData(
      `EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=MetadataId,LogicalName,SchemaName,AttributeType,AttributeTypeName,IsCustomizable&$expand=OptionSet,GlobalOptionSet`
    );

    return (result.value ?? []) as unknown as AttributeMetadata[];
  },

  async getGlobalOptionSets(): Promise<OptionSetMetadata[]> {
    const result = await window.dataverseAPI.queryData('GlobalOptionSetDefinitions');
    const optionSets = (result.value ?? []) as unknown as OptionSetMetadata[];

    return optionSets
      .filter(optionSet => optionSet.IsGlobal && optionSet.IsCustomizable?.Value !== false)
      .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
  },

  async getEntityMetadata(entityLogicalName: string): Promise<EntityMetadata> {
    const result = await window.dataverseAPI.getEntityMetadata(
      entityLogicalName,
      true,
      ['MetadataId', 'LogicalName', 'SchemaName', 'DisplayName', 'Description', 'DisplayCollectionName', 'LogicalCollectionName', 'IsCustomizable']
    );
    return result as unknown as EntityMetadata;
  },

  async getRelationships(entityLogicalName: string): Promise<{
    oneToMany: OneToManyRelationshipMetadata[];
    manyToOne: ManyToOneRelationshipMetadata[];
    manyToMany: ManyToManyRelationshipMetadata[];
  }> {
    const [oneToManyResult, manyToOneResult, manyToManyResult] = await Promise.all([
      window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'OneToManyRelationships',
        ['MetadataId', 'SchemaName', 'IsCustomizable', 'ReferencedEntity', 'ReferencingEntity', 'AssociatedMenuConfiguration']
      ),
      window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'ManyToOneRelationships',
        ['MetadataId', 'SchemaName', 'IsCustomizable', 'ReferencedEntity', 'ReferencingEntity', 'AssociatedMenuConfiguration']
      ),
      window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'ManyToManyRelationships',
        ['MetadataId', 'SchemaName', 'IsCustomizable', 'Entity1LogicalName', 'Entity2LogicalName', 'Entity1AssociatedMenuConfiguration', 'Entity2AssociatedMenuConfiguration']
      ),
    ]);
    return {
      oneToMany: oneToManyResult.value as unknown as OneToManyRelationshipMetadata[],
      manyToOne: manyToOneResult.value as unknown as ManyToOneRelationshipMetadata[],
      manyToMany: manyToManyResult.value as unknown as ManyToManyRelationshipMetadata[],
    };
  },

  async getEntityPluralNames(entityLogicalNames: string[]): Promise<Record<string, Record<number, string>>> {
    if (entityLogicalNames.length === 0) {
      return {};
    }

    const escapedNames = Array.from(new Set(entityLogicalNames.map(name => name.toLowerCase())))
      .map(name => escapeODataLiteral(name));
    const filter = escapedNames.map(name => `LogicalName eq '${name}'`).join(' or ');

    const result = await window.dataverseAPI.queryData(
      `EntityDefinitions?$select=LogicalName,DisplayCollectionName&$filter=${filter}`
    );

    const map: Record<string, Record<number, string>> = {};
    const entities = result.value as unknown as Array<{
      LogicalName: string;
      DisplayCollectionName?: Label;
    }>;

    for (const entity of entities ?? []) {
      const labels = entity.DisplayCollectionName?.LocalizedLabels ?? [];
      const localizedMap: Record<number, string> = {};
      for (const label of labels) {
        localizedMap[label.LanguageCode] = label.Label;
      }

      map[entity.LogicalName?.toLowerCase()] = localizedMap;
    }

    return map;
  },

  // ---- FetchXml queries ----

  async fetchXmlQuery<T>(fetchXml: string): Promise<T[]> {
    const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
    return (result.value ?? []) as T[];
  },

  async getSavedQueries(entityLogicalName: string): Promise<SavedQuery[]> {
    const logicalName = escapeODataLiteral(entityLogicalName.toLowerCase());
    const result = await window.dataverseAPI.queryData(
      `savedqueries?$select=savedqueryid,name,querytype,returnedtypecode&$filter=returnedtypecode eq '${logicalName}' and iscustomizable/Value eq true&$orderby=savedqueryid asc`
    );
    return (result.value ?? []) as unknown as SavedQuery[];
  },

  async getSystemForms(entityLogicalName: string): Promise<SystemForm[]> {
    const isDashboardMode = entityLogicalName.toLowerCase() === 'none';

    const query = isDashboardMode
      ? "systemforms?$select=formid,name,type,objecttypecode&$filter=formactivationstate eq 1 and iscustomizable/Value eq true and (type eq 0 or type eq 10)&$orderby=type asc"
      : `systemforms?$select=formid,name,type,objecttypecode&$filter=objecttypecode eq '${escapeODataLiteral(entityLogicalName.toLowerCase())}' and iscustomizable/Value eq true and formactivationstate eq 1&$orderby=type asc`;

    const result = await window.dataverseAPI.queryData(query);
    return (result.value ?? []) as unknown as SystemForm[];
  },

  async getSavedQueryVisualizations(entityLogicalName: string): Promise<SavedQueryVisualization[]> {
    const logicalName = escapeODataLiteral(entityLogicalName.toLowerCase());
    const result = await window.dataverseAPI.queryData(
      `savedqueryvisualizations?$select=savedqueryvisualizationid,name,primaryentitytypecode&$filter=primaryentitytypecode eq '${logicalName}' and iscustomizable/Value eq true&$orderby=savedqueryvisualizationid asc`
    );
    return (result.value ?? []) as unknown as SavedQueryVisualization[];
  },

  async retrieveLocLabels(
    entitySetName: string,
    recordId: string,
    attributeName: string,
    includeUnpublished: boolean
  ): Promise<{ Label: Label }> {
    const response = await window.dataverseAPI.execute({
      operationName: 'RetrieveLocLabels',
      operationType: 'function',
      parameters: {
        EntityMoniker: `{'@odata.id':'${entitySetName}(${recordId})'}`,
        AttributeName: attributeName,
        IncludeUnpublished: includeUnpublished,
      },
    });

    return response as { Label: Label };
  },

  async setLocLabels(payload: {
    labels: LocalizedLabel[];
    entityMoniker: Record<string, unknown>;
    attributeName: string;
  }): Promise<void> {
    await window.dataverseAPI.execute({
      operationName: 'SetLocLabels',
      operationType: 'action',
      parameters: {
        Labels: payload.labels,
        EntityMoniker: payload.entityMoniker,
        AttributeName: payload.attributeName,
      },
    });
  },

  // ---- Updates ----

  async updateAttribute(
    entityLogicalName: string,
    attributeId: string,
    definition: Partial<AttributeMetadata>
  ): Promise<void> {
    const clean = dataverseService.sanitizeForPut(definition as Record<string, unknown>);
    await window.dataverseAPI.updateAttribute(
      entityLogicalName,
      attributeId,
      clean,
      { mergeLabels: true }
    );
  },

  async updateEntity(
    entityId: string,
    definition: Partial<EntityMetadata>
  ): Promise<void> {
    const clean = dataverseService.sanitizeForPut(definition as Record<string, unknown>);
    await window.dataverseAPI.updateEntityDefinition(
      entityId,
      clean,
      { mergeLabels: true }
    );
  },

  async updateRelationship(
    relationshipId: string,
    definition: unknown
  ): Promise<void> {
    const clean = dataverseService.sanitizeForPut(definition as Record<string, unknown>);
    await window.dataverseAPI.updateRelationship(
      relationshipId,
      clean,
      { mergeLabels: true }
    );
  },

  async updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await window.dataverseAPI.update(entityLogicalName, id, data);
  },

  async updateOptionValue(params: UpdateOptionValueRequest): Promise<void> {
    await window.dataverseAPI.execute({
      operationName: 'UpdateOptionValue',
      operationType: 'action',
      parameters: params as unknown as Record<string, unknown>,
    });
  },

  async updateGlobalOptionSet(id: string, definition: unknown): Promise<void> {
    const clean = dataverseService.sanitizeForPut(definition as Record<string, unknown>);
    await window.dataverseAPI.updateGlobalOptionSet(id, clean, { mergeLabels: true });
  },

  async addSolutionComponents(params: {
    componentIds: string[];
    componentType: number;
    solutionUniqueName: string;
    includeComponentSettings?: boolean;
    includeSubComponents?: boolean;
    addRequiredComponents?: boolean;
  }): Promise<void> {
    for (const componentId of params.componentIds) {
      await window.dataverseAPI.execute({
        operationName: 'AddSolutionComponent',
        operationType: 'action',
        parameters: {
          ComponentId: componentId,
          ComponentType: params.componentType,
          SolutionUniqueName: params.solutionUniqueName,
          AddRequiredComponents: params.addRequiredComponents ?? false,
          IncludedComponentSettingsValues: params.includeComponentSettings ? null : [],
          DoNotIncludeSubcomponents: params.includeSubComponents ? false : true,
        },
      });
    }
  },

  // ---- Language switching (for FormHandler) ----

  async setUserLanguage(userId: string, lcid: number): Promise<void> {
    // usersettings entity set name is "usersettingscollection" in Dataverse
    // Use queryData with direct OData path to avoid pluralization issues
    await window.dataverseAPI.update(
      'usersettingscollection',
      userId,
      { uilanguageid: lcid }
    );
  },

  async getUserSettings(userId: string): Promise<UserSettings> {
    // usersettings entity set name is "usersettingscollection" — use queryData to avoid pluralization
    const result = await window.dataverseAPI.queryData(
      `usersettingscollection?$select=uilanguageid,helplanguageid&$filter=systemuserid eq '${userId}'&$top=1`
    );
    const records = result.value ?? [];
    if (records.length === 0) throw new Error('Could not retrieve user settings');
    return records[0] as unknown as UserSettings;
  },

  // ---- Org info ----

  async getBaseLanguage(): Promise<number> {
    const fetchXml = `
      <fetch top="1">
        <entity name="organization">
          <attribute name="languagecode" />
        </entity>
      </fetch>`;
    const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
    const orgs = result.value ?? [];
    if (orgs.length === 0) throw new Error('Could not retrieve organization language');
    return orgs[0].languagecode as number;
  },

  async getInstalledLanguages(): Promise<LanguageLocale[]> {
    // Use RetrieveAvailableLanguages function — avoids entity set name pluralization issues
    const result = await window.dataverseAPI.execute({
      operationName: 'RetrieveAvailableLanguages',
      operationType: 'function',
    });
    const lcids = (result.LocaleIds ?? []) as number[];
    return lcids.map(lcid => ({
      localeid: lcid,
      code: lcidToCode(lcid),
      name: lcidToName(lcid),
    }));
  },

  async getSolutions(): Promise<Solution[]> {
    const fetchXml = `
      <fetch>
        <entity name="solution">
          <attribute name="solutionid" />
          <attribute name="uniquename" />
          <attribute name="friendlyname" />
          <filter>
            <condition attribute="ismanaged" operator="eq" value="0" />
            <condition attribute="isvisible" operator="eq" value="1" />
          </filter>
          <order attribute="friendlyname" />
        </entity>
      </fetch>`;
    const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
    return (result.value ?? []) as unknown as Solution[];
  },

  async getEntities(solutionName?: string): Promise<EntityOption[]> {
    if (solutionName && solutionName !== 'all') {
      // Filter entities by solution using solutioncomponent
      const fetchXml = `
        <fetch>
          <entity name="solutioncomponent">
            <attribute name="objectid" />
            <filter>
              <condition attribute="componenttype" operator="eq" value="1" />
            </filter>
            <link-entity name="solution" from="solutionid" to="solutionid">
              <filter>
                <condition attribute="uniquename" operator="eq" value="${solutionName}" />
              </filter>
            </link-entity>
          </entity>
        </fetch>`;
      const components = await window.dataverseAPI.fetchXmlQuery(fetchXml);
      const entityIds = (components.value ?? []).map(c => c.objectid as string);

      if (entityIds.length === 0) return [];

      const allMeta = await window.dataverseAPI.getAllEntitiesMetadata(
        ['LogicalName', 'DisplayName']
      );
      const idSet = new Set(entityIds);
      return allMeta.value
        .filter(e => idSet.has(e.MetadataId))
        .map(e => ({
          logicalName: e.LogicalName,
          displayName: e.DisplayName?.LocalizedLabels?.[0]?.Label ?? e.LogicalName,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    // All entities
    const allMeta = await window.dataverseAPI.getAllEntitiesMetadata(
      ['LogicalName', 'DisplayName']
    );
    return allMeta.value
      .map(e => ({
        logicalName: e.LogicalName,
        displayName: e.DisplayName?.LocalizedLabels?.[0]?.Label ?? e.LogicalName,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  // ---- Utilities ----

  sanitizeForPut<T extends Record<string, unknown>>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, (_key, value) => {
      if (_key.toLowerCase() === 'versionnumber') return undefined;
      if (_key === 'MetadataId') return undefined;
      if (typeof value === 'bigint') return undefined;
      if (typeof value === 'number' && !Number.isSafeInteger(value) && !Number.isFinite(value)) {
        return undefined;
      }
      return value;
    }));
  },

  buildLabel(lcid: number, text: string): Label {
    return {
      LocalizedLabels: [
        {
          Label: text,
          LanguageCode: lcid,
          IsManaged: false,
          MetadataId: '',
          HasChanged: null,
        },
      ],
      UserLocalizedLabel: null,
    };
  },
};
