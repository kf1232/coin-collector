const { MessageFlags, ChannelType } = require('discord.js');
const { timers, toyChannels } = require('../config/config.json');
const fs = require('fs');
const path = require('path');

const { logEvent } = require('../logs/logging')

const toyImagePath = path.join(__dirname, '../downloads');
const USER_COLLECTION_FILE = path.join(__dirname, '../data/userCollection.json');
const USER_POINTS_FILE = path.join(__dirname, '../data/userPoints.json');
const processedMessages = new Set();

const recentlyUsedToys = [];
const MAX_RECENT_TOYS = 50;

if (!fs.existsSync(toyImagePath)) {
    fs.mkdirSync(toyImagePath, { recursive: true });
    logEvent('TOYS', 'warn', `Created missing directory: ${toyImagePath}`);
} else {
    logEvent('TOYS', 'info', `Found directory: ${toyImagePath}`);
}


/**
 * Gets a random image from the specified directory that has not been used in the last 50 posts.
 * @param {string} toyImagePath - Path to the directory containing toy images.
 * @returns {string|null} - The path to a valid random image or null if no valid image is found.
 */
const getUniqueRandomImage = (toyImagePath) => {
    const allImages = fs.readdirSync(toyImagePath).filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file));
    const availableImages = allImages.filter((image) => !recentlyUsedToys.includes(image));

    if (availableImages.length === 0) {
        logEvent('TOYS', 'warn', 'No unique toys available for posting. Resetting recently used toys.');
        recentlyUsedToys.length = 0;

        if (allImages.length === 0) {
            logEvent('TOYS', 'error', 'No images found in directory for posting.');
            return null;
        }

        const randomFallback = path.join(toyImagePath, allImages[Math.floor(Math.random() * allImages.length)]);
        logEvent('TOYS', 'info', `Fallback image selected: ${path.basename(randomFallback)}`);
        return randomFallback;
    }

    const randomImage = availableImages[Math.floor(Math.random() * availableImages.length)];
    recentlyUsedToys.push(randomImage);

    if (recentlyUsedToys.length > MAX_RECENT_TOYS) {
        recentlyUsedToys.shift();
    }

    logEvent('TOYS', 'info', `Selected random image: ${randomImage}`);
    return path.join(toyImagePath, randomImage);
};


/**
 * Loads a JSON file and parses its contents.
 * Creates a new file with default data if it does not exist.
 * @param {string} filePath - Path to the JSON file.
 * @param {object} defaultData - Default data to use if the file does not exist.
 * @returns {object} - Parsed JSON data from the file.
 */
const loadJsonFile = async (filePath, defaultData = {}) => {
    try {
        if (!fs.existsSync(filePath)) {
            await fs.promises.writeFile(filePath, JSON.stringify(defaultData, null, 2));
            logEvent('SYSTEM', 'info', `Created new file: ${filePath}`);
        }

        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        logEvent('SYSTEM', 'info', `Successfully loaded file: ${filePath}`);
        return JSON.parse(fileContents);
    } catch (error) {
        logEvent('SYSTEM', 'error', `Error loading file (${filePath}): ${error.message}`);
        await fs.promises.writeFile(filePath, JSON.stringify(defaultData, null, 2));
        logEvent('SYSTEM', 'warn', `Recreated file with default data: ${filePath}`);
        return defaultData;
    }
};


/**
 * Saves JSON data to a file atomically.
 * @param {object} data - The data to save.
 * @param {string} filePath - The path to the file.
 */
const saveJsonFile = async (data, filePath) => {
    try {
        const tempPath = `${filePath}.tmp`;

        // Write data to a temporary file
        await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
        logEvent('SYSTEM', 'info', `Temporary file created: ${tempPath}`);

        // Rename the temporary file to the target file
        await fs.promises.rename(tempPath, filePath);
        logEvent('SYSTEM', 'info', `File successfully updated: ${filePath}`);
    } catch (error) {
        logEvent('SYSTEM', 'error', `Failed to save file (${filePath}): ${error.message}`);
    }
};


/**
 * Posts a toy message with a random image in the "toy-collectors" channel of a guild.
 * @param {Guild} guild - The guild to post the message in.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const postToyMessage = async (guild, updatePoints, userPoints) => {
    try {
        const toyCollectorChannel = guild.channels.cache.find(
            (channel) => channel.type === ChannelType.GuildText && toyChannels.includes(channel.name)
        );

        if (!toyCollectorChannel) {
            logEvent('TOYS', 'warn', `No allowed channels in guild "${guild.name}".`);
            return;
        }

        const randomImagePath = getUniqueRandomImage(toyImagePath);

        if (!randomImagePath) {
            logEvent('TOYS', 'error', 'No image available for posting.');
            return;
        }

        const cost = Math.floor(Math.random() * 6) + 5;

        const message = await toyCollectorChannel.send({
            content: `Claim prize now - ${cost} coins`,
            flags: MessageFlags.SuppressNotifications,
            files: [randomImagePath],
        });

        logEvent(
            'TOYS',
            'info',
            `Message posted in "${guild.name}" with image: ${path.basename(randomImagePath)}`
        );

        await message.react('🪙');
        processedMessages.add(path.basename(randomImagePath));

        const collector = setupReactionCollector(message, guild, updatePoints, userPoints);
        collector.on('end', async () => {
            logEvent('TOYS', 'info', `Reaction collector ended in "${guild.name}".`);
            try {
                await message.delete();
                logEvent('TOYS', 'info', `Message deleted in guild "${guild.name}".`);
            } catch (error) {
                logEvent('TOYS', 'error', `Failed to delete message in guild "${guild.name}": ${error.message}`);
            }
        });
    } catch (error) {
        logEvent('TOYS', 'error', `Error in postToyMessage: ${error.message}`);
    }
};



/**
 * Sets up a reaction collector for a toy message to handle user interactions, such as claiming toys by spending coins.
 * @param {Message} message - The Discord message object.
 * @param {Guild} guild - The guild where the message is posted.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 * @returns {ReactionCollector} - The created reaction collector.
 */
const setupReactionCollector = (message, guild, updatePoints, userPoints) => {
    const debounceReaction = new Set(); // Shared debounce for collector level
    const debounceInterval = timers.debounceInterval;

    const collector = message.createReactionCollector({
        time: timers.ONE_MINUTE * 60 * 24,
        filter: (reaction, user) =>
            reaction.emoji.name === '🪙' &&
            !user.bot &&
            !debounceReaction.has(`${reaction.message.id}-${user.id}`),
    });

    collector.on('collect', async (reaction, user) => {
        try {
            const userMessageKey = `${reaction.message.id}-${user.id}`;

            debounceReaction.add(userMessageKey);
            setTimeout(() => debounceReaction.delete(userMessageKey), debounceInterval);

            const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
            if (!costMatch) {
                logEvent('TOYS', 'error', `Invalid message content for reaction by user "${user.username}".`);
                return;
            }

            const cost = parseInt(costMatch[1], 10);
            const userPointsMap = userPoints.get(guild.id) || new Map();
            const currentPoints = userPointsMap.get(user.id) || 0;

            if (currentPoints < cost) {
                logEvent('TOYS', 'warn', `User "${user.username}" attempted to claim without enough points. Current: ${currentPoints}, Required: ${cost}.`);
                return;
            }

            userPointsMap.set(user.id, currentPoints - cost);
            userPoints.set(guild.id, userPointsMap);
            await saveJsonFile(
                Object.fromEntries([...userPoints.entries()].map(([k, v]) => [k, Object.fromEntries(v)])),
                USER_POINTS_FILE
            );

            const userCollection = await loadJsonFile(USER_COLLECTION_FILE);
            const guildCollection = userCollection[guild.id] || {};
            const userCollectionList = guildCollection[user.id] || [];
            const fileName = message.attachments.first()?.name;

            if (fileName) {
                userCollectionList.push(fileName);
                guildCollection[user.id] = userCollectionList;
                userCollection[guild.id] = guildCollection;
                await saveJsonFile(userCollection, USER_COLLECTION_FILE);
            }

            const updatedPoints = userPointsMap.get(user.id);
            await message.edit(`${user.username} claimed the toy. Balance: ${updatedPoints} points.`);
            logEvent('TOYS', 'info', `User "${user.username}" claimed "${fileName}" for ${cost} coins in guild "${guild.name}". New balance: ${updatedPoints}.`);
        } catch (error) {
            logEvent('TOYS', 'error', `Error during reaction collection for user "${user.username}": ${error.message}`);
        }
    });

    collector.on('end', () => {
        logEvent('TOYS', 'info', `Reaction collector ended for message "${message.id}" in guild "${guild.name}".`);
    });

    return collector;
};


/**
 * Schedules toy posts for all guilds at random intervals within the configured range.
 * @param {Client} client - The Discord client instance.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const scheduleToyPost = (client, updatePoints, userPoints) => {
    const minDelay = timers.toyPostIntervalMin * timers.ONE_MINUTE;
    const maxDelay = timers.toyPostIntervalMax * timers.ONE_MINUTE;

    // Iterate through all guilds
    client.guilds.cache.forEach((guild) => {
        const scheduleNextPost = () => {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            setTimeout(async () => {
                try {
                    const randomImagePath = getUniqueRandomImage(toyImagePath);

                    if (!randomImagePath) {
                        logEvent('TOYS', 'error', `No toys available to post in guild "${guild.name}".`);
                        return;
                    }

                    await postToyMessage(guild, updatePoints, userPoints);
                    logEvent('TOYS', 'info', `Toy posted successfully in guild "${guild.name}". Next post scheduled.`);

                    scheduleNextPost();
                } catch (error) {
                    logEvent('TOYS', 'error', `Failed to post toy message in guild "${guild.name}": ${error.message}`);

                    scheduleNextPost();
                }
            }, delay);
        };

        scheduleNextPost();
    });
};


module.exports = {
    scheduleToyPost,
};
