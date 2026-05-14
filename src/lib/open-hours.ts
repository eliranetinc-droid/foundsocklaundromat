import { getBusiness } from './business';

const TZ = 'America/New_York';

export type OpenStatus = {
  isOpen: boolean;
  label: 'Open now' | 'Closed';
  detail: string; // e.g. "closes 11 PM" or "opens 6 AM"
};

function partsInTz(date: Date): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return { hour: hour === 24 ? 0 : hour, minute };
}

function formatHour12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getOpenStatus(now: Date = new Date()): OpenStatus {
  const { hours } = getBusiness();
  const { hour, minute } = partsInTz(now);
  const nowMinutes = hour * 60 + minute;

  const [oh, om] = hours.open.split(':').map(Number);
  const [ch, cm] = hours.close.split(':').map(Number);
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;

  const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;

  if (isOpen) {
    return { isOpen: true, label: 'Open now', detail: `closes ${formatHour12(hours.close)}` };
  }
  return { isOpen: false, label: 'Closed', detail: `opens ${formatHour12(hours.open)}` };
}
