import { expect } from 'chai';

import { legacyToUnrealVector } from '../../../src/core/math/coordinate-conversion.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { NullGraphicsDevice } from '../../../src/platform/graphics/null/null-graphics-device.js';
import { LIGHTTYPE_OMNI } from '../../../src/scene/constants.js';
import { LightCamera } from '../../../src/scene/renderer/light-camera.js';

describe('LightCamera coordinate basis', function () {
    it('maps cubemap face directions into the selected camera basis', function () {
        const device = new NullGraphicsDevice({ id: 'light-camera-coordinate-test' });
        try {
            for (let face = 0; face < 6; face++) {
                const legacyDirection = LightCamera.pointLightRotations[face].transformVector(new Vec3(0, 0, -1));
                const expectedDirection = legacyToUnrealVector(legacyDirection);
                const camera = LightCamera.create(device, `UnrealShadow${face}`, LIGHTTYPE_OMNI, face, 'unreal');

                expect(camera.coordinateSystem).to.equal('unreal');
                expect(camera.node.coordinateSystem).to.equal('unreal');
                expect(camera.node.forward.distance(expectedDirection)).to.be.lessThan(1e-5);
            }
        } finally {
            device.destroy();
        }
    });
});
