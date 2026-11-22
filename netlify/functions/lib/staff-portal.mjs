import crypto from "node:crypto";

export const TIME_ZONE = "America/Denver";
const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE = "uk_staff_session";
const SCRYPT_N = 16384;

const KEYS = {
  secrets: "config/secrets",
  people: "config/people",
  roles: "config/roles",
  limits: "security/limits",
  day: (date) => `days/${date}`,
};

const DEFAULT_LIMITS = {
  credentialFails: 8,
  credentialWindowMs: 30 * 60 * 1000,
  credentialLockMs: 30 * 60 * 1000,
  ipFails: 40,
  ipWindowMs: 30 * 60 * 1000,
  ipLockMs: 30 * 60 * 1000,
  globalFails: 50,
  globalWindowMs: 15 * 60 * 1000,
  globalLockMs: 15 * 60 * 1000,
};

const SEED_ROLES = [
  {
    id: "server-1",
    name: "Server 1",
    subtitle: "First Opener",
    scheduleLabel: "",
    days: [],
    active: true,
    sort: 1,
    sections: [
      {
        id: "server-1-opening",
        title: "Opening",
        tasks: [
          ["s1-open-1", "Turn on orange juice machine and fill dispenser."],
          ["s1-open-2", "Turn on coffee and espresso machines."],
          ["s1-open-3", "Set up dining room for breakfast service."],
        ],
      },
      {
        id: "server-1-leaving",
        title: "Before Leaving",
        tasks: [
          ["s1-leave-1", "Sweep assigned section."],
          ["s1-leave-2", "Wipe down seats."],
          ["s1-leave-3", "Clean and refill table caddies (sugar, salt, pepper, etc.)."],
          ["s1-leave-4", "Reset section for dinner service."],
        ],
      },
    ],
  },
  {
    id: "server-2",
    name: "Server 2",
    subtitle: "Mid-Shift",
    scheduleLabel: "",
    days: [],
    active: true,
    sort: 2,
    sections: [
      {
        id: "server-2-arrival",
        title: "Upon Arrival",
        tasks: [
          ["s2-arrive-1", "Squeeze oranges and replenish orange juice as needed."],
          ["s2-arrive-2", "Complete primary restocking of cups, kids' cups, straws, to-go containers, and other supplies."],
        ],
      },
      {
        id: "server-2-leaving",
        title: "Before Leaving",
        tasks: [
          ["s2-leave-1", "Sweep assigned section."],
          ["s2-leave-2", "Wipe down seats."],
          ["s2-leave-3", "Clean and refill table caddies."],
          ["s2-leave-4", "Reset section for dinner service."],
          ["s2-leave-5", "Verify enough polished silverware is available for dinner."],
          ["s2-leave-6", "Clean and organize coffee station."],
        ],
      },
    ],
  },
  {
    id: "server-3",
    name: "Server 3",
    subtitle: "Last In / Brunch Closer",
    scheduleLabel: "",
    days: [],
    active: true,
    sort: 3,
    sections: [
      {
        id: "server-3-arrival",
        title: "Upon Arrival",
        tasks: [
          ["s3-arrive-1", "Check and top off cups, kids' cups, straws, and to-go containers."],
          ["s3-arrive-2", "Check additional service supplies and replenish as needed."],
        ],
      },
      {
        id: "server-3-closing",
        title: "Closing / Dinner Transition",
        tasks: [
          ["s3-close-1", "Clean orange juice machine and dispenser."],
          ["s3-close-2", "Sweep assigned section."],
          ["s3-close-3", "Wipe down seats."],
          ["s3-close-4", "Clean and refill table caddies."],
          ["s3-close-5", "Reset section for dinner service."],
          ["s3-close-6", "Sweep hallway in front of kitchen service window."],
          ["s3-close-7", "Sweep coffee station area."],
          ["s3-close-8", "Take out all restaurant trash."],
        ],
      },
    ],
  },
  {
    id: "host",
    name: "Host",
    subtitle: "Friday \u2013 Sunday",
    scheduleLabel: "Friday \u2013 Sunday",
    days: [0, 5, 6],
    active: true,
    sort: 4,
    sections: [
      {
        id: "host-opening",
        title: "Opening Side Work",
        tasks: [
          ["host-open-1", "Enter and organize reservations immediately upon arrival."],
          ["host-open-2", "Review upcoming reservations to prepare for service."],
        ],
      },
      {
        id: "host-during",
        title: "Throughout Shift / Between Shifts",
        tasks: [
          ["host-during-1", "Sweep the waiting area as needed."],
          ["host-during-2", "Keep the host stand and entrance area clean and organized."],
          ["host-during-3", "Clean and touch up windows during slower periods when guest traffic allows."],
        ],
      },
      {
        id: "host-closing",
        title: "Closing Side Work",
        tasks: [
          ["host-close-1", "Thoroughly sweep the waiting area and around the host stand."],
          ["host-close-2", "Clean the front entrance doors and glass."],
          ["host-close-3", "Walk through the restaurant and touch up any remaining dirty windows."],
          ["host-close-4", "Clean bathroom mirrors."],
          ["host-close-5", "Leave the host stand and entrance area clean and organized for the next shift."],
        ],
      },
    ],
  },
  {
    id: "busser",
    name: "Busser",
    subtitle: "Friday \u2013 Sunday",
    scheduleLabel: "Friday \u2013 Sunday",
    days: [0, 5, 6],
    active: true,
    sort: 5,
    sections: [
      {
        id: "busser-during",
        title: "Throughout Shift / Between Shifts",
        tasks: [
          ["bus-during-1", "Polish silverware between shifts and as needed."],
          ["bus-during-2", "Check bathrooms periodically for cleanliness."],
          ["bus-during-3", "Empty bathroom garbage cans as needed."],
          ["bus-during-4", "Restock soap and paper towel dispensers as needed."],
        ],
      },
      {
        id: "busser-closing",
        title: "Closing Side Work",
        tasks: [
          ["bus-close-1", "Sweep the hallway leading to the dish pit."],
          ["bus-close-2", "Sweep bathroom floors."],
          ["bus-close-3", "Empty bathroom garbage cans."],
          ["bus-close-4", "Ensure soap and paper towel dispensers are fully stocked."],
        ],
      },
    ],
  },
];

function fail(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  if (extra.retryAfterSeconds) error.retryAfterSeconds = extra.retryAfterSeconds;
  throw error;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function respond(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function csvRespond(filename, csv) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: `\uFEFF${csv}`,
  };
}

export function createMemoryStore() {
  const values = new Map();
  const etags = new Map();
  return {
    async get(key) {
      return values.has(key) ? clone(values.get(key)) : null;
    },
    async getWithEtag(key) {
      if (!values.has(key)) return null;
      return { data: clone(values.get(key)), etag: etags.get(key) };
    },
    async set(key, data) {
      values.set(key, clone(data));
      const etag = String((Number(etags.get(key)) || 0) + 1);
      etags.set(key, etag);
      return { modified: true, etag };
    },
    async compareAndSet(key, data, etag) {
      const current = values.has(key) ? etags.get(key) : undefined;
      if (etag !== current) return { modified: false };
      values.set(key, clone(data));
      const next = String((Number(current) || 0) + 1);
      etags.set(key, next);
      return { modified: true, etag: next };
    },
    dump() {
      return JSON.stringify(Object.fromEntries(values));
    },
  };
}

async function updateJson(store, key, mutator) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await store.getWithEtag(key);
    const draft = current ? clone(current.data) : null;
    const next = await mutator(draft);
    if (next === undefined) return draft;
    const result = await store.compareAndSet(key, next, current ? current.etag : undefined);
    if (result.modified) return next;
  }
  fail(409, "Someone else saved at the same time. Try again.");
}

export function createSeedRoles() {
  return SEED_ROLES.map((role) => ({
    ...role,
    days: [...role.days],
    sections: role.sections.map((section) => ({
      id: section.id,
      title: section.title,
      tasks: section.tasks.map(([id, text]) => ({ id, text })),
    })),
  }));
}

export function denverDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function denverTimeLabel(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function denverDateLabel(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(probe);
}

export function denverWeekdayIndex(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(probe);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) fail(400, "Choose a valid day.");
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    fail(400, "Choose a valid day.");
  }
  if (value < "2024-01-01" || value > "2100-01-01") fail(400, "Choose a valid day.");
  return value;
}

function scryptKey(secret, salt, n = SCRYPT_N) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scryptKey(secret, salt);
  return { hash: key.toString("hex"), salt: salt.toString("hex"), n: SCRYPT_N };
}

export async function verifySecret(secret, record) {
  if (!record?.hash || !record?.salt) return false;
  const actual = await scryptKey(secret, Buffer.from(record.salt, "hex"), record.n || SCRYPT_N);
  const expected = Buffer.from(record.hash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function safeEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signSession(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifySession(token, secret, now) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.sub || !payload?.exp || payload.exp * 1000 <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(token, { secure, maxAge }) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(header, name) {
  for (const part of String(header || "").split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

function normalizeHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) out[String(key).toLowerCase()] = value;
  return out;
}

function readToken(headers) {
  const auth = String(headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return readCookie(headers.cookie, COOKIE);
}

function isPin(value) {
  return /^\d{4,6}$/.test(String(value || ""));
}

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) fail(400, "Enter a name between 2 and 60 characters.");
  if (!/^[\p{L}\p{M}'. -]+$/u.test(name)) fail(400, "Use letters, spaces, apostrophes, or hyphens in the name.");
  return name;
}

function cleanLabel(value, label, max, min = 2) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length < min || text.length > max) fail(400, `${label} must be between ${min} and ${max} characters.`);
  if (/[<>]/.test(text)) fail(400, `${label} cannot include < or >.`);
  return text;
}

function cleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === false) return value;
  fail(400, "Say whether this should stay active.");
}

function cleanDays(value) {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) fail(400, "Choose days as a list.");
  const days = [...new Set(value.map(Number))];
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    fail(400, "Days run from Sunday through Saturday.");
  }
  return days.sort((a, b) => a - b);
}

function emptyDay(date) {
  return { date, assignments: {}, checks: {}, audit: [], roleSnapshot: null };
}

function emptyLimits() {
  return { ips: {}, creds: {}, global: { fails: 0, windowStart: 0, lockedUntil: 0 } };
}

function sortRoles(roles) {
  return [...roles].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
}

function tasksOf(role) {
  return (role?.sections || []).flatMap((section) => section.tasks || []);
}

function hasChecks(role, day) {
  return tasksOf(role).some((task) => day?.checks?.[task.id]);
}

function visibleRoles(roles, day) {
  return roles.filter((role) => role.active || day?.assignments?.[role.id] || hasChecks(role, day));
}

function offSchedule(role, date) {
  return Array.isArray(role.days) && role.days.length > 0 && !role.days.includes(denverWeekdayIndex(date));
}

function publicPerson(person) {
  return {
    id: person.id,
    name: person.name,
    kind: person.kind,
    active: person.active !== false,
    hasPin: Boolean(person.pin),
    hasPassword: Boolean(person.password),
  };
}

function publicActor(person) {
  return { id: person.id, name: person.name, kind: person.kind };
}

async function ensureSecrets(store) {
  await updateJson(store, KEYS.secrets, async (draft) => {
    if (draft?.sessionSecret && draft?.dummy) return undefined;
    const next = draft || {};
    if (!next.sessionSecret) next.sessionSecret = crypto.randomBytes(32).toString("hex");
    if (!next.dummy) next.dummy = await hashSecret(crypto.randomBytes(32).toString("hex"));
    return next;
  });
  return store.get(KEYS.secrets);
}

function activeSecrets(saved, env) {
  return {
    sessionSecret: env.UK_STAFF_SESSION_SECRET || saved.sessionSecret,
    pepper: env.UK_STAFF_PIN_PEPPER || "",
    dummy: saved.dummy,
  };
}

async function ensureRoles(store) {
  await updateJson(store, KEYS.roles, (draft) => {
    if (draft?.roles?.length) return undefined;
    return { roles: createSeedRoles() };
  });
  const saved = await store.get(KEYS.roles);
  return sortRoles(saved.roles);
}

async function loadPeople(store) {
  const saved = await store.get(KEYS.people);
  return saved?.people || [];
}

async function getDay(store, date) {
  return (await store.get(KEYS.day(date))) || emptyDay(date);
}

function resolveLimits(overrides) {
  return { ...DEFAULT_LIMITS, ...(overrides || {}) };
}

function waitMessage(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`;
}

function lockRemaining(entry, now) {
  if (!entry?.lockedUntil) return 0;
  const remain = entry.lockedUntil - now.getTime();
  return remain > 0 ? Math.ceil(remain / 1000) : 0;
}

function lockedSeconds(limits, ipId, credId, now) {
  return Math.max(
    lockRemaining(limits.ips?.[ipId], now),
    lockRemaining(limits.creds?.[credId], now),
    lockRemaining(limits.global, now),
  );
}

function bumpEntry(entry, now, max, windowMs, lockMs) {
  const time = now.getTime();
  const current = entry || { fails: 0, windowStart: time, lockedUntil: 0 };
  if (!current.windowStart || time - current.windowStart > windowMs) {
    current.fails = 0;
    current.windowStart = time;
  }
  current.fails += 1;
  let retryAfterSeconds = 0;
  if (current.fails >= max) {
    current.lockedUntil = time + lockMs;
    current.fails = 0;
    current.windowStart = time;
    retryAfterSeconds = Math.ceil(lockMs / 1000);
  }
  return { entry: current, retryAfterSeconds };
}

function pruneLimits(limits, now) {
  const cutoff = now.getTime() - 36 * 60 * 60 * 1000;
  for (const bucket of [limits.ips, limits.creds]) {
    for (const [key, entry] of Object.entries(bucket || {})) {
      const latest = Math.max(entry.windowStart || 0, entry.lockedUntil || 0);
      if (latest < cutoff) delete bucket[key];
    }
  }
  const credKeys = Object.keys(limits.creds || {});
  if (credKeys.length > 500) {
    credKeys.sort((a, b) => (limits.creds[a].windowStart || 0) - (limits.creds[b].windowStart || 0));
    for (const key of credKeys.slice(0, credKeys.length - 500)) delete limits.creds[key];
  }
}

async function recordFailure(store, { ipId, credId, now, limits }) {
  let retry = 0;
  await updateJson(store, KEYS.limits, (draft) => {
    const doc = draft || emptyLimits();
    doc.ips ||= {};
    doc.creds ||= {};
    doc.global ||= { fails: 0, windowStart: 0, lockedUntil: 0 };
    pruneLimits(doc, now);
    const existing = lockedSeconds(doc, ipId, credId, now);
    if (existing) {
      retry = existing;
      return undefined;
    }
    const ip = bumpEntry(doc.ips[ipId], now, limits.ipFails, limits.ipWindowMs, limits.ipLockMs);
    const cred = bumpEntry(doc.creds[credId], now, limits.credentialFails, limits.credentialWindowMs, limits.credentialLockMs);
    const global = bumpEntry(doc.global, now, limits.globalFails, limits.globalWindowMs, limits.globalLockMs);
    doc.ips[ipId] = ip.entry;
    doc.creds[credId] = cred.entry;
    doc.global = global.entry;
    retry = Math.max(ip.retryAfterSeconds, cred.retryAfterSeconds, global.retryAfterSeconds);
    return doc;
  });
  return retry;
}

async function clearFailure(store, credId) {
  try {
    await updateJson(store, KEYS.limits, (draft) => {
      if (!draft?.creds?.[credId]) return undefined;
      delete draft.creds[credId];
      return draft;
    });
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}

async function findCredential(people, { pin, password, pepper, dummy }) {
  if (pin) {
    const withPin = people.filter((person) => person.pin);
    if (pepper) {
      const lookup = hmac(pepper, `pin:${pin}`);
      const match = withPin.find((person) => person.pinLookup === lookup);
      if (match) return (await verifySecret(pin, match.pin)) ? match : null;
      const legacy = withPin.filter((person) => !person.pinLookup);
      if (legacy.length === 0) {
        await verifySecret(pin, dummy);
        return null;
      }
      return scanSecrets(legacy, pin, "pin", null);
    }
    return scanSecrets(withPin, pin, "pin", dummy);
  }

  const managers = people.filter((person) => person.kind === "manager" && person.password);
  if (pepper) {
    const lookup = hmac(pepper, `password:${password}`);
    const match = managers.find((person) => person.passwordLookup === lookup);
    if (match) return (await verifySecret(password, match.password)) ? match : null;
    const legacy = managers.filter((person) => !person.passwordLookup);
    if (legacy.length === 0) {
      await verifySecret(password, dummy);
      return null;
    }
    return scanSecrets(legacy, password, "password", null);
  }
  return scanSecrets(managers, password, "password", dummy);
}

async function scanSecrets(people, secret, field, dummy) {
  let found = null;
  for (const person of people) {
    const record = field === "pin" ? person.pin : person.password;
    if (record && (await verifySecret(secret, record))) found = person;
  }
  if (!found && dummy) await verifySecret(secret, dummy);
  return found;
}

async function setCredential(person, { pin, password, pepper }) {
  if (pin) {
    person.pin = await hashSecret(pin);
    person.pinLookup = pepper ? hmac(pepper, `pin:${pin}`) : null;
  }
  if (password) {
    person.password = await hashSecret(password);
    person.passwordLookup = pepper ? hmac(pepper, `password:${password}`) : null;
  }
}

function assertUniqueCredential(people, { pinLookup, passwordLookup, ignoreId }) {
  if (pinLookup && people.some((person) => person.id !== ignoreId && person.pinLookup && person.pinLookup === pinLookup)) {
    fail(409, "That PIN is already in use. Choose a different one.");
  }
  if (passwordLookup && people.some((person) => person.id !== ignoreId && person.passwordLookup && person.passwordLookup === passwordLookup)) {
    fail(409, "That password is already in use. Choose a different one.");
  }
}

async function actorFromRequest(store, secrets, headers, now) {
  const token = readToken(headers);
  if (!token) fail(401, "Sign in to continue.");
  const payload = verifySession(token, secrets.sessionSecret, now);
  if (!payload) fail(401, "Sign in to continue.");
  const person = (await loadPeople(store)).find((item) => item.id === payload.sub);
  if (!person || person.active === false || (person.sessionVersion || 0) !== (payload.sv || 0) || person.kind !== payload.kind) {
    fail(401, "Sign in to continue.");
  }
  return person;
}

function requireManager(person) {
  if (person.kind !== "manager") fail(403, "A manager has to do that.");
}

function issueSession(person, secrets, now, headers) {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_SECONDS;
  const token = signSession({
    sub: person.id,
    kind: person.kind,
    name: person.name,
    sv: person.sessionVersion || 0,
    exp,
  }, secrets.sessionSecret);
  const proto = String(headers["x-forwarded-proto"] || "");
  const secure = proto.split(",")[0].trim() === "https";
  return {
    token,
    headers: { "Set-Cookie": sessionCookie(token, { secure, maxAge: SESSION_SECONDS }) },
  };
}

function presentChecklist(role, day) {
  let completed = 0;
  let total = 0;
  const sections = (role.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    tasks: (section.tasks || []).map((task) => {
      total += 1;
      const check = day.checks?.[task.id] || null;
      if (check) completed += 1;
      return {
        id: task.id,
        text: task.text,
        done: Boolean(check),
        employeeId: check?.employeeId || null,
        employeeName: check?.employeeName || null,
        at: check?.at || null,
        atLabel: check?.at ? denverTimeLabel(check.at) : null,
      };
    }),
  }));
  return { sections, completed, total, missed: total - completed };
}

function presentAssignee(assignment) {
  if (!assignment) return null;
  return {
    employeeId: assignment.employeeId,
    employeeName: assignment.employeeName,
    source: assignment.source,
    at: assignment.at,
    atLabel: assignment.at ? denverTimeLabel(assignment.at) : null,
  };
}

function presentRoleReport(role, day, date) {
  const progress = presentChecklist(role, day);
  return {
    id: role.id,
    name: role.name,
    subtitle: role.subtitle || "",
    scheduleLabel: role.scheduleLabel || "",
    offSchedule: offSchedule(role, date),
    active: role.active !== false,
    assignee: presentAssignee(day.assignments?.[role.id]),
    ...progress,
  };
}

function assignmentFor(day, personId) {
  return Object.entries(day.assignments || {}).find(([, assignment]) => assignment.employeeId === personId) || null;
}

function todayPayload(person, roles, day, today) {
  const entry = assignmentFor(day, person.id);
  const assignedRole = entry ? roles.find((role) => role.id === entry[0]) : null;
  const openRoles = assignedRole
    ? []
    : roles
      .filter((role) => role.active && !day.assignments?.[role.id])
      .map((role) => ({
        id: role.id,
        name: role.name,
        subtitle: role.subtitle || "",
        scheduleLabel: role.scheduleLabel || "",
        offSchedule: offSchedule(role, today),
      }));
  const checklist = assignedRole
    ? {
      roleId: assignedRole.id,
      name: assignedRole.name,
      subtitle: assignedRole.subtitle || "",
      scheduleLabel: assignedRole.scheduleLabel || "",
      offSchedule: offSchedule(assignedRole, today),
      source: entry[1].source,
      ...presentChecklist(assignedRole, day),
    }
    : null;
  return {
    date: today,
    dateLabel: denverDateLabel(today),
    timeZone: TIME_ZONE,
    employee: publicActor(person),
    openRoles,
    checklist,
  };
}

async function buildReport(store, roles, date, today) {
  let day = await getDay(store, date);
  let reportRoles = visibleRoles(roles, day);
  if (date < today) {
    if (!day.roleSnapshot) {
      const snapshot = clone(reportRoles);
      day = await updateJson(store, KEYS.day(date), (draft) => {
        const next = draft || emptyDay(date);
        if (next.roleSnapshot) return undefined;
        next.roleSnapshot = snapshot;
        return next;
      });
    }
    reportRoles = visibleRoles(day.roleSnapshot || reportRoles, day);
  }
  const presented = reportRoles.map((role) => presentRoleReport(role, day, date));
  const totals = presented.reduce((sum, role) => ({
    completed: sum.completed + role.completed,
    total: sum.total + role.total,
    missed: sum.missed + role.missed,
  }), { completed: 0, total: 0, missed: 0 });
  return {
    date,
    dateLabel: denverDateLabel(date),
    timeZone: TIME_ZONE,
    ...totals,
    roles: presented,
  };
}

function reportToCsv(report) {
  const rows = [["Date", "Role", "Section", "Task", "Status", "Completed By", "Time (America/Denver)"]];
  for (const role of report.roles) {
    for (const section of role.sections) {
      for (const task of section.tasks) {
        rows.push([
          report.date,
          role.subtitle ? `${role.name} (${role.subtitle})` : role.name,
          section.title,
          task.text,
          task.done ? "Done" : "Missed",
          task.employeeName || "",
          task.atLabel || "",
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function rememberToday(store, today, roles) {
  try {
    await updateJson(store, KEYS.day(today), (draft) => {
      const day = draft || emptyDay(today);
      const snapshot = clone(roles);
      if (JSON.stringify(day.roleSnapshot) === JSON.stringify(snapshot)) return undefined;
      day.roleSnapshot = snapshot;
      return day;
    });
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}

function credentialIds(secrets, { pin, password, ip }) {
  const key = secrets.pepper || secrets.sessionSecret;
  const credId = hmac(key, pin ? `pin:${pin}` : `password:${password}`);
  const ipId = hmac(key, `ip:${ip || "unknown"}`).slice(0, 32);
  return { credId, ipId };
}

async function authenticate(store, secrets, { pin, password, ip, now, limits }) {
  const { credId, ipId } = credentialIds(secrets, { pin, password, ip });
  const existing = await store.get(KEYS.limits);
  const retryNow = lockedSeconds(existing || emptyLimits(), ipId, credId, now);
  if (retryNow) {
    await verifySecret(pin || password, secrets.dummy);
    fail(429, waitMessage(retryNow), { retryAfterSeconds: retryNow });
  }

  const people = await loadPeople(store);
  const person = await findCredential(people, { pin, password, pepper: secrets.pepper, dummy: secrets.dummy });
  if (!person || person.active === false) {
    const retry = await recordFailure(store, { ipId, credId, now, limits });
    if (retry) fail(429, waitMessage(retry), { retryAfterSeconds: retry });
    fail(401, "That PIN or password wasn't recognized.");
  }
  await clearFailure(store, credId);
  return person;
}

function sessionResponse(person, secrets, now, headers, extra = {}) {
  const session = issueSession(person, secrets, now, headers);
  return respond(200, { ok: true, token: session.token, person: publicActor(person), ...extra }, session.headers);
}

async function savePerson(store, secrets, actor, input, kind) {
  requireManager(actor);
  const name = cleanName(input?.name);
  const creating = !input?.id;
  const pin = input?.pin ? String(input.pin) : "";
  const password = input?.password ? String(input.password) : "";
  if (pin && !isPin(pin)) fail(400, "Enter a 4 to 6 digit PIN.");
  if (password && (password.length < 8 || password.length > 72)) fail(400, "Use 8 to 72 characters for a manager password.");
  if (kind === "employee" && creating && !pin) fail(400, "Enter a 4 to 6 digit PIN.");
  if (kind === "manager" && creating && !pin && !password) fail(400, "Give the manager a PIN or a password.");
  if (kind === "employee" && password) fail(400, "Employees sign in with a PIN.");

  if (!secrets.pepper) await assertNoSharedSecret(store, { pin, password, ignoreId: input?.id || "" });

  let pinLookup = null;
  let passwordLookup = null;
  let pinRecord = null;
  let passwordRecord = null;
  if (pin) {
    pinRecord = await hashSecret(pin);
    pinLookup = secrets.pepper ? hmac(secrets.pepper, `pin:${pin}`) : null;
  }
  if (password) {
    passwordRecord = await hashSecret(password);
    passwordLookup = secrets.pepper ? hmac(secrets.pepper, `password:${password}`) : null;
  }

  const saved = await updateJson(store, KEYS.people, (draft) => {
    const people = draft?.people ? draft.people : [];
    if (pinLookup || passwordLookup) assertUniqueCredential(people, { pinLookup, passwordLookup, ignoreId: input?.id || "" });
    if (!secrets.pepper && pin) {
      // Without a pepper the lookup is empty, so uniqueness is checked by verifying below.
    }
    if (creating) {
      if (kind === "manager" && people.filter((person) => person.kind === "manager").length >= 30) {
        fail(400, "You can save up to 30 managers.");
      }
      if (people.length >= 200) fail(400, "You can save up to 200 people.");
      const person = {
        id: createId(kind === "manager" ? "mgr" : "emp"),
        kind,
        name,
        active: true,
        sessionVersion: 0,
        pin: pinRecord,
        pinLookup,
        password: passwordRecord,
        passwordLookup,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      people.push(person);
      return { people };
    }

    const person = people.find((item) => item.id === input.id && item.kind === kind);
    if (!person) fail(404, kind === "manager" ? "That manager was not found." : "That employee was not found.");
    const nextActive = cleanFlag(input.active, person.active !== false);
    if (kind === "manager" && person.active !== false && !nextActive) {
      const others = people.filter((item) => item.kind === "manager" && item.active !== false && item.id !== person.id);
      if (others.length === 0) fail(400, "Keep at least one active manager.");
    }
    person.name = name;
    person.active = nextActive;
    person.updatedAt = new Date().toISOString();
    if (pinRecord || passwordRecord || !nextActive) person.sessionVersion = (person.sessionVersion || 0) + 1;
    if (pinRecord) {
      person.pin = pinRecord;
      person.pinLookup = pinLookup;
    }
    if (passwordRecord) {
      person.password = passwordRecord;
      person.passwordLookup = passwordLookup;
    }
    if (kind === "manager" && nextActive && !person.pin && !person.password) {
      fail(400, "Give the manager a PIN or a password.");
    }
    return { people };
  });

  if (!secrets.pepper && pin) {
    const people = saved.people;
    const ignoreId = creating ? saved.people[saved.people.length - 1].id : input.id;
    for (const person of people) {
      if (person.id === ignoreId || !person.pin) continue;
      if (await verifySecret(pin, person.pin)) {
        fail(409, "That PIN is already in use. Choose a different one.");
      }
    }
  }

  const all = await loadPeople(store);
  return {
    employees: all.filter((person) => person.kind === "employee").map(publicPerson),
    managers: all.filter((person) => person.kind === "manager").map(publicPerson),
    self: saved.people.find((person) => person.id === actor.id) || null,
  };
}

async function assertNoSharedSecret(store, { pin, password, ignoreId }) {
  if (!pin && !password) return;
  const people = await loadPeople(store);
  for (const person of people) {
    if (person.id === ignoreId) continue;
    if (pin && person.pin && (await verifySecret(pin, person.pin))) {
      fail(409, "That PIN is already in use. Choose a different one.");
    }
    if (password && person.password && (await verifySecret(password, person.password))) {
      fail(409, "That password is already in use. Choose a different one.");
    }
  }
}

function normalizeRole(input, roles) {
  const existing = input?.id ? roles.find((role) => role.id === input.id) : null;
  if (input?.id && !existing) fail(404, "That role was not found.");
  if (!existing && roles.length >= 40) fail(400, "You can save up to 40 roles.");
  const name = cleanLabel(input?.name, "Role name", 40);
  const subtitle = input?.subtitle ? cleanLabel(input.subtitle, "Subtitle", 60, 1) : "";
  const scheduleLabel = input?.scheduleLabel ? cleanLabel(input.scheduleLabel, "Schedule", 40, 1) : "";
  const days = cleanDays(input?.days);
  const active = cleanFlag(input?.active, existing ? existing.active !== false : true);
  const sectionsInput = Array.isArray(input?.sections) ? input.sections : [];
  if (sectionsInput.length < 1 || sectionsInput.length > 12) fail(400, "Add between 1 and 12 sections.");
  const usedTaskIds = new Set();
  const usedSectionIds = new Set();
  for (const role of roles) {
    if (existing && role.id === existing.id) continue;
    for (const section of role.sections || []) {
      for (const task of section.tasks || []) usedTaskIds.add(task.id);
    }
  }
  const previousTasks = new Set(tasksOf(existing).map((task) => task.id));
  const previousSections = new Set((existing?.sections || []).map((section) => section.id));
  const sections = sectionsInput.map((section) => {
    const title = cleanLabel(section?.title, "Section name", 80);
    const tasksInput = Array.isArray(section?.tasks) ? section.tasks : [];
    if (tasksInput.length > 40) fail(400, "A section can have up to 40 tasks.");
    const tasks = tasksInput.map((task) => {
      const text = cleanLabel(task?.text, "Task", 240);
      let id = task?.id && previousTasks.has(task.id) && !usedTaskIds.has(task.id) ? task.id : createId("task");
      if (usedTaskIds.has(id)) id = createId("task");
      usedTaskIds.add(id);
      return { id, text };
    });
    let id = section?.id && previousSections.has(section.id) && !usedSectionIds.has(section.id)
      ? section.id
      : createId("section");
    usedSectionIds.add(id);
    return { id, title, tasks };
  });
  if (sections.reduce((sum, section) => sum + section.tasks.length, 0) < 1) fail(400, "Add at least one task.");
  return {
    id: existing?.id || createId("role"),
    name,
    subtitle,
    scheduleLabel,
    days,
    active,
    sort: existing?.sort || Math.max(0, ...roles.map((role) => role.sort || 0)) + 1,
    sections,
  };
}

async function mutateDay(store, date, mutator) {
  return updateJson(store, KEYS.day(date), (draft) => mutator(draft || emptyDay(date)));
}

function pushAudit(day, entry) {
  day.audit = day.audit || [];
  day.audit.push(entry);
  if (day.audit.length > 400) day.audit = day.audit.slice(-400);
}

export async function handleStaffRequest(ctx) {
  try {
    const headers = normalizeHeaders(ctx.headers);
    const method = String(ctx.method || "GET").toUpperCase();
    const env = ctx.env || {};
    const now = ctx.now ? ctx.now() : new Date();
    if (Number.isNaN(now.getTime())) fail(500, "The staff clock is unavailable.");
    if (!ctx.store) fail(500, "Staff storage is not available.");
    const store = ctx.store;
    const secrets = activeSecrets(await ensureSecrets(store), env);
    const roles = await ensureRoles(store);
    const limits = resolveLimits(ctx.limits);
    const today = denverDate(now);
    const ip = ctx.ip || "unknown";
    const body = ctx.body && typeof ctx.body === "object" ? ctx.body : {};
    const query = ctx.query || {};
    const action = String((method === "GET" ? query.action : body.action) || "");
    const base = { store, secrets, roles, limits, env, now, headers, ip, body, query, today };

    if (method === "GET") return await handleGet(action, base);
    if (method === "POST") return await handlePost(action, base);
    fail(405, "That action is not available.");
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("Staff portal error", error);
    const payload = { error: status === 500 ? "Something went wrong. Try again." : error.message };
    if (error.retryAfterSeconds) payload.retryAfterSeconds = error.retryAfterSeconds;
    const extra = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    return respond(status, payload, extra);
  }
}

async function handleGet(action, ctx) {
  if (action === "status" || action === "") {
    const people = await loadPeople(ctx.store);
    const managers = people.filter((person) => person.kind === "manager");
    return respond(200, {
      ok: true,
      needsBootstrap: managers.length === 0,
      setupConfigured: Boolean(ctx.env.UK_STAFF_SETUP_SECRET),
      timeZone: TIME_ZONE,
      date: ctx.today,
      dateLabel: denverDateLabel(ctx.today),
    });
  }

  const actor = await actorFromRequest(ctx.store, ctx.secrets, ctx.headers, ctx.now);
  if (action === "session") return respond(200, { ok: true, person: publicActor(actor), date: ctx.today, dateLabel: denverDateLabel(ctx.today) });
  if (action === "today") {
    await rememberToday(ctx.store, ctx.today, ctx.roles);
    const day = await getDay(ctx.store, ctx.today);
    return respond(200, todayPayload(actor, ctx.roles, day, ctx.today));
  }
  if (action === "roster") {
    requireManager(actor);
    const people = await loadPeople(ctx.store);
    return respond(200, {
      date: ctx.today,
      dateLabel: denverDateLabel(ctx.today),
      employees: people.filter((person) => person.kind === "employee").map(publicPerson),
      managers: people.filter((person) => person.kind === "manager").map(publicPerson),
      roles: ctx.roles,
    });
  }
  if (action === "report" || action === "report-csv") {
    requireManager(actor);
    const date = ctx.query.date ? assertDate(ctx.query.date) : ctx.today;
    if (date === ctx.today) await rememberToday(ctx.store, ctx.today, ctx.roles);
    const report = await buildReport(ctx.store, ctx.roles, date, ctx.today);
    if (action === "report-csv") return csvRespond(`side-work-${date}.csv`, reportToCsv(report));
    return respond(200, report);
  }
  fail(404, "That action is not available.");
}

async function handlePost(action, ctx) {
  if (action === "bootstrap") return bootstrap(ctx);
  if (action === "login") return login(ctx);
  if (action === "logout") return logout(ctx);

  const actor = await actorFromRequest(ctx.store, ctx.secrets, ctx.headers, ctx.now);
  if (action === "pick-role") return pickRole(ctx, actor);
  if (action === "toggle-task") return toggleTask(ctx, actor);
  if (action === "save-employee") return respondSaved(ctx, actor, await savePerson(ctx.store, ctx.secrets, actor, ctx.body, "employee"));
  if (action === "save-manager") return respondSaved(ctx, actor, await savePerson(ctx.store, ctx.secrets, actor, ctx.body, "manager"));
  if (action === "save-role") return saveRole(ctx, actor);
  if (action === "assign") return assignRole(ctx, actor);
  fail(404, "That action is not available.");
}

function respondSaved(ctx, actor, result) {
  const body = { ok: true, employees: result.employees, managers: result.managers };
  if (result.self && result.self.id === actor.id && (result.self.sessionVersion || 0) !== (actor.sessionVersion || 0)) {
    return sessionResponse(result.self, ctx.secrets, ctx.now, ctx.headers, body);
  }
  return respond(200, body);
}

async function bootstrap(ctx) {
  const people = await loadPeople(ctx.store);
  if (people.some((person) => person.kind === "manager")) fail(409, "A manager account already exists.");
  if (!ctx.env.UK_STAFF_SETUP_SECRET) {
    fail(503, "Staff setup is not ready yet. Add UK_STAFF_SETUP_SECRET in Netlify, then reload this page.");
  }
  const { credId, ipId } = credentialIds(ctx.secrets, { password: String(ctx.body.setupSecret || ""), ip: ctx.ip });
  if (!safeEqual(String(ctx.body.setupSecret || ""), ctx.env.UK_STAFF_SETUP_SECRET)) {
    const retry = await recordFailure(ctx.store, { ipId, credId, now: ctx.now, limits: ctx.limits });
    if (retry) fail(429, waitMessage(retry), { retryAfterSeconds: retry });
    fail(403, "That setup secret was not recognized.");
  }
  const name = cleanName(ctx.body.name);
  const pin = ctx.body.pin ? String(ctx.body.pin) : "";
  const password = ctx.body.password ? String(ctx.body.password) : "";
  if (pin && !isPin(pin)) fail(400, "Enter a 4 to 6 digit PIN.");
  if (password && (password.length < 8 || password.length > 72)) fail(400, "Use 8 to 72 characters for a manager password.");
  if (!pin && !password) fail(400, "Choose a manager PIN or a password.");
  const person = {
    id: createId("mgr"),
    kind: "manager",
    name,
    active: true,
    sessionVersion: 0,
    pin: null,
    pinLookup: null,
    password: null,
    passwordLookup: null,
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
  await setCredential(person, { pin, password, pepper: ctx.secrets.pepper });
  const saved = await updateJson(ctx.store, KEYS.people, (draft) => {
    const list = draft?.people || [];
    if (list.some((item) => item.kind === "manager")) return undefined;
    list.push(person);
    return { people: list };
  });
  if (!saved?.people?.some((item) => item.id === person.id)) fail(409, "A manager account already exists.");
  return sessionResponse(person, ctx.secrets, ctx.now, ctx.headers);
}

async function login(ctx) {
  const raw = String(ctx.body.pin || ctx.body.password || ctx.body.credential || "").trim();
  let pin = "";
  let password = "";
  if (isPin(raw) && !ctx.body.password) pin = raw;
  else if (ctx.body.password || (!isPin(raw) && raw)) {
    password = String(ctx.body.password || raw);
    if (password.length < 8 || password.length > 72) fail(400, "Use a 4 to 6 digit PIN, or a password of 8 to 72 characters.");
  } else {
    fail(400, "Enter a 4 to 6 digit PIN.");
  }
  const person = await authenticate(ctx.store, ctx.secrets, { pin, password, ip: ctx.ip, now: ctx.now, limits: ctx.limits });
  return sessionResponse(person, ctx.secrets, ctx.now, ctx.headers);
}

async function logout(ctx) {
  const actor = await actorFromRequest(ctx.store, ctx.secrets, ctx.headers, ctx.now);
  await updateJson(ctx.store, KEYS.people, (draft) => {
    const person = (draft?.people || []).find((item) => item.id === actor.id);
    if (!person) return undefined;
    person.sessionVersion = (person.sessionVersion || 0) + 1;
    return draft;
  });
  const proto = String(ctx.headers["x-forwarded-proto"] || "");
  const secure = proto.split(",")[0].trim() === "https";
  return respond(200, { ok: true }, { "Set-Cookie": sessionCookie("", { secure, maxAge: 0 }) });
}

async function pickRole(ctx, actor) {
  const roleId = String(ctx.body.roleId || "");
  const role = ctx.roles.find((item) => item.id === roleId && item.active);
  if (!role) fail(404, "That role is not available.");
  const day = await mutateDay(ctx.store, ctx.today, (draft) => {
    const mine = assignmentFor(draft, actor.id);
    if (mine && mine[0] !== roleId) fail(409, `You're already on ${roleName(ctx.roles, mine[0])} today. A manager can move you.`);
    if (mine && mine[0] === roleId) return undefined;
    if (draft.assignments[roleId]) fail(409, "That role was just taken. Pick another.");
    draft.assignments[roleId] = {
      employeeId: actor.id,
      employeeName: actor.name,
      source: "self",
      at: ctx.now.toISOString(),
    };
    return draft;
  });
  return respond(200, todayPayload(actor, ctx.roles, day, ctx.today));
}

function roleName(roles, roleId) {
  return roles.find((role) => role.id === roleId)?.name || "a role";
}

async function toggleTask(ctx, actor) {
  const taskId = String(ctx.body.taskId || "");
  const checked = Boolean(ctx.body.checked);
  let role = null;
  let task = null;
  for (const candidate of ctx.roles) {
    for (const section of candidate.sections || []) {
      const found = (section.tasks || []).find((item) => item.id === taskId);
      if (found) {
        role = candidate;
        task = found;
      }
    }
  }
  if (!task) fail(404, "That task is not on today's list.");
  const day = await mutateDay(ctx.store, ctx.today, (draft) => {
    const assignment = draft.assignments?.[role.id];
    if (!assignment || assignment.employeeId !== actor.id) {
      fail(403, "You can check off the role you're on today.");
    }
    const current = draft.checks?.[taskId] || null;
    if (checked && current?.employeeId === actor.id) return undefined;
    if (!checked && !current) return undefined;
    draft.checks ||= {};
    if (checked) {
      draft.checks[taskId] = {
        taskId,
        roleId: role.id,
        taskText: task.text,
        employeeId: actor.id,
        employeeName: actor.name,
        at: ctx.now.toISOString(),
      };
      pushAudit(draft, { type: "check", ...draft.checks[taskId] });
    } else {
      pushAudit(draft, {
        type: "uncheck",
        taskId,
        roleId: role.id,
        taskText: current.taskText || task.text,
        employeeId: actor.id,
        employeeName: actor.name,
        at: ctx.now.toISOString(),
      });
      delete draft.checks[taskId];
    }
    return draft;
  });
  return respond(200, todayPayload(actor, ctx.roles, day, ctx.today));
}

async function saveRole(ctx, actor) {
  requireManager(actor);
  const roles = await ensureRoles(ctx.store);
  const normalized = normalizeRole(ctx.body.role || ctx.body, roles);
  const saved = await updateJson(ctx.store, KEYS.roles, (draft) => {
    const list = draft?.roles || [];
    const index = list.findIndex((role) => role.id === normalized.id);
    if (index === -1) list.push(normalized);
    else list[index] = normalized;
    return { roles: list };
  });
  const nextRoles = sortRoles(saved.roles);
  await rememberToday(ctx.store, ctx.today, nextRoles);
  return respond(200, { ok: true, roles: nextRoles });
}

async function assignRole(ctx, actor) {
  requireManager(actor);
  const date = assertDate(ctx.body.date || ctx.today);
  const role = ctx.roles.find((item) => item.id === ctx.body.roleId);
  if (!role) fail(404, "That role was not found.");
  if (role.active === false && ctx.body.employeeId) fail(400, "Turn that role back on before assigning it.");
  const employeeId = ctx.body.employeeId ? String(ctx.body.employeeId) : "";
  let employee = null;
  if (employeeId) {
    employee = (await loadPeople(ctx.store)).find((person) => person.id === employeeId && person.active !== false);
    if (!employee) fail(404, "That person is not active.");
  }
  await mutateDay(ctx.store, date, (draft) => {
    if (!employee) {
      delete draft.assignments[role.id];
      return draft;
    }
    for (const [roleId, assignment] of Object.entries(draft.assignments || {})) {
      if (assignment.employeeId === employee.id) delete draft.assignments[roleId];
    }
    draft.assignments[role.id] = {
      employeeId: employee.id,
      employeeName: employee.name,
      source: "manager",
      at: ctx.now.toISOString(),
    };
    return draft;
  });
  if (date === ctx.today) await rememberToday(ctx.store, ctx.today, ctx.roles);
  return respond(200, await buildReport(ctx.store, ctx.roles, date, ctx.today));
}
