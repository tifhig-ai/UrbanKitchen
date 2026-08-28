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

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.classList.remove("is-error", "is-success");
    status.textContent = "Sending your request...";
    submit.disabled = true;

    const formData = new FormData(reservationForm);
    const payload = Object.fromEntries(formData.entries());

    try {
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
