const header = document.querySelector("[data-header]");
const nav = document.querySelector(".primary-nav");
const navToggle = document.querySelector(".nav-toggle");
const tabs = document.querySelectorAll("[data-menu-tab]");
const panels = document.querySelectorAll("[data-menu-panel]");
const year = document.querySelector("[data-year]");
const isSubpage = Boolean(document.querySelector(".subpage"));

const setHeaderState = () => {
  header.classList.toggle("is-scrolled", isSubpage || window.scrollY > 24);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (year) {
  year.textContent = new Date().getFullYear();
}

navToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  document.body.classList.toggle("nav-open", isOpen);
  header.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

nav.addEventListener("click", (event) => {
  const target = event.target.closest("a");
  if (!target) return;

  nav.classList.remove("is-open");
  document.body.classList.remove("nav-open");
  header.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const category = tab.dataset.menuTab;

    tabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.menuPanel === category);
    });
  });
});

const revealItems = document.querySelectorAll(".reveal");
const feedbackForm = document.querySelector("[data-feedback-form]");
const googleReviewsWidget = document.querySelector("[data-google-reviews-widget]");
const reelVideos = document.querySelectorAll("[data-reel-video]");
const reservationForm = document.querySelector("[data-reservation-form]");
const careerSuccess = document.querySelector("[data-career-success]");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

if (feedbackForm) {
  const phoneInput = feedbackForm.querySelector("[data-phone-input]");
  const smsConsent = feedbackForm.querySelector("[data-sms-consent]");
  const formError = feedbackForm.querySelector("[data-form-error]");

  feedbackForm.addEventListener("submit", (event) => {
    const hasPhone = phoneInput.value.trim().length > 0;
    const hasConsent = smsConsent.checked;

    if (hasPhone && !hasConsent) {
      event.preventDefault();
      formError.hidden = false;
      smsConsent.focus();
      return;
    }

    formError.hidden = true;
  });
}

if (reelVideos.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { rootMargin: "180px 0px", threshold: 0.18 }
    );

    reelVideos.forEach((video) => videoObserver.observe(video));
  } else {
    reelVideos.forEach((video) => video.play().catch(() => {}));
  }
}

if (reservationForm) {
  const status = reservationForm.querySelector("[data-reservation-status]");
  const submit = reservationForm.querySelector('button[type="submit"]');
  const serviceInput = reservationForm.querySelector("[data-reservation-service]");
  const dateInput = reservationForm.querySelector("[data-reservation-date]");
  const timeInput = reservationForm.querySelector("[data-reservation-time]");
  const timeHelp = reservationForm.querySelector("[data-reservation-time-help]");
  const reservationMinLeadMs = 2 * 60 * 60 * 1000;

  const reservationWindows = {
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

  const parseDateParts = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    return match.slice(1).map(Number);
  };

  const getLocalDateString = (date = new Date()) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const getDayOfWeek = (value) => {
    const parts = parseDateParts(value);
    if (!parts) return null;
    const [yearValue, monthValue, dayValue] = parts;
    return new Date(Date.UTC(yearValue, monthValue - 1, dayValue)).getUTCDay();
  };

  const getReservationDateTime = (date, time) => {
    const parts = parseDateParts(date);
    if (!parts || !time) return null;
    const [hourValue, minuteValue] = time.split(":").map(Number);
    if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], hourValue, minuteValue);
  };

  const formatTimeLabel = (time) => {
    const [hourValue, minuteValue] = time.split(":").map(Number);
    const suffix = hourValue >= 12 ? "PM" : "AM";
    const hour = hourValue % 12 || 12;
    return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
  };

  const buildTimes = (start, end) => {
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const times = [];
    for (let minutes = startHour * 60 + startMinute; minutes <= endHour * 60 + endMinute; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      times.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
    return times;
  };

  const setReservationTimeOptions = () => {
    if (!serviceInput || !dateInput || !timeInput) return;

    const service = serviceInput.value;
    const dateValue = dateInput.value;
    const day = getDayOfWeek(dateValue);
    const windowConfig = reservationWindows[service];

    timeInput.innerHTML = '<option value="">Choose a time</option>';

    if (!windowConfig || day === null) {
      timeInput.disabled = true;
      if (timeHelp) timeHelp.textContent = "Choose brunch or dinner and a date to see available request times.";
      return;
    }

    if (windowConfig.days && !windowConfig.days.has(day)) {
      timeInput.disabled = true;
      if (timeHelp) timeHelp.textContent = "Dinner reservations are currently available Friday and Saturday only.";
      return;
    }

    if (service === "brunch" && dateValue === getLocalDateString()) {
      timeInput.disabled = true;
      if (timeHelp) timeHelp.textContent = "Brunch reservations are not available for same-day requests right now. Please choose a future date.";
      return;
    }

    const [start, end] = day === 0 || day === 6 ? windowConfig.weekend : windowConfig.weekday;
    const availableTimes = buildTimes(start, end).filter((time) => {
      const reservationDateTime = getReservationDateTime(dateValue, time);
      return reservationDateTime && reservationDateTime.getTime() - Date.now() >= reservationMinLeadMs;
    });

    availableTimes.forEach((time) => {
      const option = document.createElement("option");
      option.value = time;
      option.textContent = formatTimeLabel(time);
      timeInput.append(option);
    });
    timeInput.disabled = availableTimes.length === 0;
    if (timeHelp) {
      timeHelp.textContent = availableTimes.length
        ? `${windowConfig.label} reservation requests are available from ${formatTimeLabel(start)} to ${formatTimeLabel(end)}. Please request at least 2 hours ahead.`
        : "No reservation times are available for that service and date with at least 2 hours notice.";
    }
  };

  if (dateInput) {
    dateInput.min = getLocalDateString();
  }

  serviceInput?.addEventListener("change", setReservationTimeOptions);
  dateInput?.addEventListener("change", setReservationTimeOptions);
  setReservationTimeOptions();

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("is-error", "is-success");
    status.textContent = "Sending your request...";
    submit.disabled = true;

    const formData = new FormData(reservationForm);
    const payload = Object.fromEntries(formData.entries());
    const requestedDateTime = getReservationDateTime(payload.date, payload.time);

    try {
      if (payload.service === "brunch" && payload.date === getLocalDateString()) {
        throw new Error("Brunch reservations are not available for same-day requests right now.");
      }

      if (!requestedDateTime || requestedDateTime.getTime() - Date.now() < reservationMinLeadMs) {
        throw new Error("Please choose a reservation time at least 2 hours from now.");
      }

      const storedResponse = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString(),
      });

      if (!storedResponse.ok) {
        throw new Error("We could not save your request.");
      }

      const calendarResponse = await fetch("/.netlify/functions/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (calendarResponse && !calendarResponse.ok) {
        console.warn("Reservation saved, but calendar sync is pending.");
      }

      reservationForm.reset();
      status.classList.add("is-success");
      status.textContent = "Request received. Our team will contact you to confirm your table.";
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = `${error.message} Please call 801-406-2010 if you need help.`;
    } finally {
      submit.disabled = false;
    }
  });
}

if (careerSuccess && new URLSearchParams(window.location.search).get("submitted") === "1") {
  careerSuccess.hidden = false;
  careerSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
}

if (googleReviewsWidget) {
  const reviewsList = googleReviewsWidget.querySelector("[data-reviews-list]");
  const emptyState = googleReviewsWidget.querySelector("[data-reviews-empty]");
  const rating = googleReviewsWidget.querySelector("[data-reviews-rating]");
  const count = googleReviewsWidget.querySelector("[data-reviews-count]");
  const reviewsLink = googleReviewsWidget.querySelector("[data-reviews-link]");

  const renderStars = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Google Reviews";
    return `${numeric.toFixed(1)} ★`;
  };

  const fetchReviews = () =>
    fetch("/.netlify/functions/google-reviews")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && data.configured !== false) return data;
        return fetch("data/google-reviews.json").then((response) => (response.ok ? response.json() : null));
      })
      .catch(() =>
        fetch("data/google-reviews.json").then((response) => (response.ok ? response.json() : null))
      );

  fetchReviews()
    .then((data) => {
      if (!data) return;

      const reviews = Array.isArray(data.reviews) ? data.reviews.slice(0, 3) : [];

      if (data.profileUrl && reviewsLink) {
        reviewsLink.href = data.profileUrl;
      }

      if (data.rating) {
        rating.textContent = renderStars(data.rating);
      }

      if (data.reviewCount) {
        count.textContent = `${data.reviewCount} Google reviews from Urban Kitchen guests.`;
      }

      if (!reviews.length) return;

      reviewsList.textContent = "";
      reviews.forEach((review) => {
        const card = document.createElement("article");
        const stars = document.createElement("span");
        const quote = document.createElement("blockquote");
        const author = document.createElement("cite");

        card.className = "review-card";
        stars.textContent = renderStars(review.rating);
        quote.textContent = review.text;
        author.textContent = review.author;

        card.append(stars, quote, author);
        reviewsList.append(card);
      });

      emptyState.hidden = true;
    })
    .catch(() => {});
}
