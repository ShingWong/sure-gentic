import type { ContentPart, Message } from '../types.js';

/**
 * Shared multimodal mapping: sure-gentic `ContentPart`s → provider wire
 * shapes. Pure functions (no network), so they unit-test without keys.
 *
 * Supported inputs:
 *   text       → native text everywhere
 *   image_url  → native image (data: URLs preferred; http(s) where allowed)
 *   file (pdf) → native file/document input (OpenAI input_file, Anthropic
 *                document block, Gemini inlineData)
 *   file (text/*) → inlined as text (decoded from base64)
 *   file (other binary, e.g. xlsx/docx) → placeholder note: most chat
 *                APIs cannot ingest these. Callers needing spreadsheets /
 *                word docs should extract text first.
 */

/** Readable one-line-ish text for logs, mock responses, token estimates. */
export function messageText(content: Message['content']): string {
  if (typeof content === 'string') return content;
  return content.map((p) => {
    if (p.type === 'text') return p.text;
    if (p.type === 'image_url') return '[image]';
    return `[file: ${p.file.name || p.file.mimeType}]`;
  }).join('\n');
}

/** Base64 → UTF-8 text, cross-runtime (Node Buffer, else atob). */
function decodeBase64Text(data: string): string | undefined {
  try {
    const clean = data.includes(',') ? (data.split(',')[1] || '') : data;
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf-8');
    if (typeof atob !== 'undefined') {
      const bin = atob(clean);
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
  } catch { /* fall through */ }
  return undefined;
}

function unsupportedNote(name: string, mime: string): string {
  return `[attached file: ${name} (${mime}) — this provider cannot process this file type]`;
}

/** file part → OpenAI/Anthropic-friendly text, or undefined if natively mappable. */
function fileAsText(part: Extract<ContentPart, { type: 'file' }>): string | undefined {
  const label = part.file.name || 'file';
  if (part.file.mimeType.startsWith('text/')) {
    const decoded = decodeBase64Text(part.file.data);
    return `[attached file: ${label}]\n${decoded ?? '(could not decode text)'}`;
  }
  if (part.file.mimeType === 'application/pdf') return undefined; // native path
  return unsupportedNote(label, part.file.mimeType);
}

export interface OpenAIContentPart {
  type: string;
  [key: string]: unknown;
}

/** ContentParts → OpenAI chat-completions shape (also OpenRouter, compatible). */
export function toOpenAIContent(content: Message['content']): string | OpenAIContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((p): OpenAIContentPart => {
    if (p.type === 'text') return { type: 'text', text: p.text };
    if (p.type === 'image_url') return { type: 'image_url', image_url: { url: p.image_url.url } };
    const asText = fileAsText(p);
    if (asText !== undefined) return { type: 'text', text: asText };
    return {
      type: 'file',
      file: {
        filename: p.file.name || 'file.pdf',
        file_data: `data:${p.file.mimeType};base64,${p.file.data}`,
      },
    };
  });
}

function parseDataUrl(url: string): { mime: string; data: string } | undefined {
  const m = url.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mime: m[1], data: m[2] } : undefined;
}

/** ContentParts → Anthropic messages block array. */
export function toAnthropicBlocks(content: Message['content']): Record<string, unknown>[] {
  const parts: ContentPart[] = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  return parts.map((p) => {
    if (p.type === 'text') return { type: 'text', text: p.text };
    if (p.type === 'image_url') {
      const parsed = parseDataUrl(p.image_url.url);
      if (parsed && parsed.mime.startsWith('image/')) {
        return { type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } };
      }
      if (parsed && parsed.mime === 'application/pdf') {
        return { type: 'document', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } };
      }
      if (!parsed) return { type: 'image', source: { type: 'url', url: p.image_url.url } };
      return { type: 'text', text: unsupportedNote('image', parsed.mime) };
    }
    const asText = fileAsText(p);
    if (asText !== undefined) return { type: 'text', text: asText };
    return {
      type: 'document',
      source: { type: 'base64', media_type: p.file.mimeType, data: p.file.data },
      ...(p.file.name ? { title: p.file.name } : {}),
    };
  });
}
