import assert from 'node:assert/strict';
import test from 'node:test';

import { adjustFlySpeed, getFlySpeedRatios, setFlySpeed } from '../src/runtime/fly-speed.mjs';

test('adjusts fly speed multiplicatively and clamps it', () => {
    assert.equal(adjustFlySpeed(10, -1), 12);
    assert.equal(adjustFlySpeed(10, 1), 10 / 1.2);
    assert.equal(adjustFlySpeed(0.1, 10), 0.1);
    assert.equal(adjustFlySpeed(1000, -10), 1000);
});

test('preserves fast and slow fly speed ratios', () => {
    const controls = { moveSpeed: 10, moveFastSpeed: 20, moveSlowSpeed: 5 };
    const ratios = getFlySpeedRatios(controls);
    setFlySpeed(controls, 24, ratios);
    assert.deepEqual(controls, { moveSpeed: 24, moveFastSpeed: 48, moveSlowSpeed: 12 });
});
