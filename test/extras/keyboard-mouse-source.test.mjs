import { expect } from 'chai';

import { KeyboardMouseSource } from '../../src/extras/input/sources/keyboard-mouse-source.js';

describe('KeyboardMouseSource chorded buttons', function () {
    let input;
    let canvas;

    beforeEach(function () {
        canvas = { setPointerCapture() {}, hasPointerCapture: () => false };
        input = new KeyboardMouseSource();
        input._element = canvas;
    });

    afterEach(function () {
        input._element = null;
        input.destroy();
    });

    const event = (buttons, pointerId = 1) => ({ pointerType: 'mouse', pointerId, buttons, screenX: 10, screenY: 20 });

    it('preserves left state when right joins the chord and reports partial releases', function () {
        input._onPointerDown(event(1));
        expect(input.read().button).to.deep.equal([1, 0, 0]);
        input._onMouseButtons(event(3));
        expect(input.read().button).to.deep.equal([0, 0, 1]);
        input._onMouseButtons(event(1));
        expect(input.read().button).to.deep.equal([0, 0, -1]);
        input._onPointerUp(event(0));
        expect(input.read().button).to.deep.equal([-1, 0, 0]);
    });

    it('reconciles pointermove masks and does not double count mouse events', function () {
        input._onPointerDown(event(2));
        input.read();
        input._onPointerMove({ ...event(3), target: canvas, screenX: 15 });
        expect(input.read().button).to.deep.equal([1, 0, 0]);
        input._onMouseButtons(event(3));
        expect(input.read().button).to.deep.equal([0, 0, 0]);
        input._onPointerMove({ ...event(2), target: canvas });
        expect(input.read().button).to.deep.equal([-1, 0, 0]);
    });

    it('maps middle-button bit and ignores foreign pointer releases', function () {
        input._onPointerDown(event(4));
        expect(input.read().button).to.deep.equal([0, 1, 0]);
        input._onPointerUp(event(0, 2));
        expect(input.read().button).to.deep.equal([0, 0, 0]);
        input._onBlur();
        expect(input.read().button).to.deep.equal([0, -1, 0]);
    });
});
