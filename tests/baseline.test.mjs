import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const dist = new URL('../dist/', import.meta.url);

test('the static build has a named Traditional Chinese document and a local entry script', () => {
  const index = new URL('index.html', dist);
  assert.ok(existsSync(index), 'build must produce dist/index.html');
  const html = readFileSync(index, 'utf8');
  assert.match(html, /<html lang="zh-Hant">/);
  assert.match(html, /<title>Learning Planet 學習星球<\/title>/);
  const entry = html.match(/<script\b[^>]*\bsrc="(\/assets\/[^"/]+\.js)"/);
  assert.ok(entry, 'build must reference a same-origin JS entry');
  assert.ok(existsSync(new URL(entry[1].slice(1), dist)), 'emitted script must exist');
});
