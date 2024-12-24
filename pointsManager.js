/**
 * Points Manager Module
 * Handles updates to user points for a specific guild.
 */

const updatePoints = (userPoints, persistData) => {
    /**
     * Updates the points for a user in a specific guild.
     * @param {string} guildId - The ID of the guild.
     * @param {string} userId - The ID of the user.
     * @param {number} pointsToAdd - The number of points to add (can be negative).
     * @param {string} [reason] - Optional reason for the update, used for logging.
     */
    return (guildId, userId, pointsToAdd, reason = 'No reason provided') => {
        if (!userPoints.has(guildId)) userPoints.set(guildId, new Map());
        const guildUsers = userPoints.get(guildId);

        const currentPoints = guildUsers.get(userId) || 0;
        const newPoints = currentPoints + pointsToAdd;
        guildUsers.set(userId, newPoints);

        persistData.save(); // Save points to file immediately

        console.log(
            `Updated points for user ${userId} in guild ${guildId}: ${currentPoints} -> ${newPoints} (${reason})`
        );
    };
};

module.exports = updatePoints;
