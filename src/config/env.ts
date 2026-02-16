import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  WS_HEARTBEAT_MS: z.coerce.number().int().positive().default(30000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_TEMPERATURE: z.coerce.number().default(0.3),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),

  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1),
  FIRESTORE_COLLECTION: z.string().min(1).default("lumi_qa_logs"),

  PROMPT_VERSION: z.string().min(1).default("v2"),

  NYC_LIGHTING_CSV_PATH: z.string().min(1).default("data/nyc_lighting.csv"),

  // NEW enrichment configuration
  WEATHER_TIMEZONE: z.string().min(1).default("America/New_York"),
  WEATHER_ENABLED: z.coerce.boolean().default(true),

  HOLIDAYS_ENABLED: z.coerce.boolean().default(true),
  HOLIDAYS_COUNTRY_CODE: z.string().min(2).max(2).default("US"),

  CRIME_ENABLED: z.coerce.boolean().default(true),
  CRIME_RADIUS_METERS: z.coerce.number().int().positive().default(1000),
  CRIME_LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
  NYC_OPENDATA_DATASET_ID: z.string().min(1).default("5uac-w243"),
  NYC_OPENDATA_BASE_URL: z.string().min(1).default("https://data.cityofnewyork.us/resource"),
  NYC_OPENDATA_APP_TOKEN: z.string().optional(),
  NYC_OPENDATA_LOCATION_FIELD: z.string().min(1).default("geocoded_column"),
  NYC_OPENDATA_DATE_FIELD: z.string().min(1).default("cmplnt_fr_dt")
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  return parsed.data;
}
