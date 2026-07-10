# Contributing

Thanks for your interest in the Vaquill for Google Docs add-on.

## What this repository is

This is a client only.
It is the Google Docs add-on: an Apps Script server layer plus a Svelte 5 sidebar, built into a single `sidebar.html`.
Every AI feature calls the Vaquill backend, which is not part of this repository.
To run the add-on end to end you need a Vaquill account, or your own backend that implements a compatible API.
The integration point is `callBackend()` in [src/gas/ApiClient.ts](src/gas/ApiClient.ts).

Because of that, most contributions here are to the client: the sidebar UI, the document read/write and suggestion logic, the auth exchange, and the build tooling.

## Development setup

```bash
npm install
npm run dev        # Vite dev server for the sidebar UI in a browser
npm run check      # svelte-check type validation
npm run build:all  # build the sidebar and transpile the GAS files into dist/gas
```

The sidebar only reaches the document and the backend when it runs inside Google Docs.
In a plain browser it renders but shows an out-of-environment message.

See [DEPLOYMENT.md](DEPLOYMENT.md) for pushing to an Apps Script project with clasp.

## Before you open a pull request

- Run `npm run check` and `npm run build:all`; both must pass with no errors.
- The Apps Script files under `src/gas` are TypeScript that is transpiled to `.gs`.
  They share a single global scope, so cross-file references go through `globalThis`, and there are no ES module imports at runtime.
- Keep changes small and focused, with a clear description of what and why.
- Match the surrounding code style.

## Style

- Do not use em dashes in code, comments, or UI text. Use periods, commas, or parentheses.
- Do not use emojis in code or UI text.
- Use US spelling.
- The UI follows Google Material styling so it feels native in Google Docs.

## Licensing of contributions

This project is licensed under the Apache License, Version 2.0.
By submitting a contribution, you agree that it is licensed under the same terms.
Do not submit code you do not have the right to license, and do not include secrets, credentials, or private data in code, comments, or commit history.

## Trademarks

The Apache License covers the code, not the Vaquill name or logo.
See [NOTICE](NOTICE).
Forks and derivative works must use a different name and must not imply affiliation with or endorsement by Vaquill.
