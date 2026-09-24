import { expect } from 'chai';

import {
    legacyToUnrealMatrix,
    legacyToUnrealRotation,
    legacyToUnrealScale,
    legacyToUnrealVector,
    legacyToUnrealPaper2DRotation,
    legacyToUnrealPaper2DScale,
    legacyToUnrealPaper2DVector,
    unrealToLegacyMatrix,
    unrealToLegacyRotation,
    unrealToLegacyScale,
    unrealToLegacyVector,
    unrealToLegacyPaper2DRotation,
    unrealToLegacyPaper2DScale,
    unrealToLegacyPaper2DVector,
    unrealEulerToRotation,
    unrealRotationToEuler
} from '../../../src/core/math/coordinate-conversion.js';
import { Mat4 } from '../../../src/core/math/mat4.js';
import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';

const expectVector = (actual, expected) => {
    expect(actual.x).to.be.closeTo(expected.x, 1e-5);
    expect(actual.y).to.be.closeTo(expected.y, 1e-5);
    expect(actual.z).to.be.closeTo(expected.z, 1e-5);
};

describe('legacy and Unreal coordinate conversion', function () {
    it('matches UE 5.8 Rotator axes and round-trips mixed rotations', function () {
        expectVector(unrealEulerToRotation(new Vec3(0, 0, 90)).transformVector(new Vec3(0, 1, 0)), new Vec3(-1, 0, 0));
        expectVector(unrealEulerToRotation(new Vec3(0, 0, 90)).transformVector(new Vec3(1, 0, 0)), new Vec3(0, 1, 0));
        expectVector(unrealEulerToRotation(new Vec3(0, 90, 0)).transformVector(new Vec3(1, 0, 0)), new Vec3(0, 0, 1));
        expectVector(unrealEulerToRotation(new Vec3(90, 0, 0)).transformVector(new Vec3(0, 1, 0)), new Vec3(0, 0, -1));
        for (const values of [[0, 0, 0], [23, -41, 67], [-120, 32, 175], [35, 90, 20], [-25, -90, 45]]) {
            const rotation = unrealEulerToRotation(new Vec3(values));
            expect(Math.abs(rotation.dot(unrealEulerToRotation(unrealRotationToEuler(rotation))))).to.be.closeTo(1, 1e-5);
        }
    });
    it('converts the three named directions and positions without unit scaling', function () {
        expectVector(legacyToUnrealVector(Vec3.FORWARD), new Vec3(1, 0, 0));
        expectVector(legacyToUnrealVector(Vec3.RIGHT), new Vec3(0, 1, 0));
        expectVector(legacyToUnrealVector(Vec3.UP), new Vec3(0, 0, 1));
        const position = new Vec3(2, 3, 4);
        expectVector(legacyToUnrealVector(position), new Vec3(-4, 2, 3));
        expectVector(unrealToLegacyVector(legacyToUnrealVector(position)), position);
        expectVector(unrealToLegacyVector(new Vec3(1, 0, 0)), Vec3.FORWARD);
    });

    it('converts the planar 2D world basis separately from 3D world coordinates', function () {
        const sourcePosition = new Vec3(2, 3, 4);
        const convertedPosition = legacyToUnrealPaper2DVector(sourcePosition);
        expectVector(convertedPosition, new Vec3(2, 4, 3));
        expectVector(unrealToLegacyPaper2DVector(convertedPosition), sourcePosition);
        expectVector(legacyToUnrealPaper2DScale(sourcePosition), new Vec3(2, 4, 3));
        expectVector(unrealToLegacyPaper2DScale(new Vec3(2, 4, 3)), sourcePosition);

        const legacyRotation = new Quat().setFromEulerAngles(23, -41, 67);
        const paper2dRotation = legacyToUnrealPaper2DRotation(legacyRotation);
        const sourceDirection = new Vec3(2, -3, 5);
        const expected = legacyToUnrealPaper2DVector(legacyRotation.transformVector(sourceDirection));
        const actual = paper2dRotation.transformVector(legacyToUnrealPaper2DVector(sourceDirection));
        expectVector(actual, expected);
        expect(unrealToLegacyPaper2DRotation(paper2dRotation).equalsApprox(legacyRotation)).to.be.true;
    });

    it('supports destinations aliasing inputs and never reflects scale magnitudes', function () {
        const position = new Vec3(2, 3, 4);
        legacyToUnrealVector(position, position);
        expectVector(position, new Vec3(-4, 2, 3));
        unrealToLegacyVector(position, position);
        expectVector(position, new Vec3(2, 3, 4));

        const scale = new Vec3(2, 3, 4);
        expectVector(legacyToUnrealScale(scale), new Vec3(4, 2, 3));
        legacyToUnrealScale(scale, scale);
        expectVector(scale, new Vec3(4, 2, 3));
        unrealToLegacyScale(scale, scale);
        expectVector(scale, new Vec3(2, 3, 4));
    });

    it('changes rotation basis without swapping Euler triples', function () {
        const legacy = new Quat().setFromEulerAngles(23, -41, 67);
        const unreal = legacyToUnrealRotation(legacy);
        const point = new Vec3(2, -3, 5);
        const expected = legacyToUnrealVector(legacy.transformVector(point));
        const actual = unreal.transformVector(legacyToUnrealVector(point));
        expectVector(actual, expected);
        const restored = unrealToLegacyRotation(unreal);
        expect(restored.equalsApprox(legacy)).to.be.true;
        const alias = legacy.clone();
        legacyToUnrealRotation(alias, alias);
        unrealToLegacyRotation(alias, alias);
        expect(alias.equalsApprox(legacy)).to.be.true;
    });

    it('conjugates full affine matrices including nonuniform scale and shear', function () {
        const legacy = new Mat4().setTRS(new Vec3(2, 3, 4), new Quat().setFromEulerAngles(23, -41, 67), new Vec3(2, 3, 4));
        legacy.data[4] += 0.2;
        const position = new Vec3(-1, 2, 3);
        const unreal = legacyToUnrealMatrix(legacy);
        const expected = legacyToUnrealVector(legacy.transformPoint(position));
        const actual = unreal.transformPoint(legacyToUnrealVector(position));
        expectVector(actual, expected);
        const recovered = unrealToLegacyMatrix(unreal);
        for (let i = 0; i < 16; i++) {
            expect(recovered.data[i]).to.be.closeTo(legacy.data[i], 1e-5);
        }
        legacyToUnrealMatrix(legacy, legacy);
        unrealToLegacyMatrix(legacy, legacy);
        expectVector(legacy.transformPoint(position), recovered.transformPoint(position));
    });
});
