/* @preserve
 * MIT License
 *
 * Copyright (c) 2017 Florian Krönert
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
*/
(function (ViewHandler, undefined) {
    "use strict";
    
    function ApplyChanges(changes, labels) {
        for (var change in changes) {
            if (!changes.hasOwnProperty(change)) {
                continue;
            }
            
            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];
                
                if (label.LanguageCode == change) {
                    label.Label = changes[change];
                    label.HasChanged = true;
                    
                    break;
                }
                
                // Did not find label for this language
                if (i === labels.length - 1) {
                    labels.push({ LanguageCode: change, Label: changes[change] })
                }
            }
        }
    }
    
    function GetUpdates() {
        var records = XrmTranslator.GetGrid().records;
        
        var updates = [];
        
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            
            if (record.w2ui && record.w2ui.changes) {
                var attribute = XrmTranslator.GetAttributeByProperty("recid", record.recid);
                var labels = attribute.labels.Label.LocalizedLabels;
                
                var changes = record.w2ui.changes;
                
                ApplyChanges(changes, labels);
                updates.push(attribute);
            }
        }
        
        return updates;
    }
    
    function FillTable () {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        
        var records = [];
        
        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var view = XrmTranslator.metadata[i];

            var displayNames = view.labels.Label.LocalizedLabels;
            
            if (!displayNames || displayNames.length === 0) {
                continue;
            }
            
            var record = {
               recid: view.recid,
               schemaName: "View"
            };
            
            for (var j = 0; j < displayNames.length; j++) {
                var displayName = displayNames[j];
                
                record[displayName.LanguageCode.toString()] = displayName.Label;
            }
            
            records.push(record);
        }
        
        grid.add(records);
        grid.unlock();
    }
    
    ViewHandler.Load = function() {
        var entityName = XrmTranslator.GetEntity();
        
        var entityMetadataId = XrmTranslator.entityMetadata[entityName];
        
        var queryRequest = {
            entityName: "savedquery", 
            queryParams: "?$filter=returnedtypecode eq '" + entityName.toLowerCase() + "' and iscustomizable/Value eq true&$orderby=savedqueryid asc"
        };
        
        var languages = XrmTranslator.installedLanguages.LocaleIds;
        var initialLanguage = XrmTranslator.userSettings.uilanguageid;

        WebApiClient.Retrieve(queryRequest)
            .then(function(response) {
                var views = response.value;
                var requests = [];
                
                for (var i = 0; i < views.length; i++) {
                    var view = views[i];
                    
                    var prop = Promise.props({
                        recid: view.savedqueryid,
                        labels: WebApiClient.SendRequest("GET", WebApiClient.GetApiUrl() + "RetrieveLocLabels(EntityMoniker=@p1,AttributeName=@p2,IncludeUnpublished=@p3)?@p1={'@odata.id':'savedqueries(" + view.savedqueryid + ")'}&@p2='name'&@p3=true")
                    });
                    
                    requests.push(prop);
                }
                
                return Promise.all(requests);
            })
            .then(function(responses) {
                    var views = responses;
                    XrmTranslator.metadata = views;
                    
                    FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    }
    
    ViewHandler.Save = function() {
        XrmTranslator.LockGrid("Saving");
        
        var updates = GetUpdates();
        var requests = [];
        
        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            
            var request = WebApiClient
                .SendRequest("GET", WebApiClient.GetApiUrl() 
                + "SetLocLabels(EntityMoniker=@p1,AttributeName=@p2,IncludeUnpublished=@p3)?@p1={'@odata.id':'savedqueries(" + view.savedqueryid + ")'}&@p2='name'&@p3=true");
           
            requests.push(request);
        }
        
        Promise.resolve(requests)
            .each(function(request) {
                return WebApiClient.SendRequest(request.method, request.url, request.attribute, request.headers);
            })
            .then(function (response){
                XrmTranslator.LockGrid("Publishing");
                
                return XrmTranslator.Publish();
            })
            .then(function (response) {
                XrmTranslator.LockGrid("Reloading");
                
                return AttributeHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    }
} (window.ViewHandler = window.ViewHandler || {}));