import { Debug } from '../../core/debug.js';
import { calculateNormals, calculateTangents } from './geometry-utils.js';

const convertCoordinateBasis = (geometry, target, convertTriple) => {
    if (geometry.coordinateSystem === target) {
        return geometry;
    }
    if (geometry.coordinateSystem !== 'legacy') {
        throw new Error(`Cannot convert ${geometry.coordinateSystem} geometry to ${target}`);
    }
    if (!geometry.positions || !geometry.indices || geometry.positions.length % 3 !== 0 || geometry.indices.length % 3 !== 0 ||
        (geometry.normals && geometry.normals.length !== geometry.positions.length) ||
        (geometry.tangents && geometry.tangents.length !== geometry.positions.length / 3 * 4)) {
        throw new Error(`${target} geometry conversion requires complete indexed triangles`);
    }

    const convertTriples = (source) => {
        if (!source) return;
        for (let i = 0; i < source.length; i += 3) {
            convertTriple(source, i);
        }
    };
    convertTriples(geometry.positions);
    convertTriples(geometry.normals);
    if (geometry.tangents) {
        for (let i = 0; i < geometry.tangents.length; i += 4) {
            convertTriple(geometry.tangents, i);
            geometry.tangents[i + 3] = -geometry.tangents[i + 3];
        }
    }
    for (let i = 0; i < geometry.indices.length; i += 3) {
        const second = geometry.indices[i + 1];
        geometry.indices[i + 1] = geometry.indices[i + 2];
        geometry.indices[i + 2] = second;
    }
    geometry.coordinateSystem = target;
    return geometry;
};

const convertToUnreal = (source, index) => {
    const x = source[index];
    const y = source[index + 1];
    const z = source[index + 2];
    source[index] = -z;
    source[index + 1] = x;
    source[index + 2] = y;
};

const convertToUnrealPaper2D = (source, index) => {
    const y = source[index + 1];
    source[index + 1] = source[index + 2];
    source[index + 2] = y;
};

/**
 * The Geometry class serves as a container for storing geometric information. It encapsulates data
 * such as positions, normals, colors, and indices.
 *
 * @category Graphics
 */
class Geometry {
    /**
     * Coordinates used by this geometry's vertex data.
     *
     * @type {'legacy'|'unreal'|'unreal-paper2d'}
     */
    coordinateSystem = 'legacy';

    /**
     * Positions.
     *
     * @type {ArrayLike<number>|undefined}
     */
    positions;

    /**
     * Normals.
     *
     * @type {ArrayLike<number>|undefined}
     */
    normals;

    /**
     * Colors.
     *
     * @type {ArrayLike<number>|undefined}
     */
    colors;

    /**
     * UVs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    uvs;

    /**
     * Additional Uvs.
     *
     * @type {ArrayLike<number>|undefined}
     */
    uvs1;

    /**
     * Blend indices.
     *
     * @type {ArrayLike<number>|undefined}
     */
    blendIndices;

    /**
     * Blend weights.
     *
     * @type {ArrayLike<number>|undefined}
     */
    blendWeights;

    /**
     * Tangents.
     *
     * @type {ArrayLike<number>|undefined}
     */
    tangents;

    /**
     * Indices.
     *
     * @type {number[]|Uint8Array|Uint16Array|Uint32Array|undefined}
     */
    indices;

    /**
     * Converts an indexed triangle geometry from the legacy X-right/Y-up/-Z-forward basis to
     * Unreal's X-forward/Y-right/Z-up basis. Positions, normals, tangents and triangle winding
     * change in place; UVs and vertex colors retain their values. Call before creating a Mesh.
     * Repeated calls leave already converted geometry unchanged.
     *
     * @returns {this} The converted geometry.
     * @example
     * const geometry = new PlaneGeometry().convertToUnrealCoordinates();
     * const mesh = Mesh.fromGeometry(device, geometry);
     */
    convertToUnrealCoordinates() {
        return convertCoordinateBasis(this, 'unreal', convertToUnreal);
    }

    /**
     * Converts indexed triangles from the legacy XY plane to the Unreal Paper2D XZ plane, with Y
     * as depth. Positions, normals, tangents and triangle winding change in place; UVs and vertex
     * colors retain their values. Call before creating a Mesh. Repeated calls leave converted
     * geometry unchanged.
     *
     * @returns {this} The converted geometry.
     * @example
     * const geometry = new Geometry().convertToUnrealPaper2DCoordinates();
     */
    convertToUnrealPaper2DCoordinates() {
        return convertCoordinateBasis(this, 'unreal-paper2d', convertToUnrealPaper2D);
    }

    /**
     * Generates normal information from the positions and triangle indices.
     */
    calculateNormals() {
        Debug.assert(this.positions, 'Geometry must have positions set');
        Debug.assert(this.indices, 'Geometry must have indices set');
        this.normals = calculateNormals(this.positions, this.indices);
    }

    /**
     * Generates tangent information from the positions, normals, texture coordinates and triangle
     * indices.
     */
    calculateTangents() {
        Debug.assert(this.positions, 'Geometry must have positions set');
        Debug.assert(this.normals, 'Geometry must have normals set');
        Debug.assert(this.uvs, 'Geometry must have uvs set');
        Debug.assert(this.indices, 'Geometry must have indices set');
        this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices);
    }
}

export { Geometry };
