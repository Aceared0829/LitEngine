import { EventHandler } from '../../core/event-handler.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Quat } from '../../core/math/quat.js';
import { copyXrRotationToEngine, copyXrVectorToEngine } from './xr-coordinate.js';

/**
 * @import { XrMeshDetection } from './xr-mesh-detection.js'
 */

/**
 * Detected Mesh instance that provides its transform (position, rotation), triangles (vertices,
 * indices) and its semantic label. Any of its properties can change during its lifetime.
 *
 * @category XR
 */
class XrMesh extends EventHandler {
    /**
     * Fired when an {@link XrMesh} is removed.
     *
     * @event
     * @example
     * mesh.once('remove', () => {
     *     // mesh is no longer available
     * });
     */
    static EVENT_REMOVE = 'remove';

    /**
     * Fired when {@link XrMesh} attributes such as vertices, indices and/or label have been
     * changed. Position and rotation can change at any time without triggering a `change` event.
     *
     * @event
     * @example
     * mesh.on('change', () => {
     *     // mesh attributes have been changed
     * });
     */
    static EVENT_CHANGE = 'change';

    /**
     * @type {XrMeshDetection}
     * @private
     */
    _meshDetection;

    /**
     * @type {XRMesh}
     * @private
     */
    _xrMesh;

    /** @private */
    _lastChanged = 0;

    /** @private */
    _position = new Vec3();

    /** @private */
    _rotation = new Quat();

    /** @private */
    _convertedVertices = null;

    /** @private */
    _convertedIndices = null;

    /** @private */
    _convertedDataSource = null;

    /** @private */
    _convertedCoordinateSystem = null;

    /**
     * Create a new XrMesh instance.
     *
     * @param {XrMeshDetection} meshDetection - Mesh Detection
     * interface.
     * @param {XRMesh} xrMesh - XRMesh that is instantiated by WebXR system.
     * @ignore
     */
    constructor(meshDetection, xrMesh) {
        super();

        this._meshDetection = meshDetection;
        this._xrMesh = xrMesh;
        this._lastChanged = this._xrMesh.lastChangedTime;
    }

    /**
     * @type {XRMesh}
     * @ignore
     */
    get xrMesh() {
        return this._xrMesh;
    }

    /**
     * Semantic Label of a mesh that is provided by underlying system. Current list includes (but
     * not limited to): https://github.com/immersive-web/semantic-labels/blob/master/labels.json
     *
     * @type {string}
     */
    get label() {
        return this._xrMesh.semanticLabel || '';
    }

    /**
     * Array of mesh vertices. This array contains 3 components per vertex (`x, y, z`).
     *
     * @type {Float32Array}
     */
    get vertices() {
        const manager = this._meshDetection._manager;
        if (manager.app.coordinateSystem !== 'unreal') {
            return this._xrMesh.vertices;
        }

        if (this._convertedDataSource !== this._xrMesh.vertices || this._convertedCoordinateSystem !== manager.app.coordinateSystem) {
            const source = this._xrMesh.vertices;
            if (source.length % 3 !== 0) {
                throw new Error('Unreal XR mesh conversion requires three-component vertices');
            }
            const converted = new Float32Array(source.length);
            for (let i = 0; i < source.length; i += 3) {
                converted[i] = -source[i + 2];
                converted[i + 1] = source[i];
                converted[i + 2] = source[i + 1];
            }
            this._convertedVertices = converted;
            this._convertedDataSource = source;
            this._convertedCoordinateSystem = manager.app.coordinateSystem;
        }
        return this._convertedVertices;
    }

    /**
     * Array of mesh indices.
     *
     * @type {Uint32Array}
     */
    get indices() {
        const manager = this._meshDetection._manager;
        if (manager.app.coordinateSystem !== 'unreal') {
            return this._xrMesh.indices;
        }

        if (this._convertedDataSource !== this._xrMesh.vertices || !this._convertedIndices ||
            this._convertedCoordinateSystem !== manager.app.coordinateSystem) {
            const source = this._xrMesh.indices;
            const converted = new Uint32Array(source);
            if (converted.length % 3 !== 0) {
                throw new Error('Unreal XR mesh conversion requires triangle-list indices');
            }
            for (let i = 0; i < converted.length; i += 3) {
                const second = converted[i + 1];
                converted[i + 1] = converted[i + 2];
                converted[i + 2] = second;
            }
            this._convertedIndices = converted;
            this._convertedDataSource = this._xrMesh.vertices;
            this._convertedCoordinateSystem = manager.app.coordinateSystem;
        }
        return this._convertedIndices;
    }

    /** @ignore */
    destroy() {
        if (!this._xrMesh) return;
        this._xrMesh = null;
        this.fire('remove');
    }

    /**
     * @param {XRFrame} frame - XRFrame from requestAnimationFrame callback.
     * @ignore
     */
    update(frame) {
        const manager = this._meshDetection._manager;
        const pose = frame.getPose(this._xrMesh.meshSpace, manager._referenceSpace);
        if (pose) {
            copyXrVectorToEngine(manager, pose.transform.position, this._position);
            copyXrRotationToEngine(manager, pose.transform.orientation, this._rotation);
        }

        // attributes have been changed
        if (this._lastChanged !== this._xrMesh.lastChangedTime) {
            this._lastChanged = this._xrMesh.lastChangedTime;
            this._convertedDataSource = null;
            this._convertedVertices = null;
            this._convertedIndices = null;
            this.fire('change');
        }
    }

    /**
     * Get the world space position of a mesh.
     *
     * @returns {Vec3} The world space position of a mesh.
     */
    getPosition() {
        return this._position;
    }

    /**
     * Get the world space rotation of a mesh.
     *
     * @returns {Quat} The world space rotation of a mesh.
     */
    getRotation() {
        return this._rotation;
    }
}

export { XrMesh };
