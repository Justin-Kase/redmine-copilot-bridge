import * as vscode from 'vscode';
import { fetchRedmineTicket } from './redmine';
import { downloadImageAttachments } from './attachments';
import { formatTicketPrompt } from './formatter';
import { getBaseUrl, getApiKey, openConfigWebview } from './config';

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

  const configureCommand = vscode.commands.registerCommand(
    'redmineCopilotBridge.configure',
    () => openConfigWebview(context)
  );

  context.subscriptions.push(importCommand, configureCommand);
}

export function deactivate(): void {
  // nothing to clean up
}
