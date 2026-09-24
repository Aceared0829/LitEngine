import { Vec3, unrealEulerToRotation, unrealRotationToEuler } from 'playcanvas';

/** @import { Entity } from 'playcanvas' */

/**
 * @import { EntitySnapshot, SceneSnapshot, Transform } from '../contracts/editor-contracts.mjs'
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
