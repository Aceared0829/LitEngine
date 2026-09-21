import { EditorRuntime } from '../runtime/editor-runtime.mjs';
import { editorReducer, initialEditorState } from '../domain/editor-reducer.mjs';

/**
 * @import { EditorCommand, RuntimeEvent } from '../contracts/editor-contracts.mjs'
 * @import { EditorState } from '../domain/editor-reducer.mjs'
 */

/**
 * Stable application boundary between the UI shell and graphics runtime.
 */
export class EditorController {
    /** @type {EditorState} */
    #state = initialEditorState;

    /** @type {Set<(state: EditorState) => void>} */
    #listeners = new Set();

    /** @type {EditorRuntime | null} */
    #runtime = null;

    /**
     * @param {HTMLCanvasElement} canvas - Canvas supplied by the viewport component.
     */
    constructor(canvas) {
        this.#runtime = new EditorRuntime(canvas, this.#onRuntimeEvent.bind(this));
        this.#runtime.initialize().catch((error) => {
            this.#onRuntimeEvent({
                type: 'runtimeError',
                message: error instanceof Error ? error.message : String(error)
            });
        });
    }

    /**
     * @returns {EditorState} Current immutable-by-convention editor state.
     */
    getState() {
        return this.#state;
    }

    /**
     * @param {(state: EditorState) => void} listener - State observer.
     * @returns {() => void} Unsubscribe callback.
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        listener(this.#state);
        return () => this.#listeners.delete(listener);
    }

    /**
     * @param {EditorCommand} command - UI intent.
     */
    dispatch(command) {
        switch (command.type) {
            case 'setTransformTool':
                this.#setState({ ...this.#state, activeTool: command.tool });
                break;
            case 'setCoordinateSpace':
                this.#setState({ ...this.#state, coordinateSpace: command.coordinateSpace });
                break;
        }
        this.#runtime?.dispatch(command);
    }

    /**
     * Releases the complete graphics runtime once the UI unmounts.
     */
    dispose() {
        this.#runtime?.destroy();
        this.#runtime = null;
        this.#listeners.clear();
    }

    /**
     * @param {RuntimeEvent} event - Runtime observation.
     */
    #onRuntimeEvent(event) {
        this.#setState(editorReducer(this.#state, event));
    }

    /**
     * @param {EditorState} state - New state.
     */
    #setState(state) {
        this.#state = state;
        for (const listener of this.#listeners) {
            listener(state);
        }
    }
}
