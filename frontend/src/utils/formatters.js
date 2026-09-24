/**
 * Utility Formatters for NEXORA Frontend
 */

/**
 * Formats a millisecond duration into a readable string
 * @param {number} ms
 * @returns {string}
 */
export const formatLatency = (ms) => {
  if (typeof ms !== 'number') return 'N/A';
  return `${ms} ms`;
};

/**
 * Formats an ISO date string into locale time string
 * @param {string} isoString
 * @returns {string}
 */
export const formatTimestamp = (isoString) => {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
