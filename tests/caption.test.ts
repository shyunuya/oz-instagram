import test from 'node:test';
import assert from 'node:assert/strict';
import { validPicks } from '../src/caption.ts';

test("Claude's photo picks must be unique candidate numbers within the carousel size", () => {
  assert.equal(validPicks([3, 1, 5, 2, 8, 6], 8, 5, 6), true);
  assert.equal(validPicks([1, 2, 3, 4], 8, 5, 6), false);
  assert.equal(validPicks([1, 2, 3, 4, 5, 6, 7], 8, 5, 6), false);
  assert.equal(validPicks([1, 1, 2, 3, 4], 8, 5, 6), false);
  assert.equal(validPicks([0, 1, 2, 3, 4], 8, 5, 6), false);
  assert.equal(validPicks([1, 2, 3, 4, 9], 8, 5, 6), false);
  assert.equal(validPicks([1, 2, 3, 4, 2.5], 8, 5, 6), false);
});
