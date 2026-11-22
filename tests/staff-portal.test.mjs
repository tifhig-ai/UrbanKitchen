import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryStore,
  createSeedRoles,
  denverDate,
  denverTimeLabel,
  denverWeekdayIndex,
  handleStaffRequest,
  hashSecret,
  verifySecret,
} from "../netlify/functions/lib/staff-portal.mjs";

const SUNDAY = new Date("2026-11-22T18:05:00.000Z");

function harness(overrides = {}) {
  const store = overrides.store || createMemoryStore();
  const clock = { time: overrides.now ? new Date(overrides.now) : new Date(SUNDAY) };
  const env = {
    UK_STAFF_SETUP_SECRET: "test-setup-secret",
    UK_STAFF_PIN_PEPPER: "test-pepper-value",
    UK_STAFF_SESSION_SECRET: "test-session-secret",
    ...overrides.env,
  };
  const call = (options = {}) => handleStaffRequest({
    store,
    env,
    now: () => clock.time,
    limits: overrides.limits,
    method: options.method || "POST",
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
    ip: options.ip || "203.0.113.8",
  });
  return { store, clock, env, call };
}

async function body(response) {
  const json = response.headers["Content-Type"]?.includes("text/csv") ? null : JSON.parse(response.body);
  return { status: response.statusCode, json, headers: response.headers, text: response.body };
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

async function bootstrap(call, extra = {}) {
  const response = await body(await call({
    body: { action: "bootstrap", setupSecret: "test-setup-secret", name: "Avery Cole", pin: "9753", ...extra },
  }));
  assert.equal(response.status, 200);
  return response.json;
}

test("seed lists use the printed side-work wording", () => {
  const roles = createSeedRoles();
  const byId = Object.fromEntries(roles.map((role) => [role.id, role]));
  const texts = (role) => role.sections.flatMap((section) => section.tasks.map((task) => task.text));
  assert.deepEqual(roles.map((role) => role.name), ["Server 1", "Server 2", "Server 3", "Host", "Busser"]);
  assert.equal(byId["server-1"].subtitle, "First Opener");
  assert.equal(byId["server-2"].subtitle, "Mid-Shift");
  assert.equal(byId["server-3"].subtitle, "Last In / Brunch Closer");
  assert.equal(byId.host.scheduleLabel, "Friday \u2013 Sunday");
  assert.deepEqual(byId.host.days, [0, 5, 6]);
  assert.deepEqual(byId.busser.days, [0, 5, 6]);
  assert.equal(texts(byId["server-1"])[0], "Turn on orange juice machine and fill dispenser.");
  assert.equal(texts(byId["server-2"])[1], "Complete primary restocking of cups, kids' cups, straws, to-go containers, and other supplies.");
  assert.equal(texts(byId["server-3"])[2], "Clean orange juice machine and dispenser.");
  assert.equal(texts(byId.host).at(-1), "Leave the host stand and entrance area clean and organized for the next shift.");
  assert.equal(texts(byId.busser)[4], "Sweep the hallway leading to the dish pit.");
  assert.equal(texts(byId["server-1"]).length + texts(byId["server-2"]).length + texts(byId["server-3"]).length + texts(byId.host).length + texts(byId.busser).length, 43);
});

test("Denver civil dates and weekday indexes", () => {
  assert.equal(denverDate(SUNDAY), "2026-11-22");
  assert.equal(denverTimeLabel("2026-11-22T18:05:00.000Z"), "11:05 AM");
  assert.equal(denverWeekdayIndex("2026-11-22"), 0);
  assert.equal(denverWeekdayIndex("2026-11-21"), 6);
  assert.equal(denverWeekdayIndex("2026-11-20"), 5);
});

test("PIN hashes verify and do not keep the PIN", async () => {
  const hashed = await hashSecret("1357");
  assert.equal(await verifySecret("1357", hashed), true);
  assert.equal(await verifySecret("1358", hashed), false);
  assert.equal(JSON.stringify(hashed).includes("1357"), false);
});

test("bootstrap requires the setup secret once and stores no plaintext secrets", async () => {
  const { call, store } = harness();
  const wrong = await body(await call({ body: { action: "bootstrap", setupSecret: "nope", name: "Avery Cole", pin: "9753" } }));
  assert.equal(wrong.status, 403);

  const created = await bootstrap(call);
  assert.equal(created.person.kind, "manager");
  const again = await body(await call({ body: { action: "bootstrap", setupSecret: "test-setup-secret", name: "Other", pin: "1111" } }));
  assert.equal(again.status, 409);

  const raw = store.dump();
  for (const secret of ["9753", "test-setup-secret", "test-pepper-value", "test-session-secret"]) {
    assert.equal(raw.includes(`"${secret}"`), false, secret);
  }
  assert.match(raw, /"hash":"[a-f0-9]{64}"/);
});

test("login cookie is HttpOnly and a tampered or expired session is rejected", async () => {
  const { call, clock } = harness();
  const created = await bootstrap(call);
  const me = await body(await call({ method: "GET", query: { action: "session" }, headers: auth(created.token) }));
  assert.equal(me.json.person.name, "Avery Cole");

  const logged = await body(await call({ body: { action: "login", pin: "9753" } }));
  assert.match(logged.headers["Set-Cookie"], /HttpOnly/);
  assert.match(logged.headers["Set-Cookie"], /SameSite=Lax/);
  assert.equal(logged.headers["Cache-Control"], "no-store");

  const [signed, sig] = logged.json.token.split(".");
  const flipped = `${signed}.${sig.slice(0, -1)}${sig.endsWith("a") ? "b" : "a"}`;
  const tampered = await body(await call({ method: "GET", query: { action: "roster" }, headers: auth(flipped) }));
  assert.equal(tampered.status, 401);

  clock.time = new Date(clock.time.getTime() + 13 * 60 * 60 * 1000);
  const expired = await body(await call({ method: "GET", query: { action: "session" }, headers: auth(logged.json.token) }));
  assert.equal(expired.status, 401);
});

test("repeated wrong PINs lock that guess without revealing whether it exists", async () => {
  const { call } = harness({
    limits: { credentialFails: 3, credentialLockMs: 30 * 60 * 1000, ipFails: 100, globalFails: 100 },
  });
  await bootstrap(call);
  await call({
    body: { action: "save-employee", name: "Maya Chen", pin: "1357" },
    headers: auth((await body(await call({ body: { action: "login", pin: "9753" } }))).json.token),
  });

  const manager = await body(await call({ body: { action: "login", pin: "9753" } }));
  assert.equal(manager.status, 200);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missed = await body(await call({ body: { action: "login", pin: "0000" }, ip: "203.0.113.9" }));
    assert.equal(missed.status, 401);
    assert.equal(missed.json.error, "That PIN or password wasn't recognized.");
  }
  const locked = await body(await call({ body: { action: "login", pin: "0000" }, ip: "203.0.113.10" }));
  assert.equal(locked.status, 429);
  assert.match(locked.json.error, /Too many tries/);
  assert.ok(locked.json.retryAfterSeconds > 0);

  const real = await body(await call({ body: { action: "login", pin: "1357" }, ip: "203.0.113.11" }));
  assert.equal(real.status, 200);
  assert.equal(real.json.person.name, "Maya Chen");
});

test("shared-network guessing trips the global lock", async () => {
  const { call } = harness({
    limits: { credentialFails: 20, ipFails: 20, globalFails: 3, globalLockMs: 15 * 60 * 1000 },
  });
  await bootstrap(call);
  for (const pin of ["1111", "2222"]) {
    const missed = await body(await call({ body: { action: "login", pin }, ip: `198.51.100.${pin[0]}` }));
    assert.equal(missed.status, 401);
  }
  const tripped = await body(await call({ body: { action: "login", pin: "3333" }, ip: "198.51.100.19" }));
  assert.equal(tripped.status, 429);
  const locked = await body(await call({ body: { action: "login", pin: "9753" }, ip: "198.51.100.20" }));
  assert.equal(locked.status, 429);
});

test("staff can claim a role and check-offs record who, what, and Denver time", async () => {
  const { call, store } = harness();
  const manager = await bootstrap(call);
  const saved = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-employee", name: "Maya Chen", pin: "1357" },
  }));
  assert.equal(saved.status, 200);
  const duplicate = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-employee", name: "Other Maya", pin: "1357" },
  }));
  assert.equal(duplicate.status, 409);

  const maya = await body(await call({ body: { action: "login", pin: "1357" } }));
  const before = await body(await call({ method: "GET", query: { action: "today" }, headers: auth(maya.json.token) }));
  assert.equal(before.json.openRoles[0].name, "Server 1");
  const claimed = await body(await call({
    headers: auth(maya.json.token),
    body: { action: "pick-role", roleId: "server-1" },
  }));
  assert.equal(claimed.json.checklist.name, "Server 1");
  assert.equal(claimed.json.checklist.sections[0].tasks[0].text, "Turn on orange juice machine and fill dispenser.");

  const checked = await body(await call({
    headers: auth(maya.json.token),
    body: { action: "toggle-task", taskId: "s1-open-1", checked: true },
  }));
  const task = checked.json.checklist.sections[0].tasks[0];
  assert.equal(task.done, true);
  assert.equal(task.employeeName, "Maya Chen");
  assert.equal(task.atLabel, "11:05 AM");
  assert.equal(checked.json.checklist.sections[0].tasks[1].done, false);

  const luis = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-employee", name: "Luis Ortiz", pin: "2580" },
  }));
  assert.equal(luis.status, 200);
  const luisLogin = await body(await call({ body: { action: "login", pin: "2580" } }));
  const stolen = await body(await call({
    headers: auth(luisLogin.json.token),
    body: { action: "pick-role", roleId: "server-1" },
  }));
  assert.equal(stolen.status, 409);
  const notMine = await body(await call({
    headers: auth(luisLogin.json.token),
    body: { action: "toggle-task", taskId: "s1-open-2", checked: true },
  }));
  assert.equal(notMine.status, 403);

  const report = await body(await call({
    method: "GET",
    query: { action: "report" },
    headers: auth(manager.token),
  }));
  const server = report.json.roles.find((role) => role.id === "server-1");
  assert.equal(server.assignee.employeeName, "Maya Chen");
  assert.equal(server.assignee.source, "self");
  assert.equal(server.sections[0].tasks[0].atLabel, "11:05 AM");
  assert.equal(server.sections[0].tasks[1].done, false);
  assert.ok(server.missed > 0);

  const cleared = await body(await call({
    headers: auth(maya.json.token),
    body: { action: "toggle-task", taskId: "s1-open-1", checked: false },
  }));
  assert.equal(cleared.json.checklist.sections[0].tasks[0].done, false);
  assert.match(store.dump(), /"type":"uncheck"/);

  const forbidden = await body(await call({
    method: "GET",
    query: { action: "report" },
    headers: auth(maya.json.token),
  }));
  assert.equal(forbidden.status, 403);
});

test("managers assign the shift, edit tasks, add roles, and export the day", async () => {
  const { call } = harness();
  const manager = await bootstrap(call);
  await call({ headers: auth(manager.token), body: { action: "save-employee", name: "Maya Chen", pin: "1357" } });
  await call({ headers: auth(manager.token), body: { action: "save-employee", name: "Luis Ortiz", pin: "2580" } });
  const roster = await body(await call({ method: "GET", query: { action: "roster" }, headers: auth(manager.token) }));
  const maya = roster.json.employees.find((person) => person.name === "Maya Chen");
  const luis = roster.json.employees.find((person) => person.name === "Luis Ortiz");

  let report = await body(await call({
    headers: auth(manager.token),
    body: { action: "assign", date: "2026-11-22", roleId: "server-1", employeeId: maya.id },
  }));
  assert.equal(report.json.roles.find((role) => role.id === "server-1").assignee.source, "manager");
  report = await body(await call({
    headers: auth(manager.token),
    body: { action: "assign", date: "2026-11-22", roleId: "server-2", employeeId: maya.id },
  }));
  assert.equal(report.json.roles.find((role) => role.id === "server-1").assignee, null);
  assert.equal(report.json.roles.find((role) => role.id === "server-2").assignee.employeeId, maya.id);

  await call({
    headers: auth(manager.token),
    body: { action: "assign", date: "2026-11-22", roleId: "server-1", employeeId: luis.id },
  });

  const roles = roster.json.roles.map((role) => role.id === "server-1"
    ? {
      ...role,
      sections: role.sections.map((section) => ({
        ...section,
        tasks: section.tasks.map((task) => task.id === "s1-open-1"
          ? { ...task, text: "Turn on the orange juice machine and fill the dispenser." }
          : task),
      })),
    }
    : role);
  const savedRole = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-role", role: roles[0] },
  }));
  assert.equal(savedRole.status, 200);
  assert.equal(
    savedRole.json.roles.find((role) => role.id === "server-1").sections[0].tasks[0].text,
    "Turn on the orange juice machine and fill the dispenser.",
  );

  const mayaLogin = await body(await call({ body: { action: "login", pin: "1357" } }));
  const today = await body(await call({ method: "GET", query: { action: "today" }, headers: auth(mayaLogin.json.token) }));
  assert.equal(today.json.checklist.name, "Server 2");
  assert.equal(today.json.openRoles.length, 0);

  const added = await body(await call({
    headers: auth(manager.token),
    body: {
      action: "save-role",
      name: "Line cook",
      subtitle: "Opening",
      scheduleLabel: "Every day",
      sections: [{ title: "Opening", tasks: [{ text: "Light the flat top." }] }],
    },
  }));
  assert.ok(added.json.roles.some((role) => role.name === "Line cook"));

  const csv = await call({
    method: "GET",
    query: { action: "report-csv", date: "2026-11-22" },
    headers: auth(manager.token),
  });
  assert.equal(csv.statusCode, 200);
  assert.match(csv.body, /Missed/);
  assert.match(csv.body, /Server 2 \(Mid-Shift\)/);
  assert.match(csv.body, /Time \(America\/Denver\)/);
  assert.match(csv.headers["Content-Disposition"], /side-work-2026-11-22\.csv/);
});

test("deactivated employees and old PINs cannot sign in, and the last manager stays", async () => {
  const { call } = harness();
  const manager = await bootstrap(call);
  const saved = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-employee", name: "Maya Chen", pin: "1357" },
  }));
  const maya = saved.json.employees[0];
  const mayaLogin = await body(await call({ body: { action: "login", pin: "1357" } }));
  await call({
    headers: auth(manager.token),
    body: { action: "save-employee", id: maya.id, name: "Maya Chen", pin: "2468" },
  });
  const oldPin = await body(await call({ body: { action: "login", pin: "1357" } }));
  assert.equal(oldPin.status, 401);
  const oldSession = await body(await call({ method: "GET", query: { action: "today" }, headers: auth(mayaLogin.json.token) }));
  assert.equal(oldSession.status, 401);
  const newPin = await body(await call({ body: { action: "login", pin: "2468" } }));
  assert.equal(newPin.status, 200);

  await call({
    headers: auth(manager.token),
    body: { action: "save-employee", id: maya.id, name: "Maya Chen", active: false },
  });
  const inactive = await body(await call({ body: { action: "login", pin: "2468" } }));
  assert.equal(inactive.status, 401);

  const removed = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-manager", id: manager.person.id, name: "Avery Cole", active: false },
  }));
  assert.equal(removed.status, 400);

  const password = await body(await call({
    headers: auth(manager.token),
    body: { action: "save-manager", name: "Jordan Hale", password: "correct horse battery" },
  }));
  assert.equal(password.status, 200);
  const jordan = await body(await call({ body: { action: "login", password: "correct horse battery" } }));
  assert.equal(jordan.status, 200);
  assert.equal(jordan.json.person.kind, "manager");
});

test("a short PIN still works when no pepper is configured", async () => {
  const { call } = harness({ env: { UK_STAFF_PIN_PEPPER: "" } });
  await bootstrap(call);
  const manager = await body(await call({ body: { action: "login", password: "" } }));
  assert.notEqual(manager.status, 200);
  const signedIn = await body(await call({ body: { action: "login", pin: "9753" } }));
  assert.equal(signedIn.status, 200);
  await call({ headers: auth(signedIn.json.token), body: { action: "save-employee", name: "Maya Chen", pin: "1357" } });
  const maya = await body(await call({ body: { action: "login", pin: "1357" } }));
  assert.equal(maya.status, 200);
});

test("Friday through Sunday roles stay available on a Wednesday", async () => {
  const { call } = harness({ now: "2026-11-18T18:00:00.000Z" });
  const manager = await bootstrap(call);
  await call({ headers: auth(manager.token), body: { action: "save-employee", name: "Jonah Blake", pin: "1470" } });
  const jonah = await body(await call({ body: { action: "login", pin: "1470" } }));
  const today = await body(await call({ method: "GET", query: { action: "today" }, headers: auth(jonah.json.token) }));
  const host = today.json.openRoles.find((role) => role.id === "host");
  assert.equal(host.offSchedule, true);
  const claimed = await body(await call({ headers: auth(jonah.json.token), body: { action: "pick-role", roleId: "host" } }));
  assert.equal(claimed.json.checklist.roleId, "host");
});

test("memory store compare-and-set rejects a stale etag", async () => {
  const store = createMemoryStore();
  const first = await store.compareAndSet("config/people", { people: [] }, undefined);
  assert.equal(first.modified, true);
  const stale = await store.compareAndSet("config/people", { people: [{ id: "x" }] }, undefined);
  assert.equal(stale.modified, false);
  const current = await store.getWithEtag("config/people");
  const wrote = await store.compareAndSet("config/people", { people: [{ id: "x" }] }, current.etag);
  assert.equal(wrote.modified, true);
  assert.deepEqual((await store.get("config/people")).people, [{ id: "x" }]);
});

test("setup stays closed until the environment variable exists", async () => {
  const { call } = harness({ env: { UK_STAFF_SETUP_SECRET: "" } });
  const status = await body(await call({ method: "GET", query: { action: "status" } }));
  assert.equal(status.json.needsBootstrap, true);
  assert.equal(status.json.setupConfigured, false);
  const attempt = await body(await call({
    body: { action: "bootstrap", setupSecret: "anything", name: "Avery Cole", pin: "9753" },
  }));
  assert.equal(attempt.status, 503);
});
