import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import {
    legacyToUnrealRotation,
    legacyToUnrealScale,
    legacyToUnrealVector,
    legacyToUnrealPaper2DRotation,
    legacyToUnrealPaper2DScale,
    legacyToUnrealPaper2DVector,
    unrealEulerToRotation,
    unrealRotationToEuler,
    unrealToLegacyRotation,
    unrealToLegacyScale,
    unrealToLegacyVector,
    unrealToLegacyPaper2DRotation,
    unrealToLegacyPaper2DScale,
    unrealToLegacyPaper2DVector
} from '../../core/math/coordinate-conversion.js';

const LEGACY_MARKER = Object.freeze({
    version: 1,
    scope: 'legacy-json-animation-node-keys',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const PAPER2D_MARKER = Object.freeze({
    ...LEGACY_MARKER,
    version: 2,
    scope: 'legacy-json-animation-node-keys-paper2d',
    paper2dNodeNames: []
});

const getPaper2DNodeNames = (marker) => {
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
        throw new Error('Unsupported animation coordinateMigration marker');
    }
    if (Object.keys(marker).length === Object.keys(LEGACY_MARKER).length &&
        Object.entries(LEGACY_MARKER).every(([key, value]) => marker[key] === value)) {
        return [];
    }
    const fields = Object.keys(PAPER2D_MARKER);
    if (marker.version === PAPER2D_MARKER.version && Object.keys(marker).length === fields.length &&
        fields.every(key => key === 'paper2dNodeNames' || marker[key] === PAPER2D_MARKER[key]) &&
        Array.isArray(marker.paper2dNodeNames) &&
        marker.paper2dNodeNames.every(name => typeof name === 'string' && name.length > 0) &&
        new Set(marker.paper2dNodeNames).size === marker.paper2dNodeNames.length) {
        return marker.paper2dNodeNames;
    }
    throw new Error('Unsupported animation coordinateMigration marker');
};

const normalizeNodeNames = (names) => {
    if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.length > 0) ||
        new Set(names).size !== names.length) {
        throw new TypeError('paper2dNodeNames must contain unique, non-empty animation node names');
    }
    return names.slice().sort();
};

const readVector = (value, field) => {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
        throw new TypeError(`Invalid animation ${field}`);
    }
    return new Vec3(value);
};

const copyAnimation = (source) => {
    if (!source || typeof source !== 'object' || ![3, 4].includes(source.animation?.version) ||
        !Array.isArray(source.animation.nodes)) {
        throw new TypeError('Expected PlayCanvas JSON animation version 3 or 4');
    }
    return structuredClone(source);
};

const convert = (data, toUnreal, paper2dNodeNames = new Set()) => {
    const version = data.animation.version;
    for (const node of data.animation.nodes) {
        if (!Array.isArray(node.keys) || (version === 4 && (!node.defaults || typeof node.defaults !== 'object'))) {
            throw new TypeError('Invalid animation node keys or defaults');
        }
        const isPaper2D = paper2dNodeNames.has(node.name);
        const convertPosition = isPaper2D ?
            (toUnreal ? legacyToUnrealPaper2DVector : unrealToLegacyPaper2DVector) :
            (toUnreal ? legacyToUnrealVector : unrealToLegacyVector);
        const convertRotation = isPaper2D ?
            (toUnreal ? legacyToUnrealPaper2DRotation : unrealToLegacyPaper2DRotation) :
            (toUnreal ? legacyToUnrealRotation : unrealToLegacyRotation);
        const convertScale = isPaper2D ?
            (toUnreal ? legacyToUnrealPaper2DScale : unrealToLegacyPaper2DScale) :
            (toUnreal ? legacyToUnrealScale : unrealToLegacyScale);
        const readRotation = toUnreal ? angles => new Quat().setFromEulerAngles(angles) : unrealEulerToRotation;
        const writeRotation = toUnreal ? unrealRotationToEuler : rotation => rotation.getEulerAngles();
        const fields = version === 3 ? ['pos', 'rot', 'scale'] : ['p', 'r', 's'];
        for (const values of [node.defaults, ...node.keys]) {
            if (!values) {
                continue;
            }
            for (const [index, field] of fields.entries()) {
                if (!Object.hasOwn(values, field) || values[field] == null) {
                    continue;
                }
                const vector = readVector(values[field], field);
                values[field] = (index === 0 ? convertPosition(vector) :
                    index === 1 ? writeRotation(convertRotation(readRotation(vector))) :
                        convertScale(vector)).toArray();
            }
        }
    }
    return data;
};

/**
 * Copies a PlayCanvas JSON animation and converts node key/default PRS to Unreal coordinates.
 * Rotation triples become UE XYZ Euler (Roll, Pitch, Yaw) degrees. Optionally select Paper2D
 * nodes by their unique animation node names to convert those tracks onto the XZ plane.
 *
 * @param {object} source - Legacy JSON animation version 3 or 4.
 * @param {object} [options] - Additional migration scopes.
 * @param {string[]} [options.paper2dNodeNames] - Unique animation node names that use the legacy
 * XY Paper2D plane. The tagged output records these names for preview and repeat use.
 * @returns {object} Tagged migrated copy.
 */
const migrateLegacyAnimationTransforms = (source, options = {}) => {
    const data = copyAnimation(source);
    const requestedNames = options.paper2dNodeNames === undefined ? undefined : normalizeNodeNames(options.paper2dNodeNames);
    if (Object.hasOwn(data, 'coordinateMigration')) {
        const markedNames = getPaper2DNodeNames(data.coordinateMigration);
        if (requestedNames && JSON.stringify(requestedNames) !== JSON.stringify(markedNames)) {
            throw new Error('Animation coordinateMigration marker has a different Paper2D node selection');
        }
        return data;
    }
    const paper2dNodeNames = requestedNames ?? [];
    if (paper2dNodeNames.length) {
        for (const name of paper2dNodeNames) {
            if (data.animation.nodes.filter(node => node.name === name).length !== 1) {
                throw new Error(`Paper2D animation node name '${name}' must match exactly one node`);
            }
        }
    }
    convert(data, true, new Set(paper2dNodeNames));
    data.coordinateMigration = paper2dNodeNames.length ?
        { ...PAPER2D_MARKER, paper2dNodeNames } : { ...LEGACY_MARKER };
    return data;
};

/**
 * Creates a temporary legacy-basis copy of a tagged JSON animation for the current runtime.
 *
 * @param {object} source - Tagged JSON animation.
 * @returns {object} Unmarked preview copy.
 */
const previewMigratedAnimationTransforms = (source) => {
    const data = copyAnimation(source);
    const paper2dNodeNames = getPaper2DNodeNames(data.coordinateMigration);
    convert(data, false, new Set(paper2dNodeNames));
    delete data.coordinateMigration;
    return data;
};

export { migrateLegacyAnimationTransforms, previewMigratedAnimationTransforms };
