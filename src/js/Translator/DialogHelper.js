(function (DialogHelper, undefined) {
    "use strict";

    var icons = {
        alert: '<span style="font-size: 28px; margin-right: 15px; flex-shrink: 0; color: #4285f4;">&#9432;</span>',
        confirm: '<span style="font-size: 28px; margin-right: 15px; flex-shrink: 0; color: #e6a817;">&#9888;</span>',
        question: ''
    };

    function buildBody(type, message) {
        var escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
        return '<div style="padding: 20px 25px; display: flex; align-items: flex-start;">' +
               (icons[type] || '') +
               '<span style="flex: 1; word-wrap: break-word;">' + escaped + '</span>' +
               '</div>';
    }

    function buildButton(text, onclickValue) {
        return '<button class="w2ui-btn" onclick="DialogHelper._resolve(' + onclickValue + ');">' + text + '</button>';
    }

    DialogHelper.alert = function (message, options) {
        options = options || {};

        return new Promise(function (resolve) {
            w2popup.open({
                title: options.title || "Information",
                body: buildBody("alert", message),
                buttons: buildButton("OK", ""),
                width: options.width || 450,
                height: options.height || 220,
                modal: true,
                showClose: true,
                onClose: function () {
                    resolve();
                }
            });

            DialogHelper._resolve = function () {
                w2popup.close();
            };
        });
    };

    DialogHelper.confirm = function (message, options) {
        options = options || {};
        var result = false;

        return new Promise(function (resolve) {
            w2popup.open({
                title: options.title || "Confirm",
                body: buildBody("confirm", message),
                buttons: buildButton(options.noText || "No", "false") + ' ' +
                         buildButton(options.yesText || "Yes", "true"),
                width: options.width || 450,
                height: options.height || 220,
                modal: true,
                showClose: true,
                onClose: function () {
                    resolve(result);
                }
            });

            DialogHelper._resolve = function (value) {
                result = value;
                w2popup.close();
            };
        });
    };

    DialogHelper.question = function (message, buttons, options) {
        options = options || {};
        var result = null;

        return new Promise(function (resolve) {
            var buttonHtml = buttons.map(function (btn, index) {
                return buildButton(btn.text, index);
            }).join(' ');

            w2popup.open({
                title: options.title || "Question",
                body: buildBody("question", message),
                buttons: buttonHtml,
                width: options.width || 450,
                height: options.height || 220,
                modal: true,
                showClose: true,
                onClose: function () {
                    resolve(result);
                }
            });

            DialogHelper._resolve = function (index) {
                result = buttons[index].value;
                w2popup.close();
            };
        });
    };

}(window.DialogHelper = window.DialogHelper || {}));
