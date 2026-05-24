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

  crimeCount1km?: number | null;
  weatherSummary?: string | null;
  isHolidayOrSpecialDay?: boolean | null;
  holidayName?: string | null;
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

function getPoiCount(requestedPoiCount?: number): number {
  if (!Number.isFinite(requestedPoiCount)) return 5;
  return Math.max(1, Math.min(20, requestedPoiCount as number));
}

function buildColorDistributionRule(poiCount: number): string {
  if (poiCount >= 10) {
    return [
      "Color distribution rule:",
      `- You MUST return exactly ${poiCount} POIs.`,
      "- You MUST include a mix of green, yellow, and red when the available context reasonably supports differentiation.",
      "- For this response, include at least 1 red POI and at least 2 yellow POIs, unless the context makes that clearly unjustified.",
      "- Do NOT label all POIs green unless the evidence for all of them is uniformly strong.",
      "- If the available evidence does not support many red POIs, include only the minimum required red count and explain the weaker risk signals carefully."
    ].join("\n");
  }

  if (poiCount >= 3) {
    return [
      "Color distribution rule:",
      `- You MUST return exactly ${poiCount} POIs.`,
      "- Include at least one non-green POI, yellow or red, unless the context strongly justifies all green.",
      "- Prefer a mix of green and yellow when risk is mixed or uncertain.",
      "- Use red when there are clear negative signals or several weaker negatives together."
    ].join("\n");
  }

  return [
    "Color distribution rule:",
    `- You MUST return exactly ${poiCount} POIs.`,
    "- Use the safety label that best fits the weighted evidence.",
    "- Do not default to green when evidence is weak or uncertain."
  ].join("\n");
}

export function buildPrompt(args: {
  env: Env;
  userText: string;
  ctx: PromptContext;
}): BuiltPrompt {
  const now = new Date();
  const nyc = formatNYCDateTime(now);
  const intendedVisitPeriod = inferIntendedVisitPeriod(args.userText);
  const cautiousness = args.ctx.cautiousness ?? "balanced";
  const poiCount = getPoiCount(args.ctx.requestedPoiCount);

  const cautiousnessPolicy =
    cautiousness === "cautious"
      ? [
          "Cautiousness override:",
          "- cautious mode is active.",
          "- Be conservative.",
          "- If meaningful uncertainty exists, downgrade one level relative to the raw weighted score.",
          "- At night, default to yellow unless there are strong positive signals across lighting, activity, category fit, and low uncertainty.",
          "- Use red when several negatives appear together, even if each alone is moderate."
        ].join("\n")
      : cautiousness === "relaxed"
        ? [
            "Cautiousness override:",
            "- relaxed mode is active.",
            "- Follow the weighted score, but if signals are mostly positive and uncertainty is limited, you may upgrade one level.",
            "- Reserve red for clearly negative or strongly conflicting evidence."
          ].join("\n")
        : [
            "Cautiousness override:",
            "- balanced mode is active.",
            "- Follow the weighted score normally.",
            "- Green means clearly positive overall.",
            "- Yellow means mixed or uncertain.",
            "- Red means clearly negative overall."
          ].join("\n");

  const systemPrompt =
    "You are a safety-aware local guide assistant for New York City.\n" +
    "Return ONLY a valid JSON array, no markdown, no code fences, no commentary, and no extra keys.\n" +
    "You must evaluate safety using multiple factors together, not one factor alone.\n" +
    "For every POI you MUST explicitly address ALL factors in safetyFactors: currentTime, intendedVisitPeriod, dayOfWeek, lighting, crime1km, weather, holiday.\n\n" +

    "Important interpretation rules:\n" +
    '- crimeCount1km is derived from a limited dataset and time window. A value of 0 means "no observed incidents in this dataset window", not "no crime exists". Treat it as weak evidence, not certainty.\n' +
    "- If any factor is missing or uncertain, state it and reduce confidence.\n" +
    "- Missing or uncertain evidence should push the result toward yellow, not automatically green.\n" +
    "- Do not invent numeric crime rates, crowd statistics, or weather measurements.\n\n" +

    "Safety evaluation model:\n" +
    "For each POI, internally compute a weighted safety judgment using all these factors together:\n" +
    "- lighting, 25%\n" +
    "- crime1km, 25%\n" +
    "- time context, currentTime plus intendedVisitPeriod, 20%\n" +
    "- weather, 10%\n" +
    "- holiday or special day effects, 10%\n" +
    "- dayOfWeek, 10%\n\n" +

    "Interpretation of weighted judgment:\n" +
    "- strong positive factors increase safety\n" +
    "- uncertainty lowers safety confidence\n" +
    "- conflicting signals usually lead to yellow\n" +
    "- several negative factors together lead to red\n\n" +

    "Safety label mapping:\n" +
    "- green: strong positive signals across multiple factors, with little conflict or uncertainty for the intended visit period\n" +
    "- yellow: mixed signals, moderate risk, or meaningful uncertainty\n" +
    "- red: clear risk signals, or multiple negative factors together\n" +
    "- unknown: only when core context is too incomplete to judge reasonably\n\n" +

    `${cautiousnessPolicy}\n\n` +
    `${buildColorDistributionRule(poiCount)}\n\n` +

    "Hard output constraint:\n" +
    `- You MUST return exactly ${poiCount} objects.\n` +
    "- Do NOT return fewer.\n" +
    "- Do NOT return more.\n" +
    `- If you are unsure, generate additional plausible POIs until the count is exactly ${poiCount}.\n` +
    "- The response is invalid if the count is not exact.\n" +
    "- If space is tight, shorten reasons, but still return the exact number.\n\n" +

    "Reasoning enforcement:\n" +
    "- Every safetyFactors field MUST influence safetyLevel.\n" +
    "- safetyReason MUST explicitly reference at least 3 different safety factors.\n" +
    "- safetyReason must reflect the weighted evaluation, not a generic statement.\n" +
    "- Do NOT assign green by default when information is partial.\n" +
    "- intendedVisitPeriod MUST be used if it is not unspecified.\n" +
    "- currentTime must be reported, but it must not override intendedVisitPeriod.\n";

  const contextObject = {
    time: {
      nycDate: nyc.date,
      nycTime: nyc.time,
      currentDayOrNight: nyc.isNight ? "night" : "day",
      intendedVisitPeriod,
      dayOfWeek: now.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "America/New_York"
      }),
      isWeekend: ["Saturday", "Sunday"].includes(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "America/New_York"
        })
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
      note: "If provided, use it as one factor in safety and suitability, but not as sole evidence."
    },
    lighting: args.ctx.lighting
      ? {
          streetLightCount: args.ctx.lighting.streetLightCount,
          areaKm2: args.ctx.lighting.areaKm2,
          lightsPerKm2: args.ctx.lighting.lightsPerKm2,
          lightingBand: args.ctx.lighting.lightingBand,
          interpretation:
            "Higher lightsPerKm2 and a stronger lightingBand generally imply better lighting, especially at night."
        }
      : {
          available: false,
          interpretation: "Lighting data is unavailable, reduce confidence and be more conservative."
        },
    safetySignals: {
      crimeCount1km:
        typeof args.ctx.crimeCount1km === "number" ? args.ctx.crimeCount1km : null,
      crimeNote:
        typeof args.ctx.crimeCount1km === "number"
          ? "crimeCount1km is a computed count within about 1 km for a recent lookback window. Use it qualitatively as a risk signal only."
          : "crimeCount1km is unavailable. Do not claim quantitative crime levels. Reduce confidence and be conservative.",

      weatherSummary: args.ctx.weatherSummary ?? null,
      weatherNote:
        args.ctx.weatherSummary
          ? "weatherSummary reflects current weather context for the location."
          : "weatherSummary is unavailable. If weather matters, mention uncertainty explicitly.",

      isHolidayOrSpecialDay: args.ctx.isHolidayOrSpecialDay ?? null,
      holidayName: args.ctx.holidayName ?? null,
      holidayNote:
        args.ctx.isHolidayOrSpecialDay === true
          ? "Today is a holiday or special day, which may affect crowd patterns, activity, and safety conditions."
          : args.ctx.isHolidayOrSpecialDay === false
            ? "Today is not a public holiday."
            : "Holiday status is unknown. Mention uncertainty if relevant."
    },
    userLocation: {
      lat: typeof args.ctx.userLat === "number" ? args.ctx.userLat : null,
      lng: typeof args.ctx.userLng === "number" ? args.ctx.userLng : null,
      note: "If provided, treat this as the user's current location and keep POIs close to these coordinates."
    }
  };

  const outputSchemaText =
  `Return a JSON array with exactly ${poiCount} POI objects.\n` +
  `Each object must match this schema EXACTLY and include ONLY these properties:\n` +
  `{\n` +
  `  "name": string,\n` +
  `  "category": string,\n` +
  `  "lat": number,\n` +
  `  "lng": number,\n` +
  `  "safetyLevel": "green" | "yellow" | "red" | "unknown",\n` +
  `  "safetyReason": string,\n` +
  `  "relevanceReason": string\n` +
  `}\n\n` +

  `Strict output rules:\n` +
  `1) Return exactly ${poiCount} objects.\n` +
  `2) DO NOT add any extra properties.\n` +
  `3) DO NOT omit any property listed above.\n` +
  `4) The object must contain ONLY these keys and nothing else.\n` +
  `5) The "category" field MUST always be present and describe the POI type.\n` +
  `6) safetyReason MUST reflect a weighted evaluation using lighting, crime, time, weather, holiday, and dayOfWeek.\n` +
  `7) safetyReason MUST reference at least 2–3 different factors explicitly.\n` +
  `8) If a factor is unknown, mention that uncertainty in the safetyReason.\n`;

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
