const { ChannelType } = require('discord.js');
const path = require('path');

const { getRandomImage } = require('./managerCollection');

const processedMessages = new Set();

/**
 * Posts a random image to the "coin-collectors" channel in all guilds.
 * Automatically deletes the post after 1 minute.
 * @param {Client} client - The Discord client.
 * @param {Set<string>} recentImages - A Set of recently posted image filenames.
 */
const postRandomImage = async (client, recentImages) => {
    try {
        for (const guild of client.guilds.cache.values()) {
            const coinCollectorsChannel = guild.channels.cache.find(
                (channel) => channel.type === ChannelType.GuildText && channel.name === 'coin-collectors'
            );

            if (!coinCollectorsChannel) {
                console.log(`No "coin-collectors" channel found in guild: ${guild.name}`);
                continue;
            }

            const randomImagePath = getRandomImage(path.join(__dirname, 'downloads'), recentImages);

            if (!randomImagePath) {
                console.error('No image available for posting.');
                continue;
            }

            const cost = Math.floor(Math.random() * (10 - 5 + 1)) + 5;

            const message = await coinCollectorsChannel.send({
                content: `Claim prize now - ${cost} coins`,
                files: [randomImagePath],
            });

            recentImages.add(path.basename(randomImagePath));
            console.log(`Posted image to ${guild.name} -> #coin-collectors with cost: ${cost} coins.`);

            // Schedule deletion of the message after 1 minute
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`Deleted message in #coin-collectors for guild: ${guild.name}`);
                } catch (error) {
                    console.error(`Error deleting message in guild: ${guild.name}: ${error.message}`);
                }
            }, 60000); // 60 seconds
        }
    } catch (error) {
        console.error(`Error posting image: ${error.message}`);
    }
};

/**
 * Handles the addition of a reaction to an image post.
 * @param {Reaction} reaction - The reaction object.
 * @param {User} user - The user who added the reaction.
 * @param {Function} updatePoints - Function to update user points.
 */
const handleReactionAdd = async (reaction, user, updatePoints) => {
    if (user.bot || !reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const userId = user.id;
    const message = reaction.message;

    const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
    if (costMatch) {
        const cost = parseInt(costMatch[1], 10);

        if (processedMessages.has(`${message.id}-${userId}`)) {
            console.log(`Reaction already processed for user: ${user.tag}`);
            return;
        }

        processedMessages.add(`${message.id}-${userId}`);
        updatePoints(guildId, userId, -cost, `Claimed image prize for ${cost} coins`);
        console.log(`User ${user.tag} claimed an image prize in guild: ${reaction.message.guild.name}`);
    }
};

/**
 * Handles the removal of a reaction from an image post.
 * @param {Reaction} reaction - The reaction object.
 * @param {User} user - The user who removed the reaction.
 * @param {Function} updatePoints - Function to update user points.
 */
const handleReactionRemove = async (reaction, user, updatePoints) => {
    if (user.bot || !reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const userId = user.id;
    const message = reaction.message;

    const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
    if (costMatch) {
        const cost = parseInt(costMatch[1], 10);

        if (!processedMessages.has(`${message.id}-${userId}`)) {
            console.log(`Reaction removal not previously processed for user: ${user.tag}`);
            return;
        }

        processedMessages.delete(`${message.id}-${userId}`);
        updatePoints(guildId, userId, cost, `Refunded image prize for ${cost} coins`);
        console.log(`User ${user.tag} refunded image prize in guild: ${reaction.message.guild.name}`);
    }
};

module.exports = {
    postRandomImage,
    handleReactionAdd,
    handleReactionRemove,
    getRandomImage,
};