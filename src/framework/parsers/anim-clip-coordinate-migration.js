import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import {
    legacyToUnrealRotation,
    legacyToUnrealScale,
    legacyToUnrealVector,
    legacyToUnrealPaper2DRotation,
    legacyToUnrealPaper2DScale,
    legacyToUnrealPaper2DVector,
    unrealToLegacyScale,
    unrealToLegacyVector,
    unrealToLegacyRotation,
    unrealToLegacyPaper2DRotation,
    unrealToLegacyPaper2DScale,
    unrealToLegacyPaper2DVector
} from '../../core/math/coordinate-conversion.js';

const LEGACY_MARKER = Object.freeze({
    version: 1,
    scope: 'animclip-graph-prs-tracks',
    basis: 'ue-x-forward-y-right-z-up',
    rotation: 'quaternion-xyzw'
});

const PAPER2D_MARKER = Object.freeze({
    ...LEGACY_MARKER,
    version: 2,
    scope: 'animclip-graph-prs-tracks-paper2d',
    paper2dEntityPaths: []
});

const pathKey = path => JSON.stringify(path);

const normalizeEntityPaths = (paths) => {
    if (!Array.isArray(paths) || !paths.every(path => Array.isArray(path) && path.length > 0 &&
        path.every(name => typeof name === 'string' && name.length > 0))) {
        throw new TypeError('paper2dEntityPaths must contain non-empty entity name paths');
    }
    const keys = paths.map(pathKey);
    if (new Set(keys).size !== keys.length) {
        throw new TypeError('paper2dEntityPaths must contain unique entity paths');
    }
    return paths.map(path => path.slice()).sort((lhs, rhs) => pathKey(lhs).localeCompare(pathKey(rhs)));
};

const getPaper2DEntityPaths = (marker) => {
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
        throw new Error('Unsupported animclip coordinateMigration marker');
    }
    if (Object.keys(marker).length === Object.keys(LEGACY_MARKER).length &&
        Object.entries(LEGACY_MARKER).every(([key, value]) => marker[key] === value)) {
        return [];
    }
    const fields = Object.keys(PAPER2D_MARKER);
    if (marker.version === PAPER2D_MARKER.version && Object.keys(marker).length === fields.length &&
        fields.every(key => key === 'paper2dEntityPaths' || marker[key] === PAPER2D_MARKER[key]) &&
        Array.isArray(marker.paper2dEntityPaths)) {
        const paths = normalizeEntityPaths(marker.paper2dEntityPaths);
        if (JSON.stringify(paths) === JSON.stringify(marker.paper2dEntityPaths)) return paths;
    }
    throw new Error('Unsupported animclip coordinateMigration marker');
};

const copyClip = (source) => {
    if (!source || typeof source !== 'object' || !Array.isArray(source.inputs) ||
        !Array.isArray(source.outputs) || !Array.isArray(source.curves)) {
        throw new TypeError('Expected PlayCanvas animclip JSON');
    }
    return structuredClone(source);
};

const trackKind = (curve) => {
    const path = curve.path;
    if (path?.component !== 'graph' || !Array.isArray(path.propertyPath) || path.propertyPath.length !== 1) {
        return null;
    }
    const property = path.propertyPath[0];
    return ['localPosition', 'localRotation', 'localScale'].includes(property) ? property : null;
};

const convert = (data, toUnreal, paper2dEntityPaths = new Set()) => {
    const kinds = new Map();
    for (const curve of data.curves) {
        const kind = trackKind(curve);
        const isPaper2D = kind ? paper2dEntityPaths.has(pathKey(curve.path.entityPath)) : false;
        const index = curve.outputIndex;
        if (!Number.isInteger(index) || index < 0 || index >= data.outputs.length) {
            throw new TypeError(`Invalid animclip output index ${index}`);
        }
        if (kinds.has(index) && (kinds.get(index).kind !== kind || kinds.get(index).isPaper2D !== isPaper2D)) {
            throw new Error(`Animclip output ${index} is shared by incompatible transform tracks`);
        }
        kinds.set(index, { kind, isPaper2D });
    }
    for (const [index, { kind, isPaper2D }] of kinds) {
        if (!kind) {
            continue;
        }
        const output = data.outputs[index];
        const components = kind === 'localRotation' ? 4 : 3;
        if (output?.components !== components || !Array.isArray(output.data) ||
            output.data.length % components !== 0 || !output.data.every(Number.isFinite)) {
            throw new TypeError(`Invalid animclip ${kind} output ${index}`);
        }
        const values = output.data;
        for (let i = 0; i < values.length; i += components) {
            const x = values[i];
            const y = values[i + 1];
            const z = values[i + 2];
            if (kind === 'localRotation') {
                // Basis conjugation is linear in quaternion components, including cubic tangents.
                const convertRotation = isPaper2D ?
                    (toUnreal ? legacyToUnrealPaper2DRotation : unrealToLegacyPaper2DRotation) :
                    (toUnreal ? legacyToUnrealRotation : unrealToLegacyRotation);
                const result = convertRotation(new Quat(x, y, z, values[i + 3]));
                values[i] = result.x;
                values[i + 1] = result.y;
                values[i + 2] = result.z;
                values[i + 3] = result.w;
            } else {
                const convertVector = isPaper2D ?
                    (kind === 'localScale' ?
                        (toUnreal ? legacyToUnrealPaper2DScale : unrealToLegacyPaper2DScale) :
                        (toUnreal ? legacyToUnrealPaper2DVector : unrealToLegacyPaper2DVector)) :
                    (kind === 'localScale' ?
                        (toUnreal ? legacyToUnrealScale : unrealToLegacyScale) :
                        (toUnreal ? legacyToUnrealVector : unrealToLegacyVector));
                const result = convertVector(new Vec3(x, y, z));
                values[i] = result.x;
                values[i + 1] = result.y;
                values[i + 2] = result.z;
            }
        }
    }
    return data;
};

/**
 * Copies an animclip JSON and converts graph position, quaternion rotation and scale tracks to
 * Unreal coordinates. Quaternion values and cubic tangents retain XYZW storage and interpolation.
 * Optionally select exact entity paths that use the legacy XY Paper2D plane. Other property tracks
 * are copied unchanged.
 *
 * @param {object} source - Legacy animclip JSON.
 * @param {object} [options] - Additional migration scopes.
 * @param {string[][]} [options.paper2dEntityPaths] - Entity name paths that use the legacy XY
 * Paper2D plane. The tagged output records these paths for preview and repeat use.
 * @returns {object} Tagged migrated copy.
 */
const migrateLegacyAnimClipTracks = (source, options = {}) => {
    const data = copyClip(source);
    const requestedPaths = options.paper2dEntityPaths === undefined ? undefined : normalizeEntityPaths(options.paper2dEntityPaths);
    if (Object.hasOwn(data, 'coordinateMigration')) {
        const markedPaths = getPaper2DEntityPaths(data.coordinateMigration);
        if (requestedPaths && JSON.stringify(requestedPaths) !== JSON.stringify(markedPaths)) {
            throw new Error('Animclip coordinateMigration marker has a different Paper2D path selection');
        }
        return data;
    }
    const paper2dEntityPaths = requestedPaths ?? [];
    const transformPaths = new Set();
    for (const curve of data.curves) {
        if (trackKind(curve)) transformPaths.add(pathKey(curve.path.entityPath));
    }
    for (const path of paper2dEntityPaths) {
        if (!transformPaths.has(pathKey(path))) {
            throw new Error('Paper2D animclip paths must match at least one graph transform track');
        }
    }
    convert(data, true, new Set(paper2dEntityPaths.map(pathKey)));
    data.coordinateMigration = paper2dEntityPaths.length ?
        { ...PAPER2D_MARKER, paper2dEntityPaths } : { ...LEGACY_MARKER };
    return data;
};

/**
 * Creates a temporary legacy-basis copy of a tagged animclip for the current runtime.
 *
 * @param {object} source - Tagged animclip JSON.
 * @returns {object} Unmarked preview copy.
 */
const previewMigratedAnimClipTracks = (source) => {
    const data = copyClip(source);
    const paper2dEntityPaths = getPaper2DEntityPaths(data.coordinateMigration);
    convert(data, false, new Set(paper2dEntityPaths.map(pathKey)));
    delete data.coordinateMigration;
    return data;
};

export { migrateLegacyAnimClipTracks, previewMigratedAnimClipTracks };
