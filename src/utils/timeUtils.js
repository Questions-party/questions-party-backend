// Helper function to format date to UTC+8 timezone
const formatDateToUTC8 = (date) => {
    if (!date) return null;
    const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    return utc8Date.toISOString().replace('T', ' ').substring(0, 19);
};

module.exports = {
    formatDateToUTC8
}