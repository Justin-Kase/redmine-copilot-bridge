# Redmine Copilot Bridge

Import Redmine tickets — including all of their attachments — directly into
GitHub Copilot Chat, so you can discuss a ticket with full context in one step.

## What it does

One command pulls a Redmine issue, downloads every attachment, inserts each file
into Copilot Chat, then inserts a structured prompt describing the ticket.
Screenshots, mockups, email files, PDFs, and other attachments are available to
Copilot in the context of the ticket.

## Requirements

- **Visual Studio Code** 1.90.0 or newer
- **GitHub Copilot Chat** extension installed and signed in
- A **Redmine API key** with read access to issues (configured via the extension —
  see below)

## Setup

```bash
git clone https://github.com/Justin-Kase/redmine-copilot-bridge.git
cd redmine-copilot-bridge
npm install
```

## Configure

Run **Redmine Copilot Bridge: Configure…** from the Command Palette
(`Cmd+Shift+P`). A form opens where you enter:

- **Base URL** — your Redmine instance, e.g. `https://redmine.example.com`
  (no trailing slash). Saved to settings.
- **API key** — your Redmine API key. Stored securely in the OS keychain via
  VS Code's SecretStorage; it is never written to disk in plaintext.
- **Allow insecure TLS** — enable this only if your Redmine instance uses a
  self-signed or internally-signed certificate (otherwise leave it off).

The API key can alternatively be provided via the `REDMINE_API_KEY` environment
variable, which is used as a fallback when no key is stored.

## Use

Run **Redmine Copilot Bridge: Import Ticket**, enter the numeric ticket ID, and
the ticket plus its attachments appear in Copilot Chat. If you haven't configured
anything yet, you'll be prompted for the base URL and offered the Configure form
for the API key.

## Run (debug)

1. Open the folder in VS Code.
2. Press **F5** (or **Run ▸ Start Debugging**). The `Run Extension` config
   compiles the TypeScript, then launches an Extension Development Host.
3. In the dev host, run **Redmine Copilot Bridge: Configure…**, then
   **Redmine Copilot Bridge: Import Ticket**.

## Build & package

Requires Node.js 22 or newer (`@vscode/vsce` requires it).

```bash
npm run compile      # type-check + emit JS to out/
npm run watch        # recompile on change
npm run package      # produce redmine-copilot-bridge-<version>.vsix
```

Install the `.vsix` via **Extensions ▸ ⋯ ▸ Install from VSIX…**.

## Releasing

Push a tag starting with `v` and GitHub Actions builds the `.vsix`, publishes
it to the VS Code Marketplace (via Trusted Publishing — no PAT required), and
attaches it to a GitHub release automatically:

```bash
git tag v0.0.13
git push origin v0.0.13
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| `redmineCopilotBridge.baseUrl` | _(configured via the form)_ | Base URL of your Redmine instance (no trailing slash). |
| `redmineCopilotBridge.allowInsecureTls` | `false` | Skip TLS certificate verification. Enable only for self-signed or internally-signed Redmine certificates. |

## How it works

1. Reads the API key from the OS keychain (SecretStorage), falling back to the
   `REDMINE_API_KEY` environment variable.
2. Prompts for the ticket number.
3. `GET /issues/<id>.json?include=attachments` with the `X-Redmine-API-Key` header.
4. Downloads every attachment and resolves its relative `content_url` against
   the base URL.
5. Saves each attachment to a temporary file.
6. Opens the chat with the structured prompt (`isPartialQuery: true`) and the
   files attached via the `attachFiles` option of `workbench.action.chat.open`.

## Troubleshooting

- **"No Redmine API key configured"** — run **Redmine Copilot Bridge: Configure…**
  and enter your key.
- **"GitHub Copilot Chat does not appear to be installed or active"** — install
  and sign in to Copilot Chat, or run `github.copilot.chat.open` once first.
- **Attachments don't appear in chat** — files are passed using the
  `attachFiles` option of `workbench.action.chat.open`. Update VS Code and
  Copilot Chat if attachments are not available in your build.
- **"unable to get local issuer certificate" / TLS error** — Redmine uses a
  self-signed or internally-signed certificate. Enable the
  `redmineCopilotBridge.allowInsecureTls` setting (or accept the prompt the
  extension shows), then retry.
- **401 Unauthorized** — verify the API key is valid and enabled under
  *My account → API access key* in Redmine.
- **The `.vsix` won't install / still running an old version (Windows)** —
  install it from *inside* VS Code (Extensions ▸ ⋯ ▸ Install from VSIX…) or
  `code --install-extension <file>.vsix`. Double-clicking the `.vsix` opens
  Visual Studio's installer, which cannot install VS Code extensions.
