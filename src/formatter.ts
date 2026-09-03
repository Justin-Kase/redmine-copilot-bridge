import { RedmineIssue } from './redmine';

function field(label: string, value: string | undefined): string {
  return `${label}: ${value && value.trim() ? value.trim() : 'N/A'}`;
}

/**
 * Build a structured prompt describing the ticket. The attachments are
 * already inserted into Copilot Chat separately; this prompt references them so
 * the model treats them as part of the same request.
 *
 * @param issue The fetched Redmine issue.
 * @param attachmentCount Number of attachments inserted (for the prompt's context).
 */
export function formatTicketPrompt(issue: RedmineIssue, attachmentCount: number): string {
  const lines: string[] = [];

  lines.push(`Redmine Ticket #${issue.id}: ${issue.subject}`);
  lines.push('');
  lines.push('```');
  lines.push(field('Project', issue.project?.name));
  lines.push(field('Tracker', issue.tracker?.name));
  lines.push(field('Status', issue.status?.name));
  lines.push(field('Priority', issue.priority?.name));
  lines.push(field('Author', issue.author?.name));
  lines.push(field('Assigned To', issue.assigned_to?.name));
  lines.push(field('Created', issue.created_on));
  lines.push(field('Updated', issue.updated_on));
  lines.push('```');
  lines.push('');
  lines.push('## Description');
  lines.push('');
  lines.push(issue.description && issue.description.trim() ? issue.description.trim() : '(no description)');
  lines.push('');

  if (attachmentCount > 0) {
    lines.push(`## Attachments`);
    lines.push('');
    lines.push(`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} attached above. Review them in the context of this ticket.`);
    lines.push('');
  }

  lines.push('Please analyze this ticket (including any attached files) and help me work on it.');

  return lines.join('\n');
}
