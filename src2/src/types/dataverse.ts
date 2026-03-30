/** Dataverse LocalizedLabel - don vi co ban cua moi translation */
export interface LocalizedLabel {
  Label: string;
  LanguageCode: number;  // LCID: 1033, 1036, 1034, etc.
  IsManaged: boolean;
  MetadataId: string;
  HasChanged: boolean | null;
}

/** Label object chua array cac LocalizedLabel */
export interface Label {
  LocalizedLabels: LocalizedLabel[];
  UserLocalizedLabel: LocalizedLabel | null;
}

/** Attribute metadata (tu getEntityRelatedMetadata) */
export interface AttributeMetadata {
  MetadataId: string;
  LogicalName: string;
  SchemaName: string;
  DisplayName: Label;
  Description: Label;
  AttributeType: string;
  AttributeTypeName: { Value: string };
  FormulaDefinition?: string | null;  // Rollup fields co formula
  OptionSet?: OptionSetMetadata | null;
}

/** OptionSet metadata */
export interface OptionSetMetadata {
  MetadataId: string;
  Name: string;
  IsGlobal: boolean;
  OptionSetType: string;
  Options: OptionMetadata[];
}

/** Option trong OptionSet */
export interface OptionMetadata {
  Value: number;
  Label: Label;
  Description: Label;
  Color?: string;
  IsManaged: boolean;
}

/** Entity metadata */
export interface EntityMetadata {
  MetadataId: string;
  LogicalName: string;
  SchemaName: string;
  DisplayName: Label;
  Description: Label;
  DisplayCollectionName: Label;
  LogicalCollectionName: string;
  IsCustomizable: { Value: boolean };
}

/** Relationship metadata (OneToMany) */
export interface OneToManyRelationshipMetadata {
  MetadataId: string;
  SchemaName: string;
  ReferencedEntity: string;
  ReferencingEntity: string;
  AssociatedMenuConfiguration: {
    Label: Label;
    Behavior: string;
  };
}

/** Relationship metadata (ManyToMany) */
export interface ManyToManyRelationshipMetadata {
  MetadataId: string;
  SchemaName: string;
  Entity1LogicalName: string;
  Entity2LogicalName: string;
  Entity1AssociatedMenuConfiguration: {
    Label: Label;
    Behavior: string;
  };
  Entity2AssociatedMenuConfiguration: {
    Label: Label;
    Behavior: string;
  };
}

/** Form record (tu FetchXml query systemform) */
export interface SystemForm {
  formid: string;
  name: string;
  type: number;        // 2=Main, 7=QuickView, etc.
  formxml: string;
  objecttypecode: string;
}

/** View record (tu FetchXml query savedquery) */
export interface SavedQuery {
  savedqueryid: string;
  name: string;
  querytype: number;
  returnedtypecode: string;
}

/** Chart record */
export interface SavedQueryVisualization {
  savedqueryvisualizationid: string;
  name: string;
  primaryentitytypecode: string;
}

/** Installed language info */
export interface LanguageLocale {
  localeid: number;     // LCID
  code: string;         // ISO code: "en", "fr", "vi"
  name: string;         // Display name: "English", "French"
}

/** User settings record */
export interface UserSettings {
  uilanguageid: number;
  helplanguageid: number;
}

/** Solution record */
export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
}
