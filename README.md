# Redmine Copilot Bridge

Import Redmine tickets — including their image attachments — directly into GitHub
Copilot Chat, so you can discuss a ticket with full visual context in one step.

## What it does

One command pulls a Redmine issue, downloads every image attachment, inserts each
image into Copilot Chat, then inserts a structured prompt describing the ticket.
Screenshots, mockups, and error captures land inline so Copilot can see them.

## Requirements

- **Visual Studio Code** 1.90.0 or newer
- **GitHub Copilot Chat** extension installed and signed in
- A **Redmine API key** with read access to issues (exported as `REDMINE_API_KEY`)

## Setup

```bash
git clone <this-repo> redmine-copilot-bridge
cd redmine-copilot-bridge
npm install
```

Set your API key in the shell that launches VS Code:

```bash
export REDMINE_API_KEY=your-redmine-api-key
code .
```

> **Note:** the key is read at extension activation time. If you change it,
> reload the window (`Developer: Reload Window`) so the extension picks it up.

## Run (debug)

1. Open the folder in VS Code.
2. Press **F5** (or **Run ▸ Start Debugging**). The `Run Extension` config
   compiles the TypeScript, then launches an Extension Development Host.
3. In the dev host, open the Command Palette (`Cmd+Shift+P`) and run
   **Redmine Copilot Bridge: Import Ticket**.
4. Enter the numeric ticket ID. The ticket and its images appear in Copilot Chat.

## Build & package

```bash
npm run compile      # type-check + emit JS to out/
npm run watch        # recompile on change
npx vsce package     # produce redmine-copilot-bridge-<version>.vsix
```

Install the `.vsix` via **Extensions ▸ ⋯ ▸ Install from VSIX…**.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `redmineCopilotBridge.baseUrl` | _(prompted on first use)_ | Base URL of your Redmine instance (no trailing slash). Entered on first use and saved. |

## How it works

1. Reads the API key from the `REDMINE_API_KEY` environment variable.
2. Prompts for the ticket number.
3. `GET /issues/<id>.json?include=attachments` with the `X-Redmine-API-Key` header.
4. Filters attachments to image MIME types
   (`image/png`, `image/jpeg`, `image/jpg`, `image/gif`, `image/webp`), downloads
   each, and resolves its relative `content_url` against the base URL.
5. Inserts each image via `github.copilot.chat.insertAttachment(bytes, filename)`.
6. Inserts a structured prompt via `github.copilot.chat.insert(prompt)`.

## Troubleshooting

- **"REDMINE_API_KEY environment variable is not set"** — export it in the shell
  that launched VS Code, then reload the window.
- **"GitHub Copilot Chat does not appear to be installed or active"** — install
  and sign in to Copilot Chat, or run `github.copilot.chat.open` once first.
- **Images don't appear in chat** — the `github.copilot.chat.insertAttachment`
  command is not part of the public Copilot Chat API and may differ by version.
  If your Copilot Chat build renamed it, update the `INSERT_ATTACHMENT_COMMAND`
  constant in `src/extension.ts`.
- **401 Unauthorized** — verify the API key is valid and enabled under
  *My account → API access key* in Redmine.
