const { ChannelType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { getRandomImage } = require('./managerCollection');

const processedMessages = new Set();
const USER_COLLECTION_FILE = path.join(__dirname, 'userCollection.json');
const USER_POINTS_FILE = path.join(__dirname, 'userPoints.json');

/**
 * Loads a JSON file and parses its contents.
 * Creates a new file with default data if it does not exist.
 * @param {string} filePath - Path to the JSON file.
 * @param {Object} defaultData - Default data to initialize the file with if it doesn't exist.
 * @returns {Promise<Object>} Resolves with the parsed JSON data.
 */
const loadJsonFile = async (filePath, defaultData = {}) => {
    try {
        if (!fs.existsSync(filePath)) {
            await fs.promises.writeFile(filePath, JSON.stringify(defaultData, null, 2));
            console.log(`Created new file: ${filePath}`);
        }
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(fileContents);
    } catch (error) {
        console.error(`Error loading file (${filePath}):`, error);
        await fs.promises.writeFile(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
};

/**
 * Saves JSON data to a file atomically.
 * @param {Object} data - The JSON data to save.
 * @param {string} filePath - The path to the file.
 */
const saveJsonFile = async (data, filePath) => {
    try {
        const tempPath = `${filePath}.tmp`;
        await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
        await fs.promises.rename(tempPath, filePath);
        console.log(`File updated: ${filePath}`);
    } catch (error) {
        console.error(`Failed to save file (${filePath}):`, error.message);
    }
};

/**
 * Merges data from userPoints.json into userCollection.json without overwriting existing data.
 */
const mergeUserPointsIntoCollection = async () => {
    try {
        const userCollection = await loadJsonFile(USER_COLLECTION_FILE);
        const userPoints = await loadJsonFile(USER_POINTS_FILE);

        // Merge user points into the collection
        for (const [guildId, users] of Object.entries(userPoints)) {
            if (!userCollection[guildId]) {
                userCollection[guildId] = {};
            }
            for (const [userId] of Object.entries(users)) {
                if (!userCollection[guildId][userId]) {
                    userCollection[guildId][userId] = []; // Initialize an empty collection
                }
            }
        }

        // Save the updated collection
        await saveJsonFile(userCollection, USER_COLLECTION_FILE);
        console.log('Merged userPoints.json into userCollection.json successfully.');
    } catch (error) {
        console.error('Error merging userPoints into collection:', error.message);
    }
};

/**
 * Initialize the module by syncing data from userPoints.json.
 */
const initializeCollection = async () => {
    await mergeUserPointsIntoCollection();
};

initializeCollection();

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
        // Ensure recovery for corrupted files
        await fs.promises.writeFile(filePath, JSON.stringify({}, null, 2));
        return {};
    }
};


/**
 * Saves the user collection data to a file.
 * @param {Object} userCollection - The user collection data to save.
 * @param {string} filePath - The path to the file where the data will be saved.
 */
const saveUserCollection = async (userCollection, filePath = USER_COLLECTION_FILE) => {
    try {
        const tempPath = `${filePath}.tmp`;
        await fs.promises.writeFile(tempPath, JSON.stringify(userCollection, null, 2));
        await fs.promises.rename(tempPath, filePath);
        console.log(`User collection file updated: ${filePath}`);
    } catch (error) {
        console.error('Failed to save user collection:', error.message);
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
            const allowedChannelNames = ["coin-collectors", "treasure-island"];

            const coinCollectorsChannel = guild.channels.cache.find(
                (channel) =>
                    channel.type === ChannelType.GuildText && allowedChannelNames.includes(channel.name)
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
            //setTimeout(async () => {
            //    try {
            //        await message.delete();
            //        console.log(`Deleted message in #coin-collectors for guild: ${guild.name}`);
            //    } catch (error) {
            //        console.error(`Error deleting message in guild: ${guild.name}: ${error.message}`);
            //    }
            //}, 60 * 60000);
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

        if (processedMessages.has(`${message.id}-${userId}`)) return;

        const currentBalance = getUserBalance(guildId, userId);
        if (currentBalance < cost) {
            await message.channel.send(`${name} lacks sufficient coins (${currentBalance}).`);
            return;
        }

        processedMessages.add(`${message.id}-${userId}`);
        updatePoints(guildId, userId, -cost, `Claimed image prize for ${cost} coins`);

        const userCollection = await loadUserCollection(); // Await here
        userCollection[guildId] = userCollection[guildId] || {};
        userCollection[guildId][userId] = userCollection[guildId][userId] || [];
        if (fileName) {
            userCollection[guildId][userId].push(fileName);
            await saveUserCollection(userCollection); // Await save
        }

        await message.edit(`Toy claimed by ${name}. Balance: ${currentBalance - cost}`);
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
        const fileName = message.attachments.first()?.name;

        if (!processedMessages.has(`${message.id}-${userId}`)) {
            console.log(`Reaction removal not previously processed.`);
            return;
        }

        const userCollection = await loadJsonFile(USER_COLLECTION_FILE);
        if (userCollection[guildId]?.[userId]) {
            const userImages = userCollection[guildId][userId];
            const imageIndex = userImages.indexOf(fileName);

            if (imageIndex !== -1) {
                userImages.splice(imageIndex, 1);
                await saveJsonFile(userCollection, USER_COLLECTION_FILE);

                updatePoints(guildId, userId, +costMatch[1], `Refunded image prize for ${costMatch[1]} coins`);
                console.log(`Removed image "${fileName}" and refunded coins.`);
            }
        }
        processedMessages.delete(`${message.id}-${userId}`);
    }
};


module.exports = {
    postRandomImage,
    handleReactionAdd,
    handleReactionRemove,
    mergeUserPointsIntoCollection,
};