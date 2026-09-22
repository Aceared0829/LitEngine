/**
 * Parse a finite numeric literal without eval/Function, including intermediate editing states.
 *
 * @param {string} text - User-entered decimal or exponent notation.
 * @returns {number | null} Number, or null for empty/invalid input.
 */
export const parseNumberDraft = (text) => {
    const trimmed = text.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
        return null;
    }
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
};
