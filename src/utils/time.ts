export function nowMs(): number {
  return Date.now();
}

export function formatNYCDateTime(now: Date): { date: string; time: string; isNight: boolean; hour: number } {
  const timeZone = "America/New_York";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hourStr = get("hour");
  const minute = get("minute");
  const second = get("second");

  const hour = Number(hourStr);
  const isNight = hour >= 19 || hour < 6;

  const date = `${year}-${month}-${day}`;
  const time = `${hourStr}:${minute}:${second}`;

  return { date, time, isNight, hour };
}
