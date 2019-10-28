/*
 * ERRORS
 * ------
 *
 * Errors are captured by replacing window.onerror with our own
 * custom handler.
 *
 * What does this capture? 
 *
 *      1.) When a JavaScript runtime error (including syntax errors 
 *      and exceptions thrown within handlers) occurs, an error event 
 *      using interface ErrorEvent is fired at window and 
 *      window.onerror() is invoked (as well as handlers attached by 
 *      window.addEventListener (not only capturing)).
 *
 * What does this not capture?
 *
 *      2.) When a resource (such as an <img> or <script>) fails to 
 *      load, an error event using interface Event is fired at the 
 *      element that initiated the load, and the onerror() handler 
 *      on the element is invoked. These error events DO NOT bubble 
 *      up to window, but (at least in Firefox) can be handled with 
 *      a window.addEventListener configured with useCapture set 
 *      to True.
 *
 * NOTE
 * For historical reasons, different arguments are passed to 
 * window.onerror and element.onerror handlers (as well as on 
 * error-type window.addEventListener handlers).
 *
 *      window.onerror = function(message, source, lineno, colno, error)
 *      element.onerror = function(event) 
 *
 *
 * STACK TRACES
 * ------------
 *
 * Stack traces are formatted differently in each browser, and get 
 * stored in either:
 *
 *      Error.stacktrace, or 
 *      Error.stack. 
 *
 * NEITHER of these is standard, and NONE OF THIS is on any standards 
 * track. Still, almost all browsers implement it some way or another.
 *
 * Example (Chrome):
 * 
 *      Error: hi
 *          at three (test.js:3)
 *          at two (test.js:8)
 *          at one (test.js:13)
 *          at HTMLButtonElement.<anonymous> (test.js:20)
 *
 * This message was triggered by clicking a button, which called one(), 
 * which called two(), which called three(), which threw an Error.
 *
 * From a stack trace we need to extract, for each stack frame:
 *
 *      1: url of script containing function
 *      2: function name
 *      3: function arguments (if any)
 *      4: line number
 *      5: column number
 *
 * To do this, we use some regular expressions. They are written in such a 
 * way that only one can match, so no additional browser detection is 
 * necessary.
 *
 * FIXME
 * Should the correct browser be cached?
 */
var T_T = (function()
{
        function replace_window_onerror_handler()
        {
                /* Cache any original handler, and trigger after ours. */
                var original_handler = window.onerror; 

                /*
                 * Invoked when an runtime error occurs.
                 *
                 * @msg   : <string> error message 
                 * @src   : <string> URL of script that raised error 
                 * @lineno: <number> Line number where error occurred 
                 * @colno : <number> Column number where error occurred 
                 * @error : <Error> Error object 
                 * Return : <bool> if TRUE, prevent firing of default handler.
                 */
                window.onerror = function(msg, source, lineno, colno, error) 
                {
                        console.log(JSON.stringify(format_error_event(error)));

                        if (original_handler) {
                                original_handler.apply(window, arguments);
                        }

                        return true;
                }
        }

        /* Chromium-based browsers: Chrome, Brave, new Opera, new Edge */
        var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
        var gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
        var winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
        var geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
        var chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;
        var opera10 = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
        var opera11 = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i;

        /* Used as string value of any unknown function */ 
        var UNKNOWN_FUNCTION = '?';

        /**
         * Compute a normalized stack trace and format the error event.
         *
         * @error : Error object
         * @return: Object
         */
        function format_error_event(err) 
        {
                var stack = [];
                var message = "No error message";

                try {
                        stack = get_normalized_stack_trace(err);
                } catch (e) {
                        /* Nothin' */
                }

                if (err && err.message && typeof err.message === "string") {
                        message = err.message;
                }
            
                return {
	                meta: {
                                dt: Date.now().toISOString(),
                                stream: "client-runtime-error",
                        },
                        type: Object.prototype.toString.call(err),
                        message: message,
			url: window.location.href,
                        user_agent: navigator.userAgent,
                        stack_trace: stack,
                        tags: {
                                //version:
                                //wiki:
                                //skin:
                                //user_language:
                                //action:
                                //namespace:
                                //page_title:
                                //user_groups:
                                //debug:
                        },
                };
        }

        /**
         * Compute normalized stack trace from Error.stack or Error.stacktrace
         *
         * @error : Error object
         * @return: Array of stack frame objects.
         */
        function get_normalized_stack_trace(error) 
        {
                var stack = [];

                /*
                 * This has to come first because if you access Error.stack
                 * before Error.stacktrace, Opera 10/11 will inexplicably
                 * destroy Error.stacktrace.
                 */
                if (error && error.stacktrace) {
                        /* Store this because Opera is insane */
                        var stacktrace = error.stacktrace;
                        var line = stacktrace.split('\n');
                        var part;

                        for (var i=0; i<line.length; i+=2) {
                                var frame = null;

                                if ((part = opera10.exec(line[i]))) {
                                        frame = {
                                                url: part[2],
                                                func: part[3],
                                                args: [],
                                                line: +part[1],
                                                column: null,
                                        };
                                } else if ((part = opera11.exec(line[i]))) {
                                        frame = {
                                                url: part[6],
                                                func: part[3] || part[4],
                                                args: part[5] ? part[5].split(',') : [],
                                                line: +part[1],
                                                column: +part[2],
                                        };
                                }

                                if (frame !== null) {
                                        if (!frame.func && frame.line) {
                                                frame.func = UNKNOWN_FUNCTION;
                                        }
                                        stack.push(frame);
                                }
                        }
                } else if (error && error.stack) {
                        var line = error.stack.split('\n');
                        var submatch;
                        var part;

                        for (var i=0; i<line.length; ++i) {
                                var frame = null;

                                if ((part = chrome.exec(line[i]))) {
                                        var isNative = part[2] && part[2].indexOf('native') === 0; 
                                        var isEval = part[2] && part[2].indexOf('eval') === 0;

                                        if (isEval && (submatch = chromeEval.exec(part[2]))) {
                                                /*
                                                 * throw out eval line/column 
                                                 * and use top-most line/column 
                                                 * number
                                                 */
                                                part[2] = submatch[1]; // url
                                                part[3] = submatch[2]; // line
                                                part[4] = submatch[3]; // column
                                        }

                                        frame = {
                                                url: part[2],
                                                func: part[1] || UNKNOWN_FUNCTION,
                                                args: isNative ? [part[2]] : [],
                                                line: part[3] ? +part[3] : null,
                                                column: part[4] ? +part[4] : null,
                                        };
                                } else if ((part = winjs.exec(line[i]))) {
                                        frame = {
                                                url: part[2],
                                                func: part[1] || UNKNOWN_FUNCTION,
                                                args: [],
                                                line: +part[3],
                                                column: part[4] ? +part[4] : null,
                                        };
                                } else if ((part = gecko.exec(line[i]))) {
                                        var isEval = part[3] && part[3].indexOf(' > eval') > -1;

                                        if (isEval && (submatch = geckoEval.exec(part[3]))) {
                                                /* 
                                                 * throw out eval line/column 
                                                 * and use top-most line number 
                                                 */
                                                part[1] = part[1] || `eval`;
                                                part[3] = submatch[1];
                                                part[4] = submatch[2];
                                                part[5] = ''; // no column when eval
                                        } else if (i === 0 && !part[5] && error.columnNumber !== void 0) {
                                                /* JDL: void 0 is an ancient way of getting undefined */

                                                /* 
                                                 * FireFox uses this awesome 
                                                 * columnNumber property for 
                                                 * its top frame
                                                 *
                                                 * Also note, Firefox's column 
                                                 * number is 0-based and 
                                                 * everything else expects 
                                                 * 1-based, so adding 1.
                                                 *
                                                 * NOTE: this hack doesn't work 
                                                 * if top-most frame is eval
                                                 */
                                                stack[0].column = error.columnNumber + 1;
                                        }
                                        frame = {
                                                url: part[3],
                                                func: part[1] || UNKNOWN_FUNCTION,
                                                args: part[2] ? part[2].split(',') : [],
                                                line: part[4] ? +part[4] : null,
                                                column: part[5] ? +part[5] : null,
                                        };
                                } else {
                                        /* JDL: Not sure why continue here. */
                                        continue;
                                }

                                if (!frame.func && frame.line) {
                                        frame.func = UNKNOWN_FUNCTION;
                                }

                                stack.push(frame);
                        }
                }

                return stack;
        }

        return {
                "replace_window_onerror_handler": replace_window_onerror_handler,
        };
})();
