import { isFiniteVector3 } from '../domain/editor-reducer.mjs';

/**
 * @import { HistorySnapshot, Transform } from '../contracts/editor-contracts.mjs'
 * @import { Entity } from 'playcanvas'
 */

/**
 * @typedef {object} TransformHistoryEntry
 * @property {undefined} [type] - Missing discriminator identifies a transform-only operation.
 * @property {string} entityId - Edited entity identity.
 * @property {Transform} before - Transform before the operation.
 * @property {Transform} after - Transform after the operation.
 * @property {string} label - Human-readable operation label.
 */

/**
 * @typedef {object} DuplicateHistoryEntry
 * @property {'duplicate'} type - Discriminator for a copy-and-transform operation.
 * @property {string} entityId - Identity of the duplicated entity.
 * @property {string} sourceEntityId - Identity selected before the copy operation.
 * @property {Entity} entity - Detached entity retained for redo.
 * @property {Entity} parent - Sibling parent recorded at duplication time.
 * @property {Transform} initialTransform - Transform used when resetting the duplicate.
 * @property {Transform} before - Duplicate transform before the drag.
 * @property {Transform} after - Duplicate transform after the drag.
 * @property {string} label - Human-readable operation label.
 */

/** @typedef {TransformHistoryEntry | DuplicateHistoryEntry} HistoryEntry */

/**
 * Runtime-private undo/redo stack for transforms and duplicate gestures.
 */
export class TransformHistory {
    /** @type {HistoryEntry[]} */
    #undo = [];

    /** @type {HistoryEntry[]} */
    #redo = [];

    /**
     * @param {HistoryEntry} entry - Completed reversible editor operation.
     * @returns {boolean} Whether the entry was valid and changed the stack.
     */
    commit(entry) {
        if (!this.#isValid(entry) || (entry.type !== 'duplicate' && this.#sameTransform(entry.before, entry.after))) {
            return false;
        }
        this.#disposeDetachedDuplicates(this.#redo);
        this.#undo.push(entry);
        this.#redo.length = 0;
        return true;
    }

    /**
     * @returns {HistoryEntry | null} Operation to revert, if available.
     */
    undo() {
        const entry = this.#undo.pop() ?? null;
        if (entry) {
            this.#redo.push(entry);
        }
        return entry;
    }

    /**
     * @returns {HistoryEntry | null} Operation to reapply, if available.
     */
    redo() {
        const entry = this.#redo.pop() ?? null;
        if (entry) {
            this.#undo.push(entry);
        }
        return entry;
    }

    clear() {
        this.#disposeDetachedDuplicates(this.#redo);
        this.#undo.length = 0;
        this.#redo.length = 0;
    }

    /**
     * @returns {HistorySnapshot} Serializable toolbar/status state.
     */
    snapshot() {
        const undoEntry = this.#undo.at(-1) ?? null;
        const redoEntry = this.#redo.at(-1) ?? null;
        return {
            canUndo: Boolean(undoEntry),
            canRedo: Boolean(redoEntry),
            undoLabel: undoEntry?.label ?? null,
            redoLabel: redoEntry?.label ?? null
        };
    }

    /**
     * @param {HistoryEntry} entry - Candidate history entry.
     * @returns {boolean} Whether it has valid transforms.
     */
    #isValid(entry) {
        const validTransforms = Boolean(entry?.entityId) &&
            isFiniteVector3(entry.before.position) &&
            isFiniteVector3(entry.before.rotation) &&
            isFiniteVector3(entry.before.scale) &&
            isFiniteVector3(entry.after.position) &&
            isFiniteVector3(entry.after.rotation) &&
            isFiniteVector3(entry.after.scale);
        if (!validTransforms) {
            return false;
        }
        if (entry.type === 'duplicate') {
            return Boolean(entry.sourceEntityId && entry.entity && entry.parent) &&
                isFiniteVector3(entry.initialTransform.position) &&
                isFiniteVector3(entry.initialTransform.rotation) &&
                isFiniteVector3(entry.initialTransform.scale);
        }
        return true;
    }

    /**
     * Releases duplicate entities that were undone and then discarded by a new edit.
     *
     * @param {HistoryEntry[]} entries - Entries leaving the redo stack.
     */
    #disposeDetachedDuplicates(entries) {
        for (const entry of entries) {
            if (entry.type === 'duplicate' && !entry.entity.parent) {
                entry.entity.destroy();
            }
        }
    }

    /**
     * @param {Transform} first - First transform.
     * @param {Transform} second - Second transform.
     * @returns {boolean} Whether transforms are exactly equal.
     */
    #sameTransform(first, second) {
        return ['position', 'rotation', 'scale'].every((field) => {
            return first[field].every((value, index) => value === second[field][index]);
        });
    }
}
