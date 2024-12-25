/**
 * Points Manager Module
 * Handles updates to user points for a specific guild.
 */

/**
 * Updates the points for a user in a specific guild.
 * @param {Map} userPoints - The map containing guild and user point data.
 * @param {Object} persistData - The persistence layer to save updated data.
 * @returns {Function} A function to update points for a specific user in a guild.
 */
const updatePoints = (userPoints, persistData) => {
    /**
     * Updates the points for a user in a specific guild.
     * @param {string} guildId - The ID of the guild.
     * @param {string} userId - The ID of the user.
     * @param {number} pointsToAdd - The number of points to add (can be negative).
     * @param {string} [reason='No reason provided'] - Optional reason for the update, used for logging.
     */
    return (guildId, userId, pointsToAdd, reason = 'No reason provided') => {
        if (!userPoints.has(guildId)) {
            userPoints.set(guildId, new Map());
        }

        const guildUsers = userPoints.get(guildId);
        const currentPoints = guildUsers.get(userId) || 0;
        const newPoints = currentPoints + pointsToAdd;

        guildUsers.set(userId, newPoints);

        // Persist changes to storage
        persistData.save();

        // Log the update
        console.log(
            `Points updated for user ${userId} in guild ${guildId}. ` +
            `Points: ${currentPoints} -> ${newPoints}. Reason: ${reason}`
        );
    };
};

/**
 * Retrieves the current balance for a user in a specific guild.
 * @param {Map} userPoints - The map containing guild and user point data.
 * @returns {Function} A function to get the balance for a specific user in a guild.
 */
const getUserBalance = (userPoints) => {
    /**
     * Retrieves the balance for a user in a guild.
     * @param {string} guildId - The ID of the guild.
     * @param {string} userId - The ID of the user.
     * @returns {number} The current balance of the user.
     */
    return (guildId, userId) => {
        if (!userPoints.has(guildId)) {
            return 0;
        }

        const guildUsers = userPoints.get(guildId);
        return guildUsers.get(userId) || 0;
    };
};

module.exports = {
    updatePoints,
    getUserBalance,
};
