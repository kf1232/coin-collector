const { ChannelType } = require('discord.js');
const { timers } = require('./config.json');


const processedMessages = new Map();

const cleanupProcessedMessages = (interval = timers.ONE_MINUTE) => {
    setInterval(() => {
        const now = Date.now();
        for (const [key, timestamp] of processedMessages.entries()) {
            if (now - timestamp > 60 * timers.ONE_MINUTE * 10) {
                processedMessages.delete(key);
            }
        }
        console.log('Processed messages cleaned up.');
    }, interval);
};

/**
 * Posts a coin message in the "coin-collectors" channel.
 * @param {Guild} guild - The guild to post the message in.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const postCoinMessage = async (guild, updatePoints, userPoints) => {
    try {
        const allowedChannelNames = ["coin-collectors", "treasure-island"];

        const coinCollectorsChannel = guild.channels.cache.find(
            (channel) =>
                channel.type === ChannelType.GuildText && allowedChannelNames.includes(channel.name)
        );

        if (!coinCollectorsChannel) {
            console.log(`No "coin-collectors" channel in ${guild.name}`);
            return;
        }

        const message = await coinCollectorsChannel.send({
            content: 'Coin Available - React to collect 1 coin!',
        });

        await message.react('🪙');

        const collector = setupReactionCollector(message, guild, updatePoints, userPoints);

        collector.on('end', async () => {
            console.log(`Collector ended for message in ${guild.name}`);
            await safelyDeleteMessage(message, guild.name);
        });
    } catch (error) {
        console.error(`Error in postCoinMessage: ${error.message}`);
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
    const debounceInterval = 5000; // 5 seconds

    const collector = message.createReactionCollector({
        time: timers.ONE_MINUTE * 10,
        filter: (reaction, user) => reaction.emoji.name === '🪙' && !user.bot,
    });

    collector.on('collect', async (reaction, user) => {
        // Ensure the message content matches the original coin message
        if (message.content !== 'Coin Available - React to collect 1 coin!') {
            console.log(`Invalid message content for reaction by user ${user.username}`);
            return;
        }

        const guildId = guild.id;
        const userId = user.id;

        // Generate a unique key for the user-message pair
        const userMessageKey = `${message.id}-${userId}`;

        // Check debounce and process reaction
        const now = Date.now();
        const lastProcessed = processedMessages.get(userMessageKey);

        if (lastProcessed && now - lastProcessed < debounceInterval) {
            console.log(`Debounced reaction for user ${user.username} on message ${message.id}`);
            return;
        }

        // Mark as processed with the current timestamp
        processedMessages.set(userMessageKey, now);

        // Award the coin
        updatePoints(guildId, userId, 1, 'Coin collection');
        console.log(`User ${user.username} collected a coin in guild: ${guild.name}`);

        const guildUsers = userPoints.get(guildId);
        const userPointsTotal = guildUsers ? guildUsers.get(userId) || 0 : 0;

        const updatedContent = `${user.username} collected the coin. Better luck next time, everyone! ${user.username} now has ${userPointsTotal} points.`;
        await message.edit(updatedContent);
    });

    return collector;
};

/**
 * Deletes a message and handles errors gracefully.
 * @param {Message} message - The Discord message object to delete.
 * @param {string} guildName - The name of the guild where the message is posted.
 */
const safelyDeleteMessage = async (message, guildName) => {
    try {
        await message.delete();
        console.log(`Coin message deleted in guild: ${guildName}`);
    } catch (error) {
        console.error(`Error deleting coin message in guild ${guildName}: ${error.message}`);
    }
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

    client.guilds.cache.forEach((guild) =>
        scheduleGuildCoinPost(guild, minDelay, maxDelay, updatePoints, userPoints)
    );
};

/**
 * Schedules coin posts for a specific guild.
 * @param {Guild} guild - The guild to schedule coin posts for.
 * @param {number} minDelay - Minimum delay between posts.
 * @param {number} maxDelay - Maximum delay between posts.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const scheduleGuildCoinPost = (guild, minDelay, maxDelay, updatePoints, userPoints) => {
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
        await postCoinMessage(guild, updatePoints, userPoints);
        scheduleGuildCoinPost(guild, minDelay, maxDelay, updatePoints, userPoints);
    }, delay);
};

module.exports = {
    scheduleCoinPost,
    postCoinMessage,
    cleanupProcessedMessages
};
