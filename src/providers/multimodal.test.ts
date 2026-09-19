import { describe, it, expect } from 'vitest';
import { toOpenAIContent, toAnthropicBlocks, messageText } from './multimodal.js';
import type { Message } from '../types.js';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
const IMG = `data:image/png;base64,${b64('fake-png-bytes')}`;
const PDF = b64('%PDF-1.4 fake');

function msg(content: Message['content']): Message {
  return { role: 'user', content };
}

describe('messageText', () => {
  it('passes strings through', () => {
    expect(messageText('hello')).toBe('hello');
  });
  it('summarizes parts', () => {
    expect(messageText([
      { type: 'text', text: 'hi' },
      { type: 'image_url', image_url: { url: IMG } },
      { type: 'file', file: { data: PDF, mimeType: 'application/pdf', name: 'a.pdf' } },
    ])).toBe('hi\n[image]\n[file: a.pdf]');
  });
});

describe('toOpenAIContent', () => {
  it('passes strings through', () => {
    expect(toOpenAIContent('hi')).toBe('hi');
  });
  it('keeps text and image parts native', () => {
    expect(toOpenAIContent(msg([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: IMG } },
    ]).content)).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: IMG } },
    ]);
  });
  it('maps pdf files to input_file parts', () => {
    expect(toOpenAIContent(msg([
      { type: 'file', file: { data: PDF, mimeType: 'application/pdf', name: 'a.pdf' } },
    ]).content)).toEqual([
      { type: 'file', file: { filename: 'a.pdf', file_data: `data:application/pdf;base64,${PDF}` } },
    ]);
  });
  it('inlines text files', () => {
    const out = toOpenAIContent(msg([
      { type: 'file', file: { data: b64('a,b\n1,2'), mimeType: 'text/csv', name: 'd.csv' } },
    ]).content) as { type: string; text: string }[];
    expect(out[0].type).toBe('text');
    expect(out[0].text).toContain('a,b\n1,2');
  });
  it('notes unsupported binaries', () => {
    const out = toOpenAIContent(msg([
      { type: 'file', file: { data: PDF, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 's.xlsx' } },
    ]).content) as { type: string; text: string }[];
    expect(out[0].type).toBe('text');
    expect(out[0].text).toContain('cannot process');
  });
});

describe('toAnthropicBlocks', () => {
  it('wraps strings as a text block', () => {
    expect(toAnthropicBlocks('hi')).toEqual([{ type: 'text', text: 'hi' }]);
  });
  it('maps data-url images to image blocks', () => {
    expect(toAnthropicBlocks(msg([
      { type: 'image_url', image_url: { url: IMG } },
    ]).content)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64('fake-png-bytes') } },
    ]);
  });
  it('maps remote image urls to url sources', () => {
    expect(toAnthropicBlocks(msg([
      { type: 'image_url', image_url: { url: 'https://x.test/i.png' } },
    ]).content)).toEqual([
      { type: 'image', source: { type: 'url', url: 'https://x.test/i.png' } },
    ]);
  });
  it('maps pdf files to document blocks', () => {
    expect(toAnthropicBlocks(msg([
      { type: 'file', file: { data: PDF, mimeType: 'application/pdf', name: 'a.pdf' } },
    ]).content)).toEqual([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF }, title: 'a.pdf' },
    ]);
  });
});
