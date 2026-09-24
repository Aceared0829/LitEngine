import { expect } from 'chai';

import { Vec2 } from '../../../src/core/math/vec2.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { FlyController } from '../../../src/extras/input/controllers/fly-controller.js';
import { FocusController } from '../../../src/extras/input/controllers/focus-controller.js';
import { OrbitController } from '../../../src/extras/input/controllers/orbit-controller.js';
import { InputFrame } from '../../../src/extras/input/input.js';
import { Pose } from '../../../src/extras/input/pose.js';

const expectVector = (actual, expected) => {
    expect(actual.x).to.be.closeTo(expected.x, 1e-5);
    expect(actual.y).to.be.closeTo(expected.y, 1e-5);
    expect(actual.z).to.be.closeTo(expected.z, 1e-5);
};

const input = (move = [0, 0, 0], rotate = [0, 0]) => new InputFrame({ move, rotate });

describe('coordinate-aware input poses', function () {
    it('defaults to Unreal semantics and retains explicit legacy behavior', function () {
        const pose = new Pose();
        expect(pose.coordinateSystem).to.equal('unreal');

        const controller = new FlyController();
        controller.moveDamping = 0;
        controller.rotateDamping = 0;
        controller.attach(pose, false);
        const moved = controller.update(input([0, 0, 1]), 1);
        expectVector(moved.position, new Vec3(1, 0, 0));
        controller.destroy();

        const legacyPose = new Pose(Vec3.ZERO, Vec3.ZERO, 0, 'legacy');
        const legacyController = new FlyController();
        legacyController.moveDamping = 0;
        legacyController.rotateDamping = 0;
        legacyController.attach(legacyPose, false);
        expectVector(legacyController.update(input([0, 0, 1]), 1).position, new Vec3(0, 0, -1));
        legacyController.destroy();
    });

    it('uses UE Roll, Pitch, Yaw and +X forward for pose look and focus', function () {
        const pose = new Pose(Vec3.ZERO, Vec3.ZERO, 0, 'unreal');
        pose.look(Vec3.ZERO, new Vec3(1, 1, 1));

        expect(pose.angles.x).to.equal(0);
        expect(pose.angles.y).to.be.closeTo(35.2643897, 1e-5);
        expect(pose.angles.z).to.be.closeTo(45, 1e-5);
        expectVector(pose.getFocus(new Vec3()), new Vec3(1, 1, 1));

        pose.angles.set(0, 0, 90);
        expectVector(pose.getRotation().transformVector(Vec3.RIGHT, new Vec3()), new Vec3(0, 1, 0));
    });

    it('moves and turns the fly controller along Unreal semantic axes', function () {
        const controller = new FlyController();
        controller.moveDamping = 0;
        controller.rotateDamping = 0;
        controller.attach(new Pose(Vec3.ZERO, Vec3.ZERO, 0, 'unreal'), false);

        const moved = controller.update(input([0, 0, 1]), 1);
        expectVector(moved.position, new Vec3(1, 0, 0));

        const turned = controller.update(input([0, 0, 0], [-90, 0]), 1);
        expectVector(turned.getRotation().transformVector(new Vec3(1, 0, 0), new Vec3()), new Vec3(0, 1, 0));
        controller.destroy();
    });

    it('orbits with a local -X camera offset and clamps zoom distance', function () {
        const controller = new OrbitController();
        controller.moveDamping = 0;
        controller.rotateDamping = 0;
        controller.zoomDamping = 0;
        controller.zoomRange = new Vec2(1, 6);
        controller.attach(new Pose(Vec3.ZERO, Vec3.ZERO, 5, 'unreal'), false);

        const zoomed = controller.update(input([0, 0, 0.5]), 1);
        expectVector(zoomed.position, new Vec3(-1, 0, 0));
        expect(zoomed.distance).to.equal(6);

        const panned = controller.update(input([1, 0, 0]), 1);
        expectVector(panned.position, new Vec3(-1, 1, 0));
        expect(controller.zoomRange.x).to.equal(1);
        expect(controller.zoomRange.y).to.equal(6);
        controller.destroy();
    });

    it('keeps focused camera placement when a UE pose is attached', function () {
        const controller = new FocusController();
        const pose = new Pose(new Vec3(3, 4, 5), new Vec3(0, 0, 90), 2, 'unreal');
        controller.attach(pose, false);

        const focused = controller.update(input(), 1);
        expectVector(focused.position, pose.position);
        expect(focused.coordinateSystem).to.equal('unreal');
        controller.destroy();
    });

    it('rejects interpolation between different coordinate conventions', function () {
        const legacy = new Pose(Vec3.ZERO, Vec3.ZERO, 0, 'legacy');
        const unreal = new Pose(Vec3.ZERO, Vec3.ZERO, 0, 'unreal');

        expect(legacy.equalsApprox(unreal)).to.be.false;
        expect(() => new Pose().lerp(legacy, unreal, 0.5)).to.throw(RangeError);
    });
});
