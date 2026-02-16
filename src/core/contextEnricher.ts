import { Env } from "../config/env";
import { LightingSummary } from "./lightingData";
import { getWeatherForNow } from "./openMeteoClient";
import { getHolidayInfo } from "./nagerClient";
import { getCrimeCountWithinRadius } from "./nycOpenDataCrimeClient";

export type EnrichedSignals = {
  crimeCount1km: number | null;
  weatherSummary: string | null;
  isHolidayOrSpecialDay: boolean | null;
  holidayName: string | null;

  enrichmentMeta: {
    crimeNote: string;
    weatherSource: string;
    holidaySource: string;
  };
};

export async function enrichSignals(args: {
  env: Env;
  now: Date;
  ntaName: string;
  lighting?: LightingSummary;
  userLat?: number;
  userLng?: number;
  nycDateYYYYMMDD: string;
}): Promise<EnrichedSignals> {
  const { env, userLat, userLng, nycDateYYYYMMDD } = args;

  const [weather, holiday, crime] = await Promise.all([
    getWeatherForNow({ env, lat: userLat, lng: userLng }),
    getHolidayInfo({ env, dateYYYYMMDD: nycDateYYYYMMDD }),
    getCrimeCountWithinRadius({ env, lat: userLat, lng: userLng })
  ]);

  return {
    crimeCount1km: crime.crimeCount1km,
    weatherSummary: weather.summary,
    isHolidayOrSpecialDay: holiday.isHolidayOrSpecialDay,
    holidayName: holiday.holidayName,
    enrichmentMeta: {
      crimeNote: crime.note,
      weatherSource: weather.source,
      holidaySource: holiday.source
    }
  };
}
