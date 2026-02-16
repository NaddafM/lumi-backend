import { Env } from "../config/env";

export type WeatherSnapshot = {
  summary: string | null;
  temperatureC: number | null;
  isDay: boolean | null;
  source: "open-meteo" | "none";
};

function codeToConditionLabel(weatherCode: number): string {
  if (weatherCode === 0) return "clear";
  if ([1, 2, 3].includes(weatherCode)) return "partly cloudy";
  if ([45, 48].includes(weatherCode)) return "fog";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "drizzle";
  if ([61, 63, 65, 66, 67].includes(weatherCode)) return "rain";
  if ([71, 73, 75, 77].includes(weatherCode)) return "snow";
  if ([80, 81, 82].includes(weatherCode)) return "rain showers";
  if ([95, 96, 99].includes(weatherCode)) return "thunderstorm";
  return "unknown conditions";
}

export async function getWeatherForNow(args: {
  env: Env;
  lat?: number;
  lng?: number;
}): Promise<WeatherSnapshot> {
  const { env, lat, lng } = args;

  if (!env.WEATHER_ENABLED || typeof lat !== "number" || typeof lng !== "number") {
    return { summary: null, temperatureC: null, isDay: null, source: "none" };
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day,precipitation");
  url.searchParams.set("timezone", env.WEATHER_TIMEZONE);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    return { summary: null, temperatureC: null, isDay: null, source: "none" };
  }

  const json: any = await res.json();
  const current = json?.current;
  if (!current) {
    return { summary: null, temperatureC: null, isDay: null, source: "none" };
  }

  const temperatureC = typeof current.temperature_2m === "number" ? current.temperature_2m : null;
  const weatherCode = typeof current.weather_code === "number" ? current.weather_code : null;
  const isDay = typeof current.is_day === "number" ? current.is_day === 1 : null;
  const precipitation = typeof current.precipitation === "number" ? current.precipitation : null;

  const condition = weatherCode !== null ? codeToConditionLabel(weatherCode) : "unknown conditions";
  const precipText =
    precipitation !== null && precipitation > 0 ? `, precipitation likely` : "";

  const summary =
    temperatureC !== null
      ? `${condition}${precipText}, temperature about ${Math.round(temperatureC)}°C`
      : `${condition}${precipText}`;

  return { summary, temperatureC, isDay, source: "open-meteo" };
}
