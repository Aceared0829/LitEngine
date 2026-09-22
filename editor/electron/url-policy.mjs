/**
 * @param {string} value - Candidate renderer URL.
 * @param {{ isDevelopment: boolean, developmentUrl: string }} options - Application mode details.
 * @returns {boolean} Whether the URL is the exact trusted renderer origin.
 */
export const isTrustedRendererUrl = (value, { isDevelopment, developmentUrl }) => {
    try {
        const url = new URL(value);
        if (!isDevelopment) {
            return url.protocol === 'lit-editor:' && url.hostname === 'app';
        }
        const development = new URL(developmentUrl);
        return url.protocol === development.protocol &&
            url.hostname === development.hostname &&
            url.port === development.port;
    } catch {
        return false;
    }
};

/**
 * @param {string} file - Path requested by the application protocol.
 * @returns {string | null} Sanitized relative path, or null when unsafe.
 */
export const sanitizeApplicationPath = (file) => {
    let decoded;
    try {
        decoded = decodeURIComponent(file || '/index.html');
    } catch {
        return null;
    }
    const normalized = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('\0') || normalized.split('/').some(segment => segment === '..')) {
        return null;
    }
    return normalized;
};
