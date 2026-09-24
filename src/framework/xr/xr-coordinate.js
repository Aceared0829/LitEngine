import { graphicsEyeToCamera, cameraToGraphicsEye } from '../../core/math/camera-basis.js';
import { Mat4 } from '../../core/math/mat4.js';
import {
    legacyToUnrealRotation,
    legacyToUnrealVector,
    unrealToLegacyRotation,
    unrealToLegacyVector
} from '../../core/math/coordinate-conversion.js';

/** @private */
const _xrViewInverse = new Mat4();

/** @private */
const _xrView = new Mat4();

// Scratch matrices used to rotate the five second-order real spherical-harmonic terms.
const _shRotation = new Float64Array(9);
const _shTensor = new Float64Array(9);
const _shIntermediate = new Float64Array(9);
const _shWorldTensor = new Float64Array(9);

/**
 * Copies a WebXR-space vector into the active application's coordinate system.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {object} source - Source vector.
 * @param {import('../../core/math/vec3.js').Vec3} result - Destination vector.
 * @returns {import('../../core/math/vec3.js').Vec3} Destination vector.
 * @ignore
 */
const copyXrVectorToEngine = (manager, source, result) => {
    return manager.app.coordinateSystem === 'unreal' ? legacyToUnrealVector(source, result) : result.copy(source);
};

/**
 * Copies an engine-space vector into WebXR's right-handed, Y-up reference space.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {object} source - Source vector.
 * @param {import('../../core/math/vec3.js').Vec3} result - Destination vector.
 * @returns {import('../../core/math/vec3.js').Vec3} Destination vector.
 * @ignore
 */
const copyEngineVectorToXr = (manager, source, result) => {
    return manager.app.coordinateSystem === 'unreal' ? unrealToLegacyVector(source, result) : result.copy(source);
};

/**
 * Copies a WebXR-space orientation into the active application's coordinate system.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {object} source - Source quaternion.
 * @param {import('../../core/math/quat.js').Quat} result - Destination quaternion.
 * @returns {import('../../core/math/quat.js').Quat} Destination quaternion.
 * @ignore
 */
const copyXrRotationToEngine = (manager, source, result) => {
    return manager.app.coordinateSystem === 'unreal' ? legacyToUnrealRotation(source, result) : result.copy(source);
};

/**
 * Copies an engine-space orientation into WebXR's right-handed, Y-up reference space.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {object} source - Source quaternion.
 * @param {import('../../core/math/quat.js').Quat} result - Destination quaternion.
 * @returns {import('../../core/math/quat.js').Quat} Destination quaternion.
 * @ignore
 */
const copyEngineRotationToXr = (manager, source, result) => {
    return manager.app.coordinateSystem === 'unreal' ? unrealToLegacyRotation(source, result) : result.copy(source);
};

/**
 * Rotates WebXR's order-2 real spherical-harmonic coefficients from probe space into the
 * application's world space. The input and output contain nine RGB coefficients in WebXR order.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {ArrayLike<number>} source - Probe-space coefficients in WebXR order.
 * @param {import('../../core/math/quat.js').Quat} probeOrientation - Probe-to-reference orientation
 * in WebXR coordinates.
 * @param {Float32Array} result - Destination array for world-space coefficients.
 * @returns {Float32Array} The destination array.
 * @ignore
 */
const copyXrSphericalHarmonicsToEngine = (manager, source, probeOrientation, result) => {
    const x = probeOrientation.x;
    const y = probeOrientation.y;
    const z = probeOrientation.z;
    const w = probeOrientation.w;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const xw = x * w;
    const yw = y * w;
    const zw = z * w;
    const rotation = _shRotation;

    // Row-major transform from probe-local axes to the application's world axes.
    rotation[0] = 1 - 2 * (yy + zz);
    rotation[1] = 2 * (xy - zw);
    rotation[2] = 2 * (xz + yw);
    rotation[3] = 2 * (xy + zw);
    rotation[4] = 1 - 2 * (xx + zz);
    rotation[5] = 2 * (yz - xw);
    rotation[6] = 2 * (xz - yw);
    rotation[7] = 2 * (yz + xw);
    rotation[8] = 1 - 2 * (xx + yy);

    if (manager.app.coordinateSystem === 'unreal') {
        // WebXR (+X right, +Y up, -Z forward) to Unreal (+X forward, +Y right, +Z up).
        // Apply the same orthogonal basis change to both the probe-local and world directions.
        const r0 = rotation[0];
        const r1 = rotation[1];
        const r2 = rotation[2];
        const r3 = rotation[3];
        const r4 = rotation[4];
        const r5 = rotation[5];
        const r6 = rotation[6];
        const r7 = rotation[7];
        const r8 = rotation[8];
        rotation[0] = -r6;
        rotation[1] = -r7;
        rotation[2] = -r8;
        rotation[3] = r0;
        rotation[4] = r1;
        rotation[5] = r2;
        rotation[6] = r3;
        rotation[7] = r4;
        rotation[8] = r5;
    }

    const tensor = _shTensor;
    const intermediate = _shIntermediate;
    const worldTensor = _shWorldTensor;
    const coefficientScale = 1.092548;
    const diagonalScale = 0.315392;
    const differenceScale = 0.546274;

    for (let channel = 0; channel < 3; channel++) {
        // The first-order coefficients represent a vector ordered as (x, y, z) at indices (3, 1, 2).
        const vx = source[9 + channel];
        const vy = source[3 + channel];
        const vz = source[6 + channel];
        result[3 + channel] = rotation[3] * vx + rotation[4] * vy + rotation[5] * vz;
        result[6 + channel] = rotation[6] * vx + rotation[7] * vy + rotation[8] * vz;
        result[9 + channel] = rotation[0] * vx + rotation[1] * vy + rotation[2] * vz;
        result[channel] = source[channel];

        // Encode the five second-order coefficients as a symmetric traceless quadratic tensor.
        const diagonal = source[18 + channel] * diagonalScale;
        const difference = source[24 + channel] * differenceScale;
        const xyTerm = source[12 + channel] * coefficientScale * 0.5;
        const yzTerm = source[15 + channel] * coefficientScale * 0.5;
        const xzTerm = source[21 + channel] * coefficientScale * 0.5;
        tensor[0] = -diagonal + difference;
        tensor[1] = xyTerm;
        tensor[2] = xzTerm;
        tensor[3] = xyTerm;
        tensor[4] = -diagonal - difference;
        tensor[5] = yzTerm;
        tensor[6] = xzTerm;
        tensor[7] = yzTerm;
        tensor[8] = 2 * diagonal;

        // Q_world = R * Q_probe * transpose(R).
        for (let row = 0; row < 3; row++) {
            const rowOffset = row * 3;
            for (let column = 0; column < 3; column++) {
                intermediate[rowOffset + column] =
                    rotation[rowOffset] * tensor[column] +
                    rotation[rowOffset + 1] * tensor[3 + column] +
                    rotation[rowOffset + 2] * tensor[6 + column];
            }
        }
        for (let row = 0; row < 3; row++) {
            const rowOffset = row * 3;
            for (let column = 0; column < 3; column++) {
                const columnOffset = column * 3;
                worldTensor[rowOffset + column] =
                    intermediate[rowOffset] * rotation[columnOffset] +
                    intermediate[rowOffset + 1] * rotation[columnOffset + 1] +
                    intermediate[rowOffset + 2] * rotation[columnOffset + 2];
            }
        }

        result[12 + channel] = 2 * worldTensor[1] / coefficientScale;
        result[15 + channel] = 2 * worldTensor[5] / coefficientScale;
        result[18 + channel] = worldTensor[8] / (2 * diagonalScale);
        result[21 + channel] = 2 * worldTensor[2] / coefficientScale;
        result[24 + channel] = (worldTensor[0] + worldTensor[8] * 0.5) / differenceScale;
    }

    return result;
};

/**
 * Copies WebXR view matrices while converting only their world-space basis. The view-local axes
 * stay in graphics eye space so the WebXR projection matrix remains valid.
 *
 * @param {object} manager - XR manager that owns the application.
 * @param {XRView} view - WebXR view.
 * @param {Mat4} viewInverse - Destination eye-to-world matrix.
 * @param {Mat4} viewMatrix - Destination world-to-eye matrix.
 * @ignore
 */
const copyXrViewMatrices = (manager, view, viewInverse, viewMatrix) => {
    if (manager.app.coordinateSystem !== 'unreal') {
        viewInverse.set(view.transform.matrix);
        viewMatrix.set(view.transform.inverse.matrix);
        return;
    }

    _xrViewInverse.set(view.transform.matrix);
    _xrView.set(view.transform.inverse.matrix);
    viewInverse.mul2(graphicsEyeToCamera, _xrViewInverse);
    viewMatrix.mul2(_xrView, cameraToGraphicsEye);
};

export {
    copyEngineRotationToXr,
    copyXrSphericalHarmonicsToEngine,
    copyEngineVectorToXr,
    copyXrRotationToEngine,
    copyXrVectorToEngine,
    copyXrViewMatrices
};
