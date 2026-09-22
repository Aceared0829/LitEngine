import assert from 'node:assert/strict';
import test from 'node:test';

import { adjustFlySpeed } from '../src/runtime/fly-speed.mjs';

test('adjusts fly speed multiplicatively and clamps it', () => {
    assert.equal(adjustFlySpeed(10, -1), 12);
    assert.equal(adjustFlySpeed(10, 1), 10 / 1.2);
    assert.equal(adjustFlySpeed(0.1, 10), 0.1);
    assert.equal(adjustFlySpeed(1000, -10), 1000);
});
