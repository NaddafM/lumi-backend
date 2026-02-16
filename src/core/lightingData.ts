import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export type LightingRow = {
  ntaname: string;
  street_light_count: number;
  area_km2: number;
  lights_per_km2: number;
};

export type LightingSummary = {
  ntaname: string;
  streetLightCount: number;
  areaKm2: number;
  lightsPerKm2: number;
  lightingBand: "low" | "medium" | "high" | "unknown";
};

function toNumber(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

export function loadLightingCsv(csvPath: string): LightingRow[] {
  const abs = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  const csv = fs.readFileSync(abs, "utf8");

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  const rows: LightingRow[] = [];
  for (const r of records) {
    const ntaname = (r.ntaname ?? "").trim();
    if (!ntaname) continue;

    const street_light_count = toNumber(r.street_light_count);
    const area_km2 = toNumber(r.area_km2);
    const lights_per_km2 = toNumber(r.lights_per_km2);

    if (!Number.isFinite(street_light_count) || !Number.isFinite(area_km2) || !Number.isFinite(lights_per_km2)) {
      continue;
    }

    rows.push({
      ntaname,
      street_light_count,
      area_km2,
      lights_per_km2
    });
  }

  return rows;
}

export function buildLightingIndex(rows: LightingRow[]): Map<string, LightingSummary> {
  const values = rows.map((r) => r.lights_per_km2).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);

  const q = (p: number): number => {
    if (values.length === 0) return NaN;
    const idx = Math.floor((values.length - 1) * p);
    return values[idx];
  };

  const q33 = q(0.33);
  const q66 = q(0.66);

  const band = (v: number): "low" | "medium" | "high" | "unknown" => {
    if (!Number.isFinite(v) || !Number.isFinite(q33) || !Number.isFinite(q66)) return "unknown";
    if (v <= q33) return "low";
    if (v <= q66) return "medium";
    return "high";
  };

  const m = new Map<string, LightingSummary>();
  for (const r of rows) {
    m.set(r.ntaname, {
      ntaname: r.ntaname,
      streetLightCount: r.street_light_count,
      areaKm2: r.area_km2,
      lightsPerKm2: r.lights_per_km2,
      lightingBand: band(r.lights_per_km2)
    });
  }

  return m;
}

export function pickRandomNtaName(index: Map<string, LightingSummary>): string {
  const keys = Array.from(index.keys());
  const i = Math.floor(Math.random() * keys.length);
  return keys[i] ?? "Unknown";
}
