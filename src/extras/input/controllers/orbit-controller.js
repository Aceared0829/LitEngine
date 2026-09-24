import { Quat } from '../../../core/math/quat.js';
import { Vec2 } from '../../../core/math/vec2.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { InputController } from '../input.js';
import { damp } from '../math.js';
import { Pose } from '../pose.js';
import { math } from '../../../core/math/math.js';

/** @import { InputFrame } from '../input.js'; */

const dir = new Vec3();
const offset = new Vec3();
const angles = new Vec3();

const rotation = new Quat();
const unrealBack = new Vec3(-1, 0, 0);

/**
 * The orbit controller. The pose orbits a focus point at a distance: `rotate` deltas turn the
 * view around the focus within {@link yawRange} and {@link pitchRange}, the first two `move`
 * components pan the focus point, and the third scales the distance within {@link zoomRange}.
 * Motion is smoothed with {@link rotateDamping}, {@link moveDamping} and {@link zoomDamping}.
 *
 * @category Input
 * @alpha
 */
class OrbitController extends InputController {
    /**
     * @type {Pose}
     * @private
     */
    _targetRootPose = new Pose();

    /**
     * @type {Pose}
     * @private
     */
    _rootPose = new Pose();

    /**
     * @type {Pose}
     * @private
     */
    _targetChildPose = new Pose();

    /**
     * @type {Pose}
     * @private
     */
    _childPose = new Pose();

    /** @private */
    _zoomRange = new Vec2(-Infinity, Infinity);

    /**
     * The rotation damping. In the range 0 to 1, where a value of 0 means no damping and 1 means
     * full damping. Default is 0.98.
     */
    rotateDamping = 0.98;

    /**
     * The movement damping. In the range 0 to 1, where a value of 0 means no damping and 1 means
     * full damping. Default is 0.98.
     */
    moveDamping = 0.98;

    /**
     * The zoom damping. A higher value means more damping. A value of 0 means no damping.
     */
    zoomDamping = 0.98;

    set pitchRange(range) {
        this._targetRootPose.pitchRange.copy(range);
        this._rootPose.copy(this._targetRootPose.rotate(Vec3.ZERO));
    }

    get pitchRange() {
        return this._targetRootPose.pitchRange;
    }

    set yawRange(range) {
        this._targetRootPose.yawRange.copy(range);
        this._rootPose.copy(this._targetRootPose.rotate(Vec3.ZERO));
    }

    get yawRange() {
        return this._targetRootPose.yawRange;
    }

    set zoomRange(range) {
        this._zoomRange.copy(range);
        this._syncZoomRange();
        this._childPose.copy(this._targetChildPose.move(Vec3.ZERO));
    }

    get zoomRange() {
        return this._zoomRange;
    }

    _syncZoomRange() {
        if (this._targetChildPose.coordinateSystem === 'unreal') {
            this._targetChildPose.xRange.set(-this._zoomRange.y, -this._zoomRange.x);
        } else {
            this._targetChildPose.zRange.copy(this._zoomRange);
        }
    }

    /**
     * @param {Pose} pose - The initial pose of the controller.
     * @param {boolean} [smooth] - Whether to smooth the transition.
     */
    attach(pose, smooth = true) {
        for (const internalPose of [this._targetRootPose, this._rootPose, this._targetChildPose, this._childPose, this._pose]) {
            internalPose.coordinateSystem = pose.coordinateSystem;
        }
        this._syncZoomRange();
        this._targetRootPose.set(pose.getFocus(dir), pose.angles, 0);
        this._targetChildPose.position.copy(pose.coordinateSystem === 'unreal' ? unrealBack : Vec3.BACK).mulScalar(pose.distance);

        if (!smooth) {
            this._rootPose.copy(this._targetRootPose);
            this._childPose.copy(this._targetChildPose);
        }
    }

    detach() {
        this._targetRootPose.copy(this._rootPose);
        this._targetChildPose.copy(this._childPose);
    }

    /**
     * @param {InputFrame<{ move: number[], rotate: number[] }>} frame - The input frame.
     * @param {number} dt - The delta time.
     * @returns {Pose} - The controller pose.
     */
    update(frame, dt) {
        const { move, rotate } = frame.read();

        // move
        const unrealCoordinates = this._rootPose.coordinateSystem === 'unreal';
        offset.set(unrealCoordinates ? 0 : move[0], unrealCoordinates ? 0 : move[1], 0);
        if (unrealCoordinates) offset.set(0, move[0], move[1]);
        this._rootPose.getRotation(rotation).transformVector(offset, offset);
        this._targetRootPose.move(offset);
        const dist = unrealCoordinates ? -this._targetChildPose.position.x : this._targetChildPose.position.z;
        const zoomedDistance = math.clamp(dist * (1 + move[2]), this._zoomRange.x, this._zoomRange.y);
        this._targetChildPose.position.copy(unrealCoordinates ? unrealBack : Vec3.BACK).mulScalar(zoomedDistance);

        // rotate
        this._targetRootPose.rotate(unrealCoordinates ? angles.set(0, -rotate[1], -rotate[0]) : angles.set(-rotate[1], -rotate[0], 0));

        // smoothing
        this._rootPose.lerp(
            this._rootPose,
            this._targetRootPose,
            damp(this.moveDamping, dt),
            damp(this.rotateDamping, dt),
            1
        );
        this._childPose.lerp(
            this._childPose,
            this._targetChildPose,
            damp(this.zoomDamping, dt),
            1,
            1
        );

        // calculate final pose
        this._rootPose.getRotation(rotation)
        .transformVector(this._childPose.position, offset)
        .add(this._rootPose.position);
        return this._pose.set(offset, this._rootPose.angles,
            unrealCoordinates ? -this._childPose.position.x : this._childPose.position.z);
    }

    destroy() {
        this.detach();
    }
}

export { OrbitController };
