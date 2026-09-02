import * as vscode from 'vscode';

const CONFIG_SECTION = 'redmineCopilotBridge';
const SECRET_KEY = 'redmineCopilotBridge.apiKey';

/**
 * Read the Redmine base URL from settings. If unset, prompt for it (via an
 * input box) and save it for next time.
 */
export async function getBaseUrl(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configured = config.get<string>('baseUrl')?.trim();
  if (configured) {
    return configured;
  }

  const entered = await vscode.window.showInputBox({
    title: 'Redmine Copilot Bridge',
    prompt: 'Enter your Redmine base URL (saved for next time)',
    placeHolder: 'https://redmine.example.com',
    validateInput: (value) => {
      const normalized = normalizeBaseUrl(value);
      return normalized ? undefined : 'Enter a valid http(s) URL';
    },
  });

  if (!entered) {
    return undefined; // user cancelled
  }

  const normalized = normalizeBaseUrl(entered)!;
  await config.update('baseUrl', normalized, vscode.ConfigurationTarget.Global);
  return normalized;
}

/**
 * Read the Redmine API key from SecretStorage (OS keychain), falling back to
 * the REDMINE_API_KEY environment variable.
 */
export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored) {
    return stored;
  }
  return process.env.REDMINE_API_KEY;
}

/** Open the configuration form in a webview panel. */
export async function openConfigWebview(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const baseUrl = config.get<string>('baseUrl') ?? '';
  const hasKey = !!(await context.secrets.get(SECRET_KEY));

  const panel = vscode.window.createWebviewPanel(
    'redmineCopilotBridge.config',
    'Redmine Copilot Bridge — Configuration',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getConfigHtml(baseUrl, hasKey, panel.webview);

  const messageDisposable = panel.webview.onDidReceiveMessage(async (message: ConfigMessage) => {
    switch (message.command) {
      case 'save': {
        const normalized = normalizeBaseUrl(message.baseUrl);
        if (!normalized) {
          panel.webview.postMessage({ command: 'error', message: 'Enter a valid http(s) base URL.' });
          return;
        }

        await vscode.workspace
          .getConfiguration(CONFIG_SECTION)
          .update('baseUrl', normalized, vscode.ConfigurationTarget.Global);

        const apiKey = (message.apiKey ?? '').trim();
        if (apiKey) {
          await context.secrets.store(SECRET_KEY, apiKey);
        }

        vscode.window.showInformationMessage('Redmine Copilot Bridge configuration saved.');
        panel.dispose();
        break;
      }
      case 'cancel':
        panel.dispose();
        break;
    }
  });

  panel.onDidDispose(() => messageDisposable.dispose());
}

interface ConfigMessage {
  command: 'save' | 'cancel';
  baseUrl?: string;
  apiKey?: string;
}

function normalizeBaseUrl(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) {
    return undefined;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getConfigHtml(baseUrl: string, hasKey: boolean, webview: vscode.Webview): string {
  const nonce = getNonce();
  const keyPlaceholder = hasKey
    ? 'Leave blank to keep the stored key'
    : 'Paste your Redmine API key';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 20px;
    font-size: 13px;
  }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { color: var(--vscode-descriptionForeground); margin: 0 0 16px; font-size: 12px; }
  label { display: block; font-size: 12px; margin: 14px 0 4px; }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: inherit;
    font-size: 13px;
  }
  input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 6px 0 0; }
  .error { color: var(--vscode-errorForeground); font-size: 12px; margin: 12px 0 0; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  button {
    padding: 6px 14px;
    border-radius: 2px;
    border: 1px solid transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
  }
  button#save { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button#save:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
  <form id="configForm">
    <h1>Redmine Copilot Bridge</h1>
    <p class="sub">Configure your Redmine connection.</p>

    <label for="baseUrl">Base URL</label>
    <input type="url" id="baseUrl" value="${escapeHtml(baseUrl)}" placeholder="https://redmine.example.com" />

    <label for="apiKey">API key</label>
    <input type="password" id="apiKey" placeholder="${escapeHtml(keyPlaceholder)}" autocomplete="new-password" />
    <p class="hint">${hasKey ? 'An API key is already stored in your keychain. Leave the field blank to keep it.' : 'Stored securely in your OS keychain — never written to disk in plaintext.'}</p>

    <p id="error" class="error" hidden></p>

    <div class="actions">
      <button type="button" class="secondary" id="cancel">Cancel</button>
      <button type="submit" id="save">Save</button>
    </div>
  </form>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('configForm');
    const errorEl = document.getElementById('error');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const baseUrl = document.getElementById('baseUrl').value.trim();
      const apiKey = document.getElementById('apiKey').value.trim();
      if (!/^https?:\\/\\//i.test(baseUrl)) {
        showError('Enter a valid base URL starting with http:// or https://');
        return;
      }
      vscode.postMessage({ command: 'save', baseUrl: baseUrl, apiKey: apiKey });
    });

    document.getElementById('cancel').addEventListener('click', function () {
      vscode.postMessage({ command: 'cancel' });
    });

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (msg && msg.command === 'error') {
        showError(msg.message);
      }
    });
  </script>
</body>
</html>`;
}
