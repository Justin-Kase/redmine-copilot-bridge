import axios from 'axios';
import { RedmineAttachment } from './redmine';

/** MIME types considered "images" for the purpose of this extension. */
export const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

/** A downloaded image attachment ready to be handed to Copilot Chat. */
export interface DownloadedImage {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Normalize a MIME type (strip parameters, lowercase) and test it against the
 * allowed image set.
 */
export function isImageAttachment(contentType: string): boolean {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_IMAGE_MIME_TYPES.has(normalized);
}

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
 * Download all image attachments for a ticket.
 *
 * Non-image attachments are skipped. Failures on an individual attachment are
 * logged and skipped rather than aborting the whole import.
 *
 * @param attachments Attachments listed on the issue.
 * @param apiKey      Redmine API key.
 * @param baseUrl     Base URL used to resolve relative `content_url` values.
 */
export async function downloadImageAttachments(
  attachments: RedmineAttachment[],
  apiKey: string,
  baseUrl: string
): Promise<DownloadedImage[]> {
  const images = attachments.filter((a) => isImageAttachment(a.content_type));
  const downloaded: DownloadedImage[] = [];

  for (const attachment of images) {
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
