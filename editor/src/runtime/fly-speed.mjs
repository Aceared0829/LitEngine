const MIN_FLY_SPEED = 0.1;
const MAX_FLY_SPEED = 1000;
const WHEEL_LINE_HEIGHT = 40;
const WHEEL_PAGE_HEIGHT = 800;
const MAX_WHEEL_STEPS = 4;
const SPEED_FACTOR = 1.2;

/**
 * @param {WheelEvent} event - Browser wheel event.
 * @returns {number} Bounded signed wheel notch count.
 */
export const getWheelSteps = (event) => {
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_HEIGHT :
        event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? WHEEL_PAGE_HEIGHT : 100;
    return Math.max(-MAX_WHEEL_STEPS, Math.min(MAX_WHEEL_STEPS, event.deltaY / unit));
};

/**
 * @param {number} speed - Current editor fly speed.
 * @param {number} steps - Normalized wheel steps.
 * @returns {number} Updated clamped fly speed.
 */
export const adjustFlySpeed = (speed, steps) => {
    const direction = Math.sign(-steps);
    if (!direction) {
        return speed;
    }
    return Math.max(MIN_FLY_SPEED, Math.min(MAX_FLY_SPEED, speed * Math.pow(SPEED_FACTOR, direction * Math.abs(steps))));
};
