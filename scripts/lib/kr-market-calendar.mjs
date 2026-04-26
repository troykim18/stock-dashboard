import fs from 'node:fs/promises';

let calendarCache = null;

export function kstNow() {
  return new Date(Date.now() + 9 * 3600_000);
}

export function kstDate(offsetDays = 0) {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function kstMinutes() {
  const d = kstNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

async function loadCalendar() {
  if (calendarCache) return calendarCache;
  try {
    calendarCache = JSON.parse(await fs.readFile('data/kr-market-calendar.json', 'utf8'));
  } catch {
    calendarCache = { closedDates: {}, earlyOpenDates: {}, earlyCloseDates: {} };
  }
  return calendarCache;
}

export async function getMarketCloseReason(date = kstDate()) {
  const day = new Date(`${date}T00:00:00+09:00`).getUTCDay();
  if (day === 0 || day === 6) return 'weekend';
  const calendar = await loadCalendar();
  return calendar.closedDates?.[date] || '';
}

export async function isKrMarketClosed(date = kstDate()) {
  return Boolean(await getMarketCloseReason(date));
}

export async function krMarketWindow(date = kstDate()) {
  const calendar = await loadCalendar();
  const open = calendar.earlyOpenDates?.[date] ? 10 * 60 : 9 * 60;
  const regularClose = calendar.earlyCloseDates?.[date] ? 14 * 60 + 30 : 15 * 60 + 30;
  return {
    open,
    regularClose,
    afterHoursClose: 18 * 60,
    trackingClose: 20 * 60 + 10
  };
}
