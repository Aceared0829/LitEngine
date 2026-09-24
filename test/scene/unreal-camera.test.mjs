import { expect } from 'chai';

import { Mat4 } from '../../src/core/math/mat4.js';
import { Vec2 } from '../../src/core/math/vec2.js';
import { Vec3 } from '../../src/core/math/vec3.js';
import { Entity } from '../../src/framework/entity.js';
import { Camera } from '../../src/scene/camera.js';
import { ASPECT_MANUAL, PROJECTION_ORTHOGRAPHIC } from '../../src/scene/constants.js';
import { createApp } from '../app.mjs';
import { jsdomSetup, jsdomTeardown } from '../jsdom.mjs';

describe('Unreal camera basis', function () {
    let app;

    beforeEach(function () {
        jsdomSetup();
        app = createApp();
        app.graphicsDevice.setResolution(800, 400);
    });

    afterEach(function () {
        app?.destroy();
        jsdomTeardown();
    });

    const setup = (app) => {
        const camera = new Camera(app.graphicsDevice);
        const entity = new Entity('Camera');
        camera.node = entity;
        camera.aspectRatioMode = ASPECT_MANUAL;
        camera.aspectRatio = 2;
        camera.coordinateSystem = 'unreal';
        return { camera, entity };
    };

    it('maps +X forward, +Y right and +Z up through the graphics view', function () {
        const { camera, entity } = setup(app);
        expect(camera.coordinateSystem).to.equal('unreal');
        const right = camera.worldToScreen(new Vec3(5, 1, 0), 800, 400);
        const up = camera.worldToScreen(new Vec3(5, 0, 1), 800, 400);
        const center = camera.worldToScreen(new Vec3(5, 0, 0), 800, 400);
        expect(center.x).to.be.closeTo(400, 1e-4);
        expect(center.y).to.be.closeTo(200, 1e-4);
        expect(right.x).to.be.greaterThan(center.x);
        expect(up.y).to.be.lessThan(center.y);
        const world = camera.screenToWorld(center.x, center.y, 5, 800, 400);
        expect(world.x).to.be.closeTo(5, 1e-5);
        expect(world.y).to.be.closeTo(0, 1e-5);
        expect(world.z).to.be.closeTo(0, 1e-5);
        camera.updateFrustum();
        expect(camera.frustum.containsPoint(new Vec3(5, 0, 0))).to.equal(true);
        expect(camera.frustum.containsPoint(new Vec3(-5, 0, 0))).to.equal(false);
        entity.destroy();
    });

    it('round-trips an offset perspective ray at a rotated camera pose', function () {
        const { camera, entity } = setup(app);
        entity.setLocalPosition(1, 2, 3);
        entity.setLocalEulerAngles(10, 20, -15);
        camera.projectionOffset = new Vec2(0.25, -0.2);
        const world = entity.getLocalRotation().transformVector(new Vec3(5, 0.7, -0.4)).add(entity.getPosition());
        const screen = camera.worldToScreen(world, 800, 400);
        const roundtrip = camera.screenToWorld(screen.x, screen.y, world.distance(entity.getPosition()), 800, 400);
        expect(roundtrip.distance(world)).to.be.lessThan(1e-4);
        entity.destroy();
    });

    it('supports orthographic screen/ray conversion, frustum corners and cloning', function () {
        const { camera, entity } = setup(app);
        camera.projection = PROJECTION_ORTHOGRAPHIC;
        camera.orthoHeight = 4;
        const right = camera.worldToScreen(new Vec3(5, 1, 0), 800, 400);
        const up = camera.worldToScreen(new Vec3(5, 0, 1), 800, 400);
        expect(right.x).to.be.greaterThan(400);
        expect(up.y).to.be.lessThan(200);
        const point = camera.screenToWorld(right.x, up.y, 4.9, 800, 400);
        expect(point.x).to.be.closeTo(5, 1e-5);
        expect(point.y).to.be.closeTo(1, 1e-5);
        expect(point.z).to.be.closeTo(1, 1e-5);
        const corners = camera.getFrustumCorners(1, 10);
        expect(corners[0].x).to.equal(1);
        expect(corners[0].y).to.be.greaterThan(0);
        expect(corners[0].z).to.be.lessThan(0);
        expect(corners[4].x).to.equal(10);
        expect(camera.clone().coordinateSystem).to.equal('unreal');
        entity.destroy();
    });

    it('threads the new camera option through components and rejects unknown modes', function () {
        const entity = new Entity('Camera');
        entity.addComponent('camera', { coordinateSystem: 'unreal', enabled: false });
        app.root.addChild(entity);
        expect(entity.camera.coordinateSystem).to.equal('unreal');
        const clone = entity.clone();
        expect(clone.camera.coordinateSystem).to.equal('unreal');
        expect(() => {
            entity.camera.coordinateSystem = 'invalid';
        }).to.throw(RangeError);
        clone.destroy();
        entity.destroy();
    });

    it('defaults cameras to Unreal and keeps legacy eye-to-world matrices available', function () {
        const { camera, entity } = setup(app);
        const defaultCamera = new Camera(app.graphicsDevice);
        expect(defaultCamera.coordinateSystem).to.equal('unreal');
        defaultCamera.coordinateSystem = 'legacy';
        expect(defaultCamera.coordinateSystem).to.equal('legacy');
        const result = new Mat4();
        camera.getViewInverseMatrix(entity.getWorldTransform(), result);
        const forward = result.transformPoint(new Vec3(0, 0, -1));
        expect(forward.x).to.be.closeTo(1, 1e-6);
        expect(forward.y).to.be.closeTo(0, 1e-6);
        const legacy = new Camera(app.graphicsDevice);
        legacy.coordinateSystem = 'legacy';
        legacy.node = entity;
        expect(legacy.coordinateSystem).to.equal('legacy');
        expect(legacy.getViewInverseMatrix(entity.getWorldTransform(), new Mat4()).isIdentity()).to.equal(true);
        defaultCamera.destroy();
        entity.destroy();
    });

    it('projects a Z-up editor scene from an oblique look-at pose', function () {
        const { camera, entity } = setup(app);
        entity.coordinateSystem = 'unreal';
        entity.setPosition(5, 5, 5);
        entity.lookAt(Vec3.ZERO);
        const center = camera.worldToScreen(Vec3.ZERO, 800, 400);
        const box = camera.worldToScreen(new Vec3(1, 1, 0.5), 800, 400);
        expect(center.x).to.be.closeTo(400, 1e-4);
        expect(center.y).to.be.closeTo(200, 1e-4);
        expect(box.x).to.be.within(0, 800);
        expect(box.y).to.be.within(0, 400);
        camera.updateFrustum();
        expect(camera.frustum.containsPoint(Vec3.ZERO)).to.be.true;
        entity.destroy();
    });
});
