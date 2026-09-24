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
import { Decompress } from '../../scene/compress/decompress.js';
import { ORIENTATION_VERTICAL } from '../../scene/constants.js';

const V5_COORDINATE_MIGRATION = Object.freeze({
    version: 5,
    scope: 'entity-local-prs-settings-physics-components-light-directions',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const V6_PAPER2D_COORDINATE_MIGRATION = Object.freeze({
    version: 6,
    scope: 'entity-local-prs-settings-physics-components-light-directions-paper2d',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees',
    paper2dEntities: []
});

const V7_COORDINATE_MIGRATION = Object.freeze({
    version: 7,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const V8_PAPER2D_COORDINATE_MIGRATION = Object.freeze({
    ...V7_COORDINATE_MIGRATION,
    version: 8,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d',
    paper2dEntities: []
});

const V9_COORDINATE_MIGRATION = Object.freeze({
    version: 9,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-screen-ui-preserved',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees'
});

const V10_PAPER2D_COORDINATE_MIGRATION = Object.freeze({
    ...V9_COORDINATE_MIGRATION,
    version: 10,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-screen-ui-preserved',
    paper2dEntities: []
});

const COORDINATE_MIGRATION = Object.freeze({
    version: 11,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-screen-ui-top-left-y-down',
    basis: 'ue-x-forward-y-right-z-up',
    euler: 'unreal-roll-pitch-yaw-xyz-degrees',
    screenSpaceUiDefaultFields: []
});

const PAPER2D_COORDINATE_MIGRATION = Object.freeze({
    ...COORDINATE_MIGRATION,
    version: 12,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-screen-ui-top-left-y-down',
    paper2dEntities: []
});

const WORLD_SCREEN_COORDINATE_MIGRATION = Object.freeze({
    ...PAPER2D_COORDINATE_MIGRATION,
    version: 13,
    scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-world-screen-ui-top-left-y-down',
    worldSpaceScreenEntities: []
});

const V4_COORDINATE_MIGRATION = Object.freeze({
    ...V5_COORDINATE_MIGRATION,
    version: 4,
    scope: 'entity-local-prs-settings-physics-components'
});

const V3_COORDINATE_MIGRATION = Object.freeze({
    ...V4_COORDINATE_MIGRATION,
    version: 3,
    scope: 'entity-local-prs-and-settings'
});

const V2_COORDINATE_MIGRATION = Object.freeze({
    ...V3_COORDINATE_MIGRATION,
    version: 2,
    euler: 'intrinsic-xyz-degrees'
});

const LEGACY_COORDINATE_MIGRATION = Object.freeze({
    ...V2_COORDINATE_MIGRATION,
    version: 1,
    scope: 'entity-local-prs'
});

const PAPER2D_TO_UNREAL = Object.freeze({
    vector: legacyToUnrealPaper2DVector,
    rotation: legacyToUnrealPaper2DRotation,
    scale: legacyToUnrealPaper2DScale
});

const UNREAL_TO_LEGACY_PAPER2D = Object.freeze({
    vector: unrealToLegacyPaper2DVector,
    rotation: unrealToLegacyPaper2DRotation,
    scale: unrealToLegacyPaper2DScale
});

const validateMarker = (marker) => {
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
        throw new Error('Unsupported scene coordinateMigration marker');
    }
    const knownMarkers = [V9_COORDINATE_MIGRATION, V7_COORDINATE_MIGRATION,
        V5_COORDINATE_MIGRATION, V4_COORDINATE_MIGRATION,
        V3_COORDINATE_MIGRATION, V2_COORDINATE_MIGRATION, LEGACY_COORDINATE_MIGRATION];
    if (knownMarkers.some(known => Object.keys(marker).length === Object.keys(known).length &&
        Object.entries(known).every(([key, value]) => marker[key] === value))) {
        return marker.version;
    }
    const paper2dMarkers = [V10_PAPER2D_COORDINATE_MIGRATION,
        V8_PAPER2D_COORDINATE_MIGRATION,
        V6_PAPER2D_COORDINATE_MIGRATION];
    for (const paper2dMarker of paper2dMarkers) {
        const paper2dFields = Object.keys(paper2dMarker);
        if (marker.version === paper2dMarker.version &&
        Object.keys(marker).length === paper2dFields.length &&
        paper2dFields.every(key => key === 'paper2dEntities' || marker[key] === paper2dMarker[key]) &&
        Array.isArray(marker.paper2dEntities) &&
        marker.paper2dEntities.every(id => typeof id === 'string') &&
        new Set(marker.paper2dEntities).size === marker.paper2dEntities.length) {
            return marker.version;
        }
    }

    const validUiDefaultFields = Array.isArray(marker.screenSpaceUiDefaultFields) &&
        marker.screenSpaceUiDefaultFields.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry) &&
            typeof entry.id === 'string' && Array.isArray(entry.fields) && entry.fields.length > 0 &&
            entry.fields.every(field => ['element.anchor', 'element.pivot', 'scrollbar.value'].includes(field)) &&
            new Set(entry.fields).size === entry.fields.length) &&
        new Set(marker.screenSpaceUiDefaultFields.map(entry => entry.id)).size === marker.screenSpaceUiDefaultFields.length;
    if (marker.version === COORDINATE_MIGRATION.version && validUiDefaultFields &&
        Object.keys(marker).length === Object.keys(COORDINATE_MIGRATION).length &&
        Object.entries(COORDINATE_MIGRATION).filter(([key]) => key !== 'screenSpaceUiDefaultFields')
        .every(([key, value]) => marker[key] === value)) {
        return marker.version;
    }
    const validPaper2dIds = Array.isArray(marker.paper2dEntities) &&
        marker.paper2dEntities.every(id => typeof id === 'string') &&
        new Set(marker.paper2dEntities).size === marker.paper2dEntities.length;
    if (marker.version === PAPER2D_COORDINATE_MIGRATION.version && validUiDefaultFields && validPaper2dIds &&
        Object.keys(marker).length === Object.keys(PAPER2D_COORDINATE_MIGRATION).length &&
        Object.entries(PAPER2D_COORDINATE_MIGRATION)
        .filter(([key]) => key !== 'screenSpaceUiDefaultFields' && key !== 'paper2dEntities')
        .every(([key, value]) => marker[key] === value)) {
        return marker.version;
    }
    const validWorldScreenIds = Array.isArray(marker.worldSpaceScreenEntities) &&
        marker.worldSpaceScreenEntities.every(id => typeof id === 'string') &&
        new Set(marker.worldSpaceScreenEntities).size === marker.worldSpaceScreenEntities.length;
    if (marker.version === WORLD_SCREEN_COORDINATE_MIGRATION.version && validUiDefaultFields && validPaper2dIds &&
        validWorldScreenIds && Object.keys(marker).length === Object.keys(WORLD_SCREEN_COORDINATE_MIGRATION).length &&
        Object.entries(WORLD_SCREEN_COORDINATE_MIGRATION)
        .filter(([key]) => key !== 'screenSpaceUiDefaultFields' && key !== 'paper2dEntities' && key !== 'worldSpaceScreenEntities')
        .every(([key, value]) => marker[key] === value)) {
        return marker.version;
    }
    throw new Error('Unsupported scene coordinateMigration marker');
};

const cloneScene = (source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source) ||
        !source.entities || typeof source.entities !== 'object' || Array.isArray(source.entities)) {
        throw new TypeError('Expected LitEngine scene or template JSON with an entities map');
    }
    return structuredClone(source);
};

const readVector = (values, id, field) => {
    if (!Array.isArray(values) || values.length !== 3 || !values.every(value => Number.isFinite(value))) {
        throw new TypeError(`Invalid ${field} for scene entity ${id}`);
    }
    return new Vec3(values);
};

const uiComponents = new Set(['button', 'element', 'layoutchild', 'layoutgroup', 'screen', 'scrollbar', 'scrollview']);
const unsupportedComponents = new Set([...uiComponents, 'sprite']);
const unsupportedPaper2DComponents = new Set([
    'button', 'screen', 'element', 'layoutchild', 'layoutgroup', 'scrollbar', 'scrollview',
    'camera', 'gsplat', 'joint', 'light', 'particlesystem', 'render'
]);

// These components carry world-space data. Their local axes cannot be inferred safely from a
// screen-space UI hierarchy, whose pixels and element transforms use a separate coordinate domain.
const unsupportedScreenUiComponents = new Set([
    'camera', 'collision', 'gsplat', 'joint', 'light', 'model', 'particlesystem', 'render', 'rigidbody', 'sprite', 'zone'
]);

const collectScreenSpaceUiEntities = (data, allowWorldSpaceScreens = false) => {
    const childrenByParent = new Map();
    const addChild = (parentId, childId) => {
        if (typeof parentId !== 'string' || typeof childId !== 'string') return;
        let children = childrenByParent.get(parentId);
        if (!children) {
            children = [];
            childrenByParent.set(parentId, children);
        }
        if (!children.includes(childId)) children.push(childId);
    };

    const screenRoots = [];
    const worldSpaceScreenRoots = new Set();
    for (const [id, entity] of Object.entries(data.entities)) {
        const components = entity?.components;
        if (components?.screen !== undefined) {
            const screen = components.screen;
            if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
                throw new TypeError(`Invalid screen component for scene entity ${id}`);
            }
            if (screen.screenSpace !== true) {
                if (!allowWorldSpaceScreens) {
                    throw new Error(`Scene entity ${id} has a world-space screen requiring a separate UI migration`);
                }
                worldSpaceScreenRoots.add(id);
            }
            screenRoots.push(id);
        }

        if (entity && typeof entity.parent === 'string') addChild(entity.parent, id);
        if (Array.isArray(entity?.children)) {
            for (const childId of entity.children) addChild(id, childId);
        }
    }

    const uiEntityIds = new Set();
    for (const rootId of screenRoots) {
        const pending = [rootId];
        while (pending.length) {
            const id = pending.pop();
            if (uiEntityIds.has(id)) continue;
            const entity = data.entities[id];
            if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
                throw new Error(`Screen UI hierarchy references unknown scene entity ${id}`);
            }
            uiEntityIds.add(id);
            if (id !== rootId && entity.components?.screen) {
                throw new Error(`Nested screens in scene entity ${id} require a separate UI migration`);
            }
            for (const childId of childrenByParent.get(id) ?? []) pending.push(childId);
        }
    }

    for (const [id, entity] of Object.entries(data.entities)) {
        const components = entity?.components ?? {};
        const hasUiComponent = Object.keys(components).some(type => uiComponents.has(type));
        if (hasUiComponent && !uiEntityIds.has(id)) {
            throw new Error(`Scene entity ${id} has UI components outside a screen hierarchy`);
        }
        if (uiEntityIds.has(id)) {
            for (const type of Object.keys(components)) {
                if (unsupportedScreenUiComponents.has(type)) {
                    throw new Error(`Scene entity ${id} has ${type} components requiring a separate UI migration`);
                }
            }
        }
    }

    const uiTransformEntityIds = new Set(uiEntityIds);
    for (const id of worldSpaceScreenRoots) uiTransformEntityIds.delete(id);

    return { entityIds: uiEntityIds, transformEntityIds: uiTransformEntityIds, worldSpaceScreenRoots };
};

const validateWorldSpaceScreenEntities = (uiEntities, values) => {
    if (!Array.isArray(values) || !values.every(id => typeof id === 'string') ||
        new Set(values).size !== values.length) {
        throw new TypeError('worldSpaceScreenEntities must be an array of unique entity IDs');
    }
    const actualIds = Array.from(uiEntities.worldSpaceScreenRoots).sort();
    const markerIds = [...values].sort();
    if (actualIds.length !== markerIds.length || actualIds.some((id, index) => id !== markerIds[index])) {
        throw new Error('World-space screen entity IDs do not match the scene migration marker');
    }
    return new Set(values);
};

const validateScreenMigrationScopes = (paper2dEntities, screenUiEntities) => {
    for (const id of screenUiEntities.entityIds) {
        if (paper2dEntities?.has(id)) {
            throw new Error(`Scene entity ${id} cannot belong to both Paper2D and screen UI migrations`);
        }
    }
};

const validateComponents = (entity, id, allowSprite = false, allowScreenUi = false) => {
    const components = entity.components ?? {};
    if (!components || typeof components !== 'object' || Array.isArray(components)) {
        throw new TypeError(`Invalid components for scene entity ${id}`);
    }
    for (const type of Object.keys(components)) {
        if (unsupportedComponents.has(type) && !(allowSprite && type === 'sprite') &&
            !(allowScreenUi && uiComponents.has(type))) {
            throw new Error(`Scene entity ${id} has ${type} components requiring a separate migration`);
        }
    }
    if (components.particlesystem?.screenSpace === true) {
        throw new Error(`Scene entity ${id} has screen-space particles requiring a separate UI migration`);
    }
};

const validatePaper2DEntities = (data, values) => {
    if (!Array.isArray(values) || !values.every(id => typeof id === 'string') ||
        new Set(values).size !== values.length) {
        throw new TypeError('paper2dEntityIds must be an array of unique entity IDs');
    }
    for (const id of values) {
        if (!Object.hasOwn(data.entities, id)) {
            throw new Error(`Unknown Paper2D scene entity ${id}`);
        }
        const components = data.entities[id]?.components;
        if (components?.screen || components?.element) {
            throw new Error(`Scene entity ${id} has screen or element components requiring a separate migration`);
        }
        if (components && typeof components === 'object' && !Array.isArray(components)) {
            for (const type of Object.keys(components)) {
                if (unsupportedPaper2DComponents.has(type)) {
                    throw new Error(`Scene entity ${id} has ${type} components requiring a separate Paper2D migration`);
                }
            }
        }
    }
    return new Set(values);
};

const expandCompressedTransforms = (data) => {
    const compressed = data.compressedFormat;
    if (!compressed) {
        return;
    }
    if (!data.entDecompressed) {
        data.entities = new Decompress(data.entities, compressed).run();
    }
    for (const [id, entity] of Object.entries(data.entities)) {
        if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
            throw new TypeError(`Invalid scene entity ${id}`);
        }
        const hasDirectIndices = Object.hasOwn(entity, '___1');
        const hasTripleIndex = Object.hasOwn(entity, '___2');
        if (hasDirectIndices && hasTripleIndex) {
            throw new TypeError(`Invalid compressed transform for scene entity ${id}`);
        }
        if (!hasDirectIndices && !hasTripleIndex) {
            for (const field of ['position', 'rotation', 'scale']) {
                readVector(entity[field], id, field);
            }
            continue;
        }
        if (hasTripleIndex && (!Number.isInteger(entity.___2) || entity.___2 < 0)) {
            throw new TypeError(`Invalid compressed transform for scene entity ${id}`);
        }
        const indexes = hasDirectIndices ? entity.___1 :
            compressed.tripleVecs?.slice(entity.___2, entity.___2 + 3);
        if (!Array.isArray(indexes) || indexes.length !== 3 ||
            !indexes.every(index => Number.isInteger(index) && index >= 0)) {
            throw new TypeError(`Invalid compressed transform for scene entity ${id}`);
        }
        for (const [offset, field] of ['position', 'rotation', 'scale'].entries()) {
            const index = indexes[offset];
            entity[field] = compressed.singleVecs?.slice(index, index + 3);
            readVector(entity[field], id, field);
        }
        delete entity.___1;
        delete entity.___2;
    }
    delete data.compressedFormat;
    delete data.entDecompressed;
};

const intrinsicEulerToRotation = angles => new Quat().setFromEulerAngles(angles);
const intrinsicRotationToEuler = rotation => rotation.getEulerAngles();
const legacyToUnrealScreenUiRotation = (rotation) => {
    const { x, y, z, w } = rotation;
    return new Quat(-x, y, -z, w);
};

const convertScreenSpaceUiTransforms = (data, entityIds, readRotation, writeRotation, convertRotation) => {
    for (const id of entityIds) {
        const entity = data.entities[id];
        const rotation = readVector(entity.rotation, id, 'rotation');
        entity.rotation = writeRotation(convertRotation(readRotation(rotation))).toArray();
    }
};

const convertScreenSpaceUiComponents = (data, entityIds, toUnreal = true) => {
    const defaultFields = [];
    const convertArray = (component, field, length, id, convert) => {
        if (!Object.hasOwn(component, field)) return;
        const values = component[field];
        if (!Array.isArray(values) || values.length !== length || !values.every(Number.isFinite)) {
            throw new TypeError(`Invalid ${field} for screen UI scene entity ${id}`);
        }
        component[field] = convert(values);
    };

    for (const id of entityIds) {
        const components = data.entities[id].components ?? {};
        const element = components.element;
        if (element) {
            const fields = [];
            if (toUnreal && !Object.hasOwn(element, 'anchor')) {
                element.anchor = [0, 1, 0, 1];
                fields.push('element.anchor');
            } else {
                convertArray(element, 'anchor', 4, id, ([left, bottom, right, top]) => [left, 1 - top, right, 1 - bottom]);
            }
            if (toUnreal && !Object.hasOwn(element, 'pivot')) {
                element.pivot = [0, 1];
                fields.push('element.pivot');
            } else {
                convertArray(element, 'pivot', 2, id, ([x, y]) => [x, 1 - y]);
            }
            convertArray(element, 'margin', 4, id, ([left, bottom, right, top]) => [left, top, right, bottom]);
            convertArray(element, 'alignment', 2, id, ([x, y]) => [x, 1 - y]);
            if (fields.length) defaultFields.push({ id, fields });
        }

        const button = components.button;
        if (button) {
            convertArray(button, 'hitPadding', 4, id, ([left, bottom, right, top]) => [left, top, right, bottom]);
        }

        const layoutGroup = components.layoutgroup;
        if (layoutGroup) {
            convertArray(layoutGroup, 'alignment', 2, id, ([x, y]) => [x, 1 - y]);
            convertArray(layoutGroup, 'padding', 4, id, ([left, bottom, right, top]) => [left, top, right, bottom]);
            if (Object.hasOwn(layoutGroup, 'reverseY')) {
                if (typeof layoutGroup.reverseY !== 'boolean') {
                    throw new TypeError(`Invalid reverseY for screen UI scene entity ${id}`);
                }
                layoutGroup.reverseY = !layoutGroup.reverseY;
            }
        }

        const scrollbar = components.scrollbar;
        if (scrollbar && scrollbar.orientation === ORIENTATION_VERTICAL) {
            if (toUnreal && !Object.hasOwn(scrollbar, 'value')) {
                scrollbar.value = 1;
                defaultFields.push({ id, fields: ['scrollbar.value'] });
            } else if (Object.hasOwn(scrollbar, 'value')) {
                if (!Number.isFinite(scrollbar.value)) {
                    throw new TypeError(`Invalid value for screen UI scene entity ${id}`);
                }
                scrollbar.value = 1 - scrollbar.value;
            }
        }
    }
    const defaultsByEntity = new Map();
    for (const entry of defaultFields) {
        let fields = defaultsByEntity.get(entry.id);
        if (!fields) {
            fields = [];
            defaultsByEntity.set(entry.id, fields);
        }
        fields.push(...entry.fields);
    }
    return Array.from(defaultsByEntity, ([id, fields]) => ({ id, fields }));
};

const removeScreenSpaceUiDefaultFields = (data, defaults) => {
    for (const { id, fields } of defaults) {
        const components = data.entities[id]?.components;
        for (const field of fields) {
            const [componentName, property] = field.split('.');
            delete components?.[componentName]?.[property];
        }
    }
};

const LIGHT_AXIS_CORRECTION = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), 90);
const LIGHT_AXIS_CORRECTION_INVERSE = LIGHT_AXIS_CORRECTION.clone().invert();
// The legacy joint primary axis is local X, which maps to Unreal +Y. Hinge, slider and ball
// constraints still use local X, so rotate their converted local frame to keep that axis aligned.
const JOINT_FRAME_AXIS_CORRECTION = new Quat().setFromAxisAngle(new Vec3(0, 0, 1), 90);
const JOINT_FRAME_AXIS_CORRECTION_INVERSE = JOINT_FRAME_AXIS_CORRECTION.clone().invert();

const hasDirectionalLight = (entity) => {
    const light = entity.components?.light;
    return light && light.type !== 'omni';
};

const convertTransforms = (data, convertVector, convertRotation, convertScale, readRotation, writeRotation, lightAxisCorrection = 0, paper2dEntities = null, paper2dConverters = null, screenSpaceUiEntities = null, screenUiComponentEntities = screenSpaceUiEntities) => {
    for (const [id, entity] of Object.entries(data.entities)) {
        if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
            throw new TypeError(`Invalid scene entity ${id}`);
        }
        const isPaper2D = paper2dEntities?.has(id) ?? false;
        const isScreenUiTransform = screenSpaceUiEntities?.has(id) ?? false;
        const hasScreenUiComponents = screenUiComponentEntities?.has(id) ?? isScreenUiTransform;
        validateComponents(entity, id, isPaper2D, hasScreenUiComponents);
        const position = readVector(entity.position, id, 'position');
        const rotation = readVector(entity.rotation, id, 'rotation');
        const scale = readVector(entity.scale, id, 'scale');
        if (isScreenUiTransform) {
            // Screen layout values and child transforms stay in their pixel/UI coordinate domain.
            continue;
        }
        const convertEntityVector = isPaper2D ? paper2dConverters.vector : convertVector;
        const convertEntityRotation = isPaper2D ? paper2dConverters.rotation : convertRotation;
        const convertEntityScale = isPaper2D ? paper2dConverters.scale : convertScale;
        const convertedPosition = convertEntityVector(position);
        const sourceRotation = readRotation(rotation);
        if (!isPaper2D && lightAxisCorrection < 0 && hasDirectionalLight(entity)) {
            sourceRotation.mul(LIGHT_AXIS_CORRECTION_INVERSE);
        }
        const convertedRotation = convertEntityRotation(sourceRotation);
        if (!isPaper2D && lightAxisCorrection > 0 && hasDirectionalLight(entity)) {
            convertedRotation.mul(LIGHT_AXIS_CORRECTION);
        }
        const convertedScale = convertEntityScale(scale);
        entity.position = convertedPosition.toArray();
        entity.rotation = writeRotation(convertedRotation).toArray();
        entity.scale = convertedScale.toArray();
    }
    return data;
};

const convertLightAxes = (data, toUnreal) => {
    for (const [id, entity] of Object.entries(data.entities)) {
        if (!hasDirectionalLight(entity)) continue;
        const rotation = readVector(entity.rotation, id, 'rotation');
        const quat = unrealEulerToRotation(rotation);
        quat.mul(toUnreal ? LIGHT_AXIS_CORRECTION : LIGHT_AXIS_CORRECTION_INVERSE);
        entity.rotation = unrealRotationToEuler(quat).toArray();
    }
};

const convertSettings = (data, convertVector, convertRotation, convertScale, readRotation, writeRotation) => {
    const physics = data.settings?.physics;
    const render = data.settings?.render;
    if (physics && Object.hasOwn(physics, 'gravity')) {
        physics.gravity = convertVector(readVector(physics.gravity, 'settings.physics', 'gravity')).toArray();
    }
    if (render) {
        for (const field of ['skyMeshPosition', 'skyCenter']) {
            if (Object.hasOwn(render, field)) {
                render[field] = convertVector(readVector(render[field], 'settings.render', field)).toArray();
            }
        }
        if (Object.hasOwn(render, 'skyMeshScale')) {
            render.skyMeshScale = convertScale(readVector(render.skyMeshScale, 'settings.render', 'skyMeshScale')).toArray();
        }
        for (const field of ['skyboxRotation', 'skyMeshRotation']) {
            if (Object.hasOwn(render, field)) {
                const angles = readVector(render[field], 'settings.render', field);
                render[field] = writeRotation(convertRotation(readRotation(angles))).toArray();
            }
        }
    }
};

const convertAdditionalSettings = (data, toUnreal) => {
    const render = data.settings?.render;
    if (render && Object.hasOwn(render, 'lightingCells')) {
        const convertScale = toUnreal ? legacyToUnrealScale : unrealToLegacyScale;
        render.lightingCells = convertScale(readVector(render.lightingCells, 'settings.render', 'lightingCells')).toArray();
    }
};

const materializeLegacySettingsDefaults = (data) => {
    const render = data.settings?.render;
    if (render && !Object.hasOwn(render, 'skyCenter')) {
        render.skyCenter = [0, 1, 0];
    }
};

const convertPhysicsComponents = (data, toUnreal, paper2dEntities = null, paper2dConverters = null) => {
    const convertVector = toUnreal ? legacyToUnrealVector : unrealToLegacyVector;
    const convertScale = toUnreal ? legacyToUnrealScale : unrealToLegacyScale;
    const convertRotation = toUnreal ? legacyToUnrealRotation : unrealToLegacyRotation;
    for (const [id, entity] of Object.entries(data.entities)) {
        const isPaper2D = paper2dEntities?.has(id) ?? false;
        const entityConvertVector = isPaper2D ? paper2dConverters.vector : convertVector;
        const entityConvertScale = isPaper2D ? paper2dConverters.scale : convertScale;
        const entityConvertRotation = isPaper2D ? paper2dConverters.rotation : convertRotation;
        const collision = entity.components?.collision;
        if (collision) {
            if (typeof collision !== 'object' || Array.isArray(collision)) {
                throw new TypeError(`Invalid collision component for scene entity ${id}`);
            }
            if (Object.hasOwn(collision, 'halfExtents')) {
                collision.halfExtents = entityConvertScale(readVector(collision.halfExtents, id, 'collision.halfExtents')).toArray();
            }
            if (Object.hasOwn(collision, 'linearOffset')) {
                collision.linearOffset = entityConvertVector(readVector(collision.linearOffset, id, 'collision.linearOffset')).toArray();
            }
            if (Object.hasOwn(collision, 'angularOffset')) {
                const values = collision.angularOffset;
                if (!Array.isArray(values) || ![3, 4].includes(values.length) || !values.every(Number.isFinite)) {
                    throw new TypeError(`Invalid collision.angularOffset for scene entity ${id}`);
                }
                const rotation = values.length === 4 ? new Quat(...values) :
                    toUnreal ? intrinsicEulerToRotation(new Vec3(values)) : unrealEulerToRotation(new Vec3(values));
                const converted = entityConvertRotation(rotation);
                collision.angularOffset = values.length === 4 ? [converted.x, converted.y, converted.z, converted.w] :
                    (toUnreal ? unrealRotationToEuler(converted) : intrinsicRotationToEuler(converted)).toArray();
            }
            if (Object.hasOwn(collision, 'axis') || ['capsule', 'cone', 'cylinder'].includes(collision.type)) {
                const axis = collision.axis ?? (toUnreal ? 1 : 2);
                if (!Number.isInteger(axis) || axis < 0 || axis > 2) {
                    throw new TypeError(`Invalid collision.axis for scene entity ${id}`);
                }
                collision.axis = isPaper2D ? (axis === 1 ? 2 : axis === 2 ? 1 : axis) :
                    toUnreal ? (axis + 1) % 3 : (axis + 2) % 3;
            }
        }
        const rigidbody = entity.components?.rigidbody;
        if (rigidbody) {
            if (typeof rigidbody !== 'object' || Array.isArray(rigidbody)) {
                throw new TypeError(`Invalid rigidbody component for scene entity ${id}`);
            }
            for (const field of ['linearFactor', 'angularFactor']) {
                if (Object.hasOwn(rigidbody, field)) {
                    rigidbody[field] = entityConvertScale(readVector(rigidbody[field], id, `rigidbody.${field}`)).toArray();
                }
            }
        }
    }
};

const readRange = (values, id, field) => {
    if (!Array.isArray(values) || values.length !== 2 || !values.every(Number.isFinite)) {
        throw new TypeError(`Invalid ${field} for scene entity ${id}`);
    }
    return values;
};

const reverseRange = values => [-values[1], -values[0]];

const convertCurveVector = (graph, id, field, convertVector) => {
    if (graph === null || graph === undefined) return;
    if (!graph || typeof graph !== 'object' || Array.isArray(graph) || !Array.isArray(graph.keys) || graph.keys.length !== 3) {
        throw new TypeError(`Invalid ${field} for scene entity ${id}`);
    }

    const source = graph.keys;
    const pairCount = Array.isArray(source[0]) ? source[0].length / 2 : -1;
    if (!Number.isInteger(pairCount) || source.some(keys => !Array.isArray(keys) || keys.length !== pairCount * 2 ||
        !keys.every(Number.isFinite))) {
        throw new TypeError(`Invalid ${field} for scene entity ${id}`);
    }
    for (let curve = 1; curve < 3; curve++) {
        for (let pair = 0; pair < pairCount; pair++) {
            if (source[curve][pair * 2] !== source[0][pair * 2]) {
                throw new TypeError(`Incompatible time keys in ${field} for scene entity ${id}`);
            }
        }
    }

    const convertedKeys = [[], [], []];
    for (let pair = 0; pair < pairCount; pair++) {
        const offset = pair * 2;
        const converted = convertVector(new Vec3(source[0][offset + 1], source[1][offset + 1], source[2][offset + 1]));
        const values = [converted.x, converted.y, converted.z];
        for (let curve = 0; curve < 3; curve++) {
            convertedKeys[curve].push(source[0][offset], values[curve]);
        }
    }
    graph.keys = convertedKeys;
};

const convertJointComponents = (data, toUnreal) => {
    for (const [id, entity] of Object.entries(data.entities)) {
        const joint = entity.components?.joint;
        if (!joint) continue;
        if (typeof joint !== 'object' || Array.isArray(joint)) {
            throw new TypeError(`Invalid joint component for scene entity ${id}`);
        }

        const convertVector = toUnreal ? legacyToUnrealVector : unrealToLegacyVector;
        const convertRotationVector = (value) => {
            if (toUnreal) return new Vec3(value.z, -value.x, -value.y);
            return new Vec3(-value.y, -value.z, value.x);
        };
        const type = joint.type ?? 'fixed';

        if (type === 'hinge') {
            if (Object.hasOwn(joint, 'limits')) joint.limits = reverseRange(readRange(joint.limits, id, 'joint.limits'));
            if (Object.hasOwn(joint, 'motorSpeed')) joint.motorSpeed = -joint.motorSpeed;
        } else if (type === 'ball') {
            if (Object.hasOwn(joint, 'swingLimitY') || Object.hasOwn(joint, 'swingLimitZ')) {
                [joint.swingLimitY, joint.swingLimitZ] = [joint.swingLimitZ ?? 45, joint.swingLimitY ?? 45];
            }
        } else if (type === '6dof') {
            for (const prefix of ['linear', 'angular']) {
                const fields = ['X', 'Y', 'Z'];
                const motionValues = fields.map(axis => joint[`${prefix}Motion${axis}`]);
                const limitValues = fields.map((axis) => {
                    return Object.hasOwn(joint, `${prefix}Limits${axis}`) ?
                        readRange(joint[`${prefix}Limits${axis}`], id, `joint.${prefix}Limits${axis}`) : null;
                });
                if (toUnreal) {
                    const sourceAxes = [2, 0, 1];
                    const signs = prefix === 'linear' ? [-1, 1, 1] : [1, -1, -1];
                    for (let target = 0; target < 3; target++) {
                        const axis = fields[target];
                        const source = sourceAxes[target];
                        if (motionValues[source] !== undefined) joint[`${prefix}Motion${axis}`] = motionValues[source];
                        if (limitValues[source]) {
                            const range = signs[target] < 0 ? reverseRange(limitValues[source]) : limitValues[source];
                            joint[`${prefix}Limits${axis}`] = range.slice();
                        }
                    }
                } else {
                    const sourceAxes = [1, 2, 0];
                    const signs = prefix === 'linear' ? [1, 1, -1] : [-1, -1, 1];
                    for (let target = 0; target < 3; target++) {
                        const axis = fields[target];
                        const source = sourceAxes[target];
                        if (motionValues[source] !== undefined) joint[`${prefix}Motion${axis}`] = motionValues[source];
                        if (limitValues[source]) {
                            const range = signs[target] < 0 ? reverseRange(limitValues[source]) : limitValues[source];
                            joint[`${prefix}Limits${axis}`] = range.slice();
                        }
                    }
                }
            }

            for (const field of ['linearStiffness', 'linearDamping', 'angularStiffness', 'angularDamping']) {
                if (Object.hasOwn(joint, field)) {
                    const values = readVector(joint[field], id, `joint.${field}`);
                    joint[field] = toUnreal ? [values.z, values.x, values.y] : [values.y, values.z, values.x];
                }
            }
            if (Object.hasOwn(joint, 'linearEquilibrium')) {
                joint.linearEquilibrium = convertVector(readVector(joint.linearEquilibrium, id, 'joint.linearEquilibrium')).toArray();
            }
            if (Object.hasOwn(joint, 'angularEquilibrium')) {
                joint.angularEquilibrium = convertRotationVector(readVector(joint.angularEquilibrium, id, 'joint.angularEquilibrium')).toArray();
            }
        }
    }
};

const convertAdditionalComponents = (data, toUnreal, paper2dEntities = null, paper2dConverters = null) => {
    const vector = toUnreal ? legacyToUnrealVector : unrealToLegacyVector;
    const scale = toUnreal ? legacyToUnrealScale : unrealToLegacyScale;

    for (const [id, entity] of Object.entries(data.entities)) {
        const isPaper2D = paper2dEntities?.has(id) ?? false;
        const convertVector = isPaper2D ? paper2dConverters.vector : vector;
        const convertScale = isPaper2D ? paper2dConverters.scale : scale;
        const components = entity.components ?? {};

        const particles = components.particlesystem;
        if (particles) {
            if (typeof particles !== 'object' || Array.isArray(particles)) {
                throw new TypeError(`Invalid particlesystem component for scene entity ${id}`);
            }
            for (const field of ['emitterExtents', 'emitterExtentsInner', 'wrapBounds']) {
                if (Object.hasOwn(particles, field)) {
                    particles[field] = convertScale(readVector(particles[field], id, `particlesystem.${field}`)).toArray();
                }
            }
            if (Object.hasOwn(particles, 'particleNormal')) {
                particles.particleNormal = convertVector(readVector(particles.particleNormal, id, 'particlesystem.particleNormal')).toArray();
            }
            for (const field of ['localVelocityGraph', 'localVelocityGraph2', 'velocityGraph', 'velocityGraph2']) {
                if (Object.hasOwn(particles, field)) convertCurveVector(particles[field], id, `particlesystem.${field}`, convertVector);
            }
        }

        const zone = components.zone;
        if (zone) {
            if (typeof zone !== 'object' || Array.isArray(zone)) {
                throw new TypeError(`Invalid zone component for scene entity ${id}`);
            }
            if (Object.hasOwn(zone, 'size')) zone.size = convertScale(readVector(zone.size, id, 'zone.size')).toArray();
        }

        for (const componentName of ['model', 'render', 'gsplat']) {
            const component = components[componentName];
            if (!component) continue;
            if (typeof component !== 'object' || Array.isArray(component)) {
                throw new TypeError(`Invalid ${componentName} component for scene entity ${id}`);
            }
            if (Object.hasOwn(component, 'aabbCenter')) {
                component.aabbCenter = convertVector(readVector(component.aabbCenter, id, `${componentName}.aabbCenter`)).toArray();
            }
            if (Object.hasOwn(component, 'aabbHalfExtents')) {
                component.aabbHalfExtents = convertScale(readVector(component.aabbHalfExtents, id, `${componentName}.aabbHalfExtents`)).toArray();
            }
        }
    }

    // Joint frames have a different primary-axis convention and are rejected on Paper2D entities;
    // any remaining joint belongs to the 3D hierarchy and still needs its basis conversion.
    convertJointComponents(data, toUnreal);
};

const convertJointFrameAxes = (data, toUnreal) => {
    for (const [id, entity] of Object.entries(data.entities)) {
        const type = entity.components?.joint?.type ?? 'fixed';
        if (!['hinge', 'slider', 'ball'].includes(type)) continue;
        const rotation = readVector(entity.rotation, id, 'rotation');
        const quaternion = unrealEulerToRotation(rotation);
        quaternion.mul(toUnreal ? JOINT_FRAME_AXIS_CORRECTION : JOINT_FRAME_AXIS_CORRECTION_INVERSE);
        entity.rotation = unrealRotationToEuler(quaternion).toArray();
    }
};

/**
 * Copies LitEngine scene/template JSON and converts entity-local transforms, known world-space
 * scene settings, supported physics fields and directional/spot light axes from the old PlayCanvas
 * basis into the Unreal basis. Screen-space UI subtrees keep their pixel transforms and layout
 * values; world-space Screen roots use 3D conversion while their UI descendants keep pixel
 * positions and scales. The version 13 marker records world-space Screen roots for reversible
 * previews. Pass `paper2dEntityIds` to convert selected 2D hierarchy transforms with X horizontal,
 * Y vertical and Z depth into X horizontal, Z vertical and Y depth. Include every transform in that
 * 2D hierarchy, including transform-only parents. External assets are not migrated. Rotation arrays
 * use Unreal's XYZ Euler order: Roll, Pitch, Yaw. This utility does not change the engine runtime's
 * coordinate system.
 *
 * @param {object} source - Scene or template JSON with an entities map.
 * @param {object} [options] - Additional migration scopes.
 * @param {string[]} [options.paper2dEntityIds] - Entity IDs whose local transforms use the
 * PlayCanvas 2D world convention. The resulting marker records these IDs for preview and repeat use.
 * @returns {object} A tagged, uncompressed copy with converted transforms and settings.
 */
const migrateLegacySceneTransforms = (source, options = {}) => {
    const data = cloneScene(source);
    const requestedPaper2DEntities = options.paper2dEntityIds;
    if (Object.hasOwn(data, 'coordinateMigration')) {
        const version = validateMarker(data.coordinateMigration);
        if (data.compressedFormat) {
            throw new Error('Migrated scene entity transforms must be uncompressed');
        }
        if (version === 13) {
            const paper2dEntities = validatePaper2DEntities(data, data.coordinateMigration.paper2dEntities);
            const screenSpaceUiEntities = collectScreenSpaceUiEntities(data, true);
            validateWorldSpaceScreenEntities(screenSpaceUiEntities, data.coordinateMigration.worldSpaceScreenEntities);
            validateScreenMigrationScopes(paper2dEntities, screenSpaceUiEntities);
            if (requestedPaper2DEntities !== undefined) {
                const requested = validatePaper2DEntities(data, requestedPaper2DEntities);
                if (requested.size !== paper2dEntities.size || Array.from(paper2dEntities).some(id => !requested.has(id))) {
                    throw new Error('Paper2D entity IDs do not match the scene migration marker');
                }
            }
            return data;
        }
        if (version === 11 || version === 12) {
            if (version === 11 && requestedPaper2DEntities?.length) {
                throw new Error('Paper2D entities must be selected before migrating the scene basis');
            }
            if (version === 12) {
                const paper2dEntities = validatePaper2DEntities(data, data.coordinateMigration.paper2dEntities);
                if (requestedPaper2DEntities !== undefined) {
                    const requested = validatePaper2DEntities(data, requestedPaper2DEntities);
                    if (requested.size !== paper2dEntities.size || Array.from(paper2dEntities).some(id => !requested.has(id))) {
                        throw new Error('Paper2D entity IDs do not match the scene migration marker');
                    }
                }
            }
            collectScreenSpaceUiEntities(data);
            return data;
        }
        if (version === 7 || version === 9) {
            if (requestedPaper2DEntities?.length) {
                throw new Error('Paper2D entities must be selected before migrating the scene basis');
            }
            const screenSpaceUiEntities = collectScreenSpaceUiEntities(data);
            convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
                version === 9 ? intrinsicEulerToRotation : unrealEulerToRotation,
                unrealRotationToEuler, legacyToUnrealScreenUiRotation);
            const screenSpaceUiDefaultFields = convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds);
            data.coordinateMigration = { ...COORDINATE_MIGRATION, screenSpaceUiDefaultFields };
            return data;
        }
        if (version === 8 || version === 10) {
            const paper2dEntities = validatePaper2DEntities(data, data.coordinateMigration.paper2dEntities);
            if (requestedPaper2DEntities !== undefined) {
                const requested = validatePaper2DEntities(data, requestedPaper2DEntities);
                if (requested.size !== paper2dEntities.size || Array.from(paper2dEntities).some(id => !requested.has(id))) {
                    throw new Error('Paper2D entity IDs do not match the scene migration marker');
                }
            }
            const screenSpaceUiEntities = collectScreenSpaceUiEntities(data);
            validateScreenMigrationScopes(paper2dEntities, screenSpaceUiEntities);
            convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
                version === 10 ? intrinsicEulerToRotation : unrealEulerToRotation,
                unrealRotationToEuler, legacyToUnrealScreenUiRotation);
            const screenSpaceUiDefaultFields = convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds);
            data.coordinateMigration = {
                ...PAPER2D_COORDINATE_MIGRATION,
                screenSpaceUiDefaultFields,
                paper2dEntities: Array.from(paper2dEntities).sort()
            };
            return data;
        }
        if (version === 6) {
            const paper2dEntities = validatePaper2DEntities(data, data.coordinateMigration.paper2dEntities);
            if (requestedPaper2DEntities !== undefined) {
                const requested = validatePaper2DEntities(data, requestedPaper2DEntities);
                if (requested.size !== paper2dEntities.size || Array.from(paper2dEntities).some(id => !requested.has(id))) {
                    throw new Error('Paper2D entity IDs do not match the scene migration marker');
                }
            }
            convertAdditionalComponents(data, true, paper2dEntities, PAPER2D_TO_UNREAL);
            convertAdditionalSettings(data, true);
            convertJointFrameAxes(data, true);
            const screenSpaceUiEntities = collectScreenSpaceUiEntities(data);
            validateScreenMigrationScopes(paper2dEntities, screenSpaceUiEntities);
            convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
                unrealEulerToRotation, unrealRotationToEuler, legacyToUnrealScreenUiRotation);
            const screenSpaceUiDefaultFields = convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds);
            data.coordinateMigration = {
                ...PAPER2D_COORDINATE_MIGRATION,
                screenSpaceUiDefaultFields,
                paper2dEntities: Array.from(paper2dEntities).sort()
            };
            return data;
        }
        if (requestedPaper2DEntities?.length) {
            throw new Error('Paper2D entities must be selected before migrating the scene basis');
        }
        if (version === 1) {
            materializeLegacySettingsDefaults(data);
            convertSettings(data, legacyToUnrealVector, legacyToUnrealRotation, legacyToUnrealScale,
                intrinsicEulerToRotation, unrealRotationToEuler);
        } else if (version === 2) {
            convertSettings(data, value => value, value => value, value => value,
                intrinsicEulerToRotation, unrealRotationToEuler);
        }
        const screenSpaceUiEntities = collectScreenSpaceUiEntities(data);
        if (version < 3) {
            convertTransforms(data, value => value, value => value, value => value,
                intrinsicEulerToRotation, unrealRotationToEuler, 1, null, null,
                screenSpaceUiEntities.transformEntityIds, screenSpaceUiEntities.entityIds);
        }
        if (version < 4) {
            convertPhysicsComponents(data, true);
        }
        if (version >= 3 && version < 5) convertLightAxes(data, true);
        convertAdditionalComponents(data, true);
        convertAdditionalSettings(data, true);
        convertJointFrameAxes(data, true);
        convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
            version < 3 ? intrinsicEulerToRotation : unrealEulerToRotation,
            unrealRotationToEuler, legacyToUnrealScreenUiRotation);
        const screenSpaceUiDefaultFields = convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds);
        data.coordinateMigration = { ...COORDINATE_MIGRATION, screenSpaceUiDefaultFields };
        return data;
    }
    const paper2dEntities = requestedPaper2DEntities === undefined ? null :
        validatePaper2DEntities(data, requestedPaper2DEntities);
    expandCompressedTransforms(data);
    const screenSpaceUiEntities = collectScreenSpaceUiEntities(data, true);
    validateScreenMigrationScopes(paper2dEntities, screenSpaceUiEntities);
    convertTransforms(data, legacyToUnrealVector, legacyToUnrealRotation, legacyToUnrealScale,
        intrinsicEulerToRotation, unrealRotationToEuler, 1, paper2dEntities, PAPER2D_TO_UNREAL,
        screenSpaceUiEntities.transformEntityIds, screenSpaceUiEntities.entityIds);
    materializeLegacySettingsDefaults(data);
    convertSettings(data, legacyToUnrealVector, legacyToUnrealRotation, legacyToUnrealScale,
        intrinsicEulerToRotation, unrealRotationToEuler);
    convertAdditionalSettings(data, true);
    convertPhysicsComponents(data, true, paper2dEntities, PAPER2D_TO_UNREAL);
    convertAdditionalComponents(data, true, paper2dEntities, PAPER2D_TO_UNREAL);
    convertJointFrameAxes(data, true);
    convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
        intrinsicEulerToRotation, unrealRotationToEuler, legacyToUnrealScreenUiRotation);
    const screenSpaceUiDefaultFields = convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds);
    if (screenSpaceUiEntities.worldSpaceScreenRoots.size) {
        data.coordinateMigration = {
            ...WORLD_SCREEN_COORDINATE_MIGRATION,
            screenSpaceUiDefaultFields,
            paper2dEntities: Array.from(paper2dEntities ?? []).sort(),
            worldSpaceScreenEntities: Array.from(screenSpaceUiEntities.worldSpaceScreenRoots).sort()
        };
    } else if (paper2dEntities?.size) {
        data.coordinateMigration = {
            ...PAPER2D_COORDINATE_MIGRATION,
            screenSpaceUiDefaultFields,
            paper2dEntities: Array.from(paper2dEntities).sort()
        };
    } else {
        data.coordinateMigration = { ...COORDINATE_MIGRATION, screenSpaceUiDefaultFields };
    }
    return data;
};

/**
 * Creates a temporary old-basis copy of a tagged scene for the current Y-up runtime. Do not
 * persist this preview copy: it intentionally omits the migration marker.
 *
 * @param {object} source - Scene or template JSON tagged by migrateLegacySceneTransforms.
 * @returns {object} Unmarked scene/template copy in the current runtime's basis.
 */
const previewMigratedSceneTransforms = (source) => {
    const data = cloneScene(source);
    const version = validateMarker(data.coordinateMigration);
    if (data.compressedFormat) {
        throw new Error('Migrated scene entity transforms must be uncompressed');
    }
    const readRotation = version >= 3 ? unrealEulerToRotation : intrinsicEulerToRotation;
    const paper2dEntities = version === 6 || version === 8 || version === 10 || version === 12 || version === 13 ?
        validatePaper2DEntities(data, data.coordinateMigration.paper2dEntities) : null;
    const screenSpaceUiEntities = version === 13 ? collectScreenSpaceUiEntities(data, true) :
        version >= 9 ? collectScreenSpaceUiEntities(data) : null;
    if (version === 13) {
        validateWorldSpaceScreenEntities(screenSpaceUiEntities, data.coordinateMigration.worldSpaceScreenEntities);
        validateScreenMigrationScopes(paper2dEntities, screenSpaceUiEntities);
    }
    if (version >= 7) convertJointFrameAxes(data, false);
    convertTransforms(data, unrealToLegacyVector, unrealToLegacyRotation, unrealToLegacyScale,
        readRotation, intrinsicRotationToEuler, version >= 5 ? -1 : 0,
        paper2dEntities, UNREAL_TO_LEGACY_PAPER2D,
        screenSpaceUiEntities?.transformEntityIds, screenSpaceUiEntities?.entityIds);
    if (version >= 11) {
        convertScreenSpaceUiTransforms(data, screenSpaceUiEntities.transformEntityIds,
            unrealEulerToRotation, intrinsicRotationToEuler, legacyToUnrealScreenUiRotation);
        convertScreenSpaceUiComponents(data, screenSpaceUiEntities.entityIds, false);
        removeScreenSpaceUiDefaultFields(data, data.coordinateMigration.screenSpaceUiDefaultFields);
    }
    if (version >= 2) {
        convertSettings(data, unrealToLegacyVector, unrealToLegacyRotation, unrealToLegacyScale,
            readRotation, intrinsicRotationToEuler);
    }
    if (version >= 4) {
        convertPhysicsComponents(data, false, paper2dEntities, UNREAL_TO_LEGACY_PAPER2D);
    }
    if (version >= 7) {
        convertAdditionalComponents(data, false, paper2dEntities, UNREAL_TO_LEGACY_PAPER2D);
        convertAdditionalSettings(data, false);
    }
    delete data.coordinateMigration;
    return data;
};

export { migrateLegacySceneTransforms, previewMigratedSceneTransforms };
