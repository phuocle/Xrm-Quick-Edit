import type { IHandler, HandlerContext } from '@/handlers/IHandler';
import type { GridRow } from '@/types/grid';
import type { Label, SystemForm } from '@/types/dataverse';
import { dataverseService } from '@/services/dataverseService';
import { publishService } from '@/services/publishService';
import { applyChanges, groupChangesByRow, localizedLabelsToMap } from '@/handlers/utils';

const SYSTEM_FORM_COMPONENT_TYPE = 60;

const FORM_TYPE_MAP: Record<number, string> = {
  0: 'Dashboard',
  2: 'Main',
  5: 'Mobile Express',
  6: 'Quick View',
  7: 'Quick Create',
  10: 'App Module Main',
  11: 'Interactive Experience',
  12: 'Card Form',
};

function isDashboardMode(entityLogicalName: string): boolean {
  return entityLogicalName.toLowerCase() === 'none';
}

function toGridRow(form: SystemForm, labels: Label): GridRow | null {
  const localizedLabels = labels.LocalizedLabels ?? [];
  if (localizedLabels.length === 0) {
    return null;
  }

  return {
    id: form.formid,
    schemaName: FORM_TYPE_MAP[form.type] ?? `Type ${form.type}`,
    labels: localizedLabelsToMap(localizedLabels),
    meta: {
      type: form.type,
      labels,
    },
  };
}

export const formMetaHandler: IHandler = {
  async load(context: HandlerContext) {
    const forms = await dataverseService.getSystemForms(context.entityLogicalName);

    const rows = await Promise.all(
      forms.map(async form => {
        const response = await dataverseService.retrieveLocLabels(
          'systemforms',
          form.formid,
          'name',
          true
        );
        return toGridRow(form, response.Label);
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
    const updatedFormIds: string[] = [];

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
          '@odata.type': 'Microsoft.Dynamics.CRM.systemform',
          formid: rowId,
        },
        attributeName: 'name',
      });

      updatedFormIds.push(rowId);
    }

    if (updatedFormIds.length === 0) {
      return;
    }

    const dashboardMode = isDashboardMode(context.entityLogicalName);

    if (context.solutionName) {
      await dataverseService.addSolutionComponents({
        componentIds: updatedFormIds,
        componentType: SYSTEM_FORM_COMPONENT_TYPE,
        solutionUniqueName: context.solutionName,
        includeComponentSettings: dashboardMode,
        includeSubComponents: dashboardMode,
        addRequiredComponents: dashboardMode,
      });
    }

    if (dashboardMode) {
      await publishService.publishDashboard(updatedFormIds);
      return;
    }

    await publishService.publishEntity(context.entityLogicalName);
  },
};
