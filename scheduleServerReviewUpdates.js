const { ChannelType } = require('discord.js');
const { timers, allowedChannels } = require('./config/config.json');
const { logEvent } = require('./logs/logging')

const serverMessages = new Map(); // Tracks messages for each server to dynamically update or delete

/**
 * Computes points statistics for a guild.
 * @param {Map} guildUsers - Map of user points for a guild.
 * @returns {Object} Statistics including total, max, min, average, and mean points.
 */
const calculatePointsStats = (guildUsers) => {
    const pointsArray = Array.from(guildUsers.values());
    const total = pointsArray.reduce((sum, points) => sum + points, 0);
    const max = Math.max(...pointsArray, 0);
    const min = Math.min(...pointsArray, 0);
    const avg = (total / pointsArray.length || 0).toFixed(2);
    const sortedPoints = pointsArray.sort((a, b) => a - b);
    const mean = sortedPoints[Math.floor(pointsArray.length / 2)] || 0;

    return { total, max, min, avg, mean };
};

/**
 * Retrieves filtered text channel data for a guild.
 * @param {Guild} guild - The guild object.
 * @returns {string} String representation of allowed channels in the guild.
 */
const getFilteredChannels = (guild) => {
    return guild.channels.cache
        .filter(
            (channel) =>
                channel.type === ChannelType.GuildText && allowedChannels.includes(channel.name)
        )
        .map((channel) => `(${channel.id}) ${channel.name}`)
        .join('\n') || 'No allowed channels visible';
};

/**
 * Posts or updates the server review message for a guild.
 * @param {Guild} guild - The guild object.
 * @param {string} reviewContent - The review content to post or update.
 * @param {TextChannel} serverReviewChannel - The channel to post or update the message in.
 */
const updateServerReviewMessage = async (guild, reviewContent, serverReviewChannel) => {
    try {
        if (serverMessages.has(guild.id)) {
            const existingMessage = serverMessages.get(guild.id);

            // Update the message if content has changed
            if (existingMessage.content !== reviewContent) {
                await existingMessage.edit(reviewContent);
                logEvent('SYSTEM', 'info', `Updated server review message for guild: ${guild.name}`);
            }
        } else {
            // Post a new message and store the reference
            const newMessage = await serverReviewChannel.send(reviewContent);
            serverMessages.set(guild.id, newMessage);
            logEvent('SYSTEM', 'info', `Posted initial server review message for guild: ${guild.name}`);
        }
    } catch (error) {
        logEvent('SYSTEM', 'error', `Error updating server review for guild: ${guild.name} - ${error.message}`);
    }
};

/**
 * Schedules periodic updates to the "server-review" channel in the admin guild.
 * @param {Client} client - The Discord client instance.
 * @param {Map} userPoints - The map of user points by guild.
 * @param {Object} adminServer - Admin server configuration from config.json.
 */
const scheduleServerReviewUpdates = async (client, userPoints, adminServer) => {
    const adminGuild = client.guilds.cache.get(adminServer.guildId);
    if (!adminGuild) {
        logEvent('SYSTEM', 'error', `Admin guild not found: ${adminServer.guildId}`);
        return;
    }

    const serverReviewChannel = adminGuild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && channel.name === 'server-review'
    );

    if (!serverReviewChannel) {
        logEvent('SYSTEM', 'error', 'No "server-review" channel found in the admin guild.');
        return;
    }

    const postOrUpdateServerReview = async () => {
        logEvent('SYSTEM', 'info', 'Updating server-review channel with the latest points and channel data...');

        for (const [guildId, guildUsers] of userPoints) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const { total, max, min, avg, mean } = calculatePointsStats(guildUsers);
            const filteredChannels = getFilteredChannels(guild);

            const reviewContent = `**${guild.name} (${guildId})**\n` +
                `- Members: ${guild.memberCount}\n` +
                `- Total Points: ${total}, Max: ${max}, Min: ${min}, Avg: ${avg}, Mean: ${mean}\n` +
                `\n${filteredChannels}\n\n`;

            await updateServerReviewMessage(guild, reviewContent, serverReviewChannel);
        }

        // Remove messages for disconnected servers
        for (const [guildId, message] of serverMessages.entries()) {
            if (!userPoints.has(guildId)) {
                try {
                    await message.delete();
                    serverMessages.delete(guildId);
                    logEvent('SYSTEM', 'info', `Removed server review message for disconnected guild: ${guildId}`);
                } catch (error) {
                    logEvent('SYSTEM', 'error', `Error removing message for disconnected guild: ${guildId} - ${error.message}`);
                }
            }
        }
    };

    // Post an initial full review
    await postOrUpdateServerReview();

    // Schedule periodic updates
    const refreshInterval = timers.serverReviewUpdateTimer * 60000; // Convert minutes to milliseconds
    setInterval(postOrUpdateServerReview, refreshInterval);
};

module.exports = scheduleServerReviewUpdates;