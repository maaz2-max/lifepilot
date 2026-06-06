function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function readQuery(req) {
  const url = new URL(req.url, "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

async function resolveCoordinates({ location, latitude, longitude }) {
  if (latitude && longitude) {
    return {
      location: location || "Current location",
      latitude,
      longitude
    };
  }

  if (!location) throw new Error("Weather location missing");
  const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
  if (!geoResponse.ok) throw new Error("Location lookup failed");
  const geo = await geoResponse.json();
  const match = geo.results?.[0];
  if (!match) throw new Error("Location not found");
  return {
    location: [match.name, match.admin1, match.country].filter(Boolean).join(", "),
    latitude: match.latitude,
    longitude: match.longitude
  };
}

export async function handleWeatherRequest(req, res) {
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const query = readQuery(req);
    const coords = await resolveCoordinates(query);
    const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto`);
    if (!weatherResponse.ok) throw new Error("Weather service failed");
    const weather = await weatherResponse.json();
    if (!weather.current) throw new Error("Weather unavailable");
    jsonResponse(res, 200, {
      ...coords,
      current: weather.current,
      serverTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "Weather update failed" });
  }
}
