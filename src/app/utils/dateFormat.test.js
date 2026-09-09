import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDateForDisplay } from './dateFormat.ts';

test('formatDateForDisplay converts ISO dates to day/month/year order', () => {
  assert.equal(formatDateForDisplay('2026-05-10'), '10/05/2026');
  assert.equal(formatDateForDisplay('2026-05-10T12:00:00.000Z'), '10/05/2026');
  assert.equal(formatDateForDisplay(''), '');
});
