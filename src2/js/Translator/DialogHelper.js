(function (DialogHelper, undefined) {
    "use strict";

    var icons = {
        alert: '<span class="xqt-dialog-icon xqt-dialog-icon-alert">&#9432;</span>',
        confirm: '<span class="xqt-dialog-icon xqt-dialog-icon-confirm">&#9888;</span>',
        question: ''
    };

    function escapeHtml(text) {
        return text.replace(/[&<>\n]/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\n': '<br/>' }[m];
        });
    }

    function buildBody(type, message) {
        return '<div class="xqt-dialog-body xqt-dialog-body-' + type + '">' +
               (icons[type] || '') +
               '<span class="xqt-dialog-message">' + escapeHtml(message) + '</span>' +
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
                showMax: false,
                style: options.style || "",
                onOpen: function (event) {
                    event.onComplete = function () {
                        var popup = document.querySelector("#w2ui-popup");
                        if (!popup) {
                            return;
                        }

                        popup.classList.add("xqt-dialog-popup");
                        if (options.popupClass) {
                            popup.classList.add(options.popupClass);
                        }
                    };
                },
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
