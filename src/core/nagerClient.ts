import { Env } from "../config/env";

type HolidayItem = {
  date: string;
  localName?: string;
  name?: string;
};

export type HolidayInfo = {
  isHolidayOrSpecialDay: boolean | null;
  holidayName: string | null;
  source: "nager" | "none";
};

export async function getHolidayInfo(args: {
  env: Env;
  dateYYYYMMDD: string;
}): Promise<HolidayInfo> {
  const { env, dateYYYYMMDD } = args;

  if (!env.HOLIDAYS_ENABLED) {
    return { isHolidayOrSpecialDay: null, holidayName: null, source: "none" };
  }

  const year = Number(dateYYYYMMDD.slice(0, 4));
  if (!Number.isFinite(year) || year < 1970 || year > 2100) {
    return { isHolidayOrSpecialDay: null, holidayName: null, source: "none" };
  }

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${env.HOLIDAYS_COUNTRY_CODE}`;
  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    return { isHolidayOrSpecialDay: null, holidayName: null, source: "none" };
  }

  const items = (await res.json()) as HolidayItem[];
  const match = items.find((h) => h.date === dateYYYYMMDD);

  if (!match) {
    return { isHolidayOrSpecialDay: false, holidayName: null, source: "nager" };
  }

  const name = match.name ?? match.localName ?? "Public holiday";
  return { isHolidayOrSpecialDay: true, holidayName: name, source: "nager" };
}
