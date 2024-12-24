const { ChannelType } = require('discord.js');

/**
 * Cleans up messages in specified channels across all guilds.
 * @param {Client} client - The Discord client instance.
 * @param {Array<string>} channelsToClear - List of channel names to clear.
 * @param {Object} messageManager - Utility for managing messages in channels.
 */
const cleanupOnStartup = async (client, channelsToClear, messageManager) => {
    console.log('Starting cleanup process...');

    try {
        for (const guild of client.guilds.cache.values()) {
            for (const channelName of channelsToClear) {
                const channel = guild.channels.cache.find(
                    (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
                );

                if (channel) {
                    console.log(`Clearing messages in ${channelName} for guild: ${guild.name}`);
                    await messageManager.cleanChannel(channel);
                } else {
                    console.log(`Channel "${channelName}" not found in guild: ${guild.name}`);
                }
            }
        }
        console.log('Cleanup completed.');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

module.exports = cleanupOnStartup;
