// skills.mjs — the bot team's skill library: a folder per skill, an owner and the bots allowed to call it, pinned by
// hash, so a changed skill is unusable until the auditor passes it again. Pure, total, deterministic, witness-gated.
// (Simon's bot-team spec 2026-11-01, §2.)
//
//   frontmatter(md)                         → { name, version, owner, callers, description } | null
//   folderSha(files)                        → SHA-256 over the sorted 'path sha256' lines of [{ path, sha256 }], or ''
//   entryFor(folder)                        → the catalog entry a folder { name, files: [{ path, sha256, text? }] } makes
//   problems(catalog)                       → [what is wrong with the catalog]; [] when it is whole
//   refOf(name, sha)                        → 'skill:<name>@<sha>', the ref an auditor verdict on a skill carries
//   usable(entry, sha, persona, verdicts)   → { ok: true } | { ok: false, why } — the pin is current, the persona is a
//                                             caller, and a signed auditor PASS names this skill at this hash
//   llms(catalog)                           → llms.txt
import { hashOf } from './journal.mjs';
import { PERSONAS } from './feed.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const SHA = /^[0-9a-f]{64}$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
export const PARTS = Object.freeze(['SKILL.md', 'scripts', 'tests', 'receipt.json']);

export function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(str(md));
  if (!m) return null;
  const f = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = /^([a-z]+):\s*(.*)$/.exec(line.trim()); if (kv) f[kv[1]] = kv[2].trim(); }
  const list = (v) => str(v).replace(/^\[|\]$/g, '').split(',').map((x) => x.trim()).filter(Boolean);
  return { name: str(f.name), version: str(f.version), owner: str(f.owner), callers: list(f.callers), description: str(f.description) };
}

export function folderSha(files) {
  if (!Array.isArray(files) || files.length === 0 || !files.every((f) => isObj(f) && str(f.path) && SHA.test(str(f.sha256)))) return '';
  return hashOf(files.map((f) => f.path + ' ' + f.sha256).sort().join('\n') + '\n');
}

export function entryFor(folder) {
  if (!isObj(folder) || !Array.isArray(folder.files)) return null;
  const name = str(folder.name), paths = folder.files.filter(isObj).map((f) => str(f.path));
  const skill = folder.files.find((f) => isObj(f) && f.path === 'SKILL.md');
  const fm = frontmatter(skill ? skill.text : '') || { name: '', version: '', owner: '', callers: [], description: '' };
  return {
    name, version: fm.version, owner: fm.owner, callers: fm.callers, description: fm.description, named: fm.name,
    path: 'skills/' + name, sha256: folderSha(folder.files.map((f) => (isObj(f) ? { path: f.path, sha256: f.sha256 } : f))),
    has: { 'SKILL.md': Boolean(skill), scripts: paths.includes(`scripts/${name}.mjs`), tests: paths.includes(`tests/${name}.test.mjs`), 'receipt.json': paths.includes('receipt.json') },
  };
}

export function problems(catalog) {
  if (!isObj(catalog) || !Array.isArray(catalog.skills)) return ['not a catalog'];
  const out = [], seen = new Set();
  for (const e of catalog.skills) {
    if (!isObj(e)) { out.push('an entry is not an object'); continue; }
    const who = 'skill ' + str(e.name);
    if (!NAME.test(str(e.name))) out.push(`${who}: its name is not a plain lower-case name`);
    if (seen.has(e.name)) out.push(`${who}: listed twice`);
    seen.add(e.name);
    if (e.named !== e.name) out.push(`${who}: its SKILL.md names it ${str(e.named) || 'nothing'}`);
    if (!VERSION.test(str(e.version))) out.push(`${who}: no version`);
    if (!PERSONAS.includes(e.owner)) out.push(`${who}: its owner is not a persona`);
    const callers = Array.isArray(e.callers) ? e.callers : [];
    if (callers.length === 0 || !callers.every((c) => PERSONAS.includes(c))) out.push(`${who}: its callers are not all personas`);
    if (!callers.includes(e.owner)) out.push(`${who}: its owner cannot call it`);
    if (!str(e.description).trim()) out.push(`${who}: no description`);
    if (!SHA.test(str(e.sha256))) out.push(`${who}: no pin`);
    for (const p of PARTS) if (!(isObj(e.has) && e.has[p] === true)) out.push(`${who}: no ${p}`);
  }
  return out;
}

export const refOf = (name, sha) => 'skill:' + str(name) + '@' + str(sha);

export function usable(entry, sha, persona, verdicts) {
  if (!isObj(entry) || !SHA.test(str(entry.sha256))) return { ok: false, why: 'unknown skill' };
  if (entry.sha256 !== sha) return { ok: false, why: 'changed since its pin: it must pass the auditor again' };
  if (!(Array.isArray(entry.callers) && entry.callers.includes(persona))) return { ok: false, why: 'not one of its callers' };
  if (!(isObj(verdicts) && verdicts[refOf(entry.name, sha)] === 'PASS')) return { ok: false, why: 'no auditor PASS at this hash' };
  return { ok: true };
}

export function llms(catalog) {
  const skills = isObj(catalog) && Array.isArray(catalog.skills) ? catalog.skills.filter(isObj) : [];
  return ['# The bot team\'s skills', '',
    '> One folder per skill, pinned by SHA-256. A bot may use a skill only if it is one of the skill\'s callers and the auditor has passed the skill at its current hash; a changed skill must pass again.', '',
    '## Skills', '',
    ...skills.map((e) => `- [${str(e.name)}](${str(e.path)}/SKILL.md) v${str(e.version)}: ${str(e.description)} · owner ${str(e.owner)} · callers ${(Array.isArray(e.callers) ? e.callers : []).join(', ')} · sha256 ${str(e.sha256)}`), ''].join('\n');
}

export default { PARTS, frontmatter, folderSha, entryFor, problems, refOf, usable, llms };
