const { ChannelType } = require('discord.js');
const { timers, allowedChannels } = require('./config.json');

const serverMessages = new Map(); // Track messages for each server to dynamically update or delete

/**
 * Updates the "server-review" channel in the admin guild with the latest server points and channel data.
 * Only includes channels listed in `allowedChannels`.
 * @param {Client} client - The Discord client.
 * @param {Map} userPoints - The map of user points by guild.
 * @param {Object} adminServer - Admin server configuration from config.json.
 */
const scheduleServerReviewUpdates = async (client, userPoints, adminServer) => {
    const adminGuild = client.guilds.cache.get(adminServer.guildId);
    if (!adminGuild) {
        console.error(`Admin guild not found: ${adminServer.guildId}`);
        return;
    }

    const serverReviewChannel = adminGuild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && channel.name === 'server-review'
    );

    if (!serverReviewChannel) {
        console.error('No "server-review" channel found in the admin guild.');
        return;
    }

    const postOrUpdateServerReview = async () => {
        console.log('Updating server-review channel with the latest points and channel data...');

        for (const [guildId, guildUsers] of userPoints) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            try {
                const memberCount = guild.memberCount;
                const totalPoints = Array.from(guildUsers.values()).reduce((sum, points) => sum + points, 0);
                const maxPoints = Math.max(...Array.from(guildUsers.values()), 0);
                const minPoints = Math.min(...Array.from(guildUsers.values()), 0);
                const averagePoints = (totalPoints / guildUsers.size || 0).toFixed(2);
                const meanPoints =
                    Array.from(guildUsers.values())
                        .sort((a, b) => a - b)[Math.floor(guildUsers.size / 2)] || 0;

                const filteredChannels = guild.channels.cache
                    .filter(
                        (channel) =>
                            channel.type === ChannelType.GuildText &&
                            allowedChannels.includes(channel.name)
                    )
                    .map((channel) => `(${channel.id}) ${channel.name}`)
                    .join('\n');

                const reviewContent = `**${guild.name} (${guildId})**\n` +
                    `- Members: ${memberCount}\n` +
                    `- Total Points: ${totalPoints}, Max: ${maxPoints}, Min: ${minPoints}, Avg: ${averagePoints}, Mean: ${meanPoints}\n` +
                    `\n${filteredChannels || 'No allowed channels visible'}\n\n`;

                // Check if there's an existing message for this guild
                if (serverMessages.has(guildId)) {
                    const existingMessage = serverMessages.get(guildId);

                    // Update the message if it differs
                    if (existingMessage.content !== reviewContent) {
                        await existingMessage.edit(reviewContent);
                        console.log(`Updated server review message for guild: ${guild.name}`);
                    }
                } else {
                    // Post a new message and store the reference
                    const newMessage = await serverReviewChannel.send(reviewContent);
                    serverMessages.set(guildId, newMessage);
                    console.log(`Posted initial server review message for guild: ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error updating server review for guild: ${guild.name}`, error);
            }
        }

        // Remove messages for disconnected servers
        for (const [guildId, message] of serverMessages.entries()) {
            if (!userPoints.has(guildId)) {
                try {
                    await message.delete();
                    serverMessages.delete(guildId);
                    console.log(`Removed server review message for disconnected guild: ${guildId}`);
                } catch (error) {
                    console.error(`Error removing message for disconnected guild: ${guildId}`, error);
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
