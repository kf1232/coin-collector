const fs = require('fs');
const { logEvent } = require('../logs/logging'); // Ensure the correct path to your logger.js

/**
 * User Points Persistence Module
 * Provides methods to save, load, and synchronize user points with the guilds in the Discord client.
 * 
 * @param {Map} userPoints - A Map containing guild and user point data.
 * @param {string} userPointsFile - The file path where user points data will be stored.
 * @returns {Object} Public API with methods to save, load, and sync user points.
 */
module.exports = (userPoints, userPointsFile) => {
    /**
     * Saves the user points to a file.
     */
    const save = () => {
        try {
            const serializedData = JSON.stringify(
                Object.fromEntries(
                    [...userPoints].map(([guildId, users]) => [
                        guildId,
                        Object.fromEntries(users),
                    ])
                ),
                null,
                2
            );
            fs.writeFileSync(userPointsFile, serializedData);
            logEvent('FILE', 'info', `User points successfully saved to ${userPointsFile}.`);
        } catch (error) {
            logEvent('FILE', 'error', `Error saving user points: ${error.message}`);
        }
    };

    /**
     * Loads the user points from a file.
     * If the file does not exist, it creates a new file with an empty structure.
     */
    const load = () => {
        try {
            if (!fs.existsSync(userPointsFile)) {
                fs.writeFileSync(userPointsFile, JSON.stringify({}));
                logEvent('FILE', 'info', `Created new user points file: ${userPointsFile}.`);
            }

            const rawData = fs.readFileSync(userPointsFile, 'utf-8');
            const data = JSON.parse(rawData);

            if (typeof data === 'object') {
                for (const [guildId, users] of Object.entries(data)) {
                    userPoints.set(guildId, new Map(Object.entries(users)));
                }
                logEvent('FILE', 'info', `User points successfully loaded from ${userPointsFile}.`);
            } else {
                throw new Error('Invalid file structure.');
            }
        } catch (error) {
            logEvent('FILE', 'error', `Error loading user points: ${error.message}`);
            fs.writeFileSync(userPointsFile, JSON.stringify({}));
        }
    };

    /**
     * Synchronizes user points with the current guilds in the Discord client.
     * Ensures all guild members are initialized with a default point balance if not already present.
     * 
     * @param {Object} client - The Discord client.
     */
    const syncWithGuilds = async (client) => {
        try {
            const guilds = client.guilds.cache.values();

            for (const guild of guilds) {
                const guildUsers = userPoints.get(guild.id) || new Map();
                const members = await guild.members.fetch();

                members.forEach((member) => {
                    if (!guildUsers.has(member.id)) {
                        guildUsers.set(member.id, 0);
                    }
                });

                userPoints.set(guild.id, guildUsers);
            }

            save();
            logEvent('FILE', 'info', 'Synchronized guilds and updated user points.');
        } catch (error) {
            logEvent('FILE', 'error', `Error synchronizing guilds: ${error.message}`);
        }
    };

    // Return the public API
    return {
        save,
        load,
        syncWithGuilds,
    };
};
