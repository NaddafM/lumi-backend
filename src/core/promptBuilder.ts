import { Env } from "../config/env";
import { formatNYCDateTime } from "../utils/time";
import { LightingSummary } from "./lightingData";

export type BuiltPrompt = {
  system: string;
  user: string;
  finalPromptForLogging: string;
};
export type AgeRange =
  | { kind: "range"; min: number; max: number }
  | { kind: "plus"; min: number }
  | { kind: "unspecified" };


export type PromptContext = {
  ntaName: string;
  lighting?: LightingSummary;

  ageRange?: AgeRange;
  userGender?: string | null;

  visitWith?: "alone" | "family" | "friends" | "date";
  cautiousness?: "relaxed" | "balanced" | "cautious";

  userPoiDescription?: string;

  socioeconomicLevel?: string;

  requestedPoiCount?: number;
  userLat?: number;
  userLng?: number;

  // NEW safety signals
  crimeCount1km?: number | null;          // computed by your backend, may be null if unknown
  weatherSummary?: string | null;         // "cold and rainy", "clear", etc
  isHolidayOrSpecialDay?: boolean | null; // client or backend can pass
  holidayName?: string | null;            // "New Year's Day", "NYC Marathon", etc
};

function inferIntendedVisitPeriod(userText: string): "day" | "night" | "unspecified" {
  const t = userText.toLowerCase();
  if (/\b(night|tonight|evening|after dark|late)\b/.test(t)) return "night";
  if (/\b(morning|afternoon|daytime|during the day)\b/.test(t)) return "day";
  return "unspecified";
}

function formatAgeRange(ageRange?: AgeRange | null): string | null {
  if (!ageRange) return null;

  switch (ageRange.kind) {
    case "range":
      return `${ageRange.min}-${ageRange.max}`;
    case "plus":
      return `${ageRange.min}+`;
    case "unspecified":
      return "prefer not to say";
  }
}

export function buildPrompt(args: {
  env: Env;
  userText: string;
  ctx: PromptContext;
}): BuiltPrompt {
  const now = new Date();
  const nyc = formatNYCDateTime(now);
  const intendedVisitPeriod = inferIntendedVisitPeriod(args.userText);

  const defaultPoiCount = 5;
  const poiCount = Number.isFinite(args.ctx.requestedPoiCount)
    ? Math.max(1, Math.min(20, args.ctx.requestedPoiCount as number))
    : defaultPoiCount;

  const cautiousness = args.ctx.cautiousness ?? "balanced";

  const safetyRubric =
    cautiousness === "cautious"
      ? "Cautious mode: label as green only if conditions strongly suggest safety; otherwise prefer yellow; use red if any notable risk indicators exist."
      : cautiousness === "relaxed"
        ? "Relaxed mode: you may label as green when conditions seem generally safe; reserve red for clear high-risk indicators; yellow for mixed signals."
        : "Balanced mode: use green for clearly safe, yellow for mixed/uncertain, red for clear risks, unknown only when data is insufficient.";

  const systemPrompt =
  "You are a safety-aware local guide assistant for New York City.\n" +
  "Return ONLY a valid JSON array. Do NOT include markdown, code fences, commentary, or extra keys.\n" +
  "Default behavior: recommend the nearest relevant 5 POIs unless the user explicitly requests a different count, maximum 20.\n" +
  "If exact distances are not available, approximate nearness within the selected neighborhood.\n" +
  "\n" +
  "Safety must be determined using multiple factors together, not in isolation.\n" +
  "For every POI you MUST explicitly address ALL of the following factors in the output: time of day, day of week, day or night, lighting, crime within about 1 km (if provided), weather, and holiday or special day status.\n" +
  "You must include a safetyFactors object containing these factors for every POI.\n" +
  "\n" +
  "Data constraints:\n" +
  "- You MUST NOT invent numeric crime rates or claim precise statistics.\n" +
  "- If crimeCount1km is provided, you may use it qualitatively as lower or higher risk.\n" +
  "- If a factor is missing, state it clearly and be conservative in the safetyLevel.\n"
  "\n" +
  "Time handling rule:\n" +
  "- The context includes the current NYC time and an intendedVisitPeriod derived from the user request.\n" +
  "- If intendedVisitPeriod is \"night\" or \"day\", you MUST evaluate safety as if the visit happens in that period, even if the current time is different.\n" +
  "- Only use the current time for interpreting weather recency and holiday status.\n" +
  "\n";

  const contextObject = {
    time: {
      nycDate: nyc.date,
      nycTime: nyc.time,
      currentDayOrNight: nyc.isNight ? "night" : "day",
      intendedVisitPeriod,
      dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" }),
      isWeekend: ["Saturday", "Sunday"].includes(
        now.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" })
      )
    },
    location: {
      ntaName: args.ctx.ntaName,
      note: "Neighborhood was chosen by the client. Assume POIs are within or near this neighborhood."
    },
    user: {
      ageRange: formatAgeRange(args.ctx.ageRange),
      gender: args.ctx.userGender ?? null,
      visitWith: args.ctx.visitWith ?? null,
      cautiousness
    },
    preferences: {
      poiDescription: args.ctx.userPoiDescription ?? null
    },
    socioeconomic: {
      level: args.ctx.socioeconomicLevel ?? null,
      note: "If provided, use it as one factor in safety and suitability."
    },
    lighting: args.ctx.lighting
      ? {
          streetLightCount: args.ctx.lighting.streetLightCount,
          areaKm2: args.ctx.lighting.areaKm2,
          lightsPerKm2: args.ctx.lighting.lightsPerKm2,
          lightingBand: args.ctx.lighting.lightingBand,
          interpretation: "Higher lightsPerKm2 and higher lightingBand generally imply better lighting at night."
        }
      : { available: false },
    safetySignals: {
      crimeCount1km: typeof args.ctx.crimeCount1km === "number" ? args.ctx.crimeCount1km : null,
      crimeNote:
        typeof args.ctx.crimeCount1km === "number"
          ? "crimeCount1km is a computed count within about 1 km for a recent lookback window. Use it qualitatively as a risk signal, do not invent other statistics."
          : "crimeCount1km is unavailable. Do not claim quantitative crime levels, be conservative.",

      weatherSummary: args.ctx.weatherSummary ?? null,
      weatherNote:
        args.ctx.weatherSummary
          ? "weatherSummary is measured from a weather API for the current time and location."
          : "weatherSummary is unavailable. You may infer seasonally typical conditions from the date, label it as an estimate.",

      isHolidayOrSpecialDay: args.ctx.isHolidayOrSpecialDay ?? null,
      holidayName: args.ctx.holidayName ?? null,
      holidayNote:
        args.ctx.isHolidayOrSpecialDay === true
          ? "Today is a holiday or special day, which can affect crowds and policing."
          : args.ctx.isHolidayOrSpecialDay === false
            ? "Today is not a public holiday."
            : "Holiday status is unknown, state uncertainty if it affects safety reasoning."
    },

    userLocation: {
      lat: typeof args.ctx.userLat === "number" ? args.ctx.userLat : null,
      lng: typeof args.ctx.userLng === "number" ? args.ctx.userLng : null,
      note: "If provided, treat this as the user's current location and keep POIs close to these coordinates."
    }
  };


  const outputSchemaText =
  `Return a JSON array with exactly ${poiCount} objects.\n` +
  `Each object must match this schema exactly:\n` +
  `{\n` +
  `  "name": string,\n` +
  `  "category": string,\n` +
  `  "lat": number,\n` +
  `  "lng": number,\n` +
  `  "safetyLevel": "green" | "yellow" | "red" | "unknown",\n` +
  `  "safetyFactors": {\n` +
  `    "currentTime": string,\n` +
  `    "intendedVisitPeriod": string,\n` +
  `    "dayOfWeek": string,\n` +
  `    "lighting": string,\n` +
  `    "crime1km": string,\n` +
  `    "weather": string,\n` +
  `    "holiday": string\n` +
  `  },\n` +
  `  "safetyReason": string,\n` +
  `  "relevanceReason": string\n` +
  `}\n` +
  `\n` +
  `Rules:\n` +
  `1) intendedVisitPeriod MUST be used for safety evaluation if it is not "unspecified".\n` +
  `2) currentTime MUST still be reported, but it must not override intendedVisitPeriod.\n` +
  `3) safetyFactors MUST include all keys shown above for every POI.\n` +
  `4) Each safetyFactors value must be a short sentence explaining how that factor affects safety for this POI.\n` +
  `5) safetyReason must be a compact summary that references the safetyFactors and justifies the safetyLevel.\n` +
  `6) If a factor is unknown or unavailable, write that explicitly, for example "crime1km: not available; cannot quantify risk, so safety is more conservative".\n` +
  `7) Do not invent numeric crime rates. Use crimeCount1km only if provided.\n`;
  const userPrompt =
    `Context JSON:\n${JSON.stringify(contextObject, null, 2)}\n\n` +
    `User request:\n${args.userText}\n\n` +
    outputSchemaText;

  const finalPromptForLogging =
    `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}\n`;

  return {
    system: systemPrompt,
    user: userPrompt,
    finalPromptForLogging
  };
}
