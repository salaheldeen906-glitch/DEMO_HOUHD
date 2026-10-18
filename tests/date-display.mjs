import assert from 'node:assert/strict';
import { displayDate } from '../lib/date-display.ts';

for (const [stored, expected] of [
    ['2026-10-18', '18/10/2026'],
    ['2026-01-02', '02/01/2026'],
    ['2024-02-29', '29/02/2024'],
    ['2026-12-31', '31/12/2026'],
    ['2026-10', '10/2026'],
    ['', ''],
    ['—', '—'],
    ['2026-10-18T23:30:00Z', '2026-10-18T23:30:00Z'],
]) assert.equal(displayDate(stored), expected);

console.log('8 calendar date display assertions passed');
