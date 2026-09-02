import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fetchRedmineTicket } from './redmine';
import { downloadImageAttachments, DownloadedImage } from './attachments';
import { formatTicketPrompt } from './formatter';
import { getBaseUrl, getApiKey, openConfigWebview } from './config';

const ATTACH_FILE_COMMAND = 'github.copilot.chat.attachFile';
const INSERT_PROMPT_COMMAND = 'github.copilot.chat.insert';

/**
 * Ensure GitHub Copilot Chat is installed and activated. Copilot Chat registers
 * several of its commands lazily, so we activate it explicitly before checking.
 */
async function ensureCopilotReady(): Promise<boolean> {
  if (await copilotCommandsAvailable()) {
    return true;
  }

  // Installed but not activated yet — activate it so its commands register.
  const copilot = vscode.extensions.getExtension('github.copilot-chat');
  if (copilot) {
    try {
      await copilot.activate();
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (await copilotCommandsAvailable()) {
        return true;
      }
    } catch {
      // fall through to the warning
    }
  }

  const choice = await vscode.window.showWarningMessage(
    'GitHub Copilot Chat does not appear to be installed or active. Import will likely fail.',
    'Proceed anyway'
  );
  return choice === 'Proceed anyway';
}

async function copilotCommandsAvailable(): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return commands.includes(INSERT_PROMPT_COMMAND) && commands.includes(ATTACH_FILE_COMMAND);
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

            progress.report({ message: 'Attaching images to Copilot Chat…' });
            const imageUris = saveImagesToTemp(images);
            if (imageUris.length > 0) {
              await vscode.commands.executeCommand(ATTACH_FILE_COMMAND, ...imageUris);
            }

            progress.report({ message: 'Inserting prompt…' });
            const prompt = formatTicketPrompt(issue, images.length);
            await vscode.commands.executeCommand(INSERT_PROMPT_COMMAND, prompt);
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
