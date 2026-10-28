// vendor.test.mjs — every vendored file is byte-identical to the commit it came from (hash pinned in vendor/VENDOR.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const V = JSON.parse(readFileSync(new URL('../vendor/VENDOR.json', import.meta.url), 'utf8'));
for (const f of V.files) {
  test('vendored byte-identical: ' + f.path, () => {
    const h = createHash('sha256').update(readFileSync(new URL('../' + f.path, import.meta.url))).digest('hex');
    assert.equal(h, f.sha256);
  });
}
