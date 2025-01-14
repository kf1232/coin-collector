const { logEvent } = require('../logs/logging');

/**
 * Updates the points for a user in a specific guild.
 * 
 * @param {Map} userPoints - A Map containing guild and user point data.
 * @param {Object} persistData - The persistence layer to save updated data.
 * @returns {Function} A function to update points for a specific user in a guild.
 */
const updatePoints = (userPoints, persistData) => {
    /**
     * Updates the points for a user in a specific guild.
     * 
     * @param {string} guildId - The ID of the guild.
     * @param {string} userId - The ID of the user.
     * @param {number} pointsToAdd - The number of points to add (can be negative).
     * @param {string} [reason='No reason provided'] - An optional reason for the update, used for logging.
     */
    return (guildId, userId, pointsToAdd, reason = 'No reason provided') => {
        if (!userPoints.has(guildId)) {
            userPoints.set(guildId, new Map());
        }

        const guildUsers = userPoints.get(guildId);
        const currentPoints = guildUsers.get(userId) || 0;
        const newPoints = currentPoints + pointsToAdd;

        guildUsers.set(userId, newPoints);

        persistData.save();

        logEvent('POINTS', 'info', `Points updated for user ${userId} in guild ${guildId}. Points: ${currentPoints} -> ${newPoints}. Reason: ${reason}`);
    };
};

/**
 * Retrieves the current balance for a user in a specific guild.
 * 
 * @param {Map} userPoints - A Map containing guild and user point data.
 * @returns {Function} A function to retrieve the balance for a specific user in a guild.
 */
const getUserBalance = (userPoints) => {
    /**
     * Retrieves the balance for a user in a specific guild.
     * 
     * @param {string} guildId - The ID of the guild.
     * @param {string} userId - The ID of the user.
     * @returns {number} The current balance of the user, or 0 if no balance is found.
     */
    return (guildId, userId) => {
        if (!userPoints.has(guildId)) {
            return 0;
        }

        const guildUsers = userPoints.get(guildId);
        const balance = guildUsers.get(userId) || 0;

        logEvent('POINTS', 'info', `Retrieved balance for user ${userId} in guild ${guildId}: ${balance} points.`);

        return balance;
    };
};

module.exports = {
    updatePoints,
    getUserBalance,
};
