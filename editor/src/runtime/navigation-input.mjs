/**
 * UE perspective navigation uses the complete held-button state, not the last pressed button.
 *
 * @param {number} buttons - DOM mouse button mask.
 * @param {boolean} alt - Whether Alt is held.
 * @returns {'idle'|'walk'|'look'|'pan'|'orbit'|'dolly'} Navigation operation.
 */
export const getNavigationMode = (buttons, alt) => {
    if (buttons & 4 || (buttons & 3) === 3) {
        return 'pan';
    }
    if (buttons & 2) {
        return alt ? 'dolly' : 'look';
    }
    if (buttons & 1) {
        return alt ? 'orbit' : 'walk';
    }
    return 'idle';
};

/**
 * @param {EventTarget | null} target - Potential text input target.
 * @returns {boolean} Whether keyboard input belongs to a text control.
 */
export const isEditableTarget = (target) => {
    return target instanceof HTMLElement &&
        (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable], .pcui-text-input')));
};
