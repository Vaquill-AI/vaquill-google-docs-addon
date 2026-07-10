# Vaquill for Google Docs

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Legal AI contract copilot that lives in the Google Docs sidebar.

Vaquill reviews contracts, drafts and rewrites clauses, and answers grounded questions about the open document, without leaving Google Docs.

## What it is

This is a Google Workspace add-on: a Svelte 5 sidebar plus a Google Apps Script server layer.

It is a thin client of the Vaquill backend at `api.vaquill.ai`.
Every AI feature runs on the backend, authenticated as the signed-in Vaquill user.
There is no local model, and no provider API keys live in the add-on.
If auth or the backend is unreachable, features fail with a clear message rather than silently degrading.

Google Apps Script hosts the add-on, so there is no separate front-end server to run.
The only service you operate is the backend, which already exists.

## Features

| Tab | What it does |
|-----|--------------|
| Review | Contract review, NDA triage, and compliance checks. Auto detects the document type, applies findings as tracked changes, and can cite supporting authority. |
| Playbooks | Adopt firm negotiation playbooks (positions, fallback ladders, deal-breakers) and set one active so Review checks contracts against it. |
| Draft | Rewrite a selected clause as a tracked change, explain a clause in plain English, or generate a full first draft at the cursor. |
| Library | Insert a saved clause at the cursor, or send a saved prompt to the Ask tab. |
| Ask | Grounded chat over the open document, with citations back to the source text. |

Native tracked-change suggestions and anchored comments use the Google Docs REST API (Developer Preview).
When the account is not enrolled, redlines fall back to highlighted markup and comments fall back to the Drive API.

## Architecture

```
Sidebar (Svelte 5)  ->  google.script.run  ->  Apps Script (.gs)  ->  Vaquill backend (api.vaquill.ai)
```

- The Svelte sidebar is built by Vite into a single self-contained `sidebar.html`.
- The Apps Script layer reads and writes the document and calls the backend over server-side `UrlFetch` (exempt from CORS).
- Apps Script `UrlFetch` is blocking and cannot consume Server-Sent Events, so the add-on targets non-streaming JSON endpoints only.

### Auth

Apps Script produces a Google-signed identity token via `ScriptApp.getIdentityToken()`.
The backend verifies it and exchanges it for a Supabase session at `POST /api/v1/auth/google-addon-exchange`.
The session is cached per user in `UserProperties`, so no refresh token or anon key ever lives in the add-on.
This requires the `openid` scope in the manifest, which is already present.

## Requirements

1. Node.js 20 or newer.
2. The clasp CLI: `npm install -g @google/clasp`.
3. A standard Google Cloud project attached to the Apps Script project.
   This is required for `ScriptApp.getIdentityToken()`; the default hidden project is not sufficient.
4. The backend reachable at `BACKEND_URL` (defaults to `https://api.vaquill.ai`), with `GOOGLE_ADDON_CLIENT_ID` set to the add-on project's OAuth client id.

## Build and deploy

```bash
npm install
npm run gas:login          # one-time Google auth for clasp
npm run deploy:full        # create the Apps Script project (first run), build, and push
```

`deploy:full` is guarded: it checks the prerequisites, creates a standalone Apps Script project if one does not exist yet, builds, and pushes.
The Script ID is stored in the repo-root `.clasp.json` (gitignored), which survives the Vite build emptying `dist/`.

Individual steps are also available:

```bash
npm run build:all          # build the sidebar and transpile the GAS files into dist/gas
npm run gas:push           # push dist/gas to the Apps Script project
npm run gas:open           # open the Apps Script editor
npm run deploy             # build:all then gas:push
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full runbook, including the auth smoke test to run before trusting any feature.

## Development

```bash
npm run dev                # Vite dev server for the sidebar UI in a browser
npm run check              # svelte-check type validation
```

The sidebar only reaches the document and the backend when running inside Google Docs.
In a plain browser it renders but shows an out-of-environment message.

## Project structure

```
src/
  gas/                 Apps Script server files (.ts, transpiled to .gs)
    Code.ts            Entry point and function dispatcher
    AuthService.ts     Google identity to Supabase session exchange
    ApiClient.ts       Authenticated calls to the Vaquill backend
    NativeSuggestionService.ts  Native tracked-change redlines and comments
    SuggestionService.ts        Highlighted-markup fallback
  sidebar/             Svelte 5 sidebar
    components/        Panels and shared ui/ primitives
    stores/            Svelte 5 rune stores
    services/          gasClient wrappers over google.script.run
  shared/types.ts      Shared TypeScript types
scripts/build-gas.js   Build: Vite bundle plus TS to GAS transpile
appsscript.json        Add-on manifest (scopes, advanced services)
```

## Notes

- The UI follows Google Material styling so it feels native in Google Docs, rather than the Vaquill brand theme.
- Distribution is through the Google Workspace Marketplace, private to a Workspace organization or public.
  Public listing with restricted scopes triggers Google OAuth verification.

## You need a backend

This is a client only. Every AI feature calls the Vaquill backend, which is not part of this repository. To run the add-on you need either a Vaquill account (so the hosted backend answers), or your own backend that implements a compatible API. There is no local model and no place to plug in a model provider key; the integration point is `callBackend()` in [src/gas/ApiClient.ts](src/gas/ApiClient.ts), which targets the endpoints described above.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The Apache License covers the source code in this repository. It does not license the Vaquill name, logo, or brand, and it does not license the Vaquill backend, models, prompts, corpus, or hosted services. Forks and derivative works must use a different name and must not imply affiliation with or endorsement by Vaquill.
