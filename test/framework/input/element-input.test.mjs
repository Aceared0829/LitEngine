import { expect } from 'chai';

import { Vec3 } from '../../../src/core/math/vec3.js';
import { Ray } from '../../../src/core/shape/ray.js';
import { ElementInput } from '../../../src/framework/input/element-input.js';
import { createApp } from '../../app.mjs';
import { jsdomSetup, jsdomTeardown } from '../../jsdom.mjs';

describe('ElementInput coordinate modes', function () {
    before(function () {
        jsdomSetup();
    });

    after(function () {
        jsdomTeardown();
    });

    it('maps pointer and ray input through a non-fullscreen camera rect', function () {
        for (const coordinateSystem of ['legacy', 'unreal']) {
            const app = createApp({ coordinateSystem });
            try {
                const width = app.graphicsDevice.width;
                const height = app.graphicsDevice.height;
                const rect = { x: 0.2, y: 0.1, z: 0.5, w: 0.3 };
                const pointerX = width * 0.45;
                const pointerY = height * 0.675;
                const camera = {
                    farClip: 100,
                    rect,
                    worldToScreen(_position, result) {
                        return result.set(pointerX, pointerY, 0);
                    }
                };
                const input = Object.create(ElementInput.prototype);
                input.app = app;
                input._target = { clientWidth: width, clientHeight: height };

                const pointerRay = new Ray();
                pointerRay.end = new Vec3();
                expect(input._calculateRayScreen(pointerX, pointerY, camera, pointerRay)).to.equal(true);
                expect(pointerRay.origin.x).to.be.closeTo(width * 0.5, 1e-5);

                const expectedY = height * (coordinateSystem === 'unreal' ? 0.25 : 0.75);
                expect(pointerRay.origin.y).to.be.closeTo(expectedY, 1e-5);

                input._getTargetElement = (_camera, screenRay) => screenRay;
                const worldRay = new Ray(new Vec3(1, 2, 3), new Vec3(1, 0, 0));
                const rayHit = input._getTargetElementByRay(worldRay, camera);
                expect(rayHit.origin.y).to.be.closeTo(expectedY, 1e-5);
            } finally {
                app.destroy();
            }
        }
    });
});
