import { isFiniteVector3 } from '../domain/editor-reducer.mjs';

/**
 * @import { HistorySnapshot, Transform } from '../contracts/editor-contracts.mjs'
 */

/**
 * @typedef {object} TransformHistoryEntry
 * @property {string} entityId - Edited entity identity.
 * @property {Transform} before - Transform before the operation.
 * @property {Transform} after - Transform after the operation.
 * @property {string} label - Human-readable operation label.
 */

/**
 * Runtime-private, transform-only undo/redo stack.
 */
export class TransformHistory {
    /** @type {TransformHistoryEntry[]} */
    #undo = [];

    /** @type {TransformHistoryEntry[]} */
    #redo = [];

    /**
     * @param {TransformHistoryEntry} entry - Completed reversible transform operation.
     * @returns {boolean} Whether the entry was valid and changed the stack.
     */
    commit(entry) {
        if (!this.#isValid(entry) || this.#sameTransform(entry.before, entry.after)) {
            return false;
        }
        this.#undo.push(entry);
        this.#redo.length = 0;
        return true;
    }

    /**
     * @returns {TransformHistoryEntry | null} Operation to revert, if available.
     */
    undo() {
        const entry = this.#undo.pop() ?? null;
        if (entry) {
            this.#redo.push(entry);
        }
        return entry;
    }

    /**
     * @returns {TransformHistoryEntry | null} Operation to reapply, if available.
     */
    redo() {
        const entry = this.#redo.pop() ?? null;
        if (entry) {
            this.#undo.push(entry);
        }
        return entry;
    }

    clear() {
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
     * @param {TransformHistoryEntry} entry - Candidate history entry.
     * @returns {boolean} Whether it has valid transforms.
     */
    #isValid(entry) {
        return Boolean(entry?.entityId) &&
            isFiniteVector3(entry.before.position) &&
            isFiniteVector3(entry.before.rotation) &&
            isFiniteVector3(entry.before.scale) &&
            isFiniteVector3(entry.after.position) &&
            isFiniteVector3(entry.after.rotation) &&
            isFiniteVector3(entry.after.scale);
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
