import assert from "node:assert/strict";
import test from "node:test";

import { createFormSubmittedHandler } from "../netlify/functions/reservation-form-events.mjs";
import reservations from "../netlify/functions/reservations.js";

test("ignores non-reservation forms", async () => {
  let calls = 0;
  const handler = createFormSubmittedHandler(async () => {
    calls += 1;
    return { statusCode: 200, body: JSON.stringify({ calendarSynced: true }) };
  });

  await handler({ data: { "form-name": "urban-kitchen-careers" } });
  assert.equal(calls, 0);
});

test("syncs current and legacy reservation forms", async () => {
  const formNames = ["urban-kitchen-reservations", "urban-kitchen-dinner-reservations"];
  const seen = [];
  const handler = createFormSubmittedHandler(async (event) => {
    seen.push(JSON.parse(event.body)["form-name"]);
    return {
      statusCode: 200,
      body: JSON.stringify({ calendarSynced: true, requestId: "calendar-event" }),
    };
  });

  for (const formName of formNames) {
    await handler({ data: { "form-name": formName } });
  }

  assert.deepEqual(seen, formNames);
});

test("raises an error when a verified reservation does not reach the calendar", async () => {
  const handler = createFormSubmittedHandler(async () => ({
    statusCode: 502,
    body: JSON.stringify({ error: "calendar unavailable" }),
  }));

  await assert.rejects(
    handler({ data: { "form-name": "urban-kitchen-reservations" } }),
    /not synced/
  );
});

test("calendar event IDs are stable and Google-compatible", () => {
  const input = {
    name: "Guest Name",
    email: "guest@example.com",
    phone: "801-555-0100",
    service: "brunch",
    date: "2026-09-12",
    time: "10:00",
  };

  const first = reservations.createCalendarEventId(input, "request-123");
  const second = reservations.createCalendarEventId(input, "request-123");

  assert.equal(first, second);
  assert.match(first, /^[a-v0-9]{5,1024}$/);
});
