const { ChannelType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { getRandomImage } = require('./managerCollection');

const processedMessages = new Set();
const USER_COLLECTION_FILE = path.join(__dirname, 'userCollection.json');

/**
 * Loads the user collection data from a file.
 * If the file does not exist, it initializes a new one.
 * @param {string} [filePath=USER_COLLECTION_FILE] - Path to the user collection file.
 * @returns {Promise<Object>} Resolves with the user collection data.
 */
const loadUserCollection = async (filePath = USER_COLLECTION_FILE) => {
    try {
        if (!fs.existsSync(filePath)) {
            await fs.promises.writeFile(filePath, JSON.stringify({}, null, 2));
            console.log('Created new user collection file:', filePath);
        }
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(fileContents);
    } catch (error) {
        console.error('Error loading user collection file:', error);
        throw error; // Re-throw the error to let the caller handle it appropriately.
    }
};

/**
 * Saves the user collection data to a file.
 * @param {Object} userCollection - The user collection data to save.
 * @param {string} filePath - The path to the file where the data will be saved.
 */
const saveUserCollection = (userCollection, filePath) => {
    try {
        if (typeof userCollection !== 'object' || userCollection === null) {
            throw new Error('Invalid user collection data. Expected a non-null object.');
        }

        fs.writeFileSync(filePath, JSON.stringify(userCollection, null, 2));
        console.log(`User collection file updated: ${filePath}`);
    } catch (error) {
        console.error(`Failed to save user collection: ${error.message}`);
        // Optionally rethrow or handle the error further
    }
};


/**
 * Posts a random image to the "coin-collectors" channel in all guilds.
 * Automatically deletes the post after a specified delay and pre-populates with a coin reaction.
 * @param {Client} client - The Discord client.
 * @param {Set<string>} recentImages - A Set of recently posted image filenames.
 * @param {number} messageDeleteCycle - Time in minutes before the message is deleted.
 */
const postRandomImage = async (client, recentImages, messageDeleteCycle = 5) => {
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

            const cost = Math.floor(Math.random() * 6) + 5; // Random cost between 5-10 coins

            const message = await coinCollectorsChannel.send({
                content: `Claim prize now - ${cost} coins`,
                files: [randomImagePath],
            });

            // Add :coin: reaction to the message
            await message.react('🪙');

            recentImages.add(path.basename(randomImagePath));
            console.log(`Posted image to ${guild.name} -> #coin-collectors with cost: ${cost} coins.`);

            // Schedule deletion of the message after the specified delay
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`Deleted message in #coin-collectors for guild: ${guild.name}`);
                } catch (error) {
                    console.error(`Error deleting message in guild: ${guild.name}: ${error.message}`);
                }
            }, messageDeleteCycle * 60000);
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
 * @param {Function} getUserBalance - Function to get user balance.
 */
const handleReactionAdd = async (reaction, user, updatePoints, getUserBalance) => {
    if (user.bot || !reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const userId = user.id;
    const name = user.displayName;
    const message = reaction.message;

    const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
    if (costMatch) {
        const cost = parseInt(costMatch[1], 10);
        const fileName = message.attachments.first()?.name;

        // Check if the reaction has already been processed
        if (processedMessages.has(`${message.id}-${userId}`)) {
            console.log(`Reaction already processed for user: ${name}`);
            return;
        }

        const currentBalance = getUserBalance(guildId, userId);

        // Check if the user can afford the prize
        if (currentBalance < cost) {
            // Avoid duplicate messages by marking the reaction as processed even if insufficient
            processedMessages.add(`${message.id}-${userId}_failed`);
            
            // Notify the user if they cannot afford the toy
            await message.channel.send(`${name} tried to buy a toy but was too poor and only has ${currentBalance} coins.`);
            console.log(`User ${name} attempted to claim an image prize but lacked sufficient coins.`);
            return;
        }

        // Mark the reaction as successfully processed
        processedMessages.add(`${message.id}-${userId}`);
        updatePoints(guildId, userId, -cost, `Claimed image prize for ${cost} coins`);

        const userCollection = loadUserCollection();
        if (!userCollection[guildId]) userCollection[guildId] = {};
        if (!userCollection[guildId][userId]) userCollection[guildId][userId] = [];

        // Add the image to the user's collection
        if (fileName) {
            userCollection[guildId][userId].push(fileName);
            saveUserCollection(userCollection);
            console.log(`Added image "${fileName}" to ${name}'s collection.`);
        }

        // Update message to show toy claimed
        await message.edit(`Toy claimed by ${name}, They now have ${currentBalance - cost} coins.`);
        console.log(`User ${name} claimed an image prize in guild: ${reaction.message.guild.name}`);
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
    const name = user.displayName;
    const message = reaction.message;

    const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
    if (costMatch) {
        const cost = parseInt(costMatch[1], 10);
        const fileName = message.attachments.first()?.name;

        // Check if the reaction was previously processed
        if (!processedMessages.has(`${message.id}-${userId}`)) {
            console.log(`Reaction removal not previously processed for user: ${name}`);
            return; // Exit if the reaction was not validly processed
        }

        const userCollection = loadUserCollection();
        if (userCollection[guildId]?.[userId]) {
            const userImages = userCollection[guildId][userId];
            const imageIndex = userImages.indexOf(fileName);

            if (imageIndex !== -1) {
                userImages.splice(imageIndex, 1); // Remove the image
                saveUserCollection(userCollection);

                updatePoints(guildId, userId, cost, `Refunded image prize for ${cost} coins`);
                console.log(`Removed image "${fileName}" from ${name}'s collection and refunded coins.`);
            } else {
                console.log(`Image "${fileName}" not found in ${name}'s collection.`);
            }
        }

        // Remove the message ID from processed messages
        processedMessages.delete(`${message.id}-${userId}`);
    }
};



module.exports = {
    postRandomImage,
    handleReactionAdd,
    handleReactionRemove,
    getRandomImage,
};