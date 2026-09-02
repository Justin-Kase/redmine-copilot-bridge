import axios from 'axios';

/** A Redmine attachment as returned by the issues API with `?include=attachments`. */
export interface RedmineAttachment {
  id: number;
  filename: string;
  filesize: number;
  content_type: string;
  description?: string;
  /** Path to download the attachment (relative to the Redmine root). */
  content_url: string;
  author?: { id: number; name: string };
  created_on?: string;
}

/** A Redmine issue (ticket) as returned by `/issues/<id>.json`. */
export interface RedmineIssue {
  id: number;
  subject: string;
  description?: string;
  status?: { id: number; name: string };
  tracker?: { id: number; name: string };
  priority?: { id: number; name: string };
  assigned_to?: { id: number; name: string };
  author?: { id: number; name: string };
  project?: { id: number; name: string };
  created_on?: string;
  updated_on?: string;
  attachments?: RedmineAttachment[];
  [key: string]: unknown;
}

/** Envelope returned by Redmine's issues API. */
export interface RedmineTicket {
  issue: RedmineIssue;
}

/**
 * Fetch a single Redmine ticket (with its attachments) using the API key.
 *
 * @param id      The numeric issue id.
 * @param apiKey  Redmine API key (sent as the `X-Redmine-API-Key` header).
 * @param baseUrl Base URL of the Redmine instance (no trailing slash).
 * @returns The parsed issue object.
 */
export async function fetchRedmineTicket(
  id: string | number,
  apiKey: string,
  baseUrl: string
): Promise<RedmineIssue> {
  const root = baseUrl.replace(/\/+$/, '');
  const url = `${root}/issues/${encodeURIComponent(String(id))}.json?include=attachments`;

  const response = await axios.get<RedmineTicket>(url, {
    headers: {
      'X-Redmine-API-Key': apiKey,
      Accept: 'application/json',
    },
    timeout: 30_000,
  });

  if (!response.data || !response.data.issue) {
    throw new Error(`Redmine returned an unexpected payload for issue #${id}.`);
  }

  return response.data.issue;
}
