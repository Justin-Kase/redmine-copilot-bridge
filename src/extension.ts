import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fetchRedmineTicket } from './redmine';
import { downloadImageAttachments, DownloadedImage } from './attachments';
import { formatTicketPrompt } from './formatter';
import { getBaseUrl, getApiKey, openConfigWebview } from './config';

const OPEN_CHAT_COMMAND = 'workbench.action.chat.open';

/**
 * Ensure GitHub Copilot Chat is installed and activated, so the attached
 * images are processed with vision when the prompt is sent.
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

/** Sanitize an attachment filename and guarantee an image extension. */
function safeFilename(filename: string, contentType: string): string {
  const base = path.basename(filename).replace(/[^\w.\-]/g, '_') || 'image';
  if (path.extname(base)) {
    return base;
  }
  const ext = (contentType.split('/')[1] || 'png').toLowerCase();
  const extMap: Record<string, string> = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
  return `${base}.${extMap[ext] ?? 'png'}`;
}

/** Write downloaded images to a temp dir and return their file URIs. */
function saveImagesToTemp(images: DownloadedImage[]): vscode.Uri[] {
  if (images.length === 0) {
    return [];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redmine-copilot-bridge-'));
  return images.map((image) => {
    const filePath = path.join(dir, safeFilename(image.filename, image.contentType));
    fs.writeFileSync(filePath, image.bytes);
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

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Importing Redmine ticket #${ticketId}`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: 'Fetching ticket…' });
            const issue = await fetchRedmineTicket(ticketId, apiKey, baseUrl);

            progress.report({ message: 'Downloading image attachments…' });
            const images = await downloadImageAttachments(issue.attachments ?? [], apiKey, baseUrl);

            progress.report({ message: 'Inserting into Copilot Chat…' });
            const imageUris = saveImagesToTemp(images);
            const prompt = formatTicketPrompt(issue, images.length);

            await vscode.commands.executeCommand(OPEN_CHAT_COMMAND, {
              query: prompt,
              isPartialQuery: true,
              attachFiles: imageUris,
            });
          }
        );

        vscode.window.showInformationMessage(
          `Redmine ticket #${ticketId} imported into Copilot Chat.`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
