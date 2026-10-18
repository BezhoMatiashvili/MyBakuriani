// Admin Verified Users (C52): the pure group module the routes and the form
// share (parser, RPC error mapping, picker draft, search term, initials), its
// limits and error tokens against the newest migration, and a message in every
// locale for each error code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  USER_GROUP_ERROR_CODES,
  USER_GROUP_MAX_MEMBERS,
  USER_GROUP_NAME_MAX,
  USER_GROUP_NOTE_MAX,
  USER_GROUP_ROLES,
  addMember,
  groupRpcErrorCode,
  groupToDraft,
  initialsOf,
  isUuid,
  memberPickReason,
  normalizeSearchTerm,
  parseGroupInput,
  pickPayer,
  removeMember,
  shortUserCode,
  verificationPatch,
} from "../../src/lib/user-groups.ts";

const A = "98d78998-a264-408f-a1e8-989a51a63c17";
const B = "67630fe2-5613-4fc2-b453-ffad4e7b9040";
const C = "8cef8faf-389d-4c59-a45c-3b6ca26afc1c";
const err = (r) => (r.ok ? null : r.error);
const base = (over = {}) => ({
  name: "ოჯახი",
  payerId: A,
  memberIds: [B],
  ...over,
});
const ids = (n) =>
  Array.from(
    { length: n },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );

// Invisible characters are spelled as escapes, so this file holds none itself.
const ZWSP = "\u{200b}";
const WORD_JOINER = "\u{2060}";
const BOM = "\u{feff}";
const ZWJ = "\u{200d}";
const ZWNJ = "\u{200c}";
const RLO = "\u{202e}"; // right-to-left override
const NEL = "\x85"; // a C1 control that JS does not count as whitespace
const NUL = "\x00";
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
// Unicode Bidi_Control: the Arabic letter mark, LRM, RLM, the five embeddings
// and overrides, and the four isolates.
const BIDI_CONTROLS = [
  0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
  0x2068, 0x2069,
].map((codePoint) => String.fromCodePoint(codePoint));

test("parseGroupInput: happy path trims, nulls an empty note, de-duplicates in order, lowercases ids", () => {
  const r = parseGroupInput({
    name: "  ოჯახი  ",
    note: "   ",
    payerId: A.toUpperCase(),
    memberIds: [C, B, C.toUpperCase(), B],
  });
  assert.deepEqual(r, {
    ok: true,
    value: { name: "ოჯახი", note: null, payerId: A, memberIds: [C, B] },
  });
  assert.equal(parseGroupInput(base({ note: "  a\nb  " })).value.note, "a\nb");
});

test("parseGroupInput: every error code is reachable and the check order is the RPC's", () => {
  assert.equal(err(parseGroupInput(null)), "invalid_input");
  assert.equal(err(parseGroupInput(undefined)), "invalid_input");
  assert.equal(err(parseGroupInput("x")), "invalid_input");
  assert.equal(err(parseGroupInput(7)), "invalid_input");
  assert.equal(err(parseGroupInput([base()])), "invalid_input");
  assert.equal(err(parseGroupInput(base({ name: 5 }))), "invalid_input");
  assert.equal(err(parseGroupInput(base({ name: {} }))), "invalid_input");
  assert.equal(err(parseGroupInput(base({ note: 5 }))), "invalid_input");
  assert.equal(err(parseGroupInput(base({ memberIds: "x" }))), "invalid_input");
  assert.equal(
    err(parseGroupInput(base({ memberIds: { length: 1 } }))),
    "invalid_input",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: [B, "nope"] }))),
    "invalid_input",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: [B, null] }))),
    "invalid_input",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: [B, 5] }))),
    "invalid_input",
  );
  assert.equal(
    err(parseGroupInput({ payerId: A, memberIds: [B] })),
    "name_required",
  );
  assert.equal(err(parseGroupInput(base({ name: null }))), "name_required");
  assert.equal(err(parseGroupInput(base({ name: "   " }))), "name_required");
  assert.equal(
    err(parseGroupInput(base({ name: ZWSP + WORD_JOINER + " \t\n" }))),
    "name_required",
  );
  assert.equal(
    err(parseGroupInput(base({ name: "x".repeat(USER_GROUP_NAME_MAX + 1) }))),
    "name_too_long",
  );
  assert.equal(
    err(parseGroupInput(base({ note: "n".repeat(USER_GROUP_NOTE_MAX + 1) }))),
    "note_too_long",
  );
  assert.equal(
    err(parseGroupInput(base({ payerId: undefined }))),
    "payer_required",
  );
  assert.equal(err(parseGroupInput(base({ payerId: null }))), "payer_required");
  assert.equal(
    err(parseGroupInput(base({ payerId: "nope" }))),
    "payer_required",
  );
  assert.equal(err(parseGroupInput(base({ payerId: 5 }))), "payer_required");
  assert.equal(
    err(parseGroupInput(base({ memberIds: [A, B] }))),
    "payer_in_members",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: [A] }))),
    "payer_in_members",
  ); // before members_required
  assert.equal(
    err(parseGroupInput(base({ memberIds: [A.toUpperCase()] }))),
    "payer_in_members",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: [] }))),
    "members_required",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: undefined }))),
    "members_required",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: null }))),
    "members_required",
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: ids(USER_GROUP_MAX_MEMBERS + 1) }))),
    "too_many_members",
  );
  assert.equal(
    parseGroupInput(base({ memberIds: ids(USER_GROUP_MAX_MEMBERS) })).ok,
    true,
  );
  // the RPC's order: a bad name wins over a bad note, a bad note over a bad
  // payer, a bad payer over bad members
  assert.equal(
    err(
      parseGroupInput({
        name: "",
        note: "n".repeat(2000),
        payerId: "x",
        memberIds: [],
      }),
    ),
    "name_required",
  );
  assert.equal(
    err(
      parseGroupInput({
        name: "ok",
        note: "n".repeat(2000),
        payerId: "x",
        memberIds: [],
      }),
    ),
    "note_too_long",
  );
  assert.equal(
    err(parseGroupInput({ name: "ok", payerId: "x", memberIds: [] })),
    "payer_required",
  );
  // and inside the member list: payer_in_members, members_required, too_many_members
  assert.equal(
    err(
      parseGroupInput(
        base({ memberIds: [A, ...ids(USER_GROUP_MAX_MEMBERS + 1)] }),
      ),
    ),
    "payer_in_members",
  );
  // every code the parser can return is a registered code
  const reachable = new Set([
    "invalid_input",
    "name_required",
    "name_too_long",
    "note_too_long",
    "payer_required",
    "payer_in_members",
    "members_required",
    "too_many_members",
  ]);
  for (const c of reachable) assert.ok(USER_GROUP_ERROR_CODES.includes(c), c);
});

test("parseGroupInput: the member cap counts distinct ids, as the RPC does", () => {
  const full = ids(USER_GROUP_MAX_MEMBERS);
  const next = ids(USER_GROUP_MAX_MEMBERS + 1).at(-1);
  // 101 entries, one a repeat in another case: 100 distinct members
  const repeated = parseGroupInput(
    base({ memberIds: [...full, full[0].toUpperCase()] }),
  );
  assert.equal(repeated.ok, true);
  assert.equal(repeated.value.memberIds.length, USER_GROUP_MAX_MEMBERS);
  assert.equal(
    err(parseGroupInput(base({ memberIds: [...full, next] }))),
    "too_many_members",
  );
});

test("parseGroupInput: lengths count code points like the database's char_length", () => {
  // 120 emoji = 240 UTF-16 units, 120 code points: accepted by both sides
  assert.equal(
    parseGroupInput(base({ name: "😀".repeat(USER_GROUP_NAME_MAX) })).ok,
    true,
  );
  assert.equal(
    err(parseGroupInput(base({ name: "😀".repeat(USER_GROUP_NAME_MAX + 1) }))),
    "name_too_long",
  );
  assert.equal(
    parseGroupInput(base({ name: "ა".repeat(USER_GROUP_NAME_MAX) })).ok,
    true,
  );
  assert.equal(
    parseGroupInput(base({ note: "😀".repeat(USER_GROUP_NOTE_MAX) })).ok,
    true,
  );
  assert.equal(
    err(parseGroupInput(base({ note: "😀".repeat(USER_GROUP_NOTE_MAX + 1) }))),
    "note_too_long",
  );
});

test("parseGroupInput: hostile text", () => {
  // newlines/tabs/controls inside a name collapse to one space; ZWJ/ZWNJ survive
  assert.equal(
    parseGroupInput(base({ name: `A\n\tB${NUL}C` })).value.name,
    "A B C",
  );
  assert.equal(parseGroupInput(base({ name: FAMILY })).value.name, FAMILY);
  // NUL and other C0 controls never reach Postgres in a note; tab/newline stay
  assert.equal(
    parseGroupInput(base({ note: `a${NUL}b\x07c\td\ne` })).value.note,
    "abc\td\ne",
  );
  // a Latin-1 control (NEL) in a name is a separator
  assert.equal(parseGroupInput(base({ name: `A${NEL}B` })).value.name, "A B");
  // prototype keys in the body are plain data
  const body = JSON.parse(
    '{"__proto__":{"name":"evil"},"constructor":{"x":1},"name":"ok","payerId":"' +
      A +
      '","memberIds":["' +
      B +
      '"]}',
  );
  const r = parseGroupInput(body);
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "ok");
  assert.equal(Object.getPrototypeOf(r.value), Object.prototype);
  // a huge member list is rejected without throwing
  const huge = Array.from(
    { length: 200_000 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  assert.equal(
    err(parseGroupInput(base({ memberIds: huge }))),
    "too_many_members",
  );
  // 200k copies of one id dedupe to one member
  assert.equal(
    parseGroupInput(base({ memberIds: Array(200_000).fill(B) })).value.memberIds
      .length,
    1,
  );
  // a value object with a throwing toString is only ever typeof-checked
  const evil = {
    toString() {
      throw new Error("boom");
    },
  };
  assert.equal(err(parseGroupInput(base({ name: evil }))), "invalid_input");
  assert.equal(err(parseGroupInput(base({ note: evil }))), "invalid_input");
});

test("parseGroupInput: bidi controls are removed, and before whitespace collapses", () => {
  assert.equal(BIDI_CONTROLS.length, 12);
  for (const ch of BIDI_CONTROLS) {
    const label = `U+${ch.codePointAt(0).toString(16)}`;
    assert.equal(
      parseGroupInput(base({ name: `A${ch}B` })).value.name,
      "AB",
      label,
    );
    // removed first, so it leaves no double space behind
    assert.equal(
      parseGroupInput(base({ name: `A ${ch} B` })).value.name,
      "A B",
      label,
    );
    assert.equal(
      parseGroupInput(base({ note: `x${ch}y` })).value.note,
      "xy",
      label,
    );
  }
  assert.equal(
    parseGroupInput(base({ name: `${RLO}Summer 2026` })).value.name,
    "Summer 2026",
  );
  assert.equal(
    parseGroupInput(base({ name: `A\n${RLO}\nB` })).value.name,
    "A B",
  );
});

test("parseGroupInput: a name with nothing visible is name_required, a note with nothing visible is null", () => {
  const invisible = [
    " ",
    "\t\n\r",
    "\u{a0}", // no-break space
    "\u{3000}", // ideographic space
    "\u{ad}", // soft hyphen
    ZWSP,
    WORD_JOINER,
    BOM,
    ZWJ,
    ZWNJ,
    ZWJ + ZWNJ + " " + ZWJ,
    NEL,
    NUL,
    "\x07",
    "\x7f",
    ...BIDI_CONTROLS,
    ZWSP + RLO + " " + ZWJ + NEL + NUL,
  ];
  for (const text of invisible) {
    const label = JSON.stringify(text);
    assert.equal(
      err(parseGroupInput(base({ name: text }))),
      "name_required",
      label,
    );
    const r = parseGroupInput(base({ note: text }));
    assert.equal(r.ok, true, label);
    assert.equal(r.value.note, null, label);
  }
  // however long the invisible text is, the note is still just empty
  assert.equal(
    parseGroupInput(base({ note: ZWSP.repeat(USER_GROUP_NOTE_MAX * 2) })).value
      .note,
    null,
  );
  // one visible character is enough
  assert.equal(
    parseGroupInput(base({ name: `${ZWSP}x${ZWSP}` })).value.name,
    "x",
  );
  assert.equal(
    parseGroupInput(base({ name: `${ZWJ}x` })).value.name,
    `${ZWJ}x`,
  );
});

test("parseGroupInput: ZWJ and ZWNJ stay inside a name and a note", () => {
  const joined = `A${ZWJ}B`;
  const georgian = `ა${ZWNJ}ბ`;
  assert.equal(parseGroupInput(base({ name: joined })).value.name, joined);
  assert.equal(parseGroupInput(base({ name: georgian })).value.name, georgian);
  assert.equal(parseGroupInput(base({ name: FAMILY })).value.name, FAMILY);
  assert.equal(parseGroupInput(base({ note: joined })).value.note, joined);
  assert.equal(parseGroupInput(base({ note: FAMILY })).value.note, FAMILY);
});

test("parseGroupInput: a lone surrogate is dropped (the database would refuse it), a valid pair stays", () => {
  const high = String.fromCharCode(0xd83d); // half of an emoji, text cut inside it
  const low = String.fromCharCode(0xde00);
  assert.equal(parseGroupInput(base({ name: `a${high}b` })).value.name, "ab");
  assert.equal(parseGroupInput(base({ name: `${low}a` })).value.name, "a");
  assert.equal(parseGroupInput(base({ name: "😀 ok" })).value.name, "😀 ok");
  assert.equal(err(parseGroupInput(base({ name: high }))), "name_required");
  assert.equal(parseGroupInput(base({ note: `a${high}` })).value.note, "a");
  assert.equal(parseGroupInput(base({ note: low })).value.note, null);
  const { value } = parseGroupInput(
    base({ name: `${high}😀${low}`, note: `${low}😀${high}` }),
  );
  assert.equal(value.name, "😀");
  assert.equal(value.note, "😀");
  assert.equal(value.name.isWellFormed() && value.note.isWellFormed(), true);
});

test("parseGroupInput: a note drops controls (C0 and C1) but keeps tab, line feed and carriage return", () => {
  assert.equal(
    parseGroupInput(base({ note: `a${NUL}b\x07c\x7fd${NEL}e\tf\r\ng\nh` }))
      .value.note,
    "abcde\tf\r\ng\nh",
  );
  // a note of one C1 control is empty: JS trim() alone would keep it
  assert.equal(parseGroupInput(base({ note: NEL })).value.note, null);
  assert.equal(parseGroupInput(base({ note: `\n${NEL}\n` })).value.note, null);
});

test("groupRpcErrorCode maps the RPC tokens; PostgREST puts the hint in `hint`", () => {
  const e = (message, hint) => groupRpcErrorCode({ message, hint });
  assert.deepEqual(e("ADMIN_USER_GROUP_FORBIDDEN", null), {
    code: "forbidden",
    status: 403,
  });
  assert.deepEqual(e("ADMIN_USER_GROUP_UNKNOWN_USER", null), {
    code: "unknown_user",
    status: 400,
  });
  assert.deepEqual(e("ADMIN_USER_GROUP_NOT_FOUND", null), {
    code: "not_found",
    status: 404,
  });
  // the HINT of ADMIN_USER_GROUP_INVALID is the error code itself
  const hints = [
    "name_required",
    "name_too_long",
    "note_too_long",
    "payer_required",
    "payer_in_members",
    "members_required",
    "too_many_members",
  ];
  for (const hint of hints)
    assert.deepEqual(
      e("ADMIN_USER_GROUP_INVALID", hint),
      { code: hint, status: 400 },
      hint,
    );
  // anything else is a plain invalid_input: a future hint, the retired v1 hints
  // (name, note, payer), another kind of code, an empty or a missing hint
  for (const hint of [
    "something_new",
    "name",
    "note",
    "payer",
    "forbidden",
    "invalid_input",
    "",
    null,
    undefined,
  ])
    assert.deepEqual(
      e("ADMIN_USER_GROUP_INVALID", hint),
      { code: "invalid_input", status: 400 },
      String(hint),
    );
  assert.deepEqual(e("ADMIN_USER_GROUP_INVALID", " name_required "), {
    code: "name_required",
    status: 400,
  });
  // prototype-key hints are not hints
  for (const hint of ["__proto__", "constructor", "toString", "hasOwnProperty"])
    assert.deepEqual(
      e("ADMIN_USER_GROUP_INVALID", hint),
      { code: "invalid_input", status: 400 },
      hint,
    );
  // wrapped by something else, still found
  assert.equal(
    e("Error: ADMIN_USER_GROUP_NOT_FOUND (context)", null).code,
    "not_found",
  );
  // not ours
  for (const message of [
    "",
    "boom",
    "ADMIN_STATUS_FORBIDDEN",
    "admin_user_group_forbidden",
    "ADMIN_USER_GROUP_",
    "ADMIN_USER_GROUP_SOMETHING_ELSE",
    "permission denied for table user_groups",
  ]) {
    assert.equal(e(message, null), null, message);
  }
  assert.equal(groupRpcErrorCode(null), null);
  assert.equal(groupRpcErrorCode(undefined), null);
  assert.equal(groupRpcErrorCode({}), null);
  assert.equal(groupRpcErrorCode({ message: 5 }), null);
  assert.equal(
    groupRpcErrorCode({ message: null, hint: "name_required" }),
    null,
  );
  // every code it can return is registered
  for (const code of hints)
    assert.ok(USER_GROUP_ERROR_CODES.includes(code), code);
  for (const code of [
    "forbidden",
    "unknown_user",
    "not_found",
    "invalid_input",
  ])
    assert.ok(USER_GROUP_ERROR_CODES.includes(code), code);
});

test("verificationPatch stamps on verify and clears on unverify", () => {
  const now = "2026-10-16T08:00:00.000Z";
  assert.deepEqual(verificationPatch(true, now), {
    is_verified: true,
    verified_at: now,
  });
  assert.deepEqual(verificationPatch(false, now), {
    is_verified: false,
    verified_at: null,
  });
});

test("isUuid", () => {
  assert.equal(isUuid(A), true);
  assert.equal(isUuid(A.toUpperCase()), true);
  assert.equal(isUuid("aae2ff00-0000-0000-0000-000000000001"), true); // e2e seed ids are not RFC 4122
  assert.equal(isUuid("facade00-0000-0000-0000-000000000001"), true);
  for (const bad of [
    A + "\n",
    "\n" + A,
    " " + A,
    A + " ",
    `{${A}}`,
    A.replaceAll("-", ""),
    A.slice(1),
    A + "0",
    "",
    null,
    undefined,
    5,
    {},
    [A],
    "g" + A.slice(1),
  ])
    assert.equal(isUuid(bad), false, JSON.stringify(bad));
});

test("shortUserCode is the MB-XXXXX chip the dashboards show", () => {
  assert.equal(shortUserCode(A), "MB-98D78");
  assert.equal(shortUserCode(A.toUpperCase()), "MB-98D78");
  assert.equal(
    shortUserCode("aae2ff00-0000-0000-0000-000000000001"),
    "MB-AAE2F",
  );
  assert.equal(shortUserCode("0123456789"), "MB-01234");
});

test("normalizeSearchTerm strips every PostgREST/wildcard character and control", () => {
  for (const ch of [",", "(", ")", '"', "\\", "%", "*"]) {
    assert.equal(normalizeSearchTerm(`a${ch}b`), "a b", JSON.stringify(ch));
    assert.equal(normalizeSearchTerm(ch), "", JSON.stringify(ch));
  }
  assert.equal(normalizeSearchTerm("**"), "");
  assert.equal(normalizeSearchTerm("a**b"), "a b");
  assert.equal(normalizeSearchTerm("x),phone.ilike.*"), "x phone.ilike.");
  assert.equal(normalizeSearchTerm("  a \t\n  b  "), "a b");
  assert.equal(normalizeSearchTerm("a\x00b\x01c\x7fd\x85e"), "a b c d e");
  assert.equal(normalizeSearchTerm("+995 599 12 34 56"), "+995 599 12 34 56");
  assert.equal(normalizeSearchTerm("ანა გიორგაძე"), "ანა გიორგაძე");
  assert.equal(normalizeSearchTerm("john_doe.x@y-z"), "john_doe.x@y-z"); // "_" stays: a wider match only
  assert.equal(normalizeSearchTerm(A), A);
  for (const bad of [null, undefined, 5, {}, [], true])
    assert.equal(normalizeSearchTerm(bad), "");
  assert.equal(normalizeSearchTerm(""), "");
  assert.equal(normalizeSearchTerm("   "), "");
  // cap: 100 code points, never a split surrogate pair, result re-trimmed
  assert.equal(Array.from(normalizeSearchTerm("a".repeat(500))).length, 100);
  assert.equal(normalizeSearchTerm("😀".repeat(500)), "😀".repeat(100));
  assert.equal(normalizeSearchTerm("a".repeat(99) + " b"), "a".repeat(99));
  assert.equal(normalizeSearchTerm("😀".repeat(500)).isWellFormed(), true);
  // a lone surrogate would make encodeURIComponent throw in the picker
  const lone = String.fromCharCode(0xd83d);
  assert.equal(normalizeSearchTerm(`ab${lone}c`), "abc");
  assert.equal(normalizeSearchTerm(`${lone}😀`), "😀");
  assert.doesNotThrow(() =>
    encodeURIComponent(normalizeSearchTerm(`x${lone}`)),
  );
  // normalising twice changes nothing (the server's search filter does it again)
  for (const raw of ["a**b", "  x,y  ", `ab${lone}`, "😀".repeat(500), A]) {
    assert.equal(
      normalizeSearchTerm(normalizeSearchTerm(raw)),
      normalizeSearchTerm(raw),
    );
  }
});

test("initialsOf", () => {
  assert.equal(initialsOf("ანა გიორგაძე"), "აგ"); // Georgian untouched (no Mtavruli)
  assert.equal(initialsOf("giorgi beridze"), "GB");
  assert.equal(initialsOf("Giorgi"), "G");
  assert.equal(initialsOf("  anna   maria   rossi "), "AM");
  assert.equal(initialsOf("ანა giorgi"), "აG");
  assert.equal(initialsOf("ßeta ßig"), "ßß"); // ß would upper-case to "SS": kept as is
  assert.equal(initialsOf("élan vital"), "ÉV");
  assert.equal(initialsOf("иван петров"), "ип"); // Cyrillic is not Latin: untouched (spec: Latin only)
  assert.equal(initialsOf("😀 smile"), "😀S");
  assert.equal(initialsOf(""), "");
  assert.equal(initialsOf("   "), "");
  assert.equal(initialsOf(null), "");
  assert.equal(initialsOf(undefined), "");
  assert.equal(initialsOf(5), "");
  assert.equal(initialsOf("a b c d"), "AB");
});

// ---- the group form's draft: the payer, and the members newest first ----
const person = (id, over = {}) => ({
  id,
  display_name: `Person ${id.slice(-4)}`,
  phone: null,
  avatar_url: null,
  role: "guest",
  is_verified: false,
  created_at: null,
  ...over,
});
const savedGroup = (over = {}) => ({
  id: "00000000-0000-4000-8000-00000000ffff",
  name: "Summer",
  note: null,
  created_at: "2026-10-16T08:00:00.000Z",
  updated_at: "2026-10-16T08:00:00.000Z",
  created_by: null,
  payer: PAYER,
  members: [MEMBER_1, MEMBER_2],
  ...over,
});
// A frozen argument makes any mutation throw (this file is an ES module, so
// strict mode).
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const PAYER = person(A, { display_name: "Payer" });
const MEMBER_1 = person(B);
const MEMBER_2 = person(C);
const crowd = ids(USER_GROUP_MAX_MEMBERS + 2).map((id) => person(id));

test("groupToDraft copies a saved group and accepts a deleted payer", () => {
  const group = deepFreeze(savedGroup());
  const draft = groupToDraft(group);
  assert.deepEqual(draft, { payer: PAYER, members: [MEMBER_1, MEMBER_2] });
  assert.notEqual(draft.members, group.members); // the form never edits the loaded group
  assert.deepEqual(groupToDraft(savedGroup({ payer: null })), {
    payer: null,
    members: [MEMBER_1, MEMBER_2],
  });
  assert.deepEqual(groupToDraft(savedGroup({ members: [] })).members, []);
});

test("memberPickReason: payer first, then already added, then the limit; ids compare in any case", () => {
  const draft = { payer: PAYER, members: [MEMBER_1] };
  assert.equal(memberPickReason(draft, C), null);
  assert.equal(memberPickReason(draft, A), "isPayer");
  assert.equal(memberPickReason(draft, A.toUpperCase()), "isPayer");
  assert.equal(memberPickReason(draft, B), "alreadyAdded");
  assert.equal(memberPickReason(draft, B.toUpperCase()), "alreadyAdded");
  assert.equal(memberPickReason({ payer: null, members: [MEMBER_1] }, A), null);
  // the limit: 99 members take one more, 100 take none
  const near = {
    payer: PAYER,
    members: crowd.slice(0, USER_GROUP_MAX_MEMBERS - 1),
  };
  const full = {
    payer: PAYER,
    members: crowd.slice(0, USER_GROUP_MAX_MEMBERS),
  };
  const stranger = crowd[USER_GROUP_MAX_MEMBERS].id;
  assert.equal(memberPickReason(near, stranger), null);
  assert.equal(memberPickReason(full, stranger), "limitReached");
  // a reason earlier in the order wins at the limit
  assert.equal(memberPickReason(full, A), "isPayer");
  assert.equal(memberPickReason(full, crowd[0].id), "alreadyAdded");
});

test("pickPayer: the user becomes the payer and leaves the members; the old payer is dropped", () => {
  const draft = deepFreeze({ payer: PAYER, members: [MEMBER_1, MEMBER_2] });
  const next = pickPayer(draft, MEMBER_1);
  assert.deepEqual(next, { payer: MEMBER_1, members: [MEMBER_2] }); // the old payer is not added
  // the old payer can be added back as a member afterwards
  assert.equal(memberPickReason(next, A), null);
  // the member is found in any case of the id
  assert.deepEqual(pickPayer(draft, person(C.toUpperCase())).members, [
    MEMBER_1,
  ]);
  // somebody who is not in the group
  const stranger = person(crowd[0].id);
  assert.deepEqual(pickPayer(draft, stranger), {
    payer: stranger,
    members: [MEMBER_1, MEMBER_2],
  });
  // no payer yet (the saved one was deleted), and the same payer again
  assert.deepEqual(pickPayer({ payer: null, members: [MEMBER_1] }, MEMBER_2), {
    payer: MEMBER_2,
    members: [MEMBER_1],
  });
  assert.deepEqual(pickPayer(draft, PAYER), {
    payer: PAYER,
    members: [MEMBER_1, MEMBER_2],
  });
});

test("addMember puts the newest first and says why it refuses", () => {
  const draft = deepFreeze({ payer: PAYER, members: [MEMBER_1] });
  assert.deepEqual(addMember(draft, MEMBER_2), {
    ok: true,
    draft: { payer: PAYER, members: [MEMBER_2, MEMBER_1] },
  });
  assert.deepEqual(addMember(draft, PAYER), { ok: false, reason: "isPayer" });
  assert.deepEqual(addMember(draft, person(B.toUpperCase())), {
    ok: false,
    reason: "alreadyAdded",
  });
  // exactly at the limit: the 100th member goes in, the 101st does not
  const near = deepFreeze({
    payer: PAYER,
    members: crowd.slice(0, USER_GROUP_MAX_MEMBERS - 1),
  });
  const filled = addMember(near, crowd[USER_GROUP_MAX_MEMBERS - 1]);
  assert.equal(filled.ok, true);
  assert.equal(filled.draft.members.length, USER_GROUP_MAX_MEMBERS);
  assert.equal(
    filled.draft.members[0].id,
    crowd[USER_GROUP_MAX_MEMBERS - 1].id,
  );
  assert.deepEqual(addMember(filled.draft, crowd[USER_GROUP_MAX_MEMBERS]), {
    ok: false,
    reason: "limitReached",
  });
  assert.equal(near.members.length, USER_GROUP_MAX_MEMBERS - 1);
});

test("removeMember drops one member in any case of the id and keeps the rest", () => {
  const draft = deepFreeze({ payer: PAYER, members: [MEMBER_1, MEMBER_2] });
  assert.deepEqual(removeMember(draft, B), {
    payer: PAYER,
    members: [MEMBER_2],
  });
  assert.deepEqual(removeMember(draft, B.toUpperCase()), {
    payer: PAYER,
    members: [MEMBER_2],
  });
  assert.deepEqual(removeMember(draft, crowd[0].id), {
    payer: PAYER,
    members: [MEMBER_1, MEMBER_2],
  });
  assert.deepEqual(removeMember(draft, A), {
    payer: PAYER,
    members: [MEMBER_1, MEMBER_2],
  }); // the payer is not a member
  assert.deepEqual(removeMember({ payer: null, members: [MEMBER_1] }, B), {
    payer: null,
    members: [],
  });
});

// ---- parity with the newest migration that defines each piece ----
const root = new URL("../../", import.meta.url);
const migrationsDir = new URL("supabase/migrations/", root);
let migrationTexts;
const migrations = () =>
  (migrationTexts ??= readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    // comments never count
    .map((file) => ({
      file,
      sql: readFileSync(new URL(file, migrationsDir), "utf8").replace(
        /--[^\n]*/g,
        "",
      ),
    })));
/** The newest migration whose text matches `re`; fails loudly when none does. */
function newestWith(re, what) {
  const hit = migrations()
    .filter(({ sql }) => re.test(sql))
    .at(-1);
  assert.ok(hit, `no migration defines ${what}`);
  return hit;
}
/** The first pattern's number; fails loudly when the anchor is missing. */
function cap(sql, patterns, what) {
  for (const re of patterns) {
    const m = re.exec(sql);
    if (m) return Number(m[1]);
  }
  return assert.fail(`${what}: no match for ${patterns.join(" | ")}`);
}
/** The text between the dollar quotes of CREATE OR REPLACE FUNCTION public.<name>. */
function functionBody(sql, name) {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`),
  );
  assert.ok(start >= 0, `${name}: definition not found`);
  const open = /\bAS\s+(\$[A-Za-z_]*\$)/.exec(sql.slice(start));
  assert.ok(open, `${name}: no dollar-quoted body`);
  const from = start + open.index + open[0].length;
  const end = sql.indexOf(open[1], from);
  assert.ok(end > from, `${name}: unterminated body`);
  return sql.slice(from, end);
}
const SAVE_FUNCTION =
  /CREATE OR REPLACE FUNCTION public\.admin_save_user_group\(/;

test("limits and the role vocabulary equal the newest migration that defines them", () => {
  const nameCheck = newestWith(
    /CONSTRAINT user_groups_name_check/,
    "user_groups_name_check",
  );
  const noteCheck = newestWith(
    /CONSTRAINT user_groups_note_check/,
    "user_groups_note_check",
  );
  const roleCheck = newestWith(
    /CONSTRAINT user_group_members_role_check/,
    "user_group_members_role_check",
  );
  const save = newestWith(SAVE_FUNCTION, "admin_save_user_group");
  const body = functionBody(save.sql, "admin_save_user_group");

  // the CHECK constraints
  assert.equal(
    cap(
      nameCheck.sql,
      [
        /CONSTRAINT user_groups_name_check\s+CHECK\s*\(\s*char_length\(\s*btrim\(\s*name\s*\)\s*\)\s+BETWEEN\s+1\s+AND\s+(\d+)\s*\)/,
      ],
      "user_groups_name_check",
    ),
    USER_GROUP_NAME_MAX,
  );
  assert.equal(
    cap(
      noteCheck.sql,
      [
        /CONSTRAINT user_groups_note_check\s+CHECK\s*\(\s*note IS NULL OR char_length\(\s*note\s*\)\s*<=\s*(\d+)\s*\)/,
      ],
      "user_groups_note_check",
    ),
    USER_GROUP_NOTE_MAX,
  );
  // the RPC's own caps
  assert.equal(
    cap(
      body,
      [
        /char_length\(\s*v_name\s*\)\s*>\s*(\d+)/,
        /char_length\(\s*v_name\s*\)\s+NOT\s+BETWEEN\s+1\s+AND\s+(\d+)/,
      ],
      "the RPC's name cap",
    ),
    USER_GROUP_NAME_MAX,
  );
  assert.equal(
    cap(
      body,
      [/char_length\(\s*v_note\s*\)\s*>\s*(\d+)/],
      "the RPC's note cap",
    ),
    USER_GROUP_NOTE_MAX,
  );
  assert.equal(
    cap(
      body,
      [/cardinality\(\s*v_members\s*\)\s*>\s*(\d+)/],
      "the RPC's member cap",
    ),
    USER_GROUP_MAX_MEMBERS,
  );
  // the role vocabulary
  const roles =
    /CONSTRAINT user_group_members_role_check\s+CHECK\s*\(\s*role\s+IN\s*\(([^)]*)\)\s*\)/.exec(
      roleCheck.sql,
    )?.[1];
  assert.ok(roles, "user_group_members_role_check: role IN (...) not found");
  assert.deepEqual(
    [...roles.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    [...USER_GROUP_ROLES],
  );
});

// What each ADMIN_USER_GROUP_* token must mean, written down once: the SQLSTATE
// the RPC raises it with and the code and HTTP status the route answers. The
// INVALID token's code is its HINT.
const TOKENS = {
  ADMIN_USER_GROUP_FORBIDDEN: {
    errcode: "42501",
    code: "forbidden",
    status: 403,
  },
  ADMIN_USER_GROUP_INVALID: { errcode: "22023", code: null, status: 400 },
  ADMIN_USER_GROUP_UNKNOWN_USER: {
    errcode: "P0002",
    code: "unknown_user",
    status: 400,
  },
  ADMIN_USER_GROUP_NOT_FOUND: {
    errcode: "P0002",
    code: "not_found",
    status: 404,
  },
};

test("every token and HINT the RPC raises is handled, and every hint the mapper knows is raised", () => {
  const save = newestWith(SAVE_FUNCTION, "admin_save_user_group");
  const body = functionBody(save.sql, "admin_save_user_group");
  const raises = [
    ...body.matchAll(/RAISE EXCEPTION '(ADMIN_USER_GROUP_[A-Z_]+)'([^;]*);/g),
  ].map(([, token, using]) => ({
    token,
    errcode: /ERRCODE\s*=\s*'([0-9A-Z]{5})'/.exec(using)?.[1],
    hint: /HINT\s*=\s*'([a-z_]+)'/.exec(using)?.[1],
  }));
  assert.ok(raises.length > 0, "the RPC raises its tokens");

  // the RPC raises exactly the documented tokens, with the documented SQLSTATE
  assert.deepEqual(
    [...new Set(raises.map((r) => r.token))].sort(),
    Object.keys(TOKENS).sort(),
  );
  for (const r of raises) {
    assert.equal(r.errcode, TOKENS[r.token].errcode, `${r.token} SQLSTATE`);
    if (r.token === "ADMIN_USER_GROUP_INVALID") {
      // the hint is the error code, answered with 400
      assert.ok(r.hint, "an INVALID raise carries a HINT");
      assert.ok(USER_GROUP_ERROR_CODES.includes(r.hint), r.hint);
      assert.deepEqual(
        groupRpcErrorCode({ message: r.token, hint: r.hint }),
        { code: r.hint, status: 400 },
        `HINT ${r.hint}`,
      );
    } else {
      assert.equal(r.hint, undefined, `${r.token} has no HINT`);
      const { code, status } = TOKENS[r.token];
      assert.deepEqual(
        groupRpcErrorCode({ message: r.token, hint: null }),
        { code, status },
        r.token,
      );
    }
  }

  // the other direction: every hint the mapper turns into a specific code is
  // one the RPC raises (invalid_input is the fallback for the rest)
  const sqlHints = new Set(
    raises.map((r) => r.hint).filter((h) => h && h !== "invalid_input"),
  );
  const mapperHints = new Set(
    USER_GROUP_ERROR_CODES.filter(
      (c) =>
        c !== "invalid_input" &&
        groupRpcErrorCode({ message: "ADMIN_USER_GROUP_INVALID", hint: c })
          ?.code === c,
    ),
  );
  assert.deepEqual([...sqlHints].sort(), [...mapperHints].sort());
  // and the codes of the other three tokens are registered
  for (const { code } of Object.values(TOKENS))
    if (code) assert.ok(USER_GROUP_ERROR_CODES.includes(code), code);
});

test("the module is erasable TypeScript with no imports", () => {
  const src = readFileSync(
    new URL("../../src/lib/user-groups.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(src, /^\s*import\s/m, "no import statements at all");
  assert.doesNotMatch(src, /from\s+["']@\//);
  assert.doesNotMatch(src, /\benum\s+\w+/);
  assert.doesNotMatch(src, /\bnamespace\s+\w+/);
  assert.doesNotMatch(
    src,
    /constructor\s*\([^)]*\b(?:public|private|protected|readonly)\b/,
  );
  // the C52 contract check forbids naming the group tables outside the admin API
  assert.doesNotMatch(
    src,
    /["'`]user_groups["'`]|["'`]user_group_members["'`]/,
  );
  // no invisible character in the source: the cleaning classes are escapes
  assert.doesNotMatch(
    src,
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u{200b}-\u{200f}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2060}\u{2066}-\u{2069}\u{feff}]/u,
  );
});

// Names of the ICU arguments in a message, including those nested in plural
// and select branches (a branch's own text is not an argument).
function icuArgs(message) {
  const names = new Set();
  const groups = (text) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (depth++ === 0) start = i + 1;
      } else if (text[i] === "}" && depth > 0 && --depth === 0) {
        out.push(text.slice(start, i));
      }
    }
    return out;
  };
  const scan = (text) => {
    for (const group of groups(text)) {
      const head = /^\s*([A-Za-z_]\w*)\s*(?:,|$)/.exec(group);
      if (!head) continue;
      names.add(head[1]);
      for (const branch of groups(group.slice(head[0].length))) scan(branch);
    }
  };
  scan(message);
  return [...names].sort();
}

test("icuArgs reads plain and nested ICU arguments", () => {
  assert.deepEqual(icuArgs("no arguments"), []);
  assert.deepEqual(icuArgs("{name} ({count}/{max})"), ["count", "max", "name"]);
  assert.deepEqual(
    icuArgs("{count, plural, one {# group} other {{n} groups}} in {place}"),
    ["count", "n", "place"],
  );
  assert.deepEqual(icuArgs("{g, select, male {He} other {They}}"), ["g"]);
});

test("every error code has a message in ka, en and ru, with the same placeholders", () => {
  const get = (o, p) =>
    p
      .split(".")
      .reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
  const missing = [];
  const placeholders = {};
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(
      readFileSync(new URL(`messages/${locale}.json`, root), "utf8"),
    );
    for (const code of USER_GROUP_ERROR_CODES) {
      const v = get(messages.AdminVerifiedUsers, `errors.${code}`);
      if (typeof v !== "string" || !v.trim()) {
        missing.push(`${locale}: AdminVerifiedUsers.errors.${code}`);
        continue;
      }
      (placeholders[code] ??= {})[locale] = icuArgs(v).join(",");
    }
  }
  assert.deepEqual(missing, []);
  const drift = Object.entries(placeholders)
    .filter(([, byLocale]) => new Set(Object.values(byLocale)).size > 1)
    .map(([code, byLocale]) => `${code}: ${JSON.stringify(byLocale)}`);
  assert.deepEqual(drift, []);
});
