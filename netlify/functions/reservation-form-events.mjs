import reservations from "./reservations.js";

const RESERVATION_FORM_NAMES = new Set([
  "urban-kitchen-reservations",
  "urban-kitchen-dinner-reservations",
]);

const getFormName = (data = {}) => String(
  data["form-name"] || data.formName || data.form_name || ""
).trim();

export const createFormSubmittedHandler = (reservationHandler = reservations.handler) => async (event) => {
  const data = event?.data || {};
  const formName = getFormName(data);

  if (!RESERVATION_FORM_NAMES.has(formName)) return;

  const response = await reservationHandler({
    httpMethod: "POST",
    body: JSON.stringify(data),
  });
  const result = JSON.parse(response.body || "{}");

  if (response.statusCode < 200 || response.statusCode >= 300 || !result.calendarSynced) {
    console.error(JSON.stringify({
      event: "reservation-calendar-sync-failed",
      formName,
      statusCode: response.statusCode,
      reservationRequestId: data.reservationRequestId || null,
    }));
    throw new Error("Verified reservation submission was not synced to Google Calendar.");
  }

  console.log(JSON.stringify({
    event: "reservation-calendar-sync-succeeded",
    formName,
    calendarEventId: result.requestId,
    duplicatePrevented: Boolean(result.duplicatePrevented),
  }));
};

export default {
  formSubmitted: createFormSubmittedHandler(),
};
