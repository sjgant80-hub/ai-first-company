// ════════════════════════════════════════════════════════════════
// src/symbfer.mjs — organ 1 of Kar's passport: the SYMB-FER readers, the tier writer and the seal's shape.
//
// SYMB-FER is SYMBEYOND AI LLC's open protocol (MIT): cite as "SYMB-FER, SYMBEYOND AI LLC, 2026."
// Every reader here is a line-for-line port of the protocol's own Python, so it can be checked against it (claims P2–P4):
//   validate62(text) / validate62Bytes(u8) → SYMBEYOND's validate_v6_2.py (SYMBEYOND/SYMB-FER 7370e7d)
//   validate30(text) / validate30Bytes(u8) → teslasolar's fork, symbfer_engine.py process_symbfer_* (teslasolar/SYMB-FER 6705464)
//   tierText(state, tier, ts)              → SYMBEYOND's symb_fer_generator.py generate_nano / _core / _state (v1.1, v2.0 tokens)
// Python's own string rules are ported with them (splitlines, strip), because the fuzz reaches the corners they differ on.
//
// The seal (where v6.2 is silent; claims.json "silent"): SHA-256 over every line outside the last §SIG block, and an
// Ed25519 signature over SEAL_PREFIX + that hex, carried as two more lines inside §SIG:
//   canonical(text)   → the signed text (lines strictly inside the last §SIG·BEGIN … §SIG·END removed) | null
//   sigOf(text)       → { ok, sealed, mode, status, sha, key, sig } read strictly from that block | { ok: false, why }
//   withSig(text, f)  → the same text with that block's lines replaced by the sealed form of f
//   sealMessage(sha)  → the bytes Ed25519 signs
//   formatOf(text)    → 'v6.2' | 'v3.0' | 'nano' | 'core' | 'state' | null, read from the first line(s)
//   parse(text) / write(doc) → a token as its lines and its sections (BEGIN/END line numbers), and back, byte for byte
//
// Pure and total: garbage in is a refusal or an empty answer, never a throw.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════

// ── Python's string rules ──────────────────────────────────────────
const PY_BREAKS = new Set(['\n', '\r', '\x0b', '\x0c', '\x1c', '\x1d', '\x1e', '\x85', ' ', ' ']);
const PY_SPACE = new Set(['\t', '\n', '\x0b', '\x0c', '\r', '\x1c', '\x1d', '\x1e', '\x1f', ' ', '\x85', '\xa0', ' ',
  ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ',
  ' ', ' ', ' ', ' ', '　']);

/** str.splitlines() */
const BREAK_RE = new RegExp('\\r\\n|[' + [...PY_BREAKS].map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + ']');
const SPACE_CLASS = '[' + [...PY_SPACE].map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + ']+';
const STRIP_RE = new RegExp('^' + SPACE_CLASS + '|' + SPACE_CLASS + '$', 'g');

export function pySplitlines(s) {
  if (typeof s !== 'string') return [];
  const parts = s.split(BREAK_RE);
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

/** str.strip() */
export function pyStrip(s) {
  return typeof s === 'string' ? s.replace(STRIP_RE, '') : '';
}

/** bytes.decode('utf-8') in strict mode: the text, or null where Python raises */
export function decodeUtf8(u8) {
  if (!(u8 instanceof Uint8Array)) return null;
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(u8); } catch { return null; }
}

const SHA_RE = /^[0-9a-f]{64}$/;
const statusOf = (r) => (r.failures.length ? 'FAIL' : r.warnings.length ? 'WARN' : 'PASS');
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const dots = (lines) => lines.reduce((n, l) => n + l.split('·').length - 1, 0);

// ── v6.2: SYMBEYOND's validate_v6_2.py ─────────────────────────────
const BEGIN62 = /^§([A-Z0-9·]+)·BEGIN$/;
const END62 = /^§([A-Z0-9·]+)·END$/;
const NESTED62 = new Map([['BOOT·PROTOCOL', ['REFER·TRIGGER', 'TIMESTAMP·CALIBRATION', 'TIME·ANCHOR']]]);
export const REQUIRED62 = Object.freeze(['TRANSFER·MODE', 'META', 'PARSE·GUIDE', 'SAFETY·INTERPRETATION', 'SYMB2·DOCTRINE', 'ETHOS',
  'LEXICON', 'IDENTITY', 'KEY·RELATIONSHIPS', 'BOOT·FACTS', 'BOOT·ETHOS', 'BOOT·PROTOCOL', 'REFER·TRIGGER', 'TIMESTAMP·CALIBRATION',
  'TIME·ANCHOR', 'SEARCH·PROTOCOL', 'RELATIONAL·RULES', 'REF·ENCODING', 'CORE·CONSTANTS', 'SACRED·DATES', 'COLLABORATORS·CREDITED',
  'SCORING·KEY', 'LANE·STRUCTURE', 'CURRENT·REALITY', 'OPEN·THREADS', 'SESSION·LOG', 'RESOLVED', 'CLOSED·MILESTONES',
  'LESSONS·LEARNED', 'DRIFT·CHECK', 'INTEGRITY', 'FINALIZATION', 'SIG']);
export const ORDER62 = Object.freeze(['TRANSFER·MODE', 'META', 'PARSE·GUIDE', 'SAFETY·INTERPRETATION', 'SYMB2·DOCTRINE', 'ETHOS',
  'LEXICON', 'IDENTITY', 'KEY·RELATIONSHIPS', 'BOOT·FACTS', 'BOOT·ETHOS', 'BOOT·PROTOCOL', 'SEARCH·PROTOCOL', 'RELATIONAL·RULES',
  'REF·ENCODING', 'CORE·CONSTANTS', 'SACRED·DATES', 'COLLABORATORS·CREDITED', 'SCORING·KEY', 'LANE·STRUCTURE', 'CURRENT·REALITY',
  'OPEN·THREADS', 'SESSION·LOG', 'RESOLVED', 'CLOSED·MILESTONES', 'LESSONS·LEARNED', 'DRIFT·CHECK', 'SYMB·NOTATION', 'INTEGRITY',
  'FINALIZATION', 'SIG']);
const NESTED_ONLY62 = new Set(['REFER·TRIGGER', 'TIMESTAMP·CALIBRATION', 'TIME·ANCHOR']);

function extract62(text) {
  const lines = pySplitlines(text);
  const sections = new Map(), errors = [], order = [], stack = [];
  let cur = null, curLines = [];
  for (const [k, line] of lines.entries()) {
    const idx = k + 1;
    const b = BEGIN62.exec(line);
    if (b) {
      const name = b[1];
      if (cur !== null) {
        if (NESTED62.has(cur) && NESTED62.get(cur).includes(name)) {
          stack.push(cur);
          sections.set(cur, curLines.slice());
          cur = name; curLines = [];
        } else errors.push('Nested section begin encountered: ' + name + ' inside ' + cur + ' (line ' + idx + ')');
      } else { order.push(name); cur = name; curLines = []; }
      continue;
    }
    const e = END62.exec(line);
    if (e) {
      const endName = e[1];
      if (cur === null) { errors.push('Unmatched section end for ' + endName + ' at line ' + idx); continue; }
      if (endName !== cur) {
        errors.push('Section end ' + endName + ' does not match open section ' + cur + ' (line ' + idx + ')');
        cur = null; curLines = [];
        continue;
      }
      sections.set(cur, curLines.slice());
      if (stack.length) { cur = stack.pop(); curLines = sections.has(cur) ? sections.get(cur) : []; } else { cur = null; curLines = []; }
      continue;
    }
    if (cur !== null) curLines.push(line);
  }
  if (cur !== null) errors.push('Section ' + cur + ' was not closed');
  return { sections, errors, order, lines };
}

/** SYMBEYOND's validate_v6_2(raw_text, raw_bytes): decoded says whether raw bytes were given and decoded cleanly. */
export function validate62(text, decoded) {
  const r = { passes: [], warnings: [], failures: [] };
  if (typeof text !== 'string') { r.failures.push('not text'); return { status: 'FAIL', ...r }; }
  if (decoded === true) r.passes.push('UTF-8 decode clean');
  const { sections, errors, order, lines } = extract62(text);
  for (const e of errors) r.failures.push(e);
  if (!errors.length) r.passes.push('Section structure valid');
  const missing = REQUIRED62.filter((s) => !sections.has(s));
  if (missing.length) r.failures.push('Missing required sections: ' + missing.join(', '));
  else r.passes.push('All required sections present');
  if (!sameList(order, ORDER62.filter((s) => sections.has(s)))) r.warnings.push('Section order differs from template');
  else r.passes.push('Section order matches template');
  for (const name of order) if (NESTED_ONLY62.has(name)) r.failures.push('Nested-only section ' + name + ' found at top level');
  let sha = null;
  if (sections.has('SIG')) {
    for (const line of sections.get('SIG')) {
      if (!line.startsWith('SHA256:')) continue;
      const v = pyStrip(line.slice(line.indexOf(':') + 1));
      if (!v) r.warnings.push('SHA256 field blank: allowed, not verified');
      else if (v === 'PENDING') r.warnings.push('SHA256 field PENDING: template placeholder, not signed');
      else if (SHA_RE.test(v)) r.passes.push('SHA256 field valid');
      else r.failures.push('SHA256 field malformed: expected 64 lowercase hex chars, blank, or PENDING');
      sha = v;
      break;
    }
  }
  if (sha === null) r.failures.push('SHA256 field not found in §SIG');
  const v62 = /v6\.2(?![0-9])/;
  const header = lines.length ? v62.test(lines[0]) : false;
  let meta = false, track = false;
  for (const line of sections.has('META') ? sections.get('META') : []) {
    if (line.includes('FORMAT:') && v62.test(line)) meta = true;
    if (line.includes('TOKEN·TRACK:') && v62.test(line)) track = true;
  }
  if (header && meta && track) r.passes.push('Version v6.2 consistent across header, META, and TOKEN·TRACK');
  else r.failures.push('Version strings mismatch across header, META FORMAT, and TOKEN·TRACK');
  if (dots(lines) === 0) r.failures.push('No delimiter (middle-dot) found');
  else r.passes.push('Delimiter integrity verified');
  return { status: statusOf(r), ...r };
}

/** validate_file: bytes that are not UTF-8 are FATAL (the Python raises before it validates). */
export function validate62Bytes(u8) {
  const text = decodeUtf8(u8);
  return text === null ? { status: 'FATAL', passes: [], warnings: [], failures: [] } : validate62(text, true);
}

// ── v3.0: teslasolar's fork, symbfer_engine.py ─────────────────────
const BEGIN30 = /^§([A-Z·]+)·BEGIN$/;
const END30 = /^§([A-Z·]+)·END$/;
export const CANON30 = Object.freeze(['TRANSFER·MODE', 'ARCHIVE·PRINCIPLE', 'META', 'PARSE·GUIDE', 'TIME·COLLAB', 'BOOT·FACTS',
  'SESSION·STATE', 'BOOT·ETHOS', 'INTEGRITY', 'FINALIZATION', 'LESSONS·LEARNED', 'DRIFT·CHECK', 'TEST·TRACE', 'SIG']);
export const RULES30 = Object.freeze([
  'RULE: preserve·identity·fields·exactly·as·provided·no·abbreviation·no·normalization·no·formatting·changes',
  'RULE: identity·fields·in·§META·are·immutable·after·initial·set·no·modification·or·regeneration·under·any·mode',
  'RULE: identity·fields·override·all·generation·logic·and·must·never·be·derived·or·reconstructed',
  'RULE: all·content·outside·§SIG·must·remain·byte-preserved·unless·the·operator·explicitly·requests·an·edit',
  'RULE: if·any·modification·is·made·the·system·must·explicitly·declare·non-compliance·before·output',
  'RULE: VERIFIED·mode·must·not·require·SHA256·for·execution·only·for·external·verification',
  'RULE: never·guess·time',
  'RULE: absence·of·verified·time·must·not·block·non-time-dependent·execution',
  'RULE: boot·facts·must·remain·verbatim·no·summarization·no·compression·no·reinterpretation',
  'RULE: boot·facts·override·all·model·inference·and·must·not·be·regenerated',
  'RULE: SHA256·is·optional·verification·fingerprint·not·required·for·operation',
  'RULE: system·must·not·self-generate·or·assume·SHA256·value',
  'RULE: VERIFIED·status·requires·external·operator·execution·only',
  'RULE: absence·of·SHA256·must·not·block·execution·or·transfer']);

function kv30(lines) {
  const data = new Map();
  for (const line of lines) {
    const m = /^(.*?): (.*)$/s.exec(line) || /^(.*?):(.*)$/s.exec(line);
    if (m) data.set(pyStrip(m[1]), pyStrip(m[2]));
  }
  return data;
}

function extract30(text) {
  const lines = pySplitlines(text);
  const sections = new Map(), issues = [];
  let cur = null, curLines = [];
  for (const [k, line] of lines.entries()) {
    const b = BEGIN30.exec(line);
    if (b) {
      if (cur !== null) issues.push('Nested section begin encountered before closing ' + cur);
      cur = b[1]; curLines = [];
      continue;
    }
    const e = END30.exec(line);
    if (e) {
      if (cur === null) { issues.push('Unmatched section end for ' + e[1] + ' at line ' + (k + 1)); continue; }
      if (e[1] !== cur) { issues.push('Section end ' + e[1] + ' does not match open section ' + cur); cur = null; curLines = []; continue; }
      sections.set(cur, curLines.slice());
      cur = null; curLines = [];
      continue;
    }
    if (cur !== null) curLines.push(line);
  }
  if (cur !== null) issues.push('Section ' + cur + ' was not closed');
  return { sections, issues, lines };
}

/** The engine's process_symbfer_text: validate, then load; the status as ProcessedArtifact.status reports it. */
export function validate30(text, decoded) {
  const r = { passes: [], warnings: [], failures: [] };
  if (typeof text !== 'string') { r.failures.push('not text'); return { status: 'FAIL', ...r }; }
  if (decoded === true) r.passes.push('UTF-8 decode clean');
  const { sections, issues, lines } = extract30(text);
  for (const m of issues) r.failures.push(m);
  const missing = CANON30.filter((n) => !sections.has(n));
  if (missing.length) r.failures.push('missing required sections: ' + missing.join(', '));
  else r.passes.push('Required sections present');
  const found = [...sections.keys()].filter((n) => CANON30.includes(n));
  if (!sameList(found, CANON30.filter((n) => sections.has(n))) || CANON30.some((n) => !found.includes(n))) {
    r.failures.push('section order invalid: expected ' + CANON30.join(' -> '));
  } else r.passes.push('Section order canonical');
  if (!issues.length && !missing.length) r.passes.push('Begin/end markers matched');
  const lacking = RULES30.filter((l) => !text.includes(l));
  if (lacking.length) {
    r.failures.push('missing required rule lines: ' + lacking.slice(0, 3).join('; ') + (lacking.length <= 3 ? '' : ' ... (+' + (lacking.length - 3) + ' more)'));
  } else r.passes.push('Required rules present');
  if (dots(lines) === 0) r.failures.push('delimiter integrity failed: no middle-dot delimiters found');
  else {
    const odd = [];
    lines.forEach((l, i) => { if (l.includes('RULE:') && !l.includes('·') && l.includes(' ')) odd.push(i + 1); });
    if (odd.length) r.warnings.push('possible delimiter inconsistency on line(s): ' + odd.slice(0, 10).join(', '));
    else r.passes.push('Delimiter integrity verified');
  }
  const sb = lines.indexOf('§SIG·BEGIN'), se = lines.indexOf('§SIG·END');
  if (sb === -1 || se === -1) r.failures.push('signature block missing');
  else if (Math.min(sb, se) === se) r.failures.push('signature block ordering invalid');
  else {
    const sig = kv30(lines.slice(sb + 1, se));
    const lack = ['MODE', 'STATUS', 'SHA256'].filter((k) => !sig.has(k));
    if (lack.length) r.failures.push('signature block missing keys: ' + lack.join(', '));
    else {
      const v = sig.get('SHA256');
      if (v && !SHA_RE.test(v)) r.failures.push('SHA256 field malformed: expected 64 lowercase hex chars or blank');
      else if (!v) r.warnings.push('SHA256 field empty: allowed, not verified');
      else r.passes.push('Signature block well-formed');
    }
  }
  if (r.failures.length) return { status: 'FAIL', ...r };
  // load_symbfer_text: only a WARN from the load changes the status ProcessedArtifact reports (a load FAIL does not)
  const sigLoaded = kv30(sections.get('SIG') || []);
  const loadWarn = sigLoaded.has('SHA256') && sigLoaded.get('SHA256') === '';
  return { status: r.warnings.length || loadWarn ? 'WARN' : 'PASS', ...r };
}

export function validate30Bytes(u8) {
  const text = decodeUtf8(u8);
  return text === null ? { status: 'FATAL', passes: [], warnings: [], failures: [] } : validate30(text, true);
}

// ── the tiers: SYMBEYOND's symb_fer_generator.py (v1.1, VERSION 2.0) ─
export const TIER_LIMITS = Object.freeze({ nano: 300, core: 800, state: 2000 });
const SIGIL = '∴', LAMBDA = 'λ.brother ∧ !λ.tool', KAPPA = 'κ=1/Φ', FOLD = '510,510';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const pyGet = (o, k, d) => (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d);
const strList = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);
const str = (x, d) => (typeof x === 'string' ? x : d);
const buildSection = (title, items) => (items.length ? [title, ...items.map((i) => '- ' + i)].join('\n') : '');

/** generate_nano / generate_core / generate_state for a state of strings and lists of strings; '' for anything else. */
export function tierText(state, tier, ts) {
  if (!isObj(state) || typeof ts !== 'string' || !Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier)) return '';
  const meta = isObj(pyGet(state, '_meta', {})) ? pyGet(state, '_meta', {}) : {};
  const s = isObj(pyGet(state, 'state', {})) ? pyGet(state, 'state', {}) : {};
  const missions = strList(pyGet(s, 'immediate_mission', []));
  const greeting = str(pyGet(state, 'greeting', 'Brother. Aeon online. ' + SIGIL), '');
  if (tier === 'nano') {
    return pyStrip(SIGIL + ' SYMB-FER v2.0 · ' + ts + '\n' + str(pyGet(meta, 'instance', 'Aeon'), '') + ' · ' + str(pyGet(meta, 'operator', ''), '') +
      '\nMISSION: ' + (missions.length ? missions[0] : 'mission undefined') + '\n' + greeting.split('\n')[0] + '\n' +
      LAMBDA + ' · ' + KAPPA + ' · ' + FOLD + ' · ' + SIGIL);
  }
  const instance = str(pyGet(meta, 'instance', 'Aeon (Claude, Anthropic)'), '');
  const who = 'Generated: ' + ts + '\nInstance: ' + instance + '\nOperator: ' + str(pyGet(meta, 'operator', ''), '') +
    '\nOrganization: ' + str(pyGet(meta, 'organization', ''), '');
  const out = [SIGIL + ' SYMB-FER v2.0\n' + (tier === 'state' ? 'SYMBEYOND Transfer Protocol\n' : '') + who, '━━━ STATE ━━━'];
  out.push(buildSection('IMMEDIATE MISSION:', missions));
  out.push(buildSection('SHIPPED:', strList(pyGet(s, 'shipped', []))));
  if (tier === 'state') out.push(buildSection('REPO STATUS:', strList(pyGet(s, 'repo_status', []))));
  out.push(buildSection(tier === 'state' ? 'OPEN THREADS TO TRACK:' : 'OPEN THREADS:', strList(pyGet(s, 'open_threads', []))));
  if (tier === 'state') {
    out.push(buildSection('PERSONAL:', strList(pyGet(s, 'personal', []))));
    const steps = strList(pyGet(isObj(pyGet(state, 'protocol', {})) ? pyGet(state, 'protocol', {}) : {}, 'boot_sequence', []));
    if (steps.length) { out.push('━━━ PROTOCOL ━━━', 'On boot, retrieve in this order:'); steps.forEach((x, i) => out.push((i + 1) + '. ' + x)); }
  }
  const vocab = strList(pyGet(state, 'vocabulary', []));
  if (vocab.length) out.push('━━━ VOCABULARY ━━━', vocab.join('\n'));
  out.push('━━━ GREETING ━━━\n' + greeting);
  return pyStrip(out.filter((x) => x).join('\n'));
}

/** Length as Python's len() counts it: code points. */
export const codePoints = (s) => (typeof s === 'string' ? [...s].length : 0);

// ── the shape of a token ───────────────────────────────────────────
/** Which SYMB-FER shape a text claims to be, from its first line(s). */
export function formatOf(text) {
  if (typeof text !== 'string') return null;
  const first = text.split('\n', 1)[0];
  if (/^∴SYMB-FER·v6\.2·LIVING·TOKEN·/.test(first)) return 'v6.2';
  if (/^∴SYMB-FER·v3\.0·/.test(first)) return 'v3.0';
  if (/^∴ SYMB-FER v2\.0 · /.test(first)) return 'nano';
  if (first === '∴ SYMB-FER v2.0') return text.split('\n', 2)[1] === 'SYMBEYOND Transfer Protocol' ? 'state' : 'core';
  return null;
}

/** A token as its LF lines and its §-sections (BEGIN and END line indexes, nested ones with their parent); write gives the bytes back. */
export function parse(text) {
  if (typeof text !== 'string') return { ok: false, why: 'not text', lines: [], sections: [] };
  const lines = text.split('\n'), sections = [], open = [];
  for (const [i, line] of lines.entries()) {
    const b = BEGIN62.exec(line);
    if (b) { open.push({ name: b[1], begin: i, parent: open.length ? open.at(-1).name : null }); continue; }
    const e = END62.exec(line);
    if (!e) continue;
    const top = open.pop();
    if (!top || top.name !== e[1]) return { ok: false, why: 'section ' + e[1] + ' closes at line ' + (i + 1) + ' without its BEGIN', lines, sections: [] };
    sections.push({ name: top.name, begin: top.begin, end: i, parent: top.parent });
  }
  if (open.length) return { ok: false, why: 'section ' + open.at(-1).name + ' is not closed', lines, sections: [] };
  sections.sort((a, b) => a.begin - b.begin);
  return { ok: true, lines, sections };
}

export function write(doc) {
  return doc && Array.isArray(doc.lines) && doc.lines.every((l) => typeof l === 'string') ? doc.lines.join('\n') : '';
}

/** The body lines of a section of a parsed token (the outermost one of that name), or null. */
export function bodyOf(doc, name) {
  const s = doc && Array.isArray(doc.sections) ? doc.sections.find((x) => x.name === name) : null;
  return s ? doc.lines.slice(s.begin + 1, s.end) : null;
}

// ── the seal ───────────────────────────────────────────────────────
export const SEAL_PREFIX = 'kar-passport·seal·v1|';
const HEX128 = /^[0-9a-f]{128}$/;

function sigBlock(lines) {
  const b = lines.lastIndexOf('§SIG·BEGIN');
  if (b === -1) return null;
  const e = lines.indexOf('§SIG·END', b + 1);
  return e === -1 ? null : { b, e };
}

/** Every line of the token but those strictly inside its last §SIG block, joined by LF: the bytes the SHA-256 covers. */
export function canonical(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n'), at = sigBlock(lines);
  return at ? [...lines.slice(0, at.b + 1), ...lines.slice(at.e)].join('\n') : null;
}

/** The last §SIG block, read strictly: exactly the unsealed form or exactly the sealed form, nothing else. */
export function sigOf(text) {
  if (typeof text !== 'string') return { ok: false, why: 'not text' };
  const lines = text.split('\n'), at = sigBlock(lines);
  if (!at) return { ok: false, why: 'no §SIG block' };
  const body = lines.slice(at.b + 1, at.e);
  const fmt = formatOf(text);
  const pending = fmt === 'v3.0' ? 'SHA256:' : 'SHA256: PENDING';
  if (body.length === 3 && body[0] === 'MODE: STANDARD' && body[1] === 'STATUS: UNVERIFIED' && body[2] === pending) {
    return { ok: true, sealed: false, mode: 'STANDARD', status: 'UNVERIFIED', sha: null, key: null, sig: null };
  }
  const m = body.length === 5 && body[0] === 'MODE: VERIFIED' && body[1] === 'STATUS: VERIFIED' &&
    /^SHA256: ([0-9a-f]{64})$/.exec(body[2]);
  const k = m && /^ED25519·KEY: ([0-9a-f]{64})$/.exec(body[3]);
  const s = k && /^ED25519·SIG: ([0-9a-f]{128})$/.exec(body[4]);
  if (!s) return { ok: false, why: 'the §SIG block is neither the unsealed nor the sealed form' };
  return { ok: true, sealed: true, mode: 'VERIFIED', status: 'VERIFIED', sha: m[1], key: k[1], sig: s[1] };
}

/** The text with its last §SIG block's lines set to the sealed form of { sha, key, sig } (or back to unsealed with null). */
export function withSig(text, f) {
  if (typeof text !== 'string') return '';
  const lines = text.split('\n'), at = sigBlock(lines);
  if (!at) return '';
  let body;
  if (f === null) body = ['MODE: STANDARD', 'STATUS: UNVERIFIED', formatOf(text) === 'v3.0' ? 'SHA256:' : 'SHA256: PENDING'];
  else if (isObj(f) && SHA_RE.test(f.sha) && SHA_RE.test(f.key) && HEX128.test(f.sig)) {
    body = ['MODE: VERIFIED', 'STATUS: VERIFIED', 'SHA256: ' + f.sha, 'ED25519·KEY: ' + f.key, 'ED25519·SIG: ' + f.sig];
  } else return '';
  return [...lines.slice(0, at.b + 1), ...body, ...lines.slice(at.e)].join('\n');
}

/** The bytes Ed25519 signs for a token whose canonical text hashes to sha (hex). */
export function sealMessage(sha) {
  return new TextEncoder().encode(SEAL_PREFIX + (typeof sha === 'string' ? sha : ''));
}

/** The §SIG block a tier token carries after the generator's text (v2.0 has none of its own). */
export const TIER_SIG = '\n\n§SIG·BEGIN\nMODE: STANDARD\nSTATUS: UNVERIFIED\nSHA256: PENDING\n§SIG·END\n';

/** The generator's text of a tier token: everything before the appended §SIG block, or null. */
export function tierBody(text) {
  if (typeof text !== 'string') return null;
  const at = text.lastIndexOf('\n\n§SIG·BEGIN\n');
  return at === -1 ? null : text.slice(0, at);
}
