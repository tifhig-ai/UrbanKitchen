const GOOGLE_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

const jsonResponse = (statusCode, body, cacheSeconds = 0) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheSeconds
      ? `public, max-age=300, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
      : "no-store",
  },
  body: JSON.stringify(body),
});

exports.handler = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return jsonResponse(200, {
      source: "Google",
      profileUrl: "https://www.google.com/search?q=Urban+Kitchen+Pleasant+Grove+reviews",
      rating: null,
      reviewCount: null,
      reviews: [],
      configured: false,
    });
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,rating,user_ratings_total,url,reviews",
    reviews_sort: "newest",
    key: apiKey,
  });

  try {
    const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}?${params}`);
    const data = await response.json();

    if (!response.ok || data.status !== "OK") {
      return jsonResponse(502, {
        error: "Google reviews are temporarily unavailable.",
        status: data.status,
      });
    }

    const result = data.result || {};
    const reviews = Array.isArray(result.reviews)
      ? result.reviews.map((review) => ({
          author: review.author_name,
          rating: review.rating,
          text: review.text,
          profilePhoto: review.profile_photo_url,
          relativeTime: review.relative_time_description,
        }))
      : [];

    return jsonResponse(
      200,
      {
        source: "Google",
        profileUrl:
          result.url || "https://www.google.com/search?q=Urban+Kitchen+Pleasant+Grove+reviews",
        rating: result.rating || null,
        reviewCount: result.user_ratings_total || null,
        reviews,
        configured: true,
      },
      21600
    );
  } catch (error) {
    return jsonResponse(500, {
      error: "Google reviews are temporarily unavailable.",
    });
  }
};
