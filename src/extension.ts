import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fetchRedmineTicket } from './redmine';
import { downloadAttachments, DownloadedAttachment } from './attachments';
import { formatTicketPrompt } from './formatter';
import { getBaseUrl, getApiKey, openConfigWebview } from './config';

const OPEN_CHAT_COMMAND = 'workbench.action.chat.open';

/**
 * Ensure GitHub Copilot Chat is installed and activated, so the attached
 * files are processed with vision when the prompt is sent.
 */
async function ensureCopilotReady(): Promise<boolean> {
  const copilot = vscode.extensions.getExtension('github.copilot-chat');
  if (copilot) {
    if (!copilot.isActive) {
      try {
        await copilot.activate();
      } catch {
        // ignore; proceed anyway
      }
    }
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    'GitHub Copilot Chat does not appear to be installed. Import will likely fail.',
    'Proceed anyway'
  );
  return choice === 'Proceed anyway';
}

/** Sanitize an attachment filename while preserving its extension. */
function safeFilename(filename: string, contentType: string): string {
  const base = path.basename(filename).replace(/[^\w.\-]/g, '_') || 'attachment';
  if (path.extname(base)) {
    return base;
  }
  const ext = (contentType.split(';')[0].split('/')[1] || '').toLowerCase().replace(/[^\w-]/g, '');
  return ext ? `${base}.${ext}` : base;
}

/** Write downloaded attachments to a temp dir and return their file URIs. */
function saveAttachmentsToTemp(attachments: DownloadedAttachment[]): vscode.Uri[] {
  if (attachments.length === 0) {
    return [];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redmine-copilot-bridge-'));
  return attachments.map((attachment) => {
    const filePath = path.join(dir, safeFilename(attachment.filename, attachment.contentType));
    fs.writeFileSync(filePath, attachment.bytes);
    return vscode.Uri.file(filePath);
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const importCommand = vscode.commands.registerCommand(
    'redmineCopilotBridge.importTicket',
    async () => {
      try {
        const apiKey = await getApiKey(context);
        if (!apiKey) {
          const choice = await vscode.window.showErrorMessage(
            'No Redmine API key configured.',
            'Configure...'
          );
          if (choice === 'Configure...') {
            await openConfigWebview(context);
          }
          return;
        }

        if (!(await ensureCopilotReady())) {
          return;
        }

        const ticketId = await vscode.window.showInputBox({
          title: 'Redmine Copilot Bridge',
          prompt: 'Enter the Redmine ticket number (issue ID)',
          placeHolder: 'e.g. 1234',
          validateInput: (value) =>
            /^\d+$/.test(value) ? undefined : 'Please enter a numeric issue ID',
        });

        if (!ticketId) {
          return; // user cancelled
        }

        const baseUrl = await getBaseUrl();
        if (!baseUrl) {
          return; // user cancelled
        }

        const allowInsecureTls = vscode.workspace
          .getConfiguration('redmineCopilotBridge')
          .get<boolean>('allowInsecureTls', false);
        console.log(
          `[redmine-copilot-bridge] Importing #${ticketId} — allowInsecureTls = ${allowInsecureTls}`
        );

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Importing Redmine ticket #${ticketId}`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: 'Fetching ticket…' });
            const issue = await fetchRedmineTicket(ticketId, apiKey, baseUrl, allowInsecureTls);

            progress.report({ message: 'Downloading attachments…' });
            const attachments = await downloadAttachments(
              issue.attachments ?? [],
              apiKey,
              baseUrl,
              allowInsecureTls
            );

            progress.report({ message: 'Inserting into Copilot Chat…' });
            const attachmentUris = saveAttachmentsToTemp(attachments);
            const prompt = formatTicketPrompt(issue, attachments.length);

            await vscode.commands.executeCommand(OPEN_CHAT_COMMAND, {
              query: prompt,
              isPartialQuery: true,
              attachFiles: attachmentUris,
            });
          }
        );

        vscode.window.showInformationMessage(
          `Redmine ticket #${ticketId} imported into Copilot Chat.`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/certificate|issuer|self-signed|ssl|tls|unable to verify/i.test(message)) {
          const cfg = vscode.workspace.getConfiguration('redmineCopilotBridge');
          const curTls = cfg.get<boolean>('allowInsecureTls', false);
          const curUrl = cfg.get<string>('baseUrl', '');
          const choice = await vscode.window.showErrorMessage(
            `Could not verify the Redmine server's TLS certificate: ${message}\n` +
              `[debug] allowInsecureTls=${curTls}, baseUrl=${curUrl || '(unset)'}`,
            'Enable insecure TLS'
          );
          if (choice === 'Enable insecure TLS') {
            try {
              await cfg.update('allowInsecureTls', true, vscode.ConfigurationTarget.Global);
              const after = vscode.workspace
                .getConfiguration('redmineCopilotBridge')
                .get<boolean>('allowInsecureTls', false);
              vscode.window.showInformationMessage(
                after
                  ? 'Insecure TLS enabled. Run "Import Ticket" again.'
                  : 'WARNING: the setting did NOT save (settings file may be read-only). Set "redmineCopilotBridge.allowInsecureTls": true manually.'
              );
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to save setting: ${e instanceof Error ? e.message : String(e)}. Add "redmineCopilotBridge.allowInsecureTls": true to settings.json manually.`
              );
            }
          }
          return;
        }
        vscode.window.showErrorMessage(`Failed to import Redmine ticket: ${message}`);
      }
    }
  );

  const configureCommand = vscode.commands.registerCommand(
    'redmineCopilotBridge.configure',
    () => openConfigWebview(context)
  );

  context.subscriptions.push(importCommand, configureCommand);
}

export function deactivate(): void {
  // nothing to clean up
}
