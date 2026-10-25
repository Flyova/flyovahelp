import { getServiceAccount, googleFetch } from "./credentials";

// A firebase-admin–shaped Firestore client over the Firestore REST API.
// It covers what the API routes use: refs, get/set/update/create/delete/add,
// getAll, queries (where/orderBy/limit/select, collection groups, count()),
// transactions (with retry on contention), batches, FieldValue and Timestamp.

const API = "https://firestore.googleapis.com/v1";
const MAX_TX_ATTEMPTS = 5;

/* ── Timestamp ─────────────────────────────────────────────────────────── */

export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = Math.trunc(seconds);
    this.nanoseconds = Math.trunc(nanoseconds);
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms) {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  static fromDate(date) {
    return Timestamp.fromMillis(date.getTime());
  }
  static fromRfc3339(value) {
    const m = /^(.*?)(?:\.(\d+))?Z$/.exec(value);
    if (!m) return Timestamp.fromMillis(Date.parse(value));
    const seconds = Math.floor(Date.parse(`${m[1]}Z`) / 1000);
    const nanos = m[2] ? Number(m[2].padEnd(9, "0").slice(0, 9)) : 0;
    return new Timestamp(seconds, nanos);
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate() {
    return new Date(this.toMillis());
  }
  toRfc3339() {
    const base = new Date(this.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "");
    return `${base}.${String(this.nanoseconds).padStart(9, "0")}Z`;
  }
  isEqual(other) {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }
  valueOf() {
    return this.toMillis();
  }
  toJSON() {
    return { _seconds: this.seconds, _nanoseconds: this.nanoseconds };
  }
}

/* ── FieldValue sentinels ──────────────────────────────────────────────── */

class FieldValueSentinel {
  constructor(kind, operand) {
    this.kind = kind;
    this.operand = operand;
  }
}

export const FieldValue = {
  serverTimestamp: () => new FieldValueSentinel("serverTimestamp"),
  increment: (n) => new FieldValueSentinel("increment", n),
  arrayUnion: (...elements) => new FieldValueSentinel("arrayUnion", elements),
  arrayRemove: (...elements) => new FieldValueSentinel("arrayRemove", elements),
  delete: () => new FieldValueSentinel("delete"),
};

/* ── Field paths ───────────────────────────────────────────────────────── */

const SIMPLE_SEGMENT = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const quoteSegment = (s) => (SIMPLE_SEGMENT.test(s) ? s : "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`");
const encodePath = (segments) => segments.map(quoteSegment).join(".");
const splitPath = (path) => (Array.isArray(path) ? path : String(path).split("."));

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/* ── Value encoding ────────────────────────────────────────────────────── */

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof FieldValueSentinel) throw new Error(`FieldValue.${v.kind}() is not allowed here`);
  if (v instanceof Timestamp) return { timestampValue: v.toRfc3339() };
  if (v instanceof Date) return { timestampValue: Timestamp.fromDate(v).toRfc3339() };
  if (v instanceof DocumentReference) return { referenceValue: v._name };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "bigint") return { integerValue: v.toString() };
  if (typeof v === "number") {
    if (Number.isInteger(v) && Number.isSafeInteger(v)) return { integerValue: String(v) };
    if (Number.isNaN(v)) return { doubleValue: "NaN" };
    if (!Number.isFinite(v)) return { doubleValue: v > 0 ? "Infinity" : "-Infinity" };
    return { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Uint8Array) return { bytesValue: btoa(String.fromCharCode(...v)) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encodeValue(x === undefined ? null : x)) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v) } };
  throw new Error(`Unsupported Firestore value type: ${typeof v}`);
}

function encodeFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[k] = encodeValue(val);
  }
  return fields;
}

function decodeValue(v) {
  if (!v || "nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return Timestamp.fromRfc3339(v.timestampValue);
  if ("stringValue" in v) return v.stringValue;
  if ("bytesValue" in v) return Uint8Array.from(atob(v.bytesValue), (c) => c.charCodeAt(0));
  if ("referenceValue" in v) return refFromName(v.referenceValue);
  if ("geoPointValue" in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields || {})) out[k] = decodeValue(val);
  return out;
}

/* ── Write construction ────────────────────────────────────────────────── */

function transformFor(segments, sentinel) {
  const fieldPath = encodePath(segments);
  switch (sentinel.kind) {
    case "serverTimestamp":
      return { fieldPath, setToServerValue: "REQUEST_TIME" };
    case "increment":
      return { fieldPath, increment: encodeValue(sentinel.operand) };
    case "arrayUnion":
      return { fieldPath, appendMissingElements: { values: sentinel.operand.map(encodeValue) } };
    case "arrayRemove":
      return { fieldPath, removeAllFromArray: { values: sentinel.operand.map(encodeValue) } };
    default:
      throw new Error(`Unsupported FieldValue: ${sentinel.kind}`);
  }
}

/**
 * Separates FieldValue sentinels from plain data. Returns the data with
 * sentinels removed, the transforms to apply, and the paths to delete.
 */
function extractSentinels(data, prefix = []) {
  const clean = {};
  const transforms = [];
  const deletes = [];
  for (const [k, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const segments = [...prefix, k];
    if (val instanceof FieldValueSentinel) {
      if (val.kind === "delete") deletes.push(segments);
      else transforms.push(transformFor(segments, val));
    } else if (isPlainObject(val)) {
      const inner = extractSentinels(val, segments);
      clean[k] = inner.clean;
      transforms.push(...inner.transforms);
      deletes.push(...inner.deletes);
    } else {
      clean[k] = val;
    }
  }
  return { clean, transforms, deletes };
}

/** Leaf field paths of a plain object — the update mask for a merge set. */
function leafPaths(obj, prefix = []) {
  const out = [];
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined || val instanceof FieldValueSentinel) continue;
    const segments = [...prefix, k];
    if (isPlainObject(val) && Object.keys(val).length > 0) out.push(...leafPaths(val, segments));
    else out.push(segments);
  }
  return out;
}

function setNested(target, segments, value) {
  let node = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (!isPlainObject(node[segments[i]])) node[segments[i]] = {};
    node = node[segments[i]];
  }
  node[segments[segments.length - 1]] = value;
}

function buildSetWrite(ref, data, options = {}) {
  const { clean, transforms, deletes } = extractSentinels(data);
  const write = { update: { name: ref._name, fields: encodeFields(clean) } };
  if (options.merge) {
    const mask = [...leafPaths(clean), ...deletes].map(encodePath);
    write.updateMask = { fieldPaths: mask };
  } else if (deletes.length) {
    throw new Error("FieldValue.delete() can only be used with update() or set(..., { merge: true })");
  }
  if (transforms.length) write.updateTransforms = transforms;
  return write;
}

function buildUpdateWrite(ref, data) {
  const fields = {};
  const mask = [];
  const transforms = [];
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const segments = splitPath(key);
    if (val instanceof FieldValueSentinel) {
      if (val.kind === "delete") mask.push(encodePath(segments));
      else transforms.push(transformFor(segments, val));
      continue;
    }
    if (isPlainObject(val)) {
      const inner = extractSentinels(val, segments);
      setNested(fields, segments, inner.clean);
      transforms.push(...inner.transforms);
      // Nested deletes inside a replaced map are simply absent from it.
    } else {
      setNested(fields, segments, val);
    }
    mask.push(encodePath(segments));
  }
  const write = {
    update: { name: ref._name, fields: encodeFields(fields) },
    updateMask: { fieldPaths: mask },
    currentDocument: { exists: true },
  };
  if (transforms.length) write.updateTransforms = transforms;
  return write;
}

function buildCreateWrite(ref, data) {
  const write = buildSetWrite(ref, data);
  write.currentDocument = { exists: false };
  return write;
}

const buildDeleteWrite = (ref) => ({ delete: ref._name });

/* ── Database plumbing ─────────────────────────────────────────────────── */

let projectRoot = null;
function root() {
  if (!projectRoot) {
    const { projectId } = getServiceAccount();
    projectRoot = `projects/${projectId}/databases/(default)/documents`;
  }
  return projectRoot;
}

const urlFor = (name) => `${API}/${name.split("/").map(encodeURIComponent).join("/").replace(/%28default%29/, "(default)")}`;

function refFromName(name) {
  const rel = name.slice(name.indexOf("/documents/") + "/documents/".length);
  return new DocumentReference(rel.split("/"));
}

async function commitWrites(writes, transaction) {
  if (!writes.length && !transaction) return [];
  const res = await googleFetch(`${API}/${root()}:commit`, {
    method: "POST",
    body: { writes, ...(transaction ? { transaction } : {}) },
  });
  return (res?.writeResults || []).map((r) => ({
    writeTime: r.updateTime ? Timestamp.fromRfc3339(r.updateTime) : res.commitTime ? Timestamp.fromRfc3339(res.commitTime) : null,
  }));
}

async function batchGet(refs, transaction) {
  if (!refs.length) return [];
  const res = await googleFetch(`${API}/${root()}:batchGet`, {
    method: "POST",
    body: { documents: refs.map((r) => r._name), ...(transaction ? { transaction } : {}) },
  });
  const byName = new Map();
  for (const entry of res || []) {
    if (entry.found) byName.set(entry.found.name, entry.found);
  }
  return refs.map((ref) => new DocumentSnapshot(ref, byName.get(ref._name) || null));
}

/* ── Snapshots ─────────────────────────────────────────────────────────── */

export class DocumentSnapshot {
  constructor(ref, doc) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = !!doc;
    this._fields = doc ? decodeFields(doc.fields) : undefined;
    this.createTime = doc?.createTime ? Timestamp.fromRfc3339(doc.createTime) : undefined;
    this.updateTime = doc?.updateTime ? Timestamp.fromRfc3339(doc.updateTime) : undefined;
  }
  data() {
    return this._fields === undefined ? undefined : { ...this._fields };
  }
  get(path) {
    let node = this._fields;
    for (const seg of splitPath(path)) {
      if (node == null || typeof node !== "object") return undefined;
      node = node[seg];
    }
    return node;
  }
}

export class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(cb, thisArg) {
    this.docs.forEach(cb, thisArg);
  }
}

/* ── References & queries ──────────────────────────────────────────────── */

const OPS = {
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "array-contains": "ARRAY_CONTAINS",
  "array-contains-any": "ARRAY_CONTAINS_ANY",
  in: "IN",
  "not-in": "NOT_IN",
};

export class Query {
  constructor(parentSegments, collectionId, allDescendants, spec = {}) {
    this._parent = parentSegments; // [] for root
    this._collectionId = collectionId;
    this._allDescendants = allDescendants;
    this._spec = { filters: [], orderBy: [], limit: undefined, select: undefined, ...spec };
  }
  _with(patch) {
    return new Query(this._parent, this._collectionId, this._allDescendants, { ...this._spec, ...patch });
  }
  where(field, op, value) {
    if (!OPS[op]) throw new Error(`Unsupported query operator: ${op}`);
    return this._with({ filters: [...this._spec.filters, { field: splitPath(field), op, value }] });
  }
  orderBy(field, direction = "asc") {
    return this._with({
      orderBy: [...this._spec.orderBy, { field: splitPath(field), direction: direction === "desc" ? "DESCENDING" : "ASCENDING" }],
    });
  }
  limit(n) {
    return this._with({ limit: n });
  }
  select(...fields) {
    return this._with({ select: fields.map(splitPath) });
  }
  _structuredQuery() {
    const q = { from: [{ collectionId: this._collectionId, allDescendants: this._allDescendants }] };
    const filters = this._spec.filters.map(({ field, op, value }) => {
      const fieldRef = { fieldPath: encodePath(field) };
      if (op === "==" && value === null) return { unaryFilter: { op: "IS_NULL", field: fieldRef } };
      if (op === "!=" && value === null) return { unaryFilter: { op: "IS_NOT_NULL", field: fieldRef } };
      if (op === "==" && Number.isNaN(value)) return { unaryFilter: { op: "IS_NAN", field: fieldRef } };
      return { fieldFilter: { field: fieldRef, op: OPS[op], value: encodeValue(value) } };
    });
    if (filters.length === 1) q.where = filters[0];
    else if (filters.length > 1) q.where = { compositeFilter: { op: "AND", filters } };
    if (this._spec.orderBy.length) {
      q.orderBy = this._spec.orderBy.map((o) => ({ field: { fieldPath: encodePath(o.field) }, direction: o.direction }));
    }
    if (this._spec.limit !== undefined) q.limit = this._spec.limit;
    if (this._spec.select) q.select = { fields: this._spec.select.map((f) => ({ fieldPath: encodePath(f) })) };
    return q;
  }
  async _run(transaction) {
    const parentName = this._parent.length ? `${root()}/${this._parent.join("/")}` : root();
    const res = await googleFetch(`${urlFor(parentName)}:runQuery`, {
      method: "POST",
      body: { structuredQuery: this._structuredQuery(), ...(transaction ? { transaction } : {}) },
    });
    const docs = (res || [])
      .filter((r) => r.document)
      .map((r) => new DocumentSnapshot(refFromName(r.document.name), r.document));
    return new QuerySnapshot(docs);
  }
  get() {
    return this._run();
  }
  // query.count().get() -> { data: () => ({ count }) }, as in firebase-admin. Billed
  // as one read per 1,000 matches, without downloading the documents.
  count() {
    return {
      get: async () => {
        const parentName = this._parent.length ? `${root()}/${this._parent.join("/")}` : root();
        const res = await googleFetch(`${urlFor(parentName)}:runAggregationQuery`, {
          method: "POST",
          body: { structuredAggregationQuery: { structuredQuery: this._structuredQuery(), aggregations: [{ alias: "count", count: {} }] } },
        });
        const count = Number(res?.[0]?.result?.aggregateFields?.count?.integerValue ?? 0);
        return { data: () => ({ count }) };
      },
    };
  }
}

const AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function autoId() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let id = "";
  for (const b of bytes) id += AUTO_ID_CHARS[b % AUTO_ID_CHARS.length];
  return id;
}

export class CollectionReference extends Query {
  constructor(segments) {
    super(segments.slice(0, -1), segments[segments.length - 1], false);
    this._segments = segments;
    this.id = segments[segments.length - 1];
    this.path = segments.join("/");
  }
  get parent() {
    return this._segments.length > 1 ? new DocumentReference(this._segments.slice(0, -1)) : null;
  }
  doc(id) {
    return new DocumentReference([...this._segments, ...String(id ?? autoId()).split("/")]);
  }
  async add(data) {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class DocumentReference {
  constructor(segments) {
    if (segments.length % 2 !== 0) throw new Error(`Invalid document path: ${segments.join("/")}`);
    this._segments = segments;
    this.id = segments[segments.length - 1];
    this.path = segments.join("/");
  }
  get _name() {
    return `${root()}/${this.path}`;
  }
  get parent() {
    return new CollectionReference(this._segments.slice(0, -1));
  }
  collection(id) {
    return new CollectionReference([...this._segments, ...String(id).split("/")]);
  }
  isEqual(other) {
    return other instanceof DocumentReference && other.path === this.path;
  }
  async get() {
    return (await batchGet([this]))[0];
  }
  async set(data, options) {
    return (await commitWrites([buildSetWrite(this, data, options)]))[0];
  }
  async update(data) {
    return (await commitWrites([buildUpdateWrite(this, data)]))[0];
  }
  async create(data) {
    return (await commitWrites([buildCreateWrite(this, data)]))[0];
  }
  async delete() {
    return (await commitWrites([buildDeleteWrite(this)]))[0];
  }
}

/* ── Batches & transactions ────────────────────────────────────────────── */

class WriteBatch {
  constructor() {
    this._writes = [];
  }
  set(ref, data, options) {
    this._writes.push(buildSetWrite(ref, data, options));
    return this;
  }
  update(ref, data) {
    this._writes.push(buildUpdateWrite(ref, data));
    return this;
  }
  create(ref, data) {
    this._writes.push(buildCreateWrite(ref, data));
    return this;
  }
  delete(ref) {
    this._writes.push(buildDeleteWrite(ref));
    return this;
  }
  commit() {
    return commitWrites(this._writes);
  }
}

class Transaction extends WriteBatch {
  constructor(id) {
    super();
    this._id = id;
  }
  async get(refOrQuery) {
    if (refOrQuery instanceof DocumentReference) return (await batchGet([refOrQuery], this._id))[0];
    if (refOrQuery instanceof Query) return refOrQuery._run(this._id);
    throw new Error("Transaction.get() takes a DocumentReference or Query");
  }
  getAll(...refs) {
    return batchGet(refs, this._id);
  }
}

const isContention = (err) => err?.status === 409 || err?.googleStatus === "ABORTED";

async function rollback(id) {
  try {
    await googleFetch(`${API}/${root()}:rollback`, { method: "POST", body: { transaction: id } });
  } catch {
    // The transaction expires on its own; a failed rollback is not fatal.
  }
}

/* ── Firestore ─────────────────────────────────────────────────────────── */

export class Firestore {
  settings() {
    // Accepted for API compatibility (e.g. preferRest); REST is the only transport here.
  }
  collection(path) {
    return new CollectionReference(String(path).split("/"));
  }
  doc(path) {
    return new DocumentReference(String(path).split("/"));
  }
  collectionGroup(collectionId) {
    return new Query([], collectionId, true);
  }
  batch() {
    return new WriteBatch();
  }
  getAll(...refs) {
    return batchGet(refs);
  }
  async runTransaction(fn, { maxAttempts = MAX_TX_ATTEMPTS } = {}) {
    let previous;
    for (let attempt = 1; ; attempt += 1) {
      const begun = await googleFetch(`${API}/${root()}:beginTransaction`, {
        method: "POST",
        body: { options: { readWrite: previous ? { retryTransaction: previous } : {} } },
      });
      const tx = new Transaction(begun.transaction);
      let result;
      try {
        result = await fn(tx);
      } catch (err) {
        await rollback(tx._id);
        if (isContention(err) && attempt < maxAttempts) {
          previous = tx._id;
          continue;
        }
        throw err;
      }
      try {
        await commitWrites(tx._writes, tx._id);
        return result;
      } catch (err) {
        if (isContention(err) && attempt < maxAttempts) {
          previous = tx._id;
          continue;
        }
        throw err;
      }
    }
  }
}
