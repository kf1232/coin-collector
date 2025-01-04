const { ChannelType } = require('discord.js');
const { Client, GatewayIntentBits } = require('discord.js');
const { token, adminServer, files, timers, clearChannels } = require('./config.json');

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const persistDataModule = require('./persistData');
const { registerCollectionCommands } = require('./collectionService');

const { postRandomImage,
    handleReactionAdd: handleImageReactionAdd,
    handleReactionRemove: handleImageReactionRemove
} = require('./managerImage');

const { addImage } = require('./managerCollection');

const coinManager = require('./coins/managerCoin');
const toyManager = require('./toys/managerToy');

const cleanupOnStartup = require('./cleanupOnStartup');
const scheduleUserReviewUpdates = require('./scheduleUserReviewUpdates');
const scheduleServerReviewUpdates = require('./scheduleServerReviewUpdates');

const { updatePoints, getUserBalance } = require('./managerPoints');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

const recentImages = new Set();
const channelsToClear = clearChannels;

const userPointsFile = files.userPoints;
const userPoints = new Map();

const persistData = persistDataModule(userPoints, userPointsFile);

const updatePointsFn = updatePoints(userPoints, persistData);
const getUserBalanceFn = getUserBalance(userPoints);

const scheduleToyReview = () => {
    setInterval(async () => {
        console.log("Running toy submission review...");
        await readLatestToySubmission();
    }, timers.ONE_MINUTE); // 60 seconds
};

const downloadLogPath = path.join(__dirname, 'downloadLog.txt');

/**
 * Logs events to the points log file with a timestamp.
 *
 * @param {string} status - The status of the log (e.g., ERROR, POST, SAVE, ...).
 * @param {string} message - A short descriptive message of the activity.
 */
const logEvent = (status, message) => {
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const logEntry = `${timestamp} | ${status.toUpperCase()} | ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(downloadLogPath, logEntry);
};

const readLatestToySubmission = async () => {
    try {
        const guilds = client.guilds.cache.values();

        for (const guild of guilds) {
            const toySubmissionChannel = guild.channels.cache.find(
                (channel) =>
                    channel.type === ChannelType.GuildText &&
                    channel.name === 'toy-submission'
            );

            if (toySubmissionChannel) {
                const messages = await toySubmissionChannel.messages.fetch({ limit: 100 });

                for (const message of messages.values()) {
                    const reactions = message.reactions.cache;

                    if (reactions.size > 0) {
                        const reactionSummary = reactions.map(
                            (reaction) => `${reaction.emoji.name} (${reaction.count})`
                        ).join(', ');

                        // Check if the bot has reacted with ✅
                        if (reactions.has('✅')) {
                            await message.delete();
                            console.log(
                                `Deleted message in "${guild.name}" - Reactions seen: ✅ (green check mark).`
                            );
                            continue; // Move to the next message
                        }

                        // Log other reactions and skip processing
                        console.log(
                            `Skipping message in "${guild.name}" - Reactions seen: ${reactionSummary}`
                        );
                        continue; // Skip the message
                    }

                    console.log('Processing message details:');
                    console.log(`Guild: ${guild.name}`);
                    console.log(`Channel: #${toySubmissionChannel.name}`);
                    console.log(`Message Content: ${message.content}`);
                    console.log(`Message Author: ${message.author.tag}`);

                    // Process image attachments
                    let success = false;
                    for (const attachment of message.attachments.values()) {
                        if (attachment.contentType?.startsWith('image/')) {
                            const url = attachment.url;
                            await processImage(url, 'Uploaded Attachment');
                            success = true;
                        } else {
                            console.log(`Attachment "${attachment.name}" is not a valid image.`);
                        }
                    }

                    // Process image URLs in the message content
                    const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))/gi;
                    const matches = [...message.content.matchAll(urlRegex)];

                    for (const match of matches) {
                        const url = match[1];
                        await processImage(url, 'Uploaded URL');
                        success = true;
                    }

                    // React based on processing outcome
                    if (success) {
                        await message.react('✅'); // Indicate success
                    } else {
                        await message.react('⚠️'); // Indicate failure
                    }
                }
            } else {
                console.log(`No "toy-submission" channel found in guild: ${guild.name}`);
            }
        }
    } catch (error) {
        console.error(`Error reading "toy-submission" channels: ${error.message}`);
    }
};

/**
 * Downloads and saves an image from a given URL.
 * @param {string} url - The URL of the image.
 * @param {string} label - Label for logging purposes (e.g., "Uploaded Attachment" or "Uploaded URL").
 */
const processImage = async (url, label) => {
    try {
        const directory = path.join(__dirname, 'downloads');
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }

        const fileName = path.basename(new URL(url).pathname);
        const filePath = path.join(directory, fileName);

        const response = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        logEvent('SAVE', `${label}: Saved image to "${filePath}".`);
    } catch (error) {
        logEvent('ERROR', `${label}: Failed to download image from "${url}": ${error.message}`);
    }
};




const messageManager = {
    cleanChannel: async (channel) => {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            for (const message of messages.values()) {
                if (message.author.id === client.user.id) {
                    await message.delete().catch(console.error);
                }
            }
            console.log(`Cleared messages from channel: ${channel.name}`);
        } catch (error) {
            console.error(`Error cleaning channel ${channel.name}: ${error.message}`);
        }
    },
    sendMessage: async (channel, content) => {
        try {
            const chunks = content.match(/[\s\S]{1,2000}/g) || [];
            let lastMessage;
            for (const chunk of chunks) {
                lastMessage = await channel.send(chunk);
            }
            return lastMessage;
        } catch (error) {
            console.error(`Error sending message to ${channel.name}: ${error.message}`);
        }
    },
};

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (user.bot || !reaction.message.guild) return;

        const message = reaction.message;

        // Handle image prize reactions
        if (message.content.match(/Claim prize now - (\d+) coins/)) {
            await handleImageReactionAdd(reaction, user, updatePointsFn, getUserBalanceFn);
        }
    } catch (error) {
        console.error(`Error handling reaction remove: ${error.message}`);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot || !reaction.message.guild) return;

        const message = reaction.message;

        if (message.content.includes('Coin Available')) {
            await coinManager.handleReactionAdd(reaction, user, updatePointsFn);
            return;
        }

        if (message.content.match(/Claim prize now - (\d+) coins/)) {
            await handleImageReactionAdd(reaction, user, updatePointsFn, getUserBalanceFn);
        }
    } catch (error) {
        console.error(`Error handling reaction add: ${error.message}`);
    }
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    registerCollectionCommands(client, getUserBalanceFn);

    await cleanupOnStartup(client, channelsToClear, messageManager);

    persistData.load();
    await persistData.syncWithGuilds(client);

    console.log('Scheduling periodic tasks...');
    scheduleToyReview();
    //schedulePosts();
    toyManager.scheduleToyPost(client, updatePointsFn, userPoints)
    coinManager.scheduleCoinPost(client, updatePointsFn, userPoints, timers);

    scheduleUserReviewUpdates(client, userPoints, adminServer);
    scheduleServerReviewUpdates(client, userPoints, adminServer);
});

client.login(token);

/*

const schedulePosts = () => {
    const minDelay = timers.toyPostIntervalMin * timers.ONE_MINUTE;
    const maxDelay = timers.toyPostIntervalMax * timers.ONE_MINUTE;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    setTimeout(async () => {
        try {
            await postRandomImage(client, recentImages, timers.messageDeleteCycle);
        } catch (error) {
            console.error('Error posting image:', error);
        }
        schedulePosts();
    }, delay);
};

*/