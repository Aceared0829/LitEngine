import { expect } from 'chai';

import { EventHandler } from '../../src/core/event-handler.js';
import { unrealToLegacyVector } from '../../src/core/math/coordinate-conversion.js';
import { Mat4 } from '../../src/core/math/mat4.js';
import { Quat } from '../../src/core/math/quat.js';
import { Vec3 } from '../../src/core/math/vec3.js';
import {
    copyEngineRotationToXr,
    copyEngineVectorToXr,
    copyXrRotationToEngine,
    copyXrSphericalHarmonicsToEngine,
    copyXrVectorToEngine,
    copyXrViewMatrices
} from '../../src/framework/xr/xr-coordinate.js';
import { XrLightEstimation } from '../../src/framework/xr/xr-light-estimation.js';
import { XrMesh } from '../../src/framework/xr/xr-mesh.js';
import { XrPlane } from '../../src/framework/xr/xr-plane.js';

const evaluateSphericalHarmonics = (coefficients, direction, channel) => {
    const { x, y, z } = direction;
    const basis = [
        0.282095,
        0.488603 * y,
        0.488603 * z,
        0.488603 * x,
        1.092548 * x * y,
        1.092548 * y * z,
        0.315392 * (3 * z * z - 1),
        1.092548 * x * z,
        0.546274 * (x * x - y * y)
    ];
    let value = 0;
    for (let index = 0; index < basis.length; index++) {
        value += coefficients[index * 3 + channel] * basis[index];
    }
    return value;
};

describe('XR coordinate conversion', function () {
    const manager = coordinateSystem => ({ app: { coordinateSystem } });

    it('converts WebXR positions, directions and orientations for Unreal applications', function () {
        const xrManager = manager('unreal');
        const position = copyXrVectorToEngine(xrManager, new Vec3(1, 2, 3), new Vec3());
        const direction = copyXrVectorToEngine(xrManager, new Vec3(0, 0, -1), new Vec3());
        const rotation = copyXrRotationToEngine(xrManager, new Quat(0, 0, 0, 1), new Quat());
        const webPosition = copyEngineVectorToXr(xrManager, position, new Vec3());
        const webRotation = copyEngineRotationToXr(xrManager, rotation, new Quat());

        expect(position.toArray()).to.deep.equal([-3, 1, 2]);
        expect(direction.toArray()).to.deep.equal([1, 0, 0]);
        expect(rotation.equals(Quat.IDENTITY)).to.equal(true);
        expect(webPosition.toArray()).to.deep.equal([1, 2, 3]);
        expect(webRotation.equals(Quat.IDENTITY)).to.equal(true);
    });

    it('converts eye-to-world and world-to-eye matrices without changing eye-local axes', function () {
        const xrManager = manager('unreal');
        const xrView = {
            transform: {
                matrix: new Mat4().setTranslate(1, 2, 3).data,
                inverse: { matrix: new Mat4().setTranslate(-1, -2, -3).data }
            }
        };
        const viewInverse = new Mat4();
        const viewMatrix = new Mat4();

        copyXrViewMatrices(xrManager, xrView, viewInverse, viewMatrix);

        expect(Array.from(viewInverse.data.slice(12, 15))).to.deep.equal([-3, 1, 2]);
        expect(Array.from(viewMatrix.data.slice(12, 15))).to.deep.equal([-1, -2, -3]);
        expect(new Mat4().mul2(viewInverse, viewMatrix).data).to.deep.equal(new Mat4().data);
    });

    it('converts XR eye rotation together with its world basis', function () {
        const xrManager = manager('unreal');
        const eyeToLegacyWorld = new Mat4().setTRS(
            new Vec3(4, -2, 7),
            new Quat().setFromEulerAngles(23, -41, 67),
            new Vec3(1, 1, 1)
        );
        const xrView = {
            transform: {
                matrix: eyeToLegacyWorld.data,
                inverse: { matrix: eyeToLegacyWorld.clone().invert().data }
            }
        };
        const eyeToUnrealWorld = new Mat4();
        const unrealWorldToEye = new Mat4();
        const eyePoint = new Vec3(0.2, -0.3, 0.5);

        copyXrViewMatrices(xrManager, xrView, eyeToUnrealWorld, unrealWorldToEye);

        const expected = new Vec3(-eyeToLegacyWorld.transformPoint(eyePoint).z,
            eyeToLegacyWorld.transformPoint(eyePoint).x,
            eyeToLegacyWorld.transformPoint(eyePoint).y);
        expect(eyeToUnrealWorld.transformPoint(eyePoint).equalsApprox(expected, 1e-5)).to.be.true;
        const identity = new Mat4().mul2(eyeToUnrealWorld, unrealWorldToEye).data;
        for (let i = 0; i < identity.length; i++) {
            expect(identity[i]).to.be.closeTo(i % 5 === 0 ? 1 : 0, 1e-6);
        }
    });

    it('preserves legacy WebXR coordinates', function () {
        const xrManager = manager('legacy');
        const source = new Vec3(1, 2, 3);
        const converted = copyXrVectorToEngine(xrManager, source, new Vec3());
        const xrView = {
            transform: {
                matrix: new Mat4().setTranslate(1, 2, 3).data,
                inverse: { matrix: new Mat4().setTranslate(-1, -2, -3).data }
            }
        };
        const viewInverse = new Mat4();
        const viewMatrix = new Mat4();

        copyXrViewMatrices(xrManager, xrView, viewInverse, viewMatrix);

        expect(converted.toArray()).to.deep.equal([1, 2, 3]);
        expect(viewInverse.data).to.deep.equal(xrView.transform.matrix);
        expect(viewMatrix.data).to.deep.equal(xrView.transform.inverse.matrix);
    });

    it('rotates probe-space spherical harmonics into Unreal world axes without changing sampled lighting', function () {
        const xrManager = manager('unreal');
        const coefficients = Float32Array.from({ length: 27 }, (_, index) => (index - 8) * 0.13);
        const probeOrientation = new Quat().setFromEulerAngles(23, -41, 67);
        const inverseProbeOrientation = probeOrientation.clone().invert();
        const worldCoefficients = new Float32Array(27);
        copyXrSphericalHarmonicsToEngine(xrManager, coefficients, probeOrientation, worldCoefficients);

        const directions = [
            new Vec3(1, 2, 3).normalize(),
            new Vec3(-2, 1, 4).normalize(),
            new Vec3(3, -4, 1).normalize()
        ];
        for (const worldDirection of directions) {
            const xrWorldDirection = unrealToLegacyVector(worldDirection, new Vec3());
            const probeDirection = inverseProbeOrientation.transformVector(xrWorldDirection);
            for (let channel = 0; channel < 3; channel++) {
                expect(evaluateSphericalHarmonics(worldCoefficients, worldDirection, channel))
                .to.be.closeTo(evaluateSphericalHarmonics(coefficients, probeDirection, channel), 2e-5);
            }
        }
    });

    it('converts detected XR mesh vertices and reverses triangle winding', function () {
        const xrManager = manager('unreal');
        const xrMesh = {
            vertices: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
            indices: new Uint32Array([0, 1, 2]),
            meshSpace: {},
            lastChangedTime: 0
        };
        const mesh = new XrMesh({ _manager: xrManager }, xrMesh);

        expect(Array.from(mesh.vertices)).to.deep.equal([-3, 1, 2, -6, 4, 5, -9, 7, 8]);
        expect(Array.from(mesh.indices)).to.deep.equal([0, 2, 1]);

        mesh.update({
            getPose: () => ({
                transform: {
                    position: new Vec3(1, 2, 3),
                    orientation: Quat.IDENTITY
                }
            })
        });
        expect(mesh.getPosition().toArray()).to.deep.equal([-3, 1, 2]);
    });

    it('converts XR plane-local points and preserves a consistent polygon winding', function () {
        const originalDomPoint = globalThis.DOMPoint;
        class TestDomPoint {
            constructor(x, y, z, w) {
                Object.assign(this, { x, y, z, w });
            }
        }
        globalThis.DOMPoint = TestDomPoint;

        try {
            const plane = new XrPlane({ _manager: manager('unreal') }, {
                lastChangedTime: 0,
                orientation: 'horizontal',
                planeSpace: {},
                polygon: [
                    { x: 0, y: 0, z: 0, w: 1 },
                    { x: 1, y: 0, z: 0, w: 1 },
                    { x: 0, y: 0, z: 1, w: 1 }
                ]
            });
            const points = plane.points;

            const converted = points.map((point) => {
                return [point.x, point.y, point.z].map(value => (Object.is(value, -0) ? 0 : value));
            });
            expect(converted).to.deep.equal([
                [-1, 0, 0],
                [0, 1, 0],
                [0, 0, 0]
            ]);
        } finally {
            if (originalDomPoint === undefined) {
                delete globalThis.DOMPoint;
            } else {
                globalThis.DOMPoint = originalDomPoint;
            }
        }
    });

    it('rotates the XR primary light so Unreal local +X emits opposite the source direction', function () {
        const xrManager = new EventHandler();
        xrManager.app = { coordinateSystem: 'unreal' };
        const lighting = new XrLightEstimation(xrManager);
        const coefficients = new Float32Array(27);
        lighting._lightProbe = {};

        lighting.update({
            getLightEstimate: () => ({
                primaryLightIntensity: { x: 1, y: 1, z: 1 },
                primaryLightDirection: { x: 0, y: 1, z: 0 },
                sphericalHarmonicsCoefficients: coefficients
            })
        });

        const emittedDirection = lighting.rotation.transformVector(new Vec3(1, 0, 0));
        expect(emittedDirection.equalsApprox(new Vec3(0, 0, -1), 1e-5)).to.be.true;
        expect(lighting.sphericalHarmonics).to.deep.equal(coefficients);
    });

    it('provides probe-space harmonics transformed to active application world axes', function () {
        const xrManager = new EventHandler();
        xrManager.app = { coordinateSystem: 'unreal' };
        xrManager._referenceSpace = {};
        const lighting = new XrLightEstimation(xrManager);
        const coefficients = Float32Array.from({ length: 27 }, (_, index) => index + 1);
        const probeSpace = {};
        lighting._lightProbe = { probeSpace };

        lighting.update({
            getLightEstimate: () => ({
                primaryLightIntensity: { x: 1, y: 1, z: 1 },
                primaryLightDirection: { x: 0, y: 1, z: 0 },
                sphericalHarmonicsCoefficients: coefficients
            }),
            getPose: (space, referenceSpace) => {
                expect(space).to.equal(probeSpace);
                expect(referenceSpace).to.equal(xrManager._referenceSpace);
                return { transform: { orientation: new Quat().setFromEulerAngles(10, 20, 30) } };
            }
        });

        expect(lighting.sphericalHarmonics).to.deep.equal(coefficients);
        expect(lighting.sphericalHarmonicsWorld).to.be.instanceOf(Float32Array);
        expect(lighting.sphericalHarmonicsWorld).to.have.length(27);
    });
});
