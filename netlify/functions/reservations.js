const crypto = require("crypto");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const ALLOWED_DATES = new Set(["2026-08-28", "2026-08-29"]);
const ALLOWED_TIMES = new Set(["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"]);
const RESTAURANT_LOCATION = "Urban Kitchen, 425 S. North County, Suite D, Pleasant Grove, UT";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const base64url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const clean = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

const getAccessToken = async (serviceAccountEmail, privateKey) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: GOOGLE_CALENDAR_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claims}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Google Calendar authentication failed.");
  }
  return data.access_token;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid request." });
  }

  if (clean(input.website, 40)) {
    return jsonResponse(200, { ok: true });
  }

  const name = clean(input.name, 80);
  const email = clean(input.email, 120);
  const phone = clean(input.phone, 30);
  const date = clean(input.date, 10);
  const time = clean(input.time, 5);
  const notes = clean(input.notes, 800);
  const partySize = Number.parseInt(input.partySize, 10);

  if (!name || !email || !phone || !ALLOWED_DATES.has(date) || !ALLOWED_TIMES.has(time)) {
    return jsonResponse(400, { error: "Please complete every required field." });
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 16) {
    return jsonResponse(400, { error: "Please choose a valid party size." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: "Please enter a valid email address." });
  }
  if (input.requestAcknowledged !== "yes") {
    return jsonResponse(400, { error: "Please acknowledge that your request is pending confirmation." });
  }

  const webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  const webhookSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;

  if (webhookUrl && webhookSecret) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: webhookSecret,
          name,
          email,
          phone,
          date,
          time,
          notes,
          partySize,
          source: "urbankitchen-pg.com/reservations",
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok || !result.eventId) {
        throw new Error(result.error || `Calendar webhook returned ${response.status}.`);
      }

      return jsonResponse(200, {
        ok: true,
        calendarSynced: true,
        requestId: result.eventId,
      });
    } catch (error) {
      console.error("Reservation calendar webhook error", error);
      return jsonResponse(502, { error: "Your request could not be added to the reservation calendar." });
    }
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!calendarId || !serviceAccountEmail || !privateKey) {
    return jsonResponse(202, { ok: true, calendarSynced: false });
  }

  const start = new Date(`${date}T${time}:00-06:00`);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  const description = [
    "PENDING - Staff confirmation required",
    "",
    `Guest: ${name}`,
    `Party size: ${partySize}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Requested: ${date} at ${time}`,
    notes ? `Notes: ${notes}` : "Notes: None",
    "",
    "Submitted through urbankitchen-pg.com/reservations",
  ].join("\n");

  try {
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `PENDING - ${name} - Party of ${partySize}`,
          description,
          location: RESTAURANT_LOCATION,
          start: { dateTime: start.toISOString(), timeZone: "America/Denver" },
          end: { dateTime: end.toISOString(), timeZone: "America/Denver" },
          transparency: "opaque",
          visibility: "private",
          extendedProperties: {
            private: { reservationStatus: "pending", source: "dinner-soft-open-2026" },
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google Calendar returned ${response.status}.`);
    }
    const created = await response.json();
    return jsonResponse(200, { ok: true, calendarSynced: true, requestId: created.id });
  } catch (error) {
    console.error("Reservation calendar error", error);
    return jsonResponse(502, { error: "Your request could not be added to the reservation calendar." });
  }
};
