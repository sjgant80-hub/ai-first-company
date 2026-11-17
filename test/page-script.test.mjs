// page-script.test.mjs — the live page's own script must parse. One stray bracket in index.html's module script stops
// every section on the page (it happened on 17 Nov while the Origination section was added, with every other test
// green). Node checks the script's syntax here, without running it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('every inline script on the page parses', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/type="application\/(ld\+)?json"/.test(m[1]));
  assert.ok(scripts.length >= 1, 'the page has its script');
  const dir = mkdtempSync(join(tmpdir(), 'page-script-'));
  try {
    scripts.forEach((m, i) => {
      const file = join(dir, 'script-' + i + (/type="module"/.test(m[1]) ? '.mjs' : '.js'));
      writeFileSync(file, m[2]);
      const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(r.status, 0, 'script ' + i + ' does not parse: ' + r.stderr.split('\n').slice(0, 5).join(' '));
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
