const { ChannelType } = require('discord.js');

const processedMessages = new Set();

/**
 * Posts a coin message in the "coin-collectors" channel.
 * @param {Guild} guild - The guild to post the message in.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const postCoinMessage = async (guild, updatePoints, userPoints) => {
    try {
        const coinCollectorsChannel = guild.channels.cache.find(
            (channel) => channel.type === ChannelType.GuildText && channel.name === 'coin-collectors'
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
    const collector = message.createReactionCollector({
        time: 60000, // 60 seconds
        filter: (reaction, user) => reaction.emoji.name === '🪙' && !user.bot,
    });

    collector.on('collect', async (reaction, user) => {
        const guildId = guild.id;
        const name = user.displayName;

        // Check if the message has already processed a reaction
        if (processedMessages.has(message.id)) {
            console.log(`Coin already collected for message ${message.id} in guild: ${guild.name}`);
            return;
        }

        // Mark this message as processed
        processedMessages.add(message.id);

        // Award the coin to the first user who reacts
        updatePoints(guildId, user.id, 1, 'Coin collection');
        console.log(`User ${name} collected a coin in guild: ${guild.name}`);

        const guildUsers = userPoints.get(guildId);
        const userPointsTotal = guildUsers ? guildUsers.get(user.id) || 0 : 0;

        const updatedContent = `${name} collected the coin. Better luck next time, everyone! ${name} now has ${userPointsTotal} points.`;
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
    const minDelay = timers.coinPostIntervalMin * 60000; // Convert to ms
    const maxDelay = timers.coinPostIntervalMax * 60000; // Convert to ms

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
};
