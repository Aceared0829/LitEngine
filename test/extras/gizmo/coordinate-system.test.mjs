import { expect } from 'chai';

import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { setLegacyLocalEulerAngles } from '../../../src/extras/gizmo/coordinate-utils.js';
import { Gizmo } from '../../../src/extras/gizmo/gizmo.js';
import { ScaleGizmo } from '../../../src/extras/gizmo/scale-gizmo.js';
import { TranslateGizmo } from '../../../src/extras/gizmo/translate-gizmo.js';
import { GraphNode } from '../../../src/scene/graph-node.js';

const expectVector = (actual, expected) => {
    expect(actual.x).to.be.closeTo(expected.x, 1e-5);
    expect(actual.y).to.be.closeTo(expected.y, 1e-5);
    expect(actual.z).to.be.closeTo(expected.z, 1e-5);
};

const createVisibilityProbe = (GizmoType, cameraDir, rotation = new Quat()) => {
    const gizmo = Object.create(GizmoType.prototype);
    Object.defineProperty(gizmo, 'cameraDir', { value: cameraDir });
    gizmo.root = new GraphNode();
    gizmo.root.setLocalRotation(rotation);
    gizmo.flipPlanes = true;
    gizmo._renderUpdate = false;
    gizmo._shapes = Object.fromEntries(['x', 'y', 'z', 'yz', 'xz', 'xy'].map((key) => {
        let flipped = new Vec3();
        return [key, {
            entity: { enabled: true },
            set flipped(value) {
                flipped = value.clone();
            },
            get flipped() {
                return flipped;
            }
        }];
    }));
    return gizmo;
};

describe('Unreal coordinate gizmo behavior', function () {
    it('keeps helper mesh rotations in their geometry basis', function () {
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';

        setLegacyLocalEulerAngles(node, 90, 0, 0);

        const expected = new Quat().setFromEulerAngles(90, 0, 0);
        expect(node.getLocalRotation().equalsApprox(expected)).to.be.true;
    });

    it('emits UE Roll, Pitch, Yaw values for selected Unreal nodes', function () {
        const node = new GraphNode();
        node.coordinateSystem = 'unreal';
        node.setEulerAngles(0, 0, 90);

        const gizmo = Object.create(Gizmo.prototype);
        gizmo.nodes = [node];
        gizmo.root = new GraphNode();
        gizmo._coordSpace = 'local';
        gizmo.fire = (_event, angles) => {
            expect(angles.x).to.be.closeTo(0, 1e-5);
            expect(angles.y).to.be.closeTo(0, 1e-5);
            expect(angles.z).to.be.closeTo(90, 1e-5);
        };

        gizmo._updateRotation();
        expectVector(gizmo.root.getRotation().transformVector(new Vec3(1, 0, 0), new Vec3()), new Vec3(0, 1, 0));
    });

    it('hides the scale handle on the axis viewed head-on', function () {
        const gizmo = createVisibilityProbe(ScaleGizmo, new Vec3(0, 0, 1));

        gizmo._shapesLookAtCamera();

        expect(gizmo._shapes.x.entity.enabled).to.be.true;
        expect(gizmo._shapes.y.entity.enabled).to.be.true;
        expect(gizmo._shapes.z.entity.enabled).to.be.false;
    });

    it('uses the rotated XYZ axes when deciding scale handle visibility', function () {
        const yaw = new Quat().setFromEulerAngles(0, 0, 90);
        const gizmo = createVisibilityProbe(ScaleGizmo, new Vec3(0, 1, 0), yaw);

        gizmo._shapesLookAtCamera();

        expect(gizmo._shapes.x.entity.enabled).to.be.false;
        expect(gizmo._shapes.y.entity.enabled).to.be.true;
        expect(gizmo._shapes.z.entity.enabled).to.be.true;
    });

    it('places scale planes in the camera-facing XYZ quadrant', function () {
        const gizmo = createVisibilityProbe(ScaleGizmo, new Vec3(-1, 1, -1).normalize());

        gizmo._shapesLookAtCamera();

        expectVector(gizmo._shapes.yz.flipped, new Vec3(0, 0, 1));
        expectVector(gizmo._shapes.xy.flipped, new Vec3(1, 0, 0));
        expectVector(gizmo._shapes.xz.flipped, new Vec3(1, 0, 1));
    });

    it('keeps translation arrows matched to XYZ when viewed along an axis', function () {
        const gizmo = createVisibilityProbe(TranslateGizmo, new Vec3(0, 1, 0));

        gizmo._shapesLookAtCamera();

        expect(gizmo._shapes.x.entity.enabled).to.be.true;
        expect(gizmo._shapes.y.entity.enabled).to.be.false;
        expect(gizmo._shapes.z.entity.enabled).to.be.true;
    });
});
