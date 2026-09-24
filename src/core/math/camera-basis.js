import { Mat4 } from './mat4.js';

/**
 * Unreal-style camera local basis expressed in conventional graphics eye space. Camera +X is
 * forward, +Y screen right, +Z screen up. This mirrored basis is not a quaternion rotation.
 *
 * @ignore
 */
const cameraToGraphicsEye = new Mat4().set([
    0, 0, -1, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
]);

/** @ignore */
const graphicsEyeToCamera = new Mat4().set([
    0, 1, 0, 0,
    0, 0, 1, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1
]);

export { cameraToGraphicsEye, graphicsEyeToCamera };
