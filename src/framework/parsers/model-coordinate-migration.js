import { Mat4 } from '../../core/math/mat4.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import {
    legacyToUnrealMatrix,
    legacyToUnrealPaper2DMatrix,
    legacyToUnrealPaper2DRotation,
    legacyToUnrealPaper2DScale,
    legacyToUnrealPaper2DVector,
    legacyToUnrealRotation,
    legacyToUnrealScale,
    legacyToUnrealVector,
    unrealEulerToRotation,
    unrealRotationToEuler,
    unrealToLegacyMatrix,
    unrealToLegacyPaper2DMatrix,
    unrealToLegacyPaper2DRotation,
    unrealToLegacyPaper2DScale,
    unrealToLegacyPaper2DVector,
    unrealToLegacyRotation,
    unrealToLegacyScale,
    unrealToLegacyVector
} from '../../core/math/coordinate-conversion.js';

const MARKER = Object.freeze({
    version: 1,
    scope: 'json-model-nodes-geometry-skins-morphs',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const PAPER2D_MARKER = Object.freeze({
    version: 1,
    scope: 'json-model-nodes-geometry-skins-morphs-paper2d',
    basis: 'ue-paper2d-x-right-y-depth-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const isMarkedWith = (marker, expected) => marker && typeof marker === 'object' && !Array.isArray(marker) &&
    Object.keys(marker).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => marker[key] === value);

const isMarked = marker => isMarkedWith(marker, MARKER);
const isPaper2DMarked = marker => isMarkedWith(marker, PAPER2D_MARKER);
const isKnownMarked = marker => isMarked(marker) || isPaper2DMarked(marker);

const readVector = (values, label) => {
    if (!Array.isArray(values) || values.length !== 3 || !values.every(Number.isFinite)) {
        throw new TypeError(`Invalid model ${label}`);
    }
    return new Vec3(values);
};

const copyModel = (source) => {
    const model = source?.model;
    if (!model || model.version !== 3 || !Array.isArray(model.nodes) || !Array.isArray(model.vertices) ||
        !Array.isArray(model.meshes) || !Array.isArray(model.skins) ||
        (model.morphs !== undefined && !Array.isArray(model.morphs))) {
        throw new TypeError('Expected PlayCanvas JSON model version 3');
    }
    return structuredClone(source);
};

const convertAabb = (aabb, convertVector) => {
    const min = readVector(aabb?.min, 'AABB minimum');
    const max = readVector(aabb?.max, 'AABB maximum');
    if (min.x > max.x || min.y > max.y || min.z > max.z) {
        throw new TypeError('Invalid model AABB bounds');
    }
    const convertedMin = convertVector(min);
    const convertedMax = convertVector(max);
    aabb.min = [
        Math.min(convertedMin.x, convertedMax.x),
        Math.min(convertedMin.y, convertedMax.y),
        Math.min(convertedMin.z, convertedMax.z)
    ];
    aabb.max = [
        Math.max(convertedMin.x, convertedMax.x),
        Math.max(convertedMin.y, convertedMax.y),
        Math.max(convertedMin.z, convertedMax.z)
    ];
};

const convertTriples = (values, convertVector, label) => {
    if (!Array.isArray(values) || values.length % 3 !== 0 || !values.every(Number.isFinite)) {
        throw new TypeError(`Invalid model ${label}`);
    }
    for (let i = 0; i < values.length; i += 3) {
        const result = convertVector(new Vec3(values[i], values[i + 1], values[i + 2]));
        values[i] = result.x;
        values[i + 1] = result.y;
        values[i + 2] = result.z;
    }
};

const convertTangents = (attribute, convertVector) => {
    if (attribute.type !== 'float32' || attribute.components !== 4 || !Array.isArray(attribute.data) ||
        attribute.data.length % 4 !== 0 || !attribute.data.every(Number.isFinite)) {
        throw new TypeError('Invalid model tangent attribute');
    }
    const values = attribute.data;
    for (let i = 0; i < values.length; i += 4) {
        const result = convertVector(new Vec3(values[i], values[i + 1], values[i + 2]));
        values[i] = result.x;
        values[i + 1] = result.y;
        values[i + 2] = result.z;
        values[i + 3] = -values[i + 3];
    }
};

const convert = (data, toUnreal, paper2d = false) => {
    const model = data.model;
    const convertVector = paper2d ?
        (toUnreal ? legacyToUnrealPaper2DVector : unrealToLegacyPaper2DVector) :
        (toUnreal ? legacyToUnrealVector : unrealToLegacyVector);
    const convertScale = paper2d ?
        (toUnreal ? legacyToUnrealPaper2DScale : unrealToLegacyPaper2DScale) :
        (toUnreal ? legacyToUnrealScale : unrealToLegacyScale);
    const convertRotation = paper2d ?
        (toUnreal ? legacyToUnrealPaper2DRotation : unrealToLegacyPaper2DRotation) :
        (toUnreal ? legacyToUnrealRotation : unrealToLegacyRotation);
    const convertMatrix = paper2d ?
        (toUnreal ? legacyToUnrealPaper2DMatrix : unrealToLegacyPaper2DMatrix) :
        (toUnreal ? legacyToUnrealMatrix : unrealToLegacyMatrix);

    for (const node of model.nodes) {
        node.position = convertVector(readVector(node.position, 'node position')).toArray();
        node.scale = convertScale(readVector(node.scale, 'node scale')).toArray();
        const angles = readVector(node.rotation, 'node rotation');
        const rotation = toUnreal ? new Quat().setFromEulerAngles(angles) : unrealEulerToRotation(angles);
        const converted = convertRotation(rotation);
        node.rotation = (toUnreal ? unrealRotationToEuler(converted) : converted.getEulerAngles()).toArray();
    }

    for (const vertexBuffer of model.vertices) {
        for (const field of ['position', 'normal']) {
            const attribute = vertexBuffer[field];
            if (attribute) {
                if (attribute.type !== 'float32' || attribute.components !== 3) {
                    throw new TypeError(`Invalid model ${field} attribute`);
                }
                convertTriples(attribute.data, convertVector, `${field} attribute`);
            }
        }
        if (vertexBuffer.tangent) {
            convertTangents(vertexBuffer.tangent, convertVector);
        }
    }

    for (const mesh of model.meshes) {
        convertAabb(mesh.aabb, convertVector);
        if (mesh.type === 'triangles') {
            const vertexCount = model.vertices[mesh.vertices]?.position?.data?.length / 3;
            if (!Number.isInteger(vertexCount) || !Number.isInteger(mesh.base) || !Number.isInteger(mesh.count) ||
                mesh.base < 0 || mesh.count < 0 || mesh.count % 3 !== 0) {
                throw new TypeError('Invalid model triangle range');
            }
            if (!mesh.indices) {
                mesh.indices = Array.from({ length: vertexCount }, (_, index) => index);
            }
            if (!Array.isArray(mesh.indices) || mesh.base + mesh.count > mesh.indices.length) {
                throw new TypeError('Invalid model triangle indices');
            }
            for (let i = mesh.base; i < mesh.base + mesh.count; i += 3) {
                [mesh.indices[i + 1], mesh.indices[i + 2]] = [mesh.indices[i + 2], mesh.indices[i + 1]];
            }
        } else if (mesh.type === 'trianglestrip' || mesh.type === 'trianglefan') {
            throw new Error(`Model primitive ${mesh.type} requires triangle expansion before coordinate migration`);
        }
    }

    for (const skin of model.skins) {
        if (!Array.isArray(skin.inverseBindMatrices)) {
            throw new TypeError('Invalid model inverse bind matrices');
        }
        skin.inverseBindMatrices = skin.inverseBindMatrices.map((matrix) => {
            if (!Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(Number.isFinite)) {
                throw new TypeError('Invalid model inverse bind matrix');
            }
            return Array.from(convertMatrix(new Mat4().set(matrix)).data);
        });
    }

    for (const morph of model.morphs ?? []) {
        if (!Array.isArray(morph.targets)) {
            throw new TypeError('Invalid model morph targets');
        }
        for (const target of morph.targets) {
            convertAabb(target.aabb, convertVector);
            convertTriples(target.deltaPositions, convertVector, 'morph positions');
            convertTriples(target.deltaNormals, convertVector, 'morph normals');
        }
    }
    return data;
};

/**
 * Copies a legacy PlayCanvas JSON model v3 and converts its nodes, geometry, winding, skins and
 * morphs into Unreal coordinates. Unsupported triangle strips and fans fail explicitly.
 *
 * @param {object} source - Legacy JSON model version 3.
 * @returns {object} Tagged model copy.
 */
const migrateLegacyModel = (source) => {
    const data = copyModel(source);
    if (Object.hasOwn(data, 'coordinateMigration')) {
        if (!isKnownMarked(data.coordinateMigration)) {
            throw new Error('Unsupported model coordinateMigration marker');
        }
        return data;
    }
    convert(data, true);
    data.coordinateMigration = { ...MARKER };
    return data;
};

/**
 * Copies a legacy PlayCanvas JSON model v3 and converts it to the Paper2D basis with X horizontal,
 * Z vertical and Y depth. Geometry, node transforms, winding, skins and morphs are converted.
 * Triangle strips and fans fail explicitly until expanded.
 *
 * @param {object} source - Legacy JSON model version 3 authored in the XY plane.
 * @returns {object} Tagged Paper2D model copy.
 * @example
 * const tagged = migrateLegacyPaper2DModel(legacyModelJson);
 */
const migrateLegacyPaper2DModel = (source) => {
    const data = copyModel(source);
    if (Object.hasOwn(data, 'coordinateMigration')) {
        if (!isPaper2DMarked(data.coordinateMigration)) {
            throw new Error('Unsupported Paper2D model coordinateMigration marker');
        }
        return data;
    }
    convert(data, true, true);
    data.coordinateMigration = { ...PAPER2D_MARKER };
    return data;
};

/**
 * Creates a temporary legacy-basis copy of a tagged model for the current renderer.
 *
 * @param {object} source - Tagged JSON model.
 * @returns {object} Unmarked preview copy.
 */
const previewMigratedModel = (source) => {
    const data = copyModel(source);
    const paper2d = isPaper2DMarked(data.coordinateMigration);
    if (!paper2d && !isMarked(data.coordinateMigration)) {
        throw new Error('Unsupported model coordinateMigration marker');
    }
    convert(data, false, paper2d);
    delete data.coordinateMigration;
    return data;
};

export { migrateLegacyModel, migrateLegacyPaper2DModel, previewMigratedModel };
