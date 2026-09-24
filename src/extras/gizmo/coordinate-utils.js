import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';

/**
 * @import { GraphNode } from '../../scene/graph-node.js'
 * @import { Vec3 } from '../../core/math/vec3.js'
 */

const angles = new Vec3();
const rotation = new Quat();
const localRotation = new Quat();

const getRotation = (x, y, z) => rotation.setFromEulerAngles(x instanceof Vec3 ? x : angles.set(x, y, z));

/**
 * Applies a legacy intrinsic-XYZ Euler rotation to a gizmo helper node. These values describe
 * mesh alignment, so their quaternion must stay independent of the node's authoring convention.
 *
 * @param {GraphNode} node - The node to rotate.
 * @param {number|Vec3} x - Euler angles or the vector containing them.
 * @param {number} [y] - Y angle when `x` is numeric.
 * @param {number} [z] - Z angle when `x` is numeric.
 */
const setLegacyLocalEulerAngles = (node, x, y, z) => {
    node.setLocalRotation(getRotation(x, y, z));
};

/**
 * Applies a legacy intrinsic-XYZ Euler rotation in world space to a gizmo helper node.
 *
 * @param {GraphNode} node - The node to rotate.
 * @param {number|Vec3} x - Euler angles or the vector containing them.
 * @param {number} [y] - Y angle when `x` is numeric.
 * @param {number} [z] - Z angle when `x` is numeric.
 */
const setLegacyEulerAngles = (node, x, y, z) => {
    node.setRotation(getRotation(x, y, z));
};

/**
 * Applies a legacy intrinsic-XYZ local rotation on top of the node's current orientation.
 *
 * @param {GraphNode} node - The node to rotate.
 * @param {number|Vec3} x - Euler angles or the vector containing them.
 * @param {number} [y] - Y angle when `x` is numeric.
 * @param {number} [z] - Z angle when `x` is numeric.
 */
const rotateLegacyLocal = (node, x, y, z) => {
    localRotation.copy(node.getLocalRotation()).mul(getRotation(x, y, z));
    node.setLocalRotation(localRotation);
};

/**
 * Gets the normalized world directions of the node's component X, Y and Z axes.
 *
 * Gizmo axis names refer to numeric components, while `right`, `up` and `forward` describe
 * coordinate-system semantics and therefore map to different components in Unreal mode.
 *
 * @param {GraphNode} node - The node whose axes are queried.
 * @param {Vec3} x - Receives the world-space X-axis direction.
 * @param {Vec3} y - Receives the world-space Y-axis direction.
 * @param {Vec3} z - Receives the world-space Z-axis direction.
 * @returns {void}
 */
const getWorldAxes = (node, x, y, z) => {
    const transform = node.getWorldTransform();
    transform.getX(x).normalize();
    transform.getY(y).normalize();
    transform.getZ(z).normalize();
};

export { getWorldAxes, rotateLegacyLocal, setLegacyEulerAngles, setLegacyLocalEulerAngles };
