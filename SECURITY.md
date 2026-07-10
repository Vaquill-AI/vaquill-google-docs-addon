# Security Policy

## Reporting a vulnerability

If you find a security issue, please report it privately.
Do not open a public issue for security reports.

Email **security@vaquill.ai** with a description of the issue and steps to reproduce.
We will acknowledge your report and work with you on a fix and disclosure timeline.

## Scope

This repository is the Google Docs add-on client only.
It authenticates the signed-in user and calls the Vaquill backend; it holds no provider API keys and runs no model locally.

In scope:

- The Apps Script server code and the Svelte sidebar in this repository.
- The client side of the authentication exchange.

Out of scope for this repository:

- The Vaquill backend, models, prompts, corpus, and hosted services, which are not part of this codebase.
- Reports that require a valid Vaquill account to demonstrate backend behavior should go to the same address, but note that the backend is maintained separately.

## Good to know

- The add-on never stores a provider API key, and it caches only a short-lived session per user in Apps Script `UserProperties`.
- Please do not include real credentials, tokens, or personal data in any report, sample document, or pull request.
