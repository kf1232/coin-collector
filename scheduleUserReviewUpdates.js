const { ChannelType } = require('discord.js');
const { timers } = require('./config/config.json');
const { logEvent } = require('./logs/logging');

let lastMessage = null;

/**
 * Computes points statistics for a guild.
 * @param {Array<number>} pointsArray - Array of user points.
 * @returns {Object} Object containing total, max, min, average, and mean points.
 */
const calculatePointsStats = (pointsArray) => {
    const total = pointsArray.reduce((sum, points) => sum + points, 0);
    const max = Math.max(...pointsArray, 0);
    const min = Math.min(...pointsArray, 0);
    const avg = (total / pointsArray.length || 0).toFixed(2);
    const sortedPoints = [...pointsArray].sort((a, b) => a - b);
    const mean = sortedPoints[Math.floor(pointsArray.length / 2)] || 0;

    return { total, max, min, avg, mean };
};

/**
 * Formats the top users in a guild by points.
 * @param {Map<string, number>} guildUsers - Map of user points.
 * @param {Guild} guild - Guild object to fetch user data.
 * @param {number} count - Number of top users to include.
 * @returns {string} Formatted string of top users.
 */
const formatTopUsers = (guildUsers, guild, count = 20) => {
    return Array.from(guildUsers.entries())
        .sort(([, pointsA], [, pointsB]) => pointsB - pointsA) // Sort by points descending
        .slice(0, count)
        .map(([userId, points]) => {
            const member = guild.members.cache.get(userId);
            const userName = member ? member.user.username : 'Unknown User';
            return `- (${userId.slice(-4)}) ${userName}: ${points}`;
        })
        .join('\n');
};

/**
 * Updates the "user-review" channel in the admin guild with the latest points data.
 * @param {Client} client - The Discord client.
 * @param {Map} userPoints - The map of user points by guild.
 * @param {Object} adminServer - Admin server configuration from config.json.
 */
const scheduleUserReviewUpdates = async (client, userPoints, adminServer) => {
    const adminGuild = client.guilds.cache.get(adminServer.guildId);
    if (!adminGuild) {
        logEvent('SYSTEM', 'error', `Admin guild not found: ${adminServer.guildId}`);
        return;
    }

    const userReviewChannel = adminGuild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && channel.name === 'user-review'
    );

    if (!userReviewChannel) {
        logEvent('SYSTEM', 'error', 'No "user-review" channel found in the admin guild.');
        return;
    }

    const postUserReview = async () => {
        logEvent('SYSTEM', 'info', 'Updating user-review channel with the latest points data...');

        try {
            let reviewContent = '';

            for (const [guildId, guildUsers] of userPoints) {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const pointsArray = Array.from(guildUsers.values());
                const { total, max, min, avg, mean } = calculatePointsStats(pointsArray);
                const topUsers = formatTopUsers(guildUsers, guild);

                reviewContent += `**${guild.name} (${guildId})**\n` +
                    `Members: ${guild.memberCount}\n` +
                    `Max: ${max}, Min: ${min}, Avg: ${avg}, Mean: ${mean}\n` +
                    `${topUsers}\n\n`;
            }

            if (!reviewContent) {
                reviewContent = 'No data available for connected servers.';
            }

            if (lastMessage) {
                try {
                    await lastMessage.delete();
                    logEvent('SYSTEM', 'info', 'Deleted the last user-review message.');
                } catch (error) {
                    logEvent('SYSTEM', 'error', `Error deleting last message: ${error.message}`);
                }
            }

            lastMessage = await userReviewChannel.send(reviewContent);
            logEvent('SYSTEM', 'info', 'User-review channel updated successfully.');
        } catch (error) {
            logEvent('SYSTEM', 'error', `Error updating user-review channel: ${error.message}`);
        }
    };

    await postUserReview();

    const refreshInterval = timers.userReviewUpdateTimer * 60000;
    setInterval(postUserReview, refreshInterval);
};

module.exports = scheduleUserReviewUpdates;
