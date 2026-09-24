import { expect } from 'chai';

import { unrealEulerToRotation } from '../../src/core/math/coordinate-conversion.js';
import { Quat } from '../../src/core/math/quat.js';
import { Vec3 } from '../../src/core/math/vec3.js';
import { GraphNode } from '../../src/scene/graph-node.js';

const expectDirection = (actual, expected) => {
    expect(actual.distance(expected)).to.be.lessThan(1e-5);
};

describe('GraphNode Unreal semantic axes', function () {
    it('defaults to UE identity axes and preserves an explicit legacy mode', function () {
        const node = new GraphNode();
        expect(node.coordinateSystem).to.equal('unreal');
        expectDirection(node.forward, new Vec3(1, 0, 0));
        expectDirection(node.right, new Vec3(0, 1, 0));
        expectDirection(node.up, new Vec3(0, 0, 1));
        expect(node.clone().coordinateSystem).to.equal('unreal');
        const copy = new GraphNode().copy(node);
        expect(copy.coordinateSystem).to.equal('unreal');
        expect(() => {
            node.coordinateSystem = 'unknown';
        }).to.throw(RangeError);

        const legacy = new GraphNode();
        legacy.coordinateSystem = 'legacy';
        expectDirection(legacy.forward, new Vec3(0, 0, -1));
        expectDirection(legacy.right, new Vec3(1, 0, 0));
        expectDirection(legacy.up, new Vec3(0, 1, 0));
    });

    it('looks along +X with world +Z as default up, and preserves legacy lookAt', function () {
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';
        node.lookAt(5, 0, 0);
        expectDirection(node.forward, new Vec3(1, 0, 0));
        expectDirection(node.right, new Vec3(0, 1, 0));
        expectDirection(node.up, new Vec3(0, 0, 1));
        node.lookAt(new Vec3(0, 5, 0));
        expectDirection(node.forward, new Vec3(0, 1, 0));
        expectDirection(node.up, new Vec3(0, 0, 1));
        node.coordinateSystem = 'legacy';
        node.lookAt(0, 0, -5);
        expectDirection(node.forward, new Vec3(0, 0, -1));
        expectDirection(node.up, new Vec3(0, 1, 0));
    });

    it('leaves rotation stable for a degenerate target or parallel up vector', function () {
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';
        node.setLocalEulerAngles(10, 20, 30);
        const before = node.getRotation().clone();
        node.lookAt(node.getPosition());
        expect(node.getRotation().equalsApprox(before)).to.be.true;
        node.lookAt(new Vec3(0, 0, 5));
        expect(node.getRotation().equalsApprox(before)).to.be.true;
        node.lookAt(new Vec3(0, 0, 5), new Vec3(1, 0, 0));
        expectDirection(node.forward, new Vec3(0, 0, 1));
    });

    it('preserves the world semantic directions under a rotated parent', function () {
        const parent = new GraphNode('parent');
        parent.setLocalEulerAngles(0, 0, 90);
        const child = new GraphNode('child');
        child.coordinateSystem = 'unreal';
        parent.addChild(child);
        expectDirection(child.forward, new Vec3(0, 1, 0));
        expectDirection(child.right, new Vec3(-1, 0, 0));
        expectDirection(child.up, new Vec3(0, 0, 1));
    });

    it('uses UE Roll, Pitch and Yaw for local and world Euler accessors', function () {
        const angles = new Vec3(15, 25, 35);
        const expected = unrealEulerToRotation(angles);
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';
        node.setLocalEulerAngles(angles);
        expect(node.getLocalRotation().equalsApprox(expected)).to.be.true;
        expectDirection(node.getLocalEulerAngles(), angles);

        const parent = new GraphNode();
        parent.setLocalRotation(unrealEulerToRotation(new Vec3(0, 0, 40)));
        parent.addChild(node);
        node.setEulerAngles(angles);
        expect(node.getRotation().equalsApprox(expected)).to.be.true;
        expectDirection(node.getEulerAngles(), angles);
    });

    it('rotates UE yaw around Z and pitch around local Y', function () {
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';
        node.rotate(0, 0, 90);
        expectDirection(node.forward, new Vec3(0, 1, 0));
        node.rotateLocal(new Vec3(0, 45, 0));
        expectDirection(node.forward, new Vec3(0, Math.SQRT1_2, Math.SQRT1_2));

        const legacy = new GraphNode();
        legacy.coordinateSystem = 'legacy';
        legacy.setLocalEulerAngles(15, 25, 35);
        expect(legacy.getLocalRotation().equalsApprox(new Quat().setFromEulerAngles(15, 25, 35))).to.be.true;
    });
});
