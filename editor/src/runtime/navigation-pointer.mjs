const RIGHT_MOUSE_BUTTON = 2;

/**
 * @param {number | null} activePointerId - Pointer that started right-button navigation.
 * @param {{ pointerId: number, buttons: number }} event - Pointer state after the event.
 * @returns {boolean} Whether that pointer no longer holds the right button.
 */
export const releasedNavigationButton = (activePointerId, event) => {
    return activePointerId !== null && event.pointerId === activePointerId && !(event.buttons & RIGHT_MOUSE_BUTTON);
};
