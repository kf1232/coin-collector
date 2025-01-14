const { MessageFlags, ChannelType } = require('discord.js');
const { timers, coinChannels, status } = require('../config/config.json');
const { logEvent } = require('../logs/logging')

const pointsLogPath = 'COIN';

/**
 * Posts a coin message in the "coin-collectors" channel.
 * @param {Guild} guild - The guild to post the message in.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const postCoinMessage = async (guild, updatePoints, userPoints) => {
    try {
        // Find the appropriate channel for coin collectors
        const coinCollectorsChannel = guild.channels.cache.find(
            (channel) => channel.type === ChannelType.GuildText && coinChannels.includes(channel.name)
        );

        if (!coinCollectorsChannel) {
            logEvent('COIN', 'warn', `No allowed channels in guild "${guild.name}"`);
            return;
        }

        // Post the coin message in the channel
        const message = await coinCollectorsChannel.send({
            content: 'Coin Available - React to collect 1 coin!',
            flags: MessageFlags.SuppressNotifications
        });

        await message.react('🪙');
        logEvent('COIN', 'info', `Message posted in "${guild.name}"`);

        // Setup the reaction collector
        const collector = setupReactionCollector(message, guild, updatePoints, userPoints);

        collector.on('end', async () => {
            logEvent('COIN', 'info', `Reaction collector ended in "${guild.name}"`);
            try {
                await message.delete();
                logEvent('COIN', 'info', `Message deleted in guild "${guild.name}"`);
            } catch (error) {
                logEvent('COIN', 'error', `Failed to delete message in "${guild.name}": ${error.message}`);
            }
        });
    } catch (error) {
        logEvent('COIN', 'error', `Error in postCoinMessage: ${error.message}`);
    }
};

/**
 * Sets up a reaction collector for the coin message.
 * @param {Message} message - The Discord message object.
 * @param {Guild} guild - The guild where the message is posted.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 * @returns {ReactionCollector} The created reaction collector.
 */
const setupReactionCollector = (message, guild, updatePoints, userPoints) => {
    const processedMessages = new Map();
    const debounceInterval = timers.debounceInterval;

    const collector = message.createReactionCollector({
        time: timers.ONE_MINUTE * 10,
        filter: (reaction, user) => reaction.emoji.name === '🪙' && !user.bot,
    });

    collector.on('collect', async (reaction, user) => {
        try {
            if (message.content !== 'Coin Available - React to collect 1 coin!') {
                logEvent(pointsLogPath, status.ERROR, `Invalid message content for reaction by user "${user.username}"`);
                return;
            }

            const userMessageKey = `${message.id}-${user.id}`;
            const lastProcessed = processedMessages.get(userMessageKey);

            if (lastProcessed && Date.now() - lastProcessed < debounceInterval) {
                logEvent(pointsLogPath, status.WARNING, `Debounced reaction for user "${user.username}" on message "${message.id}"`);
                return;
            }

            processedMessages.set(userMessageKey, Date.now());
            updatePoints(guild.id, user.id, 1, 'Coin collection');
            logEvent(pointsLogPath, status.SAVE, `User "${user.username}" collected a coin in guild "${guild.name}"`);

            const userPointsTotal = userPoints.get(guild.id)?.get(user.id) || 0;
            await message.edit(
                `${user.username} collected the coin. Better luck next time, everyone! ${user.username} now has ${userPointsTotal} points.`
            );
            logEvent(pointsLogPath, status.POST, `Message updated with collection data by "${user.username}" in guild "${guild.name}"`);
        } catch (error) {
            logEvent(pointsLogPath, status.ERROR, `Error during reaction collection: ${error.message}`);
        }
    });

    return collector;
};

/**
 * Schedules coin posts for all guilds.
 * @param {Client} client - The Discord client.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 * @param {Object} timers - Timing configuration for coin posts.
 */

const scheduleCoinPost = (client, updatePoints, userPoints, timers) => {
    const minDelay = timers.coinPostIntervalMin * timers.ONE_MINUTE;
    const maxDelay = timers.coinPostIntervalMax * timers.ONE_MINUTE;

    client.guilds.cache.forEach((guild) => {
        const scheduleNextPost = () => {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            const nextPostTime = new Date(Date.now() + delay);

            logEvent(
                'COIN',
                'info',
                `Next coin post for guild "${guild.name}" scheduled at ${nextPostTime
                    .toISOString()
                    .replace('T', ' ')
                    .split('.')[0]}`
            );

            setTimeout(() => {
                postCoinMessage(guild, updatePoints, userPoints)
                    .then(() => scheduleNextPost())
                    .catch((error) => {
                        logEvent('COIN', 'error', `Failed to post coin message for guild "${guild.name}": ${error.message}`);
                        scheduleNextPost();
                    });
            }, delay);
        };

        scheduleNextPost();
    });
};


module.exports = {
    scheduleCoinPost,
};
