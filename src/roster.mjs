// roster.mjs — the bot team's roles as a fence: who may use which tool, under what condition, and what each bot must
// never do. Pure, total, deterministic, witness-gated. (Simon's bot-team spec 2026-11-01, §1 and §6.)
//
//   problems(roster)                          → [what is wrong with the roster]; [] when it is whole
//   may(roster, persona, tool, { auditorPass, simonGo })
//                                             → { ok: true } | { ok: false, why } — why: unknown persona, unknown tool,
//                                               forbidden, off-list, needs the auditor's PASS, needs Simon's go.
//                                               An outward tool needs Simon's go and a gated one the auditor's PASS,
//                                               whatever the roster says.
//   toolOf(line)                              → the tool a feed line used (a post line is post.draft, a pause is
//                                               pause.write, a verdict is verdict.write…), or null
import { PERSONAS, KINDS } from './feed.mjs';

export const CLASSES = Object.freeze(['read', 'write', 'gated', 'outward']);
export const CONDITIONS = Object.freeze(['auditor-pass', 'simon-go']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const texts = (v) => Array.isArray(v) && v.length > 0 && v.every(text);
const nameOf = (t) => (typeof t === 'string' ? t : isObj(t) ? t.tool : undefined);
const personas = (r) => (isObj(r) && Array.isArray(r.personas) ? r.personas.filter(isObj) : []);
const find = (r, id) => personas(r).find((p) => p.id === id);
const classOf = (r, tool) => (isObj(r) && isObj(r.tools) && Object.hasOwn(r.tools, tool) && isObj(r.tools[tool]) ? r.tools[tool].class : undefined);
const entryOf = (p, tool) => (Array.isArray(p.tools) ? p.tools.find((t) => nameOf(t) === tool) : undefined);
const whenOf = (e) => (isObj(e) && Array.isArray(e.when) ? e.when : []);

export function problems(roster) {
  if (!isObj(roster)) return ['not a roster'];
  if (!isObj(roster.tools)) return ['no tool vocabulary'];
  const out = [];
  for (const [id, t] of Object.entries(roster.tools)) if (!isObj(t) || !CLASSES.includes(t.class) || !text(t.what)) out.push(`tool ${id}: needs a class and plain words`);
  const ps = personas(roster), ids = ps.map((p) => p.id);
  if (!Array.isArray(roster.personas) || ps.length !== roster.personas.length) out.push('a persona is not an object');
  if (ids.length !== PERSONAS.length || !PERSONAS.every((id) => ids.includes(id))) out.push("the personas are not the feed's eight");
  const owned = new Map();
  for (const p of ps) {
    const who = 'persona ' + p.id;
    for (const f of ['id', 'name', 'role', 'runs_on']) if (!text(p[f])) out.push(`${who}: no ${f}`);
    if (!isObj(p.runtime) || !text(p.runtime.model) || !text(p.runtime.config)) out.push(`${who}: no runtime model and config`);
    if (!Array.isArray(p.tools) || p.tools.length === 0) out.push(`${who}: no tools`);
    if (!texts(p.forbidden)) out.push(`${who}: no forbidden actions`);
    if (!texts(p.owns)) out.push(`${who}: owns nothing`);
    if (p.content !== undefined && !(Array.isArray(p.content) && p.content.every(text))) out.push(`${who}: content rules are not words`);
    for (const t of Array.isArray(p.tools) ? p.tools : []) {
      const n = nameOf(t), cls = classOf(roster, n), when = whenOf(t);
      if (!cls) { out.push(`${who}: unknown tool ${n}`); continue; }
      if (isObj(t) && !(when.length > 0 && when.every((c) => CONDITIONS.includes(c)))) out.push(`${who}: ${n} has a condition that is not one of ${CONDITIONS.join(', ')}`);
      if ((p.forbidden || []).includes(n)) out.push(`${who}: ${n} is both allowed and forbidden`);
      if (cls === 'outward' && !when.includes('simon-go')) out.push(`${who}: outward ${n} without Simon's go`);
      if (cls === 'gated' && !when.includes('auditor-pass')) out.push(`${who}: gated ${n} without the auditor's PASS`);
      if (n === 'verdict.write' && p.id !== 'auditor') out.push(`${who}: only the auditor writes verdicts`);
    }
    for (const f of Array.isArray(p.forbidden) ? p.forbidden : []) if (!classOf(roster, f)) out.push(`${who}: unknown forbidden tool ${f}`);
    for (const o of Array.isArray(p.owns) ? p.owns : []) { if (owned.has(o)) out.push(`${o}: owned by ${owned.get(o)} and ${p.id}`); else owned.set(o, p.id); }
  }
  const a = find(roster, 'auditor');
  for (const b of ['builder', 'kar'].map((id) => find(roster, id))) {
    if (a && b && isObj(a.runtime) && isObj(b.runtime) && (a.runtime.model === b.runtime.model || a.runtime.config === b.runtime.config)) out.push(`the auditor runs on ${b.id}'s model or config`);
  }
  return out;
}

export function may(roster, persona, tool, ctx) {
  const p = find(roster, persona);
  if (!p) return { ok: false, why: 'unknown persona' };
  const cls = classOf(roster, tool);
  if (!CLASSES.includes(cls)) return { ok: false, why: 'unknown tool' };
  if (Array.isArray(p.forbidden) && p.forbidden.includes(tool)) return { ok: false, why: 'forbidden' };
  const e = entryOf(p, tool);
  if (e === undefined) return { ok: false, why: 'off-list' };
  const c = isObj(ctx) ? ctx : {}, when = whenOf(e);
  if ((when.includes('auditor-pass') || cls === 'gated') && c.auditorPass !== true) return { ok: false, why: "needs the auditor's PASS" };
  if ((when.includes('simon-go') || cls === 'outward') && c.simonGo !== true) return { ok: false, why: "needs Simon's go" };
  return { ok: true };
}

const BY_KIND = Object.freeze({ post: 'post.draft', listing: 'listing.draft', lead: 'lead.log', build: 'branch.write' });
export function toolOf(line) {
  if (!isObj(line) || !KINDS.includes(line.kind)) return null;
  if (['PASS', 'FLAG', 'FAIL'].includes(line.verdict)) return 'verdict.write';
  if (line.kind === 'decision' && (line.verdict === 'pause' || line.verdict === 'unpause')) return 'pause.write';
  if (line.kind === 'decision' && (line.verdict === 'approve' || line.verdict === 'deny')) return 'decision.approve';
  if (line.kind === 'task' && text(line.to)) return 'task.assign';
  return Object.hasOwn(BY_KIND, line.kind) ? BY_KIND[line.kind] : 'feed.write';
}

export default { CLASSES, CONDITIONS, problems, may, toolOf };
