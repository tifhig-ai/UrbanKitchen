import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryStore, handleStaffRequest } from "../netlify/functions/lib/staff-portal.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const store = createMemoryStore();
const env = {
  UK_STAFF_SETUP_SECRET: "demo-setup-secret",
  UK_STAFF_PIN_PEPPER: "demo-pepper",
  UK_STAFF_SESSION_SECRET: "demo-session-secret",
};

const DEMO = {
  manager: { name: "Avery Cole", pin: "9753" },
  employees: [
    { name: "Maya Chen", pin: "1357", roleId: "server-1", tasks: ["s1-open-1"] },
    { name: "Luis Ortiz", pin: "2580", roleId: "server-2", tasks: [] },
    { name: "Priya Shah", pin: "3691", roleId: "server-3", tasks: [] },
    { name: "Jonah Blake", pin: "1470", roleId: "host", tasks: ["host-open-1", "host-open-2"] },
    { name: "Elena Vasquez", pin: "3692", roleId: null, tasks: [] },
  ],
};

async function call(options) {
  const response = await handleStaffRequest({
    store,
    env,
    now: () => new Date(),
    ip: "127.0.0.1",
    method: options.method || "POST",
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
  });
  const json = response.headers["Content-Type"]?.includes("json") ? JSON.parse(response.body) : null;
  if (response.statusCode >= 400) {
    throw new Error(json?.error || `Demo setup failed (${response.statusCode})`);
  }
  return json;
}

async function seed() {
  const manager = await call({
    body: { action: "bootstrap", setupSecret: env.UK_STAFF_SETUP_SECRET, name: DEMO.manager.name, pin: DEMO.manager.pin },
  });
  const headers = { authorization: `Bearer ${manager.token}` };
  for (const employee of DEMO.employees) {
    const saved = await call({ headers, body: { action: "save-employee", name: employee.name, pin: employee.pin } });
    const record = saved.employees.find((person) => person.name === employee.name);
    if (!employee.roleId) continue;
    await call({
      headers,
      body: { action: "assign", roleId: employee.roleId, employeeId: record.id },
    });
    if (!employee.tasks.length) continue;
    const signedIn = await call({ body: { action: "login", pin: employee.pin } });
    for (const taskId of employee.tasks) {
      await call({
        headers: { authorization: `Bearer ${signedIn.token}` },
        body: { action: "toggle-task", taskId, checked: true },
      });
    }
  }
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function staticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded.includes("\0") || decoded.includes("..")) return null;
  const relative = decoded.replace(/^\/+/, "");
  const candidates = relative.endsWith("/") || relative === ""
    ? [path.join(relative, "index.html")]
    : [relative, `${relative}.html`, path.join(relative, "index.html")];
  for (const candidate of candidates) {
    const full = path.resolve(root, candidate);
    if (!full.startsWith(`${root}${path.sep}`) && full !== root) return null;
    const blocked = ["node_modules", ".git", ".netlify", ".env"];
    if (blocked.some((part) => full.includes(`${path.sep}${part}`) || full.endsWith(`${path.sep}${part}`))) return null;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function send(res, status, payload, headers = {}) {
  res.writeHead(status, headers);
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/.netlify/functions/staff") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { return send(res, 400, JSON.stringify({ error: "The request could not be read." }), { "Content-Type": "application/json" }); }
    }
    const result = await handleStaffRequest({
      store,
      env,
      now: () => new Date(),
      ip: "127.0.0.1",
      method: req.method,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
    });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
    return;
  }

  const file = staticPath(url.pathname);
  if (!file) return send(res, 404, "Not found");
  send(res, 200, fs.readFileSync(file), { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
});

await seed();
server.listen(port, "127.0.0.1", () => {
  console.log(`Staff demo at http://127.0.0.1:${port}/staff`);
  console.log(`Manager ${DEMO.manager.name} PIN ${DEMO.manager.pin}`);
  for (const employee of DEMO.employees) console.log(`${employee.name} PIN ${employee.pin}`);
});
