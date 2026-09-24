import { Mat4 } from './mat4.js';
import { Quat } from './quat.js';
import { Vec3 } from './vec3.js';

// Old PlayCanvas (X right, Y up, -Z forward) -> Unreal (X forward, Y right, Z up).
// This reflection is deliberately confined to the format boundary; it does not change engine math.

/**
 * Converts a position or direction from the legacy PlayCanvas world basis to Unreal's X-forward,
 * Y-right, Z-up basis. Coordinates are not rescaled; the caller owns unit conversion.
 *
 * @param {Vec3} value - Legacy position or direction.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted vector.
 */
const legacyToUnrealVector = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(-z, x, y);
};

/**
 * Converts a position or direction from Unreal's basis to the legacy PlayCanvas world basis.
 *
 * @param {Vec3} value - Unreal position or direction.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted vector.
 */
const unrealToLegacyVector = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(y, z, -x);
};

/**
 * Permutes scale magnitudes into Unreal axes without introducing a negative scale. Use matrix
 * conversion separately when a transform contains reflection or shear.
 *
 * @param {Vec3} value - Legacy scale magnitudes.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted scale.
 */
const legacyToUnrealScale = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(z, x, y);
};

/**
 * Permutes Unreal scale magnitudes into legacy axes without introducing a negative scale.
 *
 * @param {Vec3} value - Unreal scale magnitudes.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted scale.
 */
const unrealToLegacyScale = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(y, z, x);
};

/**
 * Converts a PlayCanvas 2D world position or direction (X horizontal, Y vertical, Z depth) to a
 * Paper2D-style Unreal basis (X horizontal, Z vertical, Y depth). This is a planar convention and
 * is intentionally different from the 3D world basis conversion.
 *
 * @param {Vec3} value - Legacy 2D position or direction.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted vector.
 */
const legacyToUnrealPaper2DVector = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(x, z, y);
};

/**
 * Converts a Paper2D-style Unreal position or direction back to PlayCanvas 2D world coordinates.
 *
 * @param {Vec3} value - Paper2D position or direction.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted vector.
 */
const unrealToLegacyPaper2DVector = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(x, z, y);
};

/**
 * Permutes PlayCanvas 2D scale magnitudes to Paper2D axes without introducing negative scale.
 *
 * @param {Vec3} value - Legacy 2D scale.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted scale.
 */
const legacyToUnrealPaper2DScale = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(x, z, y);
};

/**
 * Permutes Paper2D scale magnitudes back to PlayCanvas 2D axes.
 *
 * @param {Vec3} value - Paper2D scale.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Converted scale.
 */
const unrealToLegacyPaper2DScale = (value, result = new Vec3()) => {
    const { x, y, z } = value;
    return result.set(x, z, y);
};

/**
 * Changes a PlayCanvas 2D orientation quaternion to the Paper2D basis. The axis permutation swaps
 * Y and Z and reflects orientation axes accordingly. This does not convert Euler conventions.
 *
 * @param {Quat} value - Legacy orientation.
 * @param {Quat} [result] - Optional destination.
 * @returns {Quat} Converted orientation.
 */
const legacyToUnrealPaper2DRotation = (value, result = new Quat()) => {
    const { x, y, z, w } = value;
    return result.set(-x, -z, -y, w);
};

/**
 * Changes a Paper2D orientation quaternion back to PlayCanvas 2D basis.
 *
 * @param {Quat} value - Paper2D orientation.
 * @param {Quat} [result] - Optional destination.
 * @returns {Quat} Converted orientation.
 */
const unrealToLegacyPaper2DRotation = (value, result = new Quat()) => {
    const { x, y, z, w } = value;
    return result.set(-x, -z, -y, w);
};

/**
 * Changes the basis of a legacy orientation quaternion. A reflected basis reverses the axial
 * (imaginary) part as well as permuting it. This does not convert Euler angle conventions.
 *
 * @param {Quat} value - Legacy orientation.
 * @param {Quat} [result] - Optional destination.
 * @returns {Quat} Converted orientation.
 */
const legacyToUnrealRotation = (value, result = new Quat()) => {
    const { x, y, z, w } = value;
    return result.set(z, -x, -y, w);
};

/**
 * Changes the basis of an Unreal orientation quaternion to the legacy convention.
 *
 * @param {Quat} value - Unreal orientation.
 * @param {Quat} [result] - Optional destination.
 * @returns {Quat} Converted orientation.
 */
const unrealToLegacyRotation = (value, result = new Quat()) => {
    const { x, y, z, w } = value;
    return result.set(-y, -z, x, w);
};

/**
 * Converts Unreal's XYZ Euler vector (Roll, Pitch, Yaw), in degrees, to a quaternion. This
 * follows TRotator::Quaternion in UE 5.8: yaw turns right about Z, pitch looks up about Y,
 * and roll rotates about X. The destination may be reused.
 *
 * @param {Vec3} angles - Roll (X), Pitch (Y), Yaw (Z), in degrees.
 * @param {Quat} [result] - Optional destination.
 * @returns {Quat} Unreal orientation.
 */
const unrealEulerToRotation = (angles, result = new Quat()) => {
    const pitch = angles.y * Math.PI / 360;
    const yaw = angles.z * Math.PI / 360;
    const roll = angles.x * Math.PI / 360;
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sr = Math.sin(roll);
    const cr = Math.cos(roll);
    return result.set(
        cr * sp * sy - sr * cp * cy,
        -cr * sp * cy - sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy
    );
};

/**
 * Converts an Unreal orientation quaternion to XYZ Euler (Roll, Pitch, Yaw) degrees, matching
 * UE 5.8 TQuat::Rotator and TRotator::Euler. At pitch singularities, roll is chosen as zero.
 *
 * @param {Quat} rotation - Unreal orientation.
 * @param {Vec3} [result] - Optional destination.
 * @returns {Vec3} Roll (X), Pitch (Y), Yaw (Z), in degrees.
 */
const unrealRotationToEuler = (rotation, result = new Vec3()) => {
    const { x, y, z, w } = rotation;
    const singularity = z * x - w * y;
    const toDegrees = 180 / Math.PI;
    let pitch;
    let yaw;
    let roll;
    if (singularity < -0.4999995) {
        pitch = -90;
        yaw = -2 * Math.atan2(x, w) * toDegrees;
        roll = 0;
    } else if (singularity > 0.4999995) {
        pitch = 90;
        yaw = 2 * Math.atan2(x, w) * toDegrees;
        roll = 0;
    } else {
        pitch = Math.asin(Math.max(-1, Math.min(1, 2 * singularity))) * toDegrees;
        yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * toDegrees;
        roll = Math.atan2(-2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * toDegrees;
    }
    return result.set(roll, pitch, yaw);
};

/**
 * Converts a full legacy transform into Unreal coordinates by basis conjugation, including
 * translation, rotation, nonuniform scale and shear. The destination may be the input matrix.
 *
 * @param {Mat4} value - Legacy transform.
 * @param {Mat4} [result] - Optional destination.
 * @returns {Mat4} Converted transform.
 */
const legacyToUnrealMatrix = (value, result = new Mat4()) => {
    const input = value.data;
    const output = result.data;
    const converted = new Float32Array(16);
    // Each new axis selects one old axis; only new X reverses its direction.
    const axis = [2, 0, 1];
    const sign = [-1, 1, 1];
    for (let column = 0; column < 3; column++) {
        for (let row = 0; row < 3; row++) {
            converted[column * 4 + row] = sign[row] * sign[column] * input[axis[column] * 4 + axis[row]];
        }
    }
    converted[12] = -input[14];
    converted[13] = input[12];
    converted[14] = input[13];
    converted[15] = input[15];
    output.set(converted);
    return result;
};

/**
 * Converts a full Unreal transform into legacy coordinates by basis conjugation.
 *
 * @param {Mat4} value - Unreal transform.
 * @param {Mat4} [result] - Optional destination.
 * @returns {Mat4} Converted transform.
 */
const unrealToLegacyMatrix = (value, result = new Mat4()) => {
    const input = value.data;
    const output = result.data;
    const converted = new Float32Array(16);
    const axis = [1, 2, 0];
    const sign = [1, 1, -1];
    for (let column = 0; column < 3; column++) {
        for (let row = 0; row < 3; row++) {
            converted[column * 4 + row] = sign[row] * sign[column] * input[axis[column] * 4 + axis[row]];
        }
    }
    converted[12] = input[13];
    converted[13] = input[14];
    converted[14] = -input[12];
    converted[15] = input[15];
    output.set(converted);
    return result;
};

/**
 * Converts a full PlayCanvas 2D transform into the Paper2D basis by swapping Y and Z.
 *
 * @param {Mat4} value - Legacy transform.
 * @param {Mat4} [result] - Optional destination.
 * @returns {Mat4} Converted transform.
 */
const legacyToUnrealPaper2DMatrix = (value, result = new Mat4()) => {
    const input = value.data;
    const output = result.data;
    const converted = new Float32Array(16);
    const axis = [0, 2, 1];
    for (let column = 0; column < 3; column++) {
        for (let row = 0; row < 3; row++) {
            converted[column * 4 + row] = input[axis[column] * 4 + axis[row]];
        }
    }
    converted[12] = input[12];
    converted[13] = input[14];
    converted[14] = input[13];
    converted[15] = input[15];
    output.set(converted);
    return result;
};

/**
 * Converts a full Paper2D transform back to the PlayCanvas 2D basis.
 *
 * @param {Mat4} value - Paper2D transform.
 * @param {Mat4} [result] - Optional destination.
 * @returns {Mat4} Converted transform.
 */
const unrealToLegacyPaper2DMatrix = (value, result = new Mat4()) => {
    return legacyToUnrealPaper2DMatrix(value, result);
};

export {
    legacyToUnrealVector,
    unrealToLegacyVector,
    legacyToUnrealScale,
    unrealToLegacyScale,
    legacyToUnrealPaper2DVector,
    unrealToLegacyPaper2DVector,
    legacyToUnrealPaper2DScale,
    unrealToLegacyPaper2DScale,
    legacyToUnrealPaper2DRotation,
    unrealToLegacyPaper2DRotation,
    legacyToUnrealRotation,
    unrealToLegacyRotation,
    unrealEulerToRotation,
    unrealRotationToEuler,
    legacyToUnrealMatrix,
    unrealToLegacyMatrix,
    legacyToUnrealPaper2DMatrix,
    unrealToLegacyPaper2DMatrix
};
