const crypto = require("crypto");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const RESTAURANT_LOCATION = "Urban Kitchen, 425 S. North County, Suite D, Pleasant Grove, UT";
const RESTAURANT_TIME_ZONE = "America/Denver";
const RESERVATION_LEAD_TIMES_MS = {
  brunch: 2 * 60 * 60 * 1000,
  dinner: 1 * 60 * 60 * 1000,
};
const RESERVATION_WINDOWS = {
  brunch: {
    label: "Brunch",
    weekday: ["08:00", "13:30"],
    weekend: ["08:00", "14:30"],
  },
  dinner: {
    label: "Dinner",
    days: new Set([5, 6]),
    weekday: ["17:00", "20:30"],
    weekend: ["17:00", "20:30"],
  },
};

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

const parseDateParts = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    check.getUTCFullYear() !== parts[0] ||
    check.getUTCMonth() !== parts[1] - 1 ||
    check.getUTCDate() !== parts[2]
  ) {
    return null;
  }
  return parts;
};

const getDayOfWeek = (value) => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
};

const toMinutes = (time) => {
  const match = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
};

const isAllowedReservationTime = (service, date, time) => {
  const windowConfig = RESERVATION_WINDOWS[service];
  const day = getDayOfWeek(date);
  const requested = toMinutes(time);
  if (!windowConfig || day === null || requested === null) return false;
  if (windowConfig.days && !windowConfig.days.has(day)) return false;

  const [start, end] = day === 0 || day === 6 ? windowConfig.weekend : windowConfig.weekday;
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  return requested >= startMinutes && requested <= endMinutes && (requested - startMinutes) % 30 === 0;
};

const addMinutesToTime = (date, time, durationMinutes) => {
  const start = toMinutes(time);
  const end = start + durationMinutes;
  const hour = Math.floor(end / 60);
  const minute = end % 60;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
};

const getTimeZoneOffsetMinutes = (date, timeZone) => {
  const shortOffset = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(shortOffset || "");
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
};

const getZonedReservationDate = (date, time, timeZone) => {
  const parts = parseDateParts(date);
  const minutes = toMinutes(time);
  if (!parts || minutes === null) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const utcGuess = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
};

const getTodayInTimeZone = (timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

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
  const service = clean(input.service, 20).toLowerCase();
  const date = clean(input.date, 10);
  const time = clean(input.time, 5);
  const notes = clean(input.notes, 800);
  const partySize = Number.parseInt(input.partySize, 10);

  if (!name || !email || !phone || !parseDateParts(date) || !time || !service) {
    return jsonResponse(400, { error: "Please complete every required field." });
  }
  if (!isAllowedReservationTime(service, date, time)) {
    return jsonResponse(400, { error: "Please choose a reservation time within our current hours." });
  }
  const requestedDateTime = getZonedReservationDate(date, time, RESTAURANT_TIME_ZONE);
  if (service === "brunch" && date === getTodayInTimeZone(RESTAURANT_TIME_ZONE)) {
    return jsonResponse(400, { error: "Brunch reservations are not available for same-day requests right now." });
  }
  const minLeadMs = RESERVATION_LEAD_TIMES_MS[service] || RESERVATION_LEAD_TIMES_MS.brunch;
  const leadHours = Math.round(minLeadMs / (60 * 60 * 1000));
  if (!requestedDateTime || requestedDateTime.getTime() - Date.now() < minLeadMs) {
    return jsonResponse(400, {
      error: `Please choose a reservation time at least ${leadHours} hour${leadHours === 1 ? "" : "s"} from now.`,
    });
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
          service,
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

  const reservationLabel = RESERVATION_WINDOWS[service].label;
  const startDateTime = `${date}T${time}:00`;
  const endDateTime = addMinutesToTime(date, time, 90);
  const description = [
    "PENDING - Staff confirmation required",
    "",
    `Service: ${reservationLabel}`,
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
          summary: `PENDING - ${reservationLabel} - ${name} - Party of ${partySize}`,
          description,
          location: RESTAURANT_LOCATION,
          start: { dateTime: startDateTime, timeZone: RESTAURANT_TIME_ZONE },
          end: { dateTime: endDateTime, timeZone: RESTAURANT_TIME_ZONE },
          transparency: "opaque",
          visibility: "private",
          extendedProperties: {
            private: { reservationStatus: "pending", service, source: "standard-reservations" },
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
