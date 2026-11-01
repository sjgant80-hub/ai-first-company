// skills.test.mjs — the skill library: whole folders, pins, callers, and a changed skill unusable until passed again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, frontmatter, folderSha, entryFor, problems, refOf, usable, llms } from '../src/skills.mjs';

const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);
const MD = '---\nname: check-fence\nversion: 1.0.0\nowner: kar\ncallers: [kar, reach, scout]\ndescription: May this bot use this tool?\n---\n# body';
const folder = (o = {}) => ({ name: 'check-fence', files: [{ path: 'SKILL.md', sha256: A, text: MD }, { path: 'scripts/check-fence.mjs', sha256: B }, { path: 'tests/check-fence.test.mjs', sha256: C }, { path: 'receipt.json', sha256: A }], ...o });
const entry = () => entryFor(folder());

test('parts', () => { assert.deepEqual(PARTS, ['SKILL.md', 'scripts', 'tests', 'receipt.json']); });

test('frontmatter', () => {
  assert.deepEqual(frontmatter(MD), { name: 'check-fence', version: '1.0.0', owner: 'kar', callers: ['kar', 'reach', 'scout'], description: 'May this bot use this tool?' });
  assert.deepEqual(frontmatter('---\r\nname: x\r\ncallers: a, b,\r\n  owner:  kar  \r\n---'), { name: 'x', version: '', owner: 'kar', callers: ['a', 'b'], description: '' });
  assert.deepEqual(frontmatter('---\nName: x\nnote\n---\n'), { name: '', version: '', owner: '', callers: [], description: '' });
  for (const bad of ['# no frontmatter', '---\nname: x', ' ---\nname: x\n---', 5, null]) assert.equal(frontmatter(bad), null, String(bad));
});

test('folderSha: order-free, every file counts', () => {
  const f = [{ path: 'b', sha256: A }, { path: 'a', sha256: B }];
  assert.equal(folderSha(f), folderSha([...f].reverse()));
  assert.match(folderSha(f), /^[0-9a-f]{64}$/);
  assert.notEqual(folderSha(f), folderSha([{ path: 'b', sha256: C }, { path: 'a', sha256: B }]));
  assert.notEqual(folderSha(f), folderSha([{ path: 'c', sha256: A }, { path: 'a', sha256: B }]));
  assert.notEqual(folderSha(f), folderSha([f[0]]));
  for (const bad of [[], 'x', [{ path: '', sha256: A }], [{ path: 'a', sha256: 'A'.repeat(64) }], [null], [{ path: 'a' }]]) assert.equal(folderSha(bad), '', JSON.stringify(bad));
});

test('entryFor: the entry a folder makes', () => {
  const e = entry();
  assert.deepEqual(e, { name: 'check-fence', version: '1.0.0', owner: 'kar', callers: ['kar', 'reach', 'scout'], description: 'May this bot use this tool?', named: 'check-fence', path: 'skills/check-fence', sha256: folderSha(folder().files), has: { 'SKILL.md': true, scripts: true, tests: true, 'receipt.json': true } });
  const bare = entryFor({ name: 'x', files: [null, { path: 'scripts/x.mjs', sha256: A }] });
  assert.deepEqual([bare.named, bare.owner, bare.sha256, bare.has], ['', '', '', { 'SKILL.md': false, scripts: true, tests: false, 'receipt.json': false }]);
  assert.equal(entryFor({ name: 'x', files: 'y' }), null);
  assert.equal(entryFor(null), null);
  assert.equal(entryFor({ files: [] }).name, '');
});

test('problems: each fault named', () => {
  assert.deepEqual(problems({ skills: [entry()] }), []);
  assert.deepEqual(problems(null), ['not a catalog']);
  assert.deepEqual(problems({ skills: 'x' }), ['not a catalog']);
  const one = (o, want) => assert.deepEqual(problems({ skills: [{ ...entry(), ...o }] }), want, JSON.stringify(o));
  one({ name: 'Check_Fence', named: 'Check_Fence' }, ['skill Check_Fence: its name is not a plain lower-case name']);
  one({ name: 'check-', named: 'check-' }, ['skill check-: its name is not a plain lower-case name']);
  one({ named: 'other' }, ['skill check-fence: its SKILL.md names it other']);
  one({ named: '' }, ['skill check-fence: its SKILL.md names it nothing']);
  one({ version: '1.0' }, ['skill check-fence: no version']);
  one({ owner: 'simon' }, ['skill check-fence: its owner is not a persona', 'skill check-fence: its owner cannot call it']);
  one({ callers: [] }, ['skill check-fence: its callers are not all personas', 'skill check-fence: its owner cannot call it']);
  one({ callers: ['kar', 'grok'] }, ['skill check-fence: its callers are not all personas']);
  one({ callers: 'kar' }, ['skill check-fence: its callers are not all personas', 'skill check-fence: its owner cannot call it']);
  one({ callers: ['reach'] }, ['skill check-fence: its owner cannot call it']);
  one({ description: '  ' }, ['skill check-fence: no description']);
  one({ sha256: 'x' }, ['skill check-fence: no pin']);
  one({ has: { ...entry().has, tests: false } }, ['skill check-fence: no tests']);
  one({ has: { ...entry().has, 'receipt.json': 'yes' } }, ['skill check-fence: no receipt.json']);
  one({ has: null }, PARTS.map((p) => 'skill check-fence: no ' + p));
  assert.deepEqual(problems({ skills: [entry(), entry(), 5] }), ['skill check-fence: listed twice', 'an entry is not an object']);
});

test('usable: the pin, the callers, a PASS at this hash', () => {
  const e = entry(), sha = e.sha256, V = { [refOf('check-fence', sha)]: 'PASS' };
  assert.equal(refOf('check-fence', A), 'skill:check-fence@' + A);
  assert.equal(refOf(5, null), 'skill:@');
  assert.deepEqual(usable(e, sha, 'reach', V), { ok: true });
  assert.deepEqual(usable(e, A, 'reach', V), { ok: false, why: 'changed since its pin: it must pass the auditor again' });
  assert.deepEqual(usable(e, sha, 'builder', V), { ok: false, why: 'not one of its callers' });
  assert.deepEqual(usable({ ...e, callers: 'reach' }, sha, 'reach', V), { ok: false, why: 'not one of its callers' });
  assert.deepEqual(usable(e, sha, 'reach', { [refOf('check-fence', sha)]: 'FLAG' }), { ok: false, why: 'no auditor PASS at this hash' });
  assert.deepEqual(usable(e, sha, 'reach', { [refOf('check-fence', A)]: 'PASS' }), { ok: false, why: 'no auditor PASS at this hash' });
  assert.deepEqual(usable(e, sha, 'reach', null), { ok: false, why: 'no auditor PASS at this hash' });
  assert.deepEqual(usable({ ...e, sha256: 'x' }, 'x', 'reach', V), { ok: false, why: 'unknown skill' });
  assert.deepEqual(usable(null, sha, 'reach', V), { ok: false, why: 'unknown skill' });
});

test('llms: exactly the catalog', () => {
  const e = entry();
  assert.equal(llms({ skills: [e, 7] }), ["# The bot team's skills", '', "> One folder per skill, pinned by SHA-256. A bot may use a skill only if it is one of the skill's callers and the auditor has passed the skill at its current hash; a changed skill must pass again.", '', '## Skills', '',
    `- [check-fence](skills/check-fence/SKILL.md) v1.0.0: May this bot use this tool? · owner kar · callers kar, reach, scout · sha256 ${e.sha256}`, ''].join('\n'));
  assert.ok(llms({ skills: [{ name: 'x', callers: 'y' }] }).includes('- [x](/SKILL.md) v:  · owner  · callers  · sha256 \n'));
  assert.ok(llms(null).endsWith('## Skills\n\n'));
});
