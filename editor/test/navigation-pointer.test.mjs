import assert from 'node:assert/strict';
import test from 'node:test';

import { releasedNavigationButton } from '../src/runtime/navigation-pointer.mjs';

test('chorded right-button release ends navigation before left pointerup', () => {
    assert.equal(releasedNavigationButton(7, { pointerId: 7, button: 0, buttons: 3 }), false);
    assert.equal(releasedNavigationButton(7, { pointerId: 7, button: 2, buttons: 1 }), true);
});

test('unrelated pointer and left-button release do not end right-button navigation', () => {
    assert.equal(releasedNavigationButton(7, { pointerId: 8, buttons: 0 }), false);
    assert.equal(releasedNavigationButton(7, { pointerId: 7, button: 0, buttons: 2 }), false);
    assert.equal(releasedNavigationButton(null, { pointerId: 7, buttons: 0 }), false);
    assert.equal(releasedNavigationButton(7, { pointerId: 7, buttons: 0 }), true);
});
