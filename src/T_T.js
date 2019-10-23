var T_T = (function()
{
        /**********************************************************************
         * LOAD THE THING
         **********************************************************************/
        function initialize()
        {
                var __orig_onerror = window["onerror"];
                /*
                 * MDN: 
                 * 1.) When a JavaScript runtime error (including syntax errors and 
                 * exceptions thrown within handlers) occurs, an error event using 
                 * interface ErrorEvent is fired at window and window.onerror() is 
                 * invoked (as well as handlers attached by window.addEventListener 
                 * (not only capturing)).
                 *
                 * 2.) When a resource (such as an <img> or <script>) fails to load, 
                 * an error event using interface Event is fired at the element that 
                 * initiated the load, and the onerror() handler on the element is 
                 * invoked. These error events do not bubble up to window, but 
                 * (at least in Firefox) can be handled with a window.addEventListener 
                 * configured with useCapture set to True.
                 *
                 * MDN: For historical reasons, different arguments are passed to 
                 * window.onerror and element.onerror handlers (as well as on 
                 * error-type window.addEventListener handlers).
                 *
                 *      window.onerror = function(message, source, lineno, colno, error)
                 *      element.onerror = function(event) 
                 *
                 * MDN: If an error occurs in a <script> loaded from a different
                 * origin, the details of the error are not provided to prevent
                 * leakage of information. It can be worked around in some browsers.
                 * See: https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers/onerror#Notes
                 */
                window["onerror"] = function(message, source, lineno, colno, error) 
                {
                        console.log(JSON.stringify(computeStacktrace(error)));

                        if (__orig_onerror) {
                                __orig_onerror.apply(window, arguments);
                        }

                        /* 
                         * returning TRUE will effectively 'handle' the error
                         * and prevent ugly messages on console about unhandled
                         * exceptions.
                         */
                        return true;
                }
        }

        /**********************************************************************
         * BUILD THE ERROR EVENT 
         * Derived from Sentry's tracekit.js, which is derived from Tracekit.
         * Can probably be factored.
         **********************************************************************/

        /* global reference to slice */
        var UNKNOWN_FUNCTION = '?';
        /* Chromium based browsers: Chrome, Brave, new Opera, new Edge */
        var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
        /*
         * gecko regex: `(?:bundle|\d+\.js)`: `bundle` is for react native, `\d+\.js` also but specifically for ram bundles because it
         * generates filenames without a prefix like `file://` the filenames in the stacktrace are just 42.js
         * We need this specific case for now because we want no other regex to match.
         */
        var gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
        var winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
        var geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
        var chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;

        /*
         * JL: 'ex' means 'Exception'
         */
        function computeStackTrace(ex) {
                let stack = null;
                var popSize = ex && ex.framesToPop;
                /*
                 * JL:
                 * Error.stacktrace - used by Opera
                 * Error.stack      - used by everything else
                 */
                try {
                         /*
                          * This must be tried first because Opera 10 *destroys*
                          * its stacktrace property if you try to access the stack
                          * property first!!
                          */
                        stack = computeStackTraceFromStacktraceProp(ex);
                        if (stack) {
                                return popFrames(stack, popSize);
                        }
                } catch (e) {
                        /* no-empty */
                }
            
                try {
                        stack = computeStackTraceFromStackProp(ex);
                        if (stack) {
                                return popFrames(stack, popSize);
                        }
                } catch (e) {
                        /* no-empty */
                }

                /* JDL: This is the proto-event right here. */
                return {
                        message: extractMessage(ex),
                        name: ex && ex.name,
                        stack: [],
                        failed: true,
                };
        }

        function computeStackTraceFromStackProp(ex) 
        {
                if (!ex || !ex.stack) {
                        return null;
                }

                var stack = [];
                var lines = ex.stack.split('\n');

                let isEval;
                let submatch;
                let parts;
                let element;

                for (let i = 0; i < lines.length; ++i) {
                        if ((parts = chrome.exec(lines[i]))) {
                                /* JL: This is disgusting ?? */
                                var isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
                                /* JL: This is disgusting ?? */
                                isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line

                                if (isEval && (submatch = chromeEval.exec(parts[2]))) {
                                        // throw out eval line/column and use top-most line/column number
                                        parts[2] = submatch[1]; // url
                                        parts[3] = submatch[2]; // line
                                        parts[4] = submatch[3]; // column
                                }
                                element = {
                                        url: parts[2],
                                        func: parts[1] || UNKNOWN_FUNCTION,
                                        args: isNative ? [parts[2]] : [],
                                        line: parts[3] ? +parts[3] : null,
                                        column: parts[4] ? +parts[4] : null,
                                };
                        } else if ((parts = winjs.exec(lines[i]))) {
                                element = {
                                        url: parts[2],
                                        func: parts[1] || UNKNOWN_FUNCTION,
                                        args: [],
                                        line: +parts[3],
                                        column: parts[4] ? +parts[4] : null,
                                };
                        } else if ((parts = gecko.exec(lines[i]))) {
                                isEval = parts[3] && parts[3].indexOf(' > eval') > -1;

                                if (isEval && (submatch = geckoEval.exec(parts[3]))) {
                                        /* throw out eval line/column and use top-most line number */
                                        parts[1] = parts[1] || `eval`;
                                        parts[3] = submatch[1];
                                        parts[4] = submatch[2];
                                        parts[5] = ''; // no column when eval
                                } else if (i === 0 && !parts[5] && ex.columnNumber !== void 0) {
                                        /* 
                                         * FireFox uses this awesome columnNumber property for its top frame
                                         * Also note, Firefox's column number is 0-based and everything else expects 1-based,
                                         * so adding 1
                                         * NOTE: this hack doesn't work if top-most frame is eval
                                         */
                                        stack[0].column = ex.columnNumber + 1;
                                }
                                element = {
                                        url: parts[3],
                                        func: parts[1] || UNKNOWN_FUNCTION,
                                        args: parts[2] ? parts[2].split(',') : [],
                                        line: parts[4] ? +parts[4] : null,
                                        column: parts[5] ? +parts[5] : null,
                                };
                        } else {
                                continue;
                        }
                
                        if (!element.func && element.line) {
                                element.func = UNKNOWN_FUNCTION;
                        }

                        stack.push(element);
                }

                if (!stack.length) {
                        return null;
                }

                return {
                        message: extractMessage(ex),
                        name: ex.name,
                        stack,
                };
        }

        function computeStackTraceFromStacktraceProp(ex) 
        {
                if (!ex || !ex.stacktrace) {
                        return null;
                }

                /*
                 * Access and store the stacktrace property before doing ANYTHING
                 * else to it because Opera is not very good at providing it
                 * reliably in other circumstances.
                 */
                var stacktrace = ex.stacktrace;
                var opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
                var opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i;
                var lines = stacktrace.split('\n');
                var stack = [];

                let parts;

                for (let line = 0; line < lines.length; line += 2) {
                        let element = null;

                        if ((parts = opera10Regex.exec(lines[line]))) {
                                element = {
                                        url: parts[2],
                                        func: parts[3],
                                        args: [],
                                        line: +parts[1],
                                        column: null,
                                };
                        } else if ((parts = opera11Regex.exec(lines[line]))) {
                                element = {
                                        url: parts[6],
                                        func: parts[3] || parts[4],
                                        args: parts[5] ? parts[5].split(',') : [],
                                        line: +parts[1],
                                        column: +parts[2],
                                };
                        }

                        if (element) {
                                if (!element.func && element.line) {
                                        element.func = UNKNOWN_FUNCTION;
                                }
                                stack.push(element);
                        }
                }

                if (!stack.length) {
                        return null;
                }

                return {
                        message: extractMessage(ex),
                        name: ex.name,
                        stack,
                };
        }

        /** Remove N number of frames from the stack */
        function popFrames(stacktrace, popSize) 
        {
                try {
                        return Object.assign(Object.assign({}, stacktrace), { stack: stacktrace.stack.slice(popSize) });
                } catch (e) {
                        return stacktrace;
                }
        }

        /**
         * There are cases where stacktrace.message is an Event object
         * https://github.com/getsentry/sentry-javascript/issues/1949
         * In this specific case we try to extract stacktrace.message.error.message
         */
        function extractMessage(ex) 
        {
                var message = ex && ex.message;
                
                if (!message) {
                        return 'No error message';
                }

                if (message.error && typeof message.error.message === 'string') {
                        return message.error.message;
                }

                return message;
        }

        return {
                "initialize": initialize,
        };
})();
