import * as vscode from 'vscode';
import { fetchRedmineTicket } from './redmine';
import { downloadImageAttachments } from './attachments';
import { formatTicketPrompt } from './formatter';

const INSERT_ATTACHMENT_COMMAND = 'github.copilot.chat.insertAttachment';
const INSERT_PROMPT_COMMAND = 'github.copilot.chat.insert';

/**
 * Ensure GitHub Copilot Chat is available. Returns true when both insert
 * commands are registered, or when the user chooses to proceed anyway.
 */
async function ensureCopilotAvailable(): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  const hasInsert = commands.includes(INSERT_PROMPT_COMMAND);
  const hasAttachment = commands.includes(INSERT_ATTACHMENT_COMMAND);

  if (hasInsert && hasAttachment) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    'GitHub Copilot Chat does not appear to be installed or active. Import will likely fail.',
    'Proceed anyway'
  );
  return choice === 'Proceed anyway';
}

/**
 * Resolve the Redmine base URL from settings, prompting for it (and saving it)
 * on first use.
 */
async function getBaseUrl(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('redmineCopilotBridge');
  const configured = config.get<string>('baseUrl')?.trim();
  if (configured) {
    return configured;
  }

  const entered = await vscode.window.showInputBox({
    title: 'Redmine Copilot Bridge',
    prompt: 'Enter your Redmine base URL (saved for next time)',
    placeHolder: 'https://redmine.example.com',
    validateInput: (value) => {
      try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:'
          ? undefined
          : 'URL must start with http:// or https://';
      } catch {
        return 'Enter a valid URL';
      }
    },
  });

  if (!entered) {
    return undefined; // user cancelled
  }

  const normalized = entered.trim().replace(/\/+$/, '');
  await config.update('baseUrl', normalized, vscode.ConfigurationTarget.Global);
  return normalized;
}

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'redmineCopilotBridge.importTicket',
    async () => {
      try {
        const apiKey = process.env.REDMINE_API_KEY;
        if (!apiKey) {
          vscode.window.showErrorMessage(
            'The REDMINE_API_KEY environment variable is not set. Set it and reload the window.'
          );
          return;
        }

        if (!(await ensureCopilotAvailable())) {
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
            for (const image of images) {
              await vscode.commands.executeCommand(
                INSERT_ATTACHMENT_COMMAND,
                image.bytes,
                image.filename
              );
            }

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

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // nothing to clean up
}
