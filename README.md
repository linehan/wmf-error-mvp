# wmf-error-mvp
Bare requirements for client-side error logging library. Minified size is ~2.1Kb, but could be reduced by factoring the Tracekit implementation. Almost everything was thrown away including
- Synthetic events
- Promise rejection handling
- Events from strings, plain objects, etc
- Complicated and opaque queueing and triggering behavior
- Lazy loading and SDK injection with fancy CORS workarounds
- Just everything

It is also now in plain old JS.

## To try:
1. Clone somewhere you can access via HTTP(S). If you try to use `file:///` all of the errors will be seen as 'Script Error' and things won't work.
2. Navigate to `https://whatever.org/path/to/wmf-error-mvp/test`
