// ════════════════════════════════════════════════════════════════
// src/render.mjs — organ 1 of Kar's passport (with symbfer.mjs): the writers. A content model in, a SYMB-FER token out,
// and back. SYMB-FER is SYMBEYOND AI LLC's protocol (MIT): "SYMB-FER, SYMBEYOND AI LLC, 2026."
//
//   dot(text)            → free text in the template's dot notation (whitespace runs → U+00B7; em/en dash → hyphen;
//                          markdown links and wikilinks → their words; other brackets → parentheses); '' for non-text
//   checkModel62(m)      → { ok } | { ok: false, why }: every value one non-empty run with no whitespace, nothing that
//                          could be read as a section marker, a comment or an empty-list line
//   render62(m)          → the v6.2 LIVING TOKEN (§SIG unsealed), or '' for a model that fails checkModel62
//   toModel62(text)      → { ok, model } | { ok: false, why }: the model back from a token render62 wrote; every fixed
//                          line must be exactly where render62 puts it, so render62(toModel62(t).model) === t
//   render30 / checkModel30 / toModel30 → the same for the v3.0 shape teslasolar's fork checks
//   tierState(m, tier)   → the state SYMBEYOND's generator takes, for NANO, CORE or STATE, from a v6.2 model
//
// The fixed text is the template's own lines (src/template62.mjs, generated from the vendored file). Left out, on purpose:
// the template's fill-in [BRACKET] lines and its how-to-fill guidance comments; a filled token has nothing to fill.
// Pure and total. Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { T62 } from './template62.mjs';
import { RULES30, tierText, codePoints, TIER_LIMITS, withSig } from './symbfer.mjs';

const T = (a, b) => T62.slice(a - 1, b === undefined ? a : b);
export const NONE = 'NONE·IN·THIS·SLICE';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Free text → one dot-notation value. */
export function dot(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\[\[([^\]\n]*)\]\]/g, '$1')
    .replace(/\[([^\]\n]*)\]\(([^)\n]*)\)/g, '$1')
    .replace(/\[/g, '(').replace(/\]/g, ')')
    .replace(/[—–]/g, '-')
    .replace(/[*`]/g, '')
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, '·')
    .replace(/·{2,}/g, '·')
    .replace(/^[·§#]+/, '')
    .replace(/·+$/, '');
}

// a model value: one run, no whitespace, not a marker, a comment, a bracket field or the empty-list line
const val = (s) => typeof s === 'string' && /^\S+$/.test(s) && !/^[§#]/.test(s) && !/[[\]]/.test(s) && s !== NONE && !s.includes('—');
const list = (x, f) => Array.isArray(x) && x.every(f);
const pair = (p) => Array.isArray(p) && p.length === 2 && val(p[0]) && val(p[1]);
const pairs = (x) => list(x, pair);
const vals = (x) => list(x, val);
const fail = (why) => ({ ok: false, why });

// ── v6.2 ───────────────────────────────────────────────────────────
const META_KEYS = [['human', 'HUMAN'], ['callname', 'CALLNAME'], ['org', 'ORG'], ['contact', 'CONTACT'], ['website', 'WEBSITE'], ['origin', 'ORIGIN']];
const ID_KEYS = [['fullName', 'FULL·NAME'], ['callname', 'CALLNAME'], ['role', 'ROLE'], ['function', 'FUNCTION'], ['nature', 'NATURE'],
  ['communication', 'COMMUNICATION'], ['location', 'LOCATION']];
const CUR_KEYS = [['active', 'ACTIVE·NOW:'], ['changed', 'JUST·CHANGED:'], ['waiting', 'WAITING·ON·OTHERS:'], ['hands', 'IN·OUR·HANDS:']];

export function checkModel62(m) {
  if (!isObj(m)) return fail('not a model');
  if (typeof m.generated !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{4}H$/.test(m.generated)) return fail('generated is not YYYY-MM-DD_HHMMH');
  if (m.mode !== 'STANDARD' && m.mode !== 'VERIFIED') return fail('mode is STANDARD or VERIFIED');
  if (!isObj(m.meta) || !META_KEYS.every(([k]) => val(m.meta[k]))) return fail('meta');
  if (!isObj(m.identity) || !ID_KEYS.every(([k]) => val(m.identity[k]))) return fail('identity');
  if (!vals(m.ethos) || !vals(m.bootEthos) || !vals(m.retrieve) || !vals(m.rules)) return fail('a list of lines');
  if (!pairs(m.lexicon) || m.lexicon.some(([t]) => t.includes(' :: '))) return fail('lexicon');
  for (const k of ['relationships', 'bootFacts', 'refs', 'constants', 'dates', 'credits', 'lessons']) if (!pairs(m[k])) return fail(k);
  if (!val(m.sovereign)) return fail('sovereign');
  if (!Array.isArray(m.lanes) || !m.lanes.every((l) => isObj(l) && val(l.name) && isObj(l.primary) && val(l.primary.thread) &&
    val(l.primary.score) && val(l.primary.status) && vals(l.primary.next) && list(l.queued, (q) => isObj(q) && val(q.thread) && val(q.score) && val(q.first)))) return fail('lanes');
  if (!isObj(m.current) || !/^\d{4}-\d{2}-\d{2}$/.test(m.current.asOf) || !CUR_KEYS.every(([k]) => vals(m.current[k]))) return fail('current');
  if (!list(m.threads, (t) => isObj(t) && ['name', 'status', 'nature', 'action'].every((k) => val(t[k])))) return fail('threads');
  if (!list(m.sessions, (s) => isObj(s) && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && vals(s.accomplished) && vals(s.queued))) return fail('sessions');
  if (!list(m.resolved, (r) => isObj(r) && ['name', 'date', 'what', 'outcome', 'lesson'].every((k) => val(r[k])))) return fail('resolved');
  if (!list(m.milestones, (r) => isObj(r) && ['id', 'name', 'date', 'what', 'outcome', 'source'].every((k) => val(r[k])))) return fail('milestones');
  if (!isObj(m.finalization) || !val(m.finalization.status) || !val(m.finalization.mode)) return fail('finalization');
  return { ok: true };
}

const orNone = (lines) => (lines.length ? lines : [NONE]);
const pad2 = (i) => String(i + 1).padStart(2, '0');

// each section: its fixed head and tail (the template's lines), and the variable lines between them
const S62 = [
  ['TRANSFER·MODE', [], T(50, 52), (m) => ['MODE: ' + m.mode]],
  ['META', T(56, 57), [...T(65, 72)], (m) => ['GENERATED: ' + m.generated, ...META_KEYS.map(([k, K]) => K + ': ' + m.meta[k])]],
  ['PARSE·GUIDE', [...T(76, 84), ...T(86, 87)], [], () => []],
  ['SAFETY·INTERPRETATION', T(91, 94), [], () => []],
  ['SYMB2·DOCTRINE', T(98, 106), [], () => []],
  ['ETHOS', T(110, 119), [], (m) => orNone(m.ethos)],
  ['LEXICON', T(127, 130), [], (m) => m.lexicon.map(([t, d]) => t + ' :: ' + d)],
  ['IDENTITY', [], [], (m) => ID_KEYS.map(([k, K]) => K + ': ' + m.identity[k])],
  ['KEY·RELATIONSHIPS', T(146, 148), [], (m) => orNone(m.relationships.map(([n, r]) => n + ': ' + r))],
  ['BOOT·FACTS', T(158, 159), [], (m) => orNone(m.bootFacts.map(([k, v]) => k + ': ' + v))],
  ['BOOT·ETHOS', T(169, 175), T(178, 182), (m) => m.bootEthos],
  ['BOOT·PROTOCOL', T(186, 191), T(193, 224), (m) => ['SOVEREIGNTY: ' + m.sovereign + '·can·invoke·ReFer·at·any·time·to·force·full·orientation']],
  ['SEARCH·PROTOCOL', T(228, 274), [], (m) => (m.retrieve.length ? ['', 'RETRIEVE·FOR·THIS·SLICE {', ...m.retrieve.map((r) => '  ' + r), '}'] : [])],
  ['RELATIONAL·RULES', [...T(278, 279), ...T(282, 286)], [], (m) => m.rules.map((r) => 'RULE: ' + r)],
  ['REF·ENCODING', [...T(291, 293), ...T(295, 305)], [], (m) => orNone(m.refs.map(([c, d]) => c + ' :: ' + d))],
  ['CORE·CONSTANTS', T(309, 310), [], (m) => orNone(m.constants.map(([n, v]) => n + ': ' + v))],
  ['SACRED·DATES', T(316, 317), [], (m) => orNone(m.dates.map(([d, w]) => d + ': ' + w))],
  ['COLLABORATORS·CREDITED', [], T(325), (m) => orNone(m.credits.map(([n, c]) => n + ': ' + c))],
  ['SCORING·KEY', T(329, 340), [], () => []],
  ['LANE·STRUCTURE', T(344, 348), ['', ...T(370, 372)], (m) => laneLines(m.lanes)],
  ['CURRENT·REALITY', T(376, 378), [], (m) => ['AS·OF: ' + m.current.asOf, ...CUR_KEYS.flatMap(([k, K]) => ['', K, ...orNone(m.current[k])])]],
  ['OPEN·THREADS', T(399, 403), [], (m) => orNone(m.threads.flatMap((t, i) => [...(i ? [''] : []), 'THREAD·' + pad2(i) + ': ' + t.name,
    'STATUS: ' + t.status, 'NATURE: ' + t.nature, 'ACTION: ' + t.action]))],
  ['SESSION·LOG', T(413, 417), [], (m) => orNone(m.sessions.flatMap((s, i) => [...(i ? [''] : []), 'SESSION·' + s.date + ' {',
    '  ACCOMPLISHED {', ...s.accomplished.map((x) => '    ' + x), '  }', '  QUEUED·FOR·NEXT·SESSION {', ...s.queued.map((x) => '    ' + x), '  }', '}']))],
  ['RESOLVED', T(435, 437), [], (m) => orNone(m.resolved.flatMap((r, i) => [...(i ? [''] : []), 'RESOLVED·' + pad2(i) + ': ' + r.name,
    'DATE: ' + r.date, 'WHAT: ' + r.what, 'OUTCOME: ' + r.outcome, 'LESSON: ' + r.lesson]))],
  ['CLOSED·MILESTONES', T(448, 456), [], (m) => orNone(m.milestones.flatMap((r, i) => [...(i ? [''] : []), 'MILESTONE·' + r.id + ': ' + r.name,
    'DATE: ' + r.date, 'WHAT: ' + r.what, 'OUTCOME: ' + r.outcome, 'SOURCE: ' + r.source]))],
  ['LESSONS·LEARNED', T(473, 474), T(479, 490), (m) => m.lessons.map(([k, t]) => k + ': ' + t)],
  ['DRIFT·CHECK', T(494, 495), T(497, 498), (m) => ['SOVEREIGNTY: ' + m.sovereign + '·decides·whether·to·continue·or·redirect']],
  ['INTEGRITY', T(523, 527), [], () => []],
  ['FINALIZATION', [], [T(533)[0], 'NOTE: sealed·by·Kar\'s·passport·SHA-256·of·every·line·outside·§SIG·and·Ed25519·see·§SIG'],
    (m) => ['STATUS: ' + m.finalization.status, 'MODE: ' + m.finalization.mode]],
];

function laneLines(lanes) {
  if (!lanes.length) return [NONE];
  const out = lanes.map((l, i) => 'LANE·' + (i + 1) + '·NAME: ' + l.name);
  lanes.forEach((l, i) => {
    out.push('', 'LANE·' + (i + 1) + '·BEGIN', 'PRIMARY {', '  thread: ' + l.primary.thread, '  score: ' + l.primary.score,
      '  status: ' + l.primary.status, '  next·actions {', ...l.primary.next.map((a, j) => '    ' + (j + 1) + '. ' + a), '  }', '}',
      'QUEUED {', ...l.queued.map((q) => '  ' + q.thread + ' score:' + q.score + ' first·action:' + q.first), '}', 'LANE·' + (i + 1) + '·END');
  });
  return out;
}

const HEAD62 = (m) => ['∴SYMB-FER·v6.2·LIVING·TOKEN·[' + m.generated + ']', T(2)[0], 'SYMB-FER·v6.2·Living·Token·made·by·Kar\'s·passport', T(4)[0], T(5)[0], ''];
const TAIL62 = [T(537)[0], '§SIG·BEGIN', 'MODE: STANDARD', 'STATUS: UNVERIFIED', 'SHA256: PENDING', '§SIG·END', T(543)[0], '', T(545)[0], ''];

export function render62(m) {
  if (!checkModel62(m).ok) return '';
  const out = HEAD62(m);
  for (const [name, head, tail, put] of S62) out.push('§' + name + '·BEGIN', ...head, ...put(m), ...tail, '§' + name + '·END', '');
  return [...out, ...TAIL62].join('\n');
}

// ── reading a token back into its model ────────────────────────────
// The readers extract leniently and never throw; what makes them exact is the last step: the model read back must render
// to the very text it came from (the §SIG block aside). Any line out of place fails that comparison.
const after = (line, prefix) => (typeof line === 'string' && line.startsWith(prefix) ? line.slice(prefix.length) : null);
const split2 = (line, sep) => { const i = typeof line === 'string' ? line.indexOf(sep) : -1; return i === -1 ? null : [line.slice(0, i), line.slice(i + sep.length)]; };
const noneOr = (lines) => (lines.length === 1 && lines[0] === NONE ? [] : lines);
const blocks = (lines) => { const out = [[]]; for (const l of lines) { if (l === '') out.push([]); else out.at(-1).push(l); } return out.filter((b) => b.length); };
const untilBlank = (v, from) => { const end = v.indexOf('', from); return v.slice(from, end === -1 ? v.length : end); };
const strip = (line, re) => (typeof line === 'string' && re.test(line) ? line.replace(re, '') : null);

const GETS = {
  'TRANSFER·MODE': (v, m) => { m.mode = after(v[0], 'MODE: '); },
  'META': (v, m) => { m.generated = after(v[0], 'GENERATED: '); m.meta = Object.fromEntries(META_KEYS.map(([k, K], j) => [k, after(v[j + 1], K + ': ')])); },
  'ETHOS': (v, m) => { m.ethos = noneOr(v); },
  'LEXICON': (v, m) => { m.lexicon = v.map((l) => split2(l, ' :: ')); },
  'IDENTITY': (v, m) => { m.identity = Object.fromEntries(ID_KEYS.map(([k, K], j) => [k, after(v[j], K + ': ')])); },
  'KEY·RELATIONSHIPS': (v, m) => { m.relationships = noneOr(v).map((l) => split2(l, ': ')); },
  'BOOT·FACTS': (v, m) => { m.bootFacts = noneOr(v).map((l) => split2(l, ': ')); },
  'BOOT·ETHOS': (v, m) => { m.bootEthos = v; },
  'BOOT·PROTOCOL': (v, m) => { m.sovereign = strip(after(v[0], 'SOVEREIGNTY: '), /·can·invoke·ReFer·at·any·time·to·force·full·orientation$/); },
  'SEARCH·PROTOCOL': (v, m) => { m.retrieve = v.slice(2, -1).map((l) => after(l, '  ')); },
  'RELATIONAL·RULES': (v, m) => { m.rules = v.map((l) => after(l, 'RULE: ')); },
  'REF·ENCODING': (v, m) => { m.refs = noneOr(v).map((l) => split2(l, ' :: ')); },
  'CORE·CONSTANTS': (v, m) => { m.constants = noneOr(v).map((l) => split2(l, ': ')); },
  'SACRED·DATES': (v, m) => { m.dates = noneOr(v).map((l) => split2(l, ': ')); },
  'COLLABORATORS·CREDITED': (v, m) => { m.credits = noneOr(v).map((l) => split2(l, ': ')); },
  'LANE·STRUCTURE': (v, m) => { m.lanes = readLanes(noneOr(v)); },
  'CURRENT·REALITY': (v, m) => {
    m.current = { asOf: after(v[0], 'AS·OF: ') };
    for (const [k, K] of CUR_KEYS) m.current[k] = noneOr(untilBlank(v, v.indexOf(K) + 1));
  },
  'OPEN·THREADS': (v, m) => {
    m.threads = blocks(noneOr(v)).map((b) => ({ name: strip(b[0], /^THREAD·\d+: /), status: after(b[1], 'STATUS: '), nature: after(b[2], 'NATURE: '), action: after(b[3], 'ACTION: ') }));
  },
  'SESSION·LOG': (v, m) => {
    m.sessions = blocks(noneOr(v)).map((b) => {
      const q = b.indexOf('  QUEUED·FOR·NEXT·SESSION {');
      return { date: strip(strip(b[0], /^SESSION·/), / \{$/), accomplished: b.slice(2, q - 1).map((l) => after(l, '    ')), queued: b.slice(q + 1, -2).map((l) => after(l, '    ')) };
    });
  },
  'RESOLVED': (v, m) => {
    m.resolved = blocks(noneOr(v)).map((b) => ({ name: strip(b[0], /^RESOLVED·\d+: /), date: after(b[1], 'DATE: '), what: after(b[2], 'WHAT: '), outcome: after(b[3], 'OUTCOME: '), lesson: after(b[4], 'LESSON: ') }));
  },
  'CLOSED·MILESTONES': (v, m) => {
    m.milestones = blocks(noneOr(v)).map((b) => {
      const h = split2(strip(b[0], /^MILESTONE·/), ': ') || [null, null];
      return { id: h[0], name: h[1], date: after(b[1], 'DATE: '), what: after(b[2], 'WHAT: '), outcome: after(b[3], 'OUTCOME: '), source: after(b[4], 'SOURCE: ') };
    });
  },
  'LESSONS·LEARNED': (v, m) => { m.lessons = v.map((l) => split2(l, ': ')); },
  'FINALIZATION': (v, m) => { m.finalization = { status: after(v[0], 'STATUS: '), mode: after(v[1], 'MODE: ') }; },
};

function readLanes(v) {
  if (!v.length) return [];
  const names = untilBlank(v, 0).map((l) => strip(l, /^LANE·\d+·NAME: /));
  return blocks(v.slice(names.length)).map((b, k) => {
    const close = b.indexOf('  }'), queued = b.indexOf('QUEUED {');
    return {
      name: names[k] === undefined ? null : names[k],
      primary: { thread: after(b[2], '  thread: '), score: after(b[3], '  score: '), status: after(b[4], '  status: '), next: b.slice(6, close).map((l) => strip(l, /^ {4}\d+\. /)) },
      queued: b.slice(queued + 1, -2).map((l) => { const q = /^ {2}(\S+) score:(\S+) first·action:(\S+)$/.exec(l) || []; return { thread: q[1], score: q[2], first: q[3] }; }),
    };
  });
}

export function toModel62(text) {
  if (typeof text !== 'string') return fail('not text');
  const lines = text.split('\n'), m = {};
  for (const [name, head, tail] of S62) {
    const b = lines.indexOf('§' + name + '·BEGIN'), e = lines.indexOf('§' + name + '·END');
    if (b === -1 || e === -1) return fail('§' + name + ' is missing');
    if (GETS[name]) GETS[name](lines.slice(b + 1 + head.length, e - tail.length), m);
  }
  const check = checkModel62(m);
  if (!check.ok) return fail('the values read back are not a model: ' + check.why);
  return render62(m) === (withSig(text, null) || text) ? { ok: true, model: m } : fail('a line differs from what render62 writes');
}

// ── v3.0: the shape teslasolar's fork checks ───────────────────────
export function checkModel30(m) {
  if (!isObj(m)) return fail('not a model');
  if (typeof m.generated !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{4}H$/.test(m.generated)) return fail('generated');
  if (m.mode !== 'STANDARD' && m.mode !== 'VERIFIED') return fail('mode');
  if (!isObj(m.meta) || !['purpose', 'human', 'org', 'contact'].every((k) => val(m.meta[k]))) return fail('meta');
  if (!pairs(m.facts)) return fail('facts');
  const s = m.session;
  if (!isObj(s) || !val(s.workingDirectory) || !val(s.nextStep) || !val(s.notes) || !vals(s.activePaths) || !vals(s.recentActions) ||
    [...s.activePaths, ...s.recentActions].some((x) => x.includes('|'))) return fail('session');
  if (!vals(m.ethos) || !pairs(m.lessons) || !val(m.trace)) return fail('ethos, lessons or trace');
  return { ok: true };
}

const V30 = [
  ['TRANSFER·MODE', (m) => ['MODE: ' + m.mode, 'OPTIONS: STANDARD·VERIFIED', 'RULE: STANDARD·copy-paste·only', 'RULE: VERIFIED·optional·integrity·hardening', ...RULES30.slice(0, 6)]],
  ['ARCHIVE·PRINCIPLE', () => ['RULE: all·data·is·equal·no·implicit·ranking', 'RULE: no·data·is·discarded·without·explicit·intent',
    'RULE: unused·data·must·be·preserved·for·posterity', 'RULE: system·must·not·prune·based·on·assumed·relevance',
    'RULE: archive·integrity·overrides·optimization', 'RULE: pruning·allowed·only·with·explicit·operator·instruction']],
  ['META', (m) => ['FORMAT: SYMB-FER·v3.0·TOKEN', 'PURPOSE: ' + m.meta.purpose, 'GENERATED: ' + m.generated, 'HUMAN: ' + m.meta.human,
    'ORG: ' + m.meta.org, 'CONTACT: ' + m.meta.contact]],
  ['PARSE·GUIDE', () => ['∴ = therefore·earned·not·assumed', 'λ = condition·must·hold', '∧ = AND', '! = NOT', '· = delimiter·U+00B7·middle·dot', '§ = section·marker']],
  ['TIME·COLLAB', () => RULES30.slice(6, 8)],
  ['BOOT·FACTS', (m) => [...RULES30.slice(8, 10), ...m.facts.map(([k, v]) => k + ': ' + v)]],
  ['SESSION·STATE', (m) => ['working·directory: ' + m.session.workingDirectory, 'active·paths: ' + m.session.activePaths.join('|'),
    'recent·actions: ' + m.session.recentActions.join('|'), 'next·step: ' + m.session.nextStep, 'notes: ' + m.session.notes]],
  ['BOOT·ETHOS', (m) => m.ethos.map((e) => 'principle: ' + e)],
  ['INTEGRITY', () => RULES30.slice(10, 14)],
  ['FINALIZATION', () => ['status: ready']],
  ['LESSONS·LEARNED', (m) => m.lessons.map(([k, t]) => k + ': ' + t)],
  ['DRIFT·CHECK', () => ['status: clean', 'principle: if·something·feels·off·name·it·directly']],
  ['TEST·TRACE', (m) => ['trace: ' + m.trace]],
];

export function render30(m) {
  if (!checkModel30(m).ok) return '';
  const out = ['∴SYMB-FER·v3.0·TOKEN·[' + m.generated + ']', T(2)[0], ''];
  for (const [name, put] of V30) out.push('§' + name + '·BEGIN', ...put(m), '§' + name + '·END', '');
  return [...out, '§SIG·BEGIN', 'MODE: STANDARD', 'STATUS: UNVERIFIED', 'SHA256:', '§SIG·END', ''].join('\n');
}

export function toModel30(text) {
  if (typeof text !== 'string') return fail('not text');
  const lines = text.split('\n');
  const body = (name) => { const b = lines.indexOf('§' + name + '·BEGIN'); return b === -1 ? [] : lines.slice(b + 1, lines.indexOf('§' + name + '·END')); };
  const meta = body('META'), ss = body('SESSION·STATE'), list = (l) => (l === null ? null : l.split('|').filter((x) => x !== ''));
  const m = {
    generated: strip(strip(lines[0], /^∴SYMB-FER·v3\.0·TOKEN·\[/), /\]$/), mode: after(body('TRANSFER·MODE')[0], 'MODE: '),
    meta: { purpose: after(meta[1], 'PURPOSE: '), human: after(meta[3], 'HUMAN: '), org: after(meta[4], 'ORG: '), contact: after(meta[5], 'CONTACT: ') },
    facts: body('BOOT·FACTS').slice(2).map((l) => split2(l, ': ')),
    session: { workingDirectory: after(ss[0], 'working·directory: '), activePaths: list(after(ss[1], 'active·paths: ')), recentActions: list(after(ss[2], 'recent·actions: ')),
      nextStep: after(ss[3], 'next·step: '), notes: after(ss[4], 'notes: ') },
    ethos: body('BOOT·ETHOS').map((l) => after(l, 'principle: ')), lessons: body('LESSONS·LEARNED').map((l) => split2(l, ': ')), trace: after(body('TEST·TRACE')[0], 'trace: '),
  };
  const check = checkModel30(m);
  if (!check.ok) return fail('the values read back are not a model: ' + check.why);
  return render30(m) === (withSig(text, null) || text) ? { ok: true, model: m } : fail('a line differs from what render30 writes');
}

// ── the tiers' state, from a v6.2 model ────────────────────────────
/** SYMBEYOND's generator's state: missions = the lanes' PRIMARY threads, shipped = milestones, threads = open threads,
 *  repo status = the RETRIEVE lines that are links, boot sequence = the v6.2 boot protocol in its own order, vocabulary =
 *  the lexicon; never anything in "personal". */
export function tierState(m) {
  if (!checkModel62(m).ok) return null;
  const words = (s) => s.replace(/·/g, ' ');
  return {
    _meta: { instance: 'Kar', operator: words(m.identity.callname), organization: words(m.meta.org) },
    state: {
      immediate_mission: m.lanes.map((l) => words(l.primary.thread) + (l.primary.next.length ? ' · next: ' + words(l.primary.next[0]) : '')),
      shipped: m.milestones.map((x) => words(x.name) + ' · ' + x.date),
      open_threads: m.threads.map((t) => words(t.name) + ' · ' + words(t.status)),
      repo_status: m.retrieve.filter((r) => /^https:\/\//.test(r)).map(words),
      personal: [],
    },
    protocol: { boot_sequence: ['read the whole token before any response', 'identify yourself and your capabilities', 'when uncertain search history: token first, recent chats second, synthesis third'] },
    vocabulary: m.lexicon.map(([t, d]) => words(t) + ' :: ' + words(d)),
    greeting: 'Token received. Orienting before responding.',
  };
}

/** The tier token's state, trimmed from the end of its lists until SYMBEYOND's generator's text fits the tier: the
 *  vocabulary goes first, then repo status, open threads, shipped, then missions after the first; a first mission that
 *  still does not fit loses its "next:" part. { ok, state, text } or a refusal when even that does not fit. */
export function tierFit(m, tier, ts) {
  const st = tierState(m);
  if (!st || !Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier) || typeof ts !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{4}H$/.test(ts)) return fail('model, tier or time');
  const limit = TIER_LIMITS[tier];
  const lists = [st.vocabulary, st.state.repo_status, st.state.open_threads, st.state.shipped, st.protocol.boot_sequence];
  let text = tierText(st, tier, ts);
  for (;;) {
    if (codePoints(text) <= limit) return { ok: true, state: st, text };
    const l = lists.find((x) => x.length);
    if (l) l.pop();
    else if (st.state.immediate_mission.length > 1) st.state.immediate_mission.pop();
    else if (st.state.immediate_mission.length === 1 && st.state.immediate_mission[0].includes(' · next: ')) st.state.immediate_mission[0] = st.state.immediate_mission[0].split(' · next: ')[0];
    else return fail('does not fit ' + tier + ' (' + codePoints(text) + ' > ' + limit + ')');
    text = tierText(st, tier, ts);
  }
}
