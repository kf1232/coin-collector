const { ChannelType } = require('discord.js');
const { logEvent } = require('../logs/logging')

/**
 * Cleans up messages in specified channels across all guilds.
 * @param {Client} client - The Discord client instance.
 * @param {Array<string>} channelsToClear - List of channel names to clear.
 * @param {Object} messageManager - Utility for managing messages in channels, must have a `cleanChannel` method.
 */
const cleanupOnStartup = async (client, channelsToClear, messageManager) => {
    logEvent('SYSTEM', 'info', 'Starting cleanup process...');

    try {
        for (const guild of client.guilds.cache.values()) {
            for (const channelName of channelsToClear) {
                const channel = guild.channels.cache.find(
                    (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
                );

                if (channel) {
                    logEvent('SYSTEM', 'info', `Clearing messages in channel "${channelName}" for guild: "${guild.name}".`);
                    await messageManager.cleanChannel(channel);
                } else {
                    logEvent('SYSTEM', 'warn', `Channel "${channelName}" not found in guild: "${guild.name}".`);
                }
            }
        }
        logEvent('SYSTEM', 'info', 'Cleanup process completed successfully.');
    } catch (error) {
        logEvent('SYSTEM', 'error', `Error during cleanup process: ${error.message}`);
    }
};

module.exports = cleanupOnStartup;
