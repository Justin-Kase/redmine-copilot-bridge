import axios from 'axios';
import { RedmineAttachment } from './redmine';

/** A downloaded attachment ready to be handed to Copilot Chat. */
export interface DownloadedAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/** @deprecated Use DownloadedAttachment instead. */
export type DownloadedImage = DownloadedAttachment;

/**
 * Resolve a Redmine `content_url` (relative to the Redmine root) to an absolute URL.
 * Handles fully-qualified URLs, host-rooted paths, and root-relative paths.
 */
export function resolveContentUrl(contentUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(contentUrl)) {
    return contentUrl;
  }

  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, '');

  if (contentUrl.startsWith('/')) {
    if (basePath && !contentUrl.startsWith(basePath + '/')) {
      return `${base.origin}${basePath}/${contentUrl.replace(/^\/+/, '')}`;
    }
    return `${base.origin}${contentUrl}`;
  }

  return new URL(contentUrl, baseUrl).toString();
}

/**
 * Download all attachments for a ticket.
 *
 * Failures on an individual attachment are logged and skipped rather than
 * aborting the whole import.
 *
 * @param attachments Attachments listed on the issue.
 * @param apiKey      Redmine API key.
 * @param baseUrl     Base URL used to resolve relative `content_url` values.
 */
export async function downloadAttachments(
  attachments: RedmineAttachment[],
  apiKey: string,
  baseUrl: string
): Promise<DownloadedAttachment[]> {
  const downloaded: DownloadedAttachment[] = [];

  for (const attachment of attachments) {
    const url = resolveContentUrl(attachment.content_url, baseUrl);
    try {
      const response = await axios.get(url, {
        headers: { 'X-Redmine-API-Key': apiKey },
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      downloaded.push({
        filename: attachment.filename,
        contentType: attachment.content_type,
        bytes: new Uint8Array(response.data as ArrayBuffer),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[redmine-copilot-bridge] Failed to download "${attachment.filename}": ${message}`);
    }
  }

  return downloaded;
}

/** Alias for callers that prefer the explicit operation name. */
export const downloadAllAttachments = downloadAttachments;

/** @deprecated Use downloadAttachments instead. */
export const downloadImageAttachments = downloadAttachments;
