/// <reference types="@pptb/types" />

export const publishService = {
  async publishEntity(entityLogicalName: string, globalOptionSetNames?: string[]): Promise<void> {
    const optionSets = globalOptionSetNames ?? [];
    const optionSetXml = optionSets.length > 0
      ? '<optionsets>' + optionSets.map(o => `<optionset>${o}</optionset>`).join('') + '</optionsets>'
      : '';

    const publishXml = `<importexportxml><entities><entity>${entityLogicalName.toLowerCase()}</entity></entities>${optionSetXml}</importexportxml>`;

    await window.dataverseAPI.execute({
      operationName: 'PublishXml',
      operationType: 'action',
      parameters: {
        ParameterXml: publishXml,
      },
    });
  },

  async publishDashboard(dashboardIds: string[]): Promise<void> {
    const dashboardXml = dashboardIds.map(id => `<dashboard>{${id}}</dashboard>`).join('');
    const publishXml = `<importexportxml><dashboards>${dashboardXml}</dashboards></importexportxml>`;

    await window.dataverseAPI.execute({
      operationName: 'PublishXml',
      operationType: 'action',
      parameters: {
        ParameterXml: publishXml,
      },
    });
  },

  async publishWebResources(webResourceIds: string[]): Promise<void> {
    const wrXml = webResourceIds.map(id => `<webresource>{${id}}</webresource>`).join('');
    const publishXml = `<importexportxml><webresources>${wrXml}</webresources></importexportxml>`;

    await window.dataverseAPI.execute({
      operationName: 'PublishXml',
      operationType: 'action',
      parameters: {
        ParameterXml: publishXml,
      },
    });
  },

  async publishSiteMap(): Promise<void> {
    const publishXml = '<importexportxml><sitemaps><sitemap></sitemap></sitemaps></importexportxml>';

    await window.dataverseAPI.execute({
      operationName: 'PublishXml',
      operationType: 'action',
      parameters: {
        ParameterXml: publishXml,
      },
    });
  },

  async publishAll(): Promise<void> {
    await window.dataverseAPI.execute({
      operationName: 'PublishAllXml',
      operationType: 'action',
    });
  },
};
