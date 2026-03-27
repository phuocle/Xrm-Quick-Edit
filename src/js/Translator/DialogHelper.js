(function (DialogHelper, undefined) {
    "use strict";

    var iconStyle = "font-size: 28px; margin-right: 15px; flex-shrink: 0;";

    var icons = {
        alert: '<span style="' + iconStyle + ' color: #4285f4;">&#9432;</span>',
        confirm: '<span style="' + iconStyle + ' color: #e6a817;">&#9888;</span>',
        question: ''
    };

    function escapeHtml(text) {
        return text.replace(/[&<>\n]/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\n': '<br/>' }[m];
        });
    }

    function buildBody(type, message) {
        return '<div style="padding: 20px 25px; display: flex; align-items: flex-start;">' +
               (icons[type] || '') +
               '<span style="flex: 1; word-wrap: break-word;">' + escapeHtml(message) + '</span>' +
               '</div>';
    }

    function buildButton(text, onclickValue) {
        return '<button class="w2ui-btn" onclick="DialogHelper._resolve(' + onclickValue + ');">' + escapeHtml(text) + '</button>';
    }

    function openDialog(type, title, message, buttonsHtml, options, onResolve) {
        options = options || {};
        var result;

        return new Promise(function (resolve) {
            w2popup.open({
                title: title,
                body: buildBody(type, message),
                buttons: buttonsHtml,
                width: options.width || 450,
                height: options.height || 220,
                modal: true,
                showClose: true,
                onClose: function () {
                    DialogHelper._resolve = null;
                    resolve(result);
                }
            });

            DialogHelper._resolve = function (value) {
                result = onResolve(value);
                w2popup.close();
            };
        });
    }

    DialogHelper.alert = function (message, options) {
        return openDialog("alert", (options && options.title) || "Information", message,
            buildButton("OK", ""),
            options,
            function () { return undefined; }
        );
    };

    DialogHelper.confirm = function (message, options) {
        options = options || {};
        return openDialog("confirm", options.title || "Confirm", message,
            buildButton(options.noText || "No", "false") + ' ' +
            buildButton(options.yesText || "Yes", "true"),
            options,
            function (value) { return value; }
        );
    };

    DialogHelper.question = function (message, buttons, options) {
        var buttonHtml = buttons.map(function (btn, index) {
            return buildButton(btn.text, index);
        }).join(' ');

        return openDialog("question", (options && options.title) || "Question", message,
            buttonHtml,
            options,
            function (index) { return buttons[index].value; }
        );
    };

}(window.DialogHelper = window.DialogHelper || {}));
