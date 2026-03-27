# Implementation Guide: SiteMap Translation Handler

## Overview

Add a new translation type `sitemap` to allow translating **Title** and **Description** labels of SiteMap areas, groups, and subareas. These control the left-hand navigation in model-driven apps.

**Priority:** 🔴 High  
**Pattern:** Similar to `FormMetaHandler.js` (uses `RetrieveLocLabels` / `SetLocLabels`)  
**ComponentType:** `SiteMap = 62` (already defined in `XrmTranslator.ComponentType`)

> **Important:** SiteMap translations are NOT included in `CrmTranslations.xml` export — they can only be translated via API or by editing `Customizations.xml`. This makes a UI tool especially valuable.

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/SiteMapHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `SiteMapHandler.js`

Create file: `src/js/Translator/SiteMapHandler.js`

### Key Concepts

- SiteMap records are stored in the `sitemap` entity
- Each sitemap has an `sitemapxml` field containing XML
- The XML contains `<Area>`, `<Group>`, `<SubArea>` elements
- Each element has translatable `Title` attributes and `<Titles>` child nodes with `<Title LCID="1033" Title="..." />` entries
- We use `RetrieveLocLabels` / `SetLocLabels` to read/write the localized `sitemapname` attribute
- However, the **internal Area/Group/SubArea titles** must be read from `sitemapxml` and updated via XML manipulation

### Approach: Two-Level Translation

**Level 1 (Simple):** SiteMap name itself — use `RetrieveLocLabels` / `SetLocLabels` on `sitemapname` attribute.

**Level 2 (Complex):** Area/Group/SubArea titles — parse `sitemapxml`, extract `<Titles>` elements, modify and PATCH back.

### Recommended: Start with Level 2 (XML-based) as it provides the most value

```javascript
(function (SiteMapHandler, undefined) {
    "use strict";

    var siteMapData = [];
    var idSeparator = "|";

    /**
     * Parse sitemap XML and extract all translatable nodes.
     * Each Area, Group, SubArea can have <Titles> with <Title LCID="1033" Title="..." />
     * and <Descriptions> with <Description LCID="1033" Description="..." />
     *
     * Returns array of { id, type, parentLabel, titles: [{lcid, text}], descriptions: [{lcid, text}] }
     */
    function ParseSiteMapXml(xmlString) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlString, "text/xml");
        var results = [];

        function extractTitles(node) {
            var titles = [];
            var titlesNode = node.querySelector(":scope > Titles");
            if (titlesNode) {
                var titleNodes = titlesNode.querySelectorAll("Title");
                for (var i = 0; i < titleNodes.length; i++) {
                    titles.push({
                        lcid: titleNodes[i].getAttribute("LCID"),
                        text: titleNodes[i].getAttribute("Title")
                    });
                }
            }
            return titles;
        }

        function extractDescriptions(node) {
            var descs = [];
            var descsNode = node.querySelector(":scope > Descriptions");
            if (descsNode) {
                var descNodes = descsNode.querySelectorAll("Description");
                for (var i = 0; i < descNodes.length; i++) {
                    descs.push({
                        lcid: descNodes[i].getAttribute("LCID"),
                        text: descNodes[i].getAttribute("Description")
                    });
                }
            }
            return descs;
        }

        // Process Areas
        var areas = doc.querySelectorAll("Area");
        for (var a = 0; a < areas.length; a++) {
            var area = areas[a];
            var areaId = area.getAttribute("Id");
            results.push({
                id: areaId,
                type: "Area",
                nodeType: "Area",
                parentLabel: "",
                titles: extractTitles(area),
                descriptions: extractDescriptions(area)
            });

            // Process Groups within Area
            var groups = area.querySelectorAll(":scope > Group");
            for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                var groupId = group.getAttribute("Id");
                results.push({
                    id: groupId,
                    type: "Group",
                    nodeType: "Group",
                    parentLabel: areaId,
                    titles: extractTitles(group),
                    descriptions: extractDescriptions(group)
                });

                // Process SubAreas within Group
                var subAreas = group.querySelectorAll(":scope > SubArea");
                for (var s = 0; s < subAreas.length; s++) {
                    var subArea = subAreas[s];
                    var subAreaId = subArea.getAttribute("Id");
                    results.push({
                        id: subAreaId,
                        type: "SubArea",
                        nodeType: "SubArea",
                        parentLabel: areaId + " > " + groupId,
                        titles: extractTitles(subArea),
                        descriptions: extractDescriptions(subArea)
                    });
                }
            }
        }

        return results;
    }

    /**
     * Apply label changes back into the sitemap XML string.
     * Uses DOMParser to safely modify XML.
     */
    function ApplyXmlUpdates(xmlString, updates) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlString, "text/xml");
        var serializer = new XMLSerializer();

        for (var u = 0; u < updates.length; u++) {
            var update = updates[u];
            // Find the node by type and Id attribute
            var nodes = doc.querySelectorAll(update.nodeType + "[Id='" + update.id + "']");
            if (nodes.length === 0) {
                continue;
            }
            var node = nodes[0];

            // Update Titles
            var component = XrmTranslator.GetComponent();
            if (component === "DisplayName") {
                var titlesNode = node.querySelector(":scope > Titles");
                if (!titlesNode) {
                    titlesNode = doc.createElement("Titles");
                    node.insertBefore(titlesNode, node.firstChild);
                }

                for (var l = 0; l < update.labels.length; l++) {
                    var label = update.labels[l];
                    var existing = titlesNode.querySelector("Title[LCID='" + label.lcid + "']");
                    if (existing) {
                        existing.setAttribute("Title", label.text);
                    } else {
                        var newTitle = doc.createElement("Title");
                        newTitle.setAttribute("LCID", label.lcid);
                        newTitle.setAttribute("Title", label.text);
                        titlesNode.appendChild(newTitle);
                    }
                }
            } else {
                // Description
                var descsNode = node.querySelector(":scope > Descriptions");
                if (!descsNode) {
                    descsNode = doc.createElement("Descriptions");
                    node.insertBefore(descsNode, node.firstChild);
                }

                for (var d = 0; d < update.labels.length; d++) {
                    var descLabel = update.labels[d];
                    var existingDesc = descsNode.querySelector("Description[LCID='" + descLabel.lcid + "']");
                    if (existingDesc) {
                        existingDesc.setAttribute("Description", descLabel.text);
                    } else {
                        var newDesc = doc.createElement("Description");
                        newDesc.setAttribute("LCID", descLabel.lcid);
                        newDesc.setAttribute("Description", descLabel.text);
                        descsNode.appendChild(newDesc);
                    }
                }
            }
        }

        return serializer.serializeToString(doc);
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var s = 0; s < siteMapData.length; s++) {
            var sm = siteMapData[s];
            var parent = {
                recid: sm.sitemapid,
                schemaName: sm.sitemapname || "SiteMap",
                w2ui: { editable: false, children: [] }
            };

            var component = XrmTranslator.GetComponent();
            var nodes = sm.nodes || [];

            for (var n = 0; n < nodes.length; n++) {
                var node = nodes[n];
                var child = {
                    recid: sm.sitemapid + idSeparator + node.id,
                    schemaName: "[" + node.type + "] " + node.id
                };

                var labels = component === "DisplayName" ? node.titles : node.descriptions;
                for (var l = 0; l < labels.length; l++) {
                    child[labels[l].lcid] = labels[l].text;
                }

                parent.w2ui.children.push(child);
            }

            records.push(parent);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    SiteMapHandler.Load = function () {
        siteMapData = [];

        // Query all active sitemaps
        return WebApiClient.Retrieve({
            entityName: "sitemap",
            queryParams: "?$select=sitemapid,sitemapname,sitemapxml"
        })
        .then(function (response) {
            var sitemaps = response.value;

            for (var i = 0; i < sitemaps.length; i++) {
                var sm = sitemaps[i];
                var nodes = [];

                if (sm.sitemapxml) {
                    try {
                        nodes = ParseSiteMapXml(sm.sitemapxml);
                    } catch (e) {
                        // Skip unparseable sitemaps
                    }
                }

                siteMapData.push({
                    sitemapid: sm.sitemapid,
                    sitemapname: sm.sitemapname,
                    sitemapxml: sm.sitemapxml,
                    nodes: nodes
                });
            }

            FillTable();
        })
        .catch(XrmTranslator.errorHandler);
    };

    SiteMapHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var records = XrmTranslator.GetAllRecords();
        var sitemapUpdates = {}; // sitemapid -> [{id, nodeType, labels}]

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var parts = record.recid.split(idSeparator);
            if (parts.length < 2) {
                continue;
            }

            var sitemapId = parts[0];
            var nodeId = parts[1];

            if (!sitemapUpdates[sitemapId]) {
                sitemapUpdates[sitemapId] = [];
            }

            // Find the node metadata
            var sm = siteMapData.find(function (s) { return s.sitemapid === sitemapId; });
            var nodeInfo = sm ? sm.nodes.find(function (n) { return n.id === nodeId; }) : null;

            var changes = record.w2ui.changes;
            var labels = [];
            for (var lang in changes) {
                if (!changes.hasOwnProperty(lang) || !changes[lang]) {
                    continue;
                }
                labels.push({ lcid: lang, text: changes[lang] });
            }

            if (labels.length > 0) {
                sitemapUpdates[sitemapId].push({
                    id: nodeId,
                    nodeType: nodeInfo ? nodeInfo.nodeType : "SubArea",
                    labels: labels
                });
            }
        }

        var sitemapIds = Object.keys(sitemapUpdates);

        return WebApiClient.Promise.resolve(sitemapIds)
            .each(function (sitemapId) {
                var sm = siteMapData.find(function (s) { return s.sitemapid === sitemapId; });
                if (!sm || !sm.sitemapxml) {
                    return;
                }

                var updatedXml = ApplyXmlUpdates(sm.sitemapxml, sitemapUpdates[sitemapId]);

                return WebApiClient.Update({
                    entityName: "sitemap",
                    entityId: sitemapId,
                    entity: {
                        sitemapxml: updatedXml
                    }
                });
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");
                // SiteMap publish uses PublishXml with <sitemaps> element
                return XrmTranslator.SetBaseLanguage(XrmTranslator.userId)
                    .then(function () {
                        var xml = "<importexportxml><sitemaps><sitemap></sitemap></sitemaps></importexportxml>";
                        var request = WebApiClient.Requests.PublishXmlRequest.with({
                            payload: { ParameterXml: xml }
                        });
                        return WebApiClient.Execute(request);
                    })
                    .then(function () {
                        return XrmTranslator.RestoreUserLanguage();
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    sitemapIds,
                    XrmTranslator.ComponentType.SiteMap
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return SiteMapHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.SiteMapHandler = window.SiteMapHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

Add after `BpfHandler.js`:

```html
<script type="text/javascript" src="../js/SiteMapHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

In `InitializeGrid()`, add to the `type` menu-radio items:

```javascript
{ id: 'sitemap', text: 'SiteMap', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

Add in `SetHandler()`:

```javascript
else if (XrmTranslator.GetType() === "sitemap") {
    currentHandler = SiteMapHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

SiteMap is **entity-independent** (like dashboards and webresources). It should be:

- **Enabled** when entity is "none"
- **Disabled** when an entity is selected

In the `entitySelect` click handler:

**When entity is "none":**
```javascript
w2ui['filterbar'].enable('type:sitemap');
```

**When entity is selected (not "none"):**
```javascript
w2ui['filterbar'].disable('type:sitemap');
```

Also add `"sitemap"` to the array check that resets to "attributes" when switching entity:

```javascript
if (["content", "webresources", "dashboards", "sitemap"].indexOf(w2ui.filterbar.get("type").selected) !== -1) {
    w2ui.filterbar.get("type").selected = "attributes";
    w2ui.filterbar.refresh();
}
```

---

## Step 6: Update `README.md`

Add to the Translation Management Dashboard features list:

```markdown
- **SiteMap** - Navigation areas, groups, and subareas
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve sitemaps | `GET sitemaps?$select=sitemapid,sitemapname,sitemapxml` |
| Update XML | `PATCH sitemaps({id})` with `{ sitemapxml: "..." }` |
| Publish | `PublishXml` with `<sitemaps><sitemap></sitemap></sitemaps>` |
| AddToSolution | `ComponentType = 62` (SiteMap) |

## Testing

1. Select Entity → None
2. Select Type → SiteMap, Component → DisplayName
3. Grid should show all SiteMap areas/groups/subareas with current title labels
4. Edit a label for a non-base language
5. Click Save → verify navigation labels updated in CRM
6. Test Component → Description for description labels
7. Test with multiple sitemaps if present
8. **Edge case:** Test with subareas that have no existing `<Titles>` node (should create new)

## Known Considerations

- `:scope` CSS pseudo-class may not be supported in IE11. If IE11 support is needed, use manual child node iteration instead of `querySelector(":scope > ...")`.
- SiteMap XML structure can vary between Unified Interface and legacy web client. Test with both.
- DOMParser/XMLSerializer should work fine for SiteMap XML (unlike BPF XAML which had namespace issues).
