import { Env } from "../config/env";

export type CrimeSignal = {
  crimeCount1km: number | null;
  lookbackDays: number;
  radiusMeters: number;
  source: "nyc-opendata" | "none";
  note: string;
};

function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getCrimeCountWithinRadius(args: {
  env: Env;
  lat?: number;
  lng?: number;
}): Promise<CrimeSignal> {
  const { env, lat, lng } = args;

  if (
    !env.CRIME_ENABLED ||
    typeof lat !== "number" ||
    typeof lng !== "number"
  ) {
    return {
      crimeCount1km: null,
      lookbackDays: env.CRIME_LOOKBACK_DAYS,
      radiusMeters: env.CRIME_RADIUS_METERS,
      source: "none",
      note: "Crime signal disabled or missing coordinates."
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - env.CRIME_LOOKBACK_DAYS);
  const sinceStr = toYYYYMMDD(since);

  const datasetUrl = `${env.NYC_OPENDATA_BASE_URL}/${env.NYC_OPENDATA_DATASET_ID}.json`;

  const where = [
    `within_circle(${env.NYC_OPENDATA_LOCATION_FIELD}, ${lat}, ${lng}, ${env.CRIME_RADIUS_METERS})`,
    `${env.NYC_OPENDATA_DATE_FIELD} >= '${sinceStr}'`
  ].join(" AND ");

  const url = new URL(datasetUrl);
  url.searchParams.set("$select", "count(1) as cnt");
  url.searchParams.set("$where", where);

  const headers: Record<string, string> = {};
  if (env.NYC_OPENDATA_APP_TOKEN && env.NYC_OPENDATA_APP_TOKEN.trim().length > 0) {
    headers["X-App-Token"] = env.NYC_OPENDATA_APP_TOKEN.trim();
  }

  try {
    const res = await fetch(url.toString(), { method: "GET", headers });
    if (!res.ok) {
      return {
        crimeCount1km: null,
        lookbackDays: env.CRIME_LOOKBACK_DAYS,
        radiusMeters: env.CRIME_RADIUS_METERS,
        source: "none",
        note: `Crime query failed with HTTP ${res.status}. Check dataset id and field names.`
      };
    }

    const json: any = await res.json();
    const first = Array.isArray(json) ? json[0] : null;
    const cntRaw = first?.cnt;

    const count = typeof cntRaw === "string" ? Number(cntRaw) : typeof cntRaw === "number" ? cntRaw : NaN;
    if (!Number.isFinite(count)) {
      return {
        crimeCount1km: null,
        lookbackDays: env.CRIME_LOOKBACK_DAYS,
        radiusMeters: env.CRIME_RADIUS_METERS,
        source: "none",
        note: "Crime query returned an unexpected shape. Adjust NYC_OPENDATA_* env vars."
      };
    }

    return {
      crimeCount1km: Math.max(0, Math.trunc(count)),
      lookbackDays: env.CRIME_LOOKBACK_DAYS,
      radiusMeters: env.CRIME_RADIUS_METERS,
      source: "nyc-opendata",
      note: "Count is from NYC Open Data within the configured radius and lookback window."
    };
  } catch (err: any) {
    return {
      crimeCount1km: null,
      lookbackDays: env.CRIME_LOOKBACK_DAYS,
      radiusMeters: env.CRIME_RADIUS_METERS,
      source: "none",
      note: `Crime query threw an error: ${err?.message ?? String(err)}`
    };
  }
}
