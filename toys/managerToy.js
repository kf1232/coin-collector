const { MessageFlags, ChannelType } = require('discord.js');
const { timers, toyChannels, status } = require('../config.json');
const fs = require('fs');
const path = require('path');

const { logEvent } = require('../logs/logging')

const toyLogPath = 'TOYS';
const toyImagePath = path.join(__dirname, '../downloads');
const USER_COLLECTION_FILE = path.join(__dirname, '../userCollection.json');
const USER_POINTS_FILE = path.join(__dirname, '../userPoints.json');
const processedMessages = new Set();

const recentlyUsedToys = [];
const MAX_RECENT_TOYS = 50;

if (!fs.existsSync(toyImagePath)) {
    fs.mkdirSync(toyImagePath, { recursive: true });
    logEvent(toyLogPath, status.ERROR, `Created missing directory: ${toyImagePath}`);
    console.log();
} else {
    logEvent(toyLogPath, status.POST, `Found directory: ${toyImagePath}`);
}

/**
 * Gets a random image that has not been used in the last 50 posts.
 * @param {string} toyImagePath - Path to the directory containing toy images.
 * @returns {string|null} - The path to a valid random image or null if no valid image is found.
 */
const getUniqueRandomImage = (toyImagePath) => {
    const allImages = fs.readdirSync(toyImagePath).filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file));

    const availableImages = allImages.filter((image) => !recentlyUsedToys.includes(image));
    if (availableImages.length === 0) {
        logEvent(toyLogPath, status.WARNING, 'No unique toys available for posting. Resetting recently used toys.');
        recentlyUsedToys.length = 0;
        if (allImages.length === 0) {
            logEvent(toyLogPath, status.ERROR, 'No images found in directory for posting.');
            return null;
        }
        return path.join(toyImagePath, allImages[Math.floor(Math.random() * allImages.length)]);
    }

    const randomImage = availableImages[Math.floor(Math.random() * availableImages.length)];
    recentlyUsedToys.push(randomImage);

    // Ensure the queue does not exceed the maximum size
    if (recentlyUsedToys.length > MAX_RECENT_TOYS) {
        recentlyUsedToys.shift();
    }

    return path.join(toyImagePath, randomImage);
};


/**
 * Loads a JSON file and parses its contents.
 * Creates a new file with default data if it does not exist.
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
 * Posts a toy message in the "toy-collectors" channel.
 * @param {Guild} guild - The guild to post the message in.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 */
const postToyMessage = async (guild, updatePoints, userPoints) => {
    try {
        // Find the appropriate channel
        const toyCollectorChannel = guild.channels.cache.find(
            (channel) => channel.type === ChannelType.GuildText && toyChannels.includes(channel.name)
        );
        if (!toyCollectorChannel) {
            logEvent(toyLogPath, status.WARNING, `No allowed channels in guild "${guild.name}"`);
            return;
        }

        // Get a unique random image
        const randomImagePath = getUniqueRandomImage(toyImagePath);

        if (!randomImagePath) {
            logEvent(toyLogPath, status.ERROR, 'No image available for posting.');
            return;
        }

        // Generate a random cost
        const cost = Math.floor(Math.random() * 6) + 5;

        // Post the toy message with the image and cost
        const message = await toyCollectorChannel.send({
            content: `Claim prize now - ${cost} coins`,
            flags: MessageFlags.SuppressNotifications,
            files: [randomImagePath], // Properly include the random image
        });

        // Add reaction for claiming
        await message.react('🪙');

        // Track the posted image
        processedMessages.add(path.basename(randomImagePath));
        logEvent(toyLogPath, status.POST, `Message posted in "${guild.name}" with image: ${path.basename(randomImagePath)}`);

        // Set up the reaction collector
        const collector = setupReactionCollector(message, guild, updatePoints, userPoints);
        collector.on('end', async () => {
            logEvent(toyLogPath, status.END, `Reaction collector ended in "${guild.name}"`);
            try {
                await message.delete();
                logEvent(toyLogPath, status.DELETE, `Message deleted in guild "${guild.name}"`);
            } catch (error) {
                logEvent(toyLogPath, status.ERROR, `Failed to delete message in "${guild.name}": ${error.message}`);
            }
        });
    } catch (error) {
        logEvent(toyLogPath, status.ERROR, `Error in postToyMessage: ${error.message}`);
    }
};


/**
 * Sets up a reaction collector for the toy message.
 * @param {Message} message - The Discord message object.
 * @param {Guild} guild - The guild where the message is posted.
 * @param {Function} updatePoints - Function to update user points.
 * @param {Map} userPoints - Map of user points for each guild.
 * @returns {ReactionCollector} The created reaction collector.
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

            debounceReaction.add(userMessageKey); // Add to debounce
            setTimeout(() => debounceReaction.delete(userMessageKey), debounceInterval); // Remove after interval

            const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
            if (!costMatch) {
                logEvent(toyLogPath, status.ERROR, `Invalid message content for reaction by user "${user.username}"`);
                return;
            }

            const cost = parseInt(costMatch[1], 10);
            const userPointsMap = userPoints.get(guild.id) || new Map();
            const currentPoints = userPointsMap.get(user.id) || 0;

            if (currentPoints < cost) {
                //await message.channel.send(`${user.username} lacks enough coins to spend ${cost} (${currentPoints}).`);
                logEvent(toyLogPath, status.WARNING, `User "${user.username}" attempted to claim without enough points.`);
                return;
            }

            // Deduct points and update
            userPointsMap.set(user.id, currentPoints - cost);
            userPoints.set(guild.id, userPointsMap);
            await saveJsonFile(Object.fromEntries([...userPoints.entries()].map(([k, v]) => [k, Object.fromEntries(v)])), USER_POINTS_FILE);

            // Update user collection
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
            logEvent(toyLogPath, status.SAVE, `User "${user.username}" claimed "${fileName}" for ${cost} coins in guild "${guild.name}".`);
        } catch (error) {
            logEvent(toyLogPath, status.ERROR, `Error during reaction collection: ${error.message}`);
        }
    });

    collector.on('end', () => {
        logEvent(toyLogPath, status.END, `Reaction collector ended for message "${message.id}" in guild "${guild.name}".`);
    });

    return collector;
};


const scheduleToyPost = (client, updatePoints, userPoints) => {
    const minDelay = timers.toyPostIntervalMin * timers.ONE_MINUTE;
    const maxDelay = timers.toyPostIntervalMax * timers.ONE_MINUTE;

    client.guilds.cache.forEach((guild) => {
        const scheduleNextPost = () => {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            setTimeout(async () => {
                try {
                    const randomImagePath = getUniqueRandomImage(toyImagePath);

                    if (!randomImagePath) {
                        logEvent(toyLogPath, status.ERROR, `No toys available to post in guild "${guild.name}"`);
                        return;
                    }

                    await postToyMessage(guild, updatePoints, userPoints);
                    logEvent(toyLogPath, status.SCHEDULE, `Toy posted successfully in "${guild.name}"`);
                    scheduleNextPost(); // Schedule the next post
                } catch (error) {
                    logEvent(toyLogPath, status.ERROR, `Failed to post toy message for guild "${guild.name}": ${error.message}`);
                    scheduleNextPost(); // Schedule the next post even if an error occurs
                }
            }, delay);
        };

        scheduleNextPost();
    });
};

module.exports = {
    scheduleToyPost,
};
