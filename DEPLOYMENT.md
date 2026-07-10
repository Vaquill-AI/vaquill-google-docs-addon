# Vaquill for Google Docs: Deployment and Auth Runbook

This add-on is a thin client of the Vaquill backend.
It does not call any model or search provider directly, and it holds no provider API keys.
Every AI feature (contract review, NDA triage, compliance, risk, chat, and grounded citations) runs on `api.vaquill.ai`, authenticated as the signed-in Vaquill user.
If auth or the backend is not reachable, features fail with a clear message rather than silently degrading.

## Architecture

- Svelte 5 sidebar (built by Vite into a single `sidebar.html`).
- Google Apps Script server layer that reads and writes the document and calls the Vaquill backend.
- Auth: Apps Script produces a Google-signed identity token via `ScriptApp.getIdentityToken()`, the backend exchanges it for a Supabase session at `POST /api/v1/auth/google-addon-exchange`, and the session is cached per user in `UserProperties`.
- Native tracked-change suggestions and anchored comments use the Google Docs REST API (Developer Preview); when the account is not enrolled they fall back to highlighted markup and to a Drive comment, respectively.

## What you need

1. Node.js 20+ and the clasp CLI (`npm install -g @google/clasp`).
2. A standard Google Cloud project associated with the Apps Script project.
   This is required for `ScriptApp.getIdentityToken()` to work.
   The default hidden GCP project is not sufficient.
3. The Vaquill backend deployed and reachable at your `BACKEND_URL` (defaults to `https://api.vaquill.ai`).
4. On the backend: the setting `GOOGLE_ADDON_CLIENT_ID` set to the OAuth client id of the add-on's GCP project.
   This is the audience the backend verifies on the identity token.

## No provider keys required

Earlier standalone builds needed model and search provider API keys in Script Properties.
Those are gone.
The only Script Properties this add-on reads are optional:

| Property | Required | Purpose |
|----------|----------|---------|
| `BACKEND_URL` | No | Overrides the backend base URL. Defaults to `https://api.vaquill.ai`. |
| `NATIVE_SUGGESTIONS` | No | Set to `false` to force highlighted-markup redlines instead of native tracked changes. |

## Build and deploy

```bash
cd google-docs-extension
npm install
npm run build:all      # builds the sidebar and transpiles the GAS files into dist/gas
npm run gas:login      # clasp login
clasp create --type standalone --title "Vaquill for Docs"
# clasp create writes the returned script id into the repo-root ./.clasp.json.
# That file (gitignored) is the persistent home for your Script ID, so the
# Vite build emptying dist/ never wipes it. To set the id explicitly instead:
#   CLASP_SCRIPT_ID=<script-id> npm run build:gas
npm run gas:push       # push dist/gas to the Apps Script project
npm run gas:open       # open the editor
```

clasp is run from the repo root; the root `.clasp.json` carries `rootDir: "./dist/gas"` and the `filePushOrder` for the five `.gs` files plus `sidebar.html`.
`npm run deploy` chains `build:all` then `gas:push` in one step.

In the Apps Script editor, open Project Settings and set the Google Cloud project to your standard GCP project.
Confirm the manifest includes the `openid` scope (it does) so `getIdentityToken()` returns an OpenID token with the user's email.

## Auth smoke test (run this first, before trusting any feature)

The auth chain is the single point of failure, so verify it explicitly.

1. Open a Google Doc, then Extensions, then Vaquill, then Open Vaquill.
2. Open the settings gear.
   The Account section resolves your Vaquill status.
   - "Signed in" with your email means the identity-token exchange and the session mint both worked.
   - "No Vaquill account for this Google account" means the token verified but there is no matching Vaquill user.
     Sign up at vaquill.ai with the same Google email, then reopen.
   - "Not connected to Vaquill" means the exchange failed (backend unreachable or `GOOGLE_ADDON_CLIENT_ID` unset).
3. If the account resolves, run a contract review.
   A successful grounded result confirms the bearer reaches the backend and the RAG endpoints respond.
4. If anything fails, the sidebar shows a plain-language reason.
   Cross-check the backend logs for `addon_exchange_*` events.

Known verification points that must hold in the live environment:

- `getIdentityToken()` must include an `email` claim and an `aud` equal to `GOOGLE_ADDON_CLIENT_ID`.
- The backend session mint (`generate_link` then `verify_otp`) must return a Supabase session.
  The service tries the `token_hash` form first and the numeric OTP second for cross-version robustness.
- Grounded chat requires the user to belong to a Vaquill organization.
  Personal-workspace accounts get an explicit error on the Ask tab.

## Developer Preview features

Native tracked-change suggestions and anchored comments require enrollment in the Google Workspace Developer Preview Program on the account running the add-on.
Without enrollment:

- Redlines apply as highlighted markup (the sidebar says so).
- Cite authority inserts the comment via the Drive API instead of the native comment API.

## Tabs and features

- Review: contract review, NDA triage, and compliance, with per-finding apply, go-to-clause, and cite-authority.
- Playbooks: adopt firm negotiation playbooks (positions, fallback ladders, deal-breakers) and set an active one that Review runs against.
- Draft: rewrite a selected clause (apply as a tracked change), explain a clause in plain English, or generate a full first draft.
- Library: insert a saved clause at the cursor, or send a saved prompt to Ask.
- Ask: grounded RAG chat over the open document.

Version comparison, executive summary, and the clause map were removed from the add-on.
They have no non-streaming backend endpoint that Apps Script can consume, so shipping them would have meant an ungrounded model call, which this add-on does not do.
