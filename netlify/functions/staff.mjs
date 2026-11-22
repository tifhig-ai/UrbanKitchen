import { handleStaffRequest } from "./lib/staff-portal.mjs";
import { createNetlifyStaffStore } from "./lib/staff-blobs.mjs";

// Prefer the Netlify runtime helper. process.env covers local Node, tests, and
// the values Netlify still injects when Netlify.env is absent.
function readEnv(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env && typeof Netlify.env.get === "function") {
      const value = Netlify.env.get(name);
      if (value != null && String(value).trim()) return String(value).trim();
    }
  } catch {
    // Outside the Netlify runtime.
  }
  const fallback = process.env[name];
  return fallback && String(fallback).trim() ? String(fallback).trim() : "";
}

function clientIp(request) {
  return request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async (request) => {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") return jsonError(405, "That action is not available.");
  if (method === "POST") {
    if (!sameOrigin(request)) return jsonError(403, "Open the staff page on this site and try again.");
    const type = request.headers.get("content-type") || "";
    if (!type.includes("application/json")) return jsonError(415, "Send the staff request as JSON.");
  }

  let body = {};
  if (method === "POST") {
    const text = await request.text();
    if (text.length > 100000) return jsonError(413, "That update is too large.");
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return jsonError(400, "The request could not be read.");
      }
    }
  }

  const url = new URL(request.url);
  let store;
  try {
    store = createNetlifyStaffStore();
  } catch (error) {
    console.error("Staff storage is unavailable", error);
    return jsonError(500, "Staff storage is not available on this deploy.");
  }

  try {
    const result = await handleStaffRequest({
      store,
      method,
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      ip: clientIp(request),
      now: () => new Date(),
      env: {
        UK_STAFF_SETUP_SECRET: readEnv("UK_STAFF_SETUP_SECRET"),
        UK_STAFF_PIN_PEPPER: readEnv("UK_STAFF_PIN_PEPPER"),
        UK_STAFF_SESSION_SECRET: readEnv("UK_STAFF_SESSION_SECRET"),
      },
    });
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  } catch (error) {
    console.error("Staff portal error", error);
    return jsonError(500, "Something went wrong. Try again.");
  }
};
