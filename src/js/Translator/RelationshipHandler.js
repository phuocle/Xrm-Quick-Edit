(function (RelationshipHandler, undefined) {
    "use strict";

    // Relationship metadata does NOT have DisplayName/Description.
    // The only translatable label is AssociatedMenuConfiguration.Label (navigation menu label).
    // When Behavior = "UseCollectionName", the label shown is the entity's plural name.
    // We show that plural name as default in the grid. If the user edits it,
    // Save sets Behavior = "UseLabel" and stores the custom label.

    var _pluralNames = {}; // entityLogicalName -> { lcid: label, ... }

    function GetMenuLabel(rel) {
        if (rel._menuConfig && rel._menuConfig.Label) {
            return rel._menuConfig.Label;
        }
        return { LocalizedLabels: [] };
    }

    function IsUsingPluralName(rel) {
        var config = rel._menuConfig || {};
        return !config.Behavior || config.Behavior === "UseCollectionName";
    }

    function ApplyChanges(changes, labels) {
        for (var change in changes) {
            if (!changes.hasOwnProperty(change)) {
                continue;
            }
            if (!changes[change]) {
                continue;
            }

            var found = false;
            for (var i = 0; i < labels.length; i++) {
                if (labels[i].LanguageCode == change) {
                    labels[i].Label = changes[change];
                    labels[i].HasChanged = true;
                    found = true;
                    break;
                }
            }
            if (!found) {
                labels.push({ LanguageCode: parseInt(change, 10), Label: changes[change] });
            }
        }
    }

    function GetUpdates() {
        var records = XrmTranslator.GetGrid().records;
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var rel = XrmTranslator.GetAttributeByProperty("recid", record.recid);
            if (!rel) {
                continue;
            }

            var menuLabel = GetMenuLabel(rel);
            var changes = record.w2ui.changes;

            // If switching from UseCollectionName to UseLabel,
            // pre-populate LocalizedLabels with plural names so existing languages are preserved
            if (IsUsingPluralName(rel) && rel._navEntity && _pluralNames[rel._navEntity]) {
                var plurals = _pluralNames[rel._navEntity];
                menuLabel.LocalizedLabels = [];
                for (var lcid in plurals) {
                    if (plurals.hasOwnProperty(lcid)) {
                        menuLabel.LocalizedLabels.push({
                            LanguageCode: parseInt(lcid, 10),
                            Label: plurals[lcid]
                        });
                    }
                }
            }

            ApplyChanges(changes, menuLabel.LocalizedLabels);
            updates.push(rel);
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var rel = XrmTranslator.metadata[i];
            var menuLabel = GetMenuLabel(rel);
            var labels = menuLabel.LocalizedLabels;

            var record = {
                recid: rel.recid,
                schemaName: rel.SchemaName + " (" + rel.relType + ")"
            };

            if (labels && labels.length > 0) {
                // Has custom label (Behavior = UseLabel)
                for (var j = 0; j < labels.length; j++) {
                    record[labels[j].LanguageCode.toString()] = labels[j].Label;
                }
            } else if (IsUsingPluralName(rel) && rel._navEntity && _pluralNames[rel._navEntity]) {
                // Using plural name — show it as default (edits will switch to UseLabel)
                var plurals = _pluralNames[rel._navEntity];
                for (var lcid in plurals) {
                    if (plurals.hasOwnProperty(lcid)) {
                        record[lcid] = plurals[lcid];
                    }
                }
            }

            records.push(record);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    function FetchPluralNames(entityNames) {
        if (entityNames.length === 0) {
            return WebApiClient.Promise.resolve();
        }

        var filterParts = [];
        for (var i = 0; i < entityNames.length; i++) {
            filterParts.push("LogicalName eq '" + entityNames[i] + "'");
        }

        return WebApiClient.Retrieve({
            entityName: "EntityDefinition",
            queryParams: "?$select=LogicalName,DisplayCollectionName&$filter=" + filterParts.join(" or ")
        })
        .then(function (response) {
            var entities = response.value || [];
            for (var i = 0; i < entities.length; i++) {
                var ent = entities[i];
                var labels = ent.DisplayCollectionName && ent.DisplayCollectionName.LocalizedLabels;
                if (labels && labels.length > 0) {
                    var map = {};
                    for (var j = 0; j < labels.length; j++) {
                        map[labels[j].LanguageCode.toString()] = labels[j].Label;
                    }
                    _pluralNames[ent.LogicalName] = map;
                }
            }
        });
    }

    RelationshipHandler.Load = function () {
        var entityName = XrmTranslator.GetEntity();
        var entityMetadataId = XrmTranslator.entityMetadata[entityName];

        var oneToManyRequest = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/OneToManyRelationships"
        };

        var manyToOneRequest = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/ManyToOneRelationships"
        };

        var manyToManyRequest = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/ManyToManyRelationships"
        };

        return WebApiClient.Promise.all([
            WebApiClient.Retrieve(oneToManyRequest),
            WebApiClient.Retrieve(manyToOneRequest),
            WebApiClient.Retrieve(manyToManyRequest)
        ])
        .then(function (responses) {
            var allRels = [];
            var navEntityNames = {};

            // 1:N — this entity is parent (referenced)
            // Navigation appears on parent form, label = plural name of child entity
            for (var i = 0; i < responses[0].value.length; i++) {
                var r = responses[0].value[i];
                if (r.IsCustomizable && !r.IsCustomizable.Value) {
                    continue;
                }
                var rMenu = r.AssociatedMenuConfiguration || {};
                if (rMenu.IsCustomizable === false) {
                    continue;
                }
                navEntityNames[r.ReferencingEntity] = true;
                allRels.push({
                    recid: r.MetadataId,
                    MetadataId: r.MetadataId,
                    SchemaName: r.SchemaName,
                    relType: "1:N \u2192 " + r.ReferencingEntity,
                    _menuConfig: r.AssociatedMenuConfiguration || {},
                    _navEntity: r.ReferencingEntity
                });
            }

            // N:1 — this entity is child (referencing), lookup to parent
            // Navigation appears on parent form, label = plural name of THIS entity
            for (var k = 0; k < responses[1].value.length; k++) {
                var n = responses[1].value[k];
                if (n.IsCustomizable && !n.IsCustomizable.Value) {
                    continue;
                }
                var nMenu = n.AssociatedMenuConfiguration || {};
                if (nMenu.IsCustomizable === false) {
                    continue;
                }
                navEntityNames[entityName] = true;
                allRels.push({
                    recid: n.MetadataId,
                    MetadataId: n.MetadataId,
                    SchemaName: n.SchemaName,
                    relType: "N:1 \u2190 " + n.ReferencedEntity,
                    _menuConfig: n.AssociatedMenuConfiguration || {},
                    _navEntity: entityName
                });
            }

            // N:N
            for (var j = 0; j < responses[2].value.length; j++) {
                var m = responses[2].value[j];
                if (m.IsCustomizable && !m.IsCustomizable.Value) {
                    continue;
                }
                var mMenu = m.Entity1AssociatedMenuConfiguration || {};
                if (mMenu.IsCustomizable === false) {
                    continue;
                }
                var otherEntity = m.Entity2LogicalName;
                navEntityNames[otherEntity] = true;
                allRels.push({
                    recid: m.MetadataId,
                    MetadataId: m.MetadataId,
                    SchemaName: m.SchemaName,
                    relType: "N:N \u2194 " + otherEntity,
                    _menuConfig: m.Entity1AssociatedMenuConfiguration || {},
                    _menuConfig2: m.Entity2AssociatedMenuConfiguration || {},
                    _navEntity: otherEntity
                });
            }

            allRels.sort(function (a, b) {
                return a.SchemaName < b.SchemaName ? -1 : a.SchemaName > b.SchemaName ? 1 : 0;
            });

            XrmTranslator.metadata = allRels;

            // Fetch plural names for all related entities, then fill the table
            return FetchPluralNames(Object.keys(navEntityNames));
        })
        .then(function () {
            FillTable();
        })
        .catch(XrmTranslator.errorHandler);
    };

    RelationshipHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];

            // Skip relationships where nav pane is not customizable
            var menuConfig = update._menuConfig;
            if (menuConfig.IsCustomizable === false) {
                continue;
            }

            // Use RelationshipDefinitions endpoint (base path, no derived type in URL)
            var url = WebApiClient.GetApiUrl()
                + "RelationshipDefinitions(" + update.MetadataId + ")";

            // Set Behavior to UseLabel so the custom label is displayed
            var menuConfig = update._menuConfig;
            menuConfig.Behavior = "UseLabel";

            // Must include @odata.type so the API accepts derived-type properties
            var odataType = update.relType.indexOf("N:N") === 0
                ? "Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata"
                : "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata";

            var payload = { "@odata.type": odataType, SchemaName: update.SchemaName };
            if (update.relType.indexOf("N:N") === 0) {
                payload.Entity1AssociatedMenuConfiguration = menuConfig;
            } else {
                payload.AssociatedMenuConfiguration = menuConfig;
            }

            requests.push({
                method: "PUT",
                url: url,
                payload: payload,
                headers: [{ key: "MSCRM.MergeLabels", value: "true" }],
                metadataId: update.MetadataId
            });
        }

        return WebApiClient.Promise.resolve(requests)
            .each(function (request) {
                return WebApiClient.SendRequest(request.method, request.url, request.payload, request.headers);
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");
                return XrmTranslator.Publish();
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    updates.map(function (u) { return u.MetadataId; }),
                    XrmTranslator.ComponentType.EntityRelationship
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return RelationshipHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.RelationshipHandler = window.RelationshipHandler || {}));
