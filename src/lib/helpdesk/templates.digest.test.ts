import { test, expect, describe } from 'vitest';
import { digestEmail } from './templates';

describe('digestEmail', () => {
  const data = {
    weekLabel: 'Jun 30 – Jul 6',
    visitors: 120, visitorsPrev: 100,
    tickets: 6, ticketsPrev: 9,
    aiHandled: 4, aiSuggested: 5,
    medianCloseHours: 5.5,
    openNow: 2,
    machines: [{ machine: 'Washer #7', n: 3 }],
  };
  test('renders the numbers + deltas in text and html', () => {
    const e = digestEmail(data);
    expect(e.subject).toContain('Weekly');
    expect(e.text).toContain('120');
    expect(e.text).toContain('Washer #7');
    expect(e.html).toContain('120');
    expect(e.html).toContain('Washer #7');
    expect(e.html).toContain('+20%');   // visitors up
    expect(e.html).toContain('Open in admin').valueOf;
    expect(e.html).toContain('/admin/');
  });
  test('escapes machine names', () => {
    const e = digestEmail({ ...data, machines: [{ machine: '<img src=x>', n: 1 }] });
    expect(e.html).not.toContain('<img src=x>');
  });
});
