import { Vec3, unrealEulerToRotation, unrealRotationToEuler } from 'playcanvas';

/** @import { Entity } from 'playcanvas' */

/**
 * @import { EntitySnapshot, SceneSnapshot, Transform } from '../contracts/editor-contracts.mjs'
 */

/**
 * @typedef {object} SceneDuplicate
 * @property {Entity} entity - Deep-cloned entity hierarchy.
 * @property {Entity} parent - Original sibling parent used when restoring the entity.
 * @property {Transform} initialTransform - Transform at the time of duplication.
 * @property {boolean} enabled - Whether the source entity was enabled before the provisional drag.
 */

/**
 * Keeps the engine object graph private and publishes only serializable scene data.
 */
export class SceneAdapter {
    /** @type {Map<string, Entity>} */
    #entities = new Map();

    /** @type {Map<string, Transform>} */
    #initialTransforms = new Map();

    /**
     * @param {Entity} entity - Entity to expose to the editor.
     * @param {string} id - Stable editor identity.
     */
    register(entity, id) {
        this.#entities.set(id, entity);
    }

    /**
     * Deep-clones a registered entity as a sibling and registers the clone for editing.
     *
     * @param {string} id - Source entity identity.
     * @param {string} duplicateId - Stable identity for the copy.
     * @param {string} name - Display name for the copy.
     * @returns {SceneDuplicate | null} Created entity data, or null when the source cannot be copied.
     */
    duplicate(id, duplicateId, name) {
        const source = this.#entities.get(id);
        const parent = source?.parent;
        if (!source || !parent || this.#entities.has(duplicateId)) {
            return null;
        }

        const enabled = source.enabled;
        const entity = source.clone();
        entity.name = name;
        entity.enabled = false;
        parent.addChild(entity);
        this.register(entity, duplicateId);

        const initialTransform = this.getTransform(duplicateId);
        if (!initialTransform) {
            this.remove(duplicateId);
            entity.destroy();
            return null;
        }
        this.setInitialTransform(duplicateId, initialTransform);

        return { entity, parent, initialTransform, enabled };
    }

    /**
     * Unregisters and detaches an entity without destroying it, so history can restore it.
     *
     * @param {string} id - Entity identity.
     * @returns {Entity | null} Detached entity, if registered.
     */
    remove(id) {
        const entity = this.#entities.get(id);
        if (!entity) {
            return null;
        }

        entity.parent?.removeChild(entity);
        this.#entities.delete(id);
        this.#initialTransforms.delete(id);
        return entity;
    }

    /**
     * Re-registers an entity detached by {@link remove}.
     *
     * @param {Entity} entity - Detached entity to restore.
     * @param {string} id - Stable editor identity.
     * @param {Entity} parent - Parent recorded when the entity was duplicated.
     * @param {Transform} initialTransform - Transform used by inspector reset.
     * @returns {boolean} Whether the entity was restored.
     */
    restore(entity, id, parent, initialTransform) {
        if (this.#entities.has(id)) {
            return false;
        }

        parent.addChild(entity);
        this.register(entity, id);
        this.setInitialTransform(id, initialTransform);
        return true;
    }

    /**
     * @param {string | null} id - Editor entity identity.
     * @returns {Entity | null} Runtime entity.
     */
    getEntity(id) {
        return id ? this.#entities.get(id) ?? null : null;
    }

    /**
     * @param {string} id - Entity identity.
     * @param {Transform} transform - New editor transform.
     * @returns {Transform | null} Resulting transform.
     */
    setTransform(id, transform) {
        const entity = this.#entities.get(id);
        if (!entity) {
            return null;
        }

        entity.setLocalPosition(...transform.position);
        entity.setLocalRotation(unrealEulerToRotation(new Vec3(transform.rotation)));
        entity.setLocalScale(...transform.scale);
        return this.getTransform(id);
    }

    /**
     * @param {string} id - Entity identity.
     * @returns {Transform | null} Current plain transform.
     */
    getTransform(id) {
        const entity = this.#entities.get(id);
        if (!entity) {
            return null;
        }

        return {
            position: entity.getLocalPosition().toArray(),
            rotation: unrealRotationToEuler(entity.getLocalRotation()).toArray(),
            scale: entity.getLocalScale().toArray()
        };
    }

    /**
     * @returns {Entity[]} All editable runtime entities.
     */
    getEntities() {
        return [...this.#entities.values()];
    }

    /**
     * @returns {SceneSnapshot} Runtime scene snapshot.
     */
    snapshot() {
        return {
            entities: [...this.#entities.entries()].map(([id, entity]) => this.#toSnapshot(id, entity))
        };
    }

    /**
     * @param {string} id - Entity identity.
     * @returns {Transform | null} Initial transform snapshot.
     */
    getInitialTransform(id) {
        return this.#initialTransforms.get(id) ?? null;
    }

    /**
     * @param {string} id - Entity identity.
     * @param {Transform} transform - Initial transform to associate with the entity.
     */
    setInitialTransform(id, transform) {
        this.#initialTransforms.set(id, transform);
    }

    /**
     * @param {string} id - Editor entity identity.
     * @param {Entity} entity - Runtime entity.
     * @returns {EntitySnapshot} Plain entity data.
     */
    #toSnapshot(id, entity) {
        /** @type {string[]} */
        const components = [];
        for (const type of ['camera', 'light', 'render']) {
            if (entity[type] || (type === 'render' && entity.findComponents('render').length)) {
                components.push(type);
            }
        }

        const render = entity.render ?? entity.findComponents('render')[0];

        return {
            id,
            name: entity.name,
            type: render?.type ?? 'Entity',
            components,
            transform: /** @type {Transform} */ (this.getTransform(id)),
            initialTransform: /** @type {Transform} */ (this.getInitialTransform(id) ?? this.getTransform(id))
        };
    }
}
