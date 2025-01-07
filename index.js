const { ChannelType } = require('discord.js');
const { Client, GatewayIntentBits } = require('discord.js');
const { token, adminServer, files, timers, clearChannels, status } = require('./config.json');

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { logEvent } = require('./logs/logging')

const persistDataModule = require('./persistData');
const { registerCollectionCommands } = require('./collectionService');

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

const channelsToClear = clearChannels;

const userPointsFile = files.userPoints;
const userPoints = new Map();

const persistData = persistDataModule(userPoints, userPointsFile);

const updatePointsFn = updatePoints(userPoints, persistData);
const getUserBalanceFn = getUserBalance(userPoints);

const scheduleToyReview = () => {
    setInterval(async () => {
        logEvent('DOWNLOAD', status.SCHEDULE, 'Running check for new toys...')
        await readLatestToySubmission();
    }, timers.ONE_MINUTE); // 60 seconds
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
                        const reactionSummary = reactions.map((reaction) => `${reaction.emoji.name} (${reaction.count})`).join(', ');

                        if (reactions.has('✅')) {
                            await message.delete();
                            logEvent('DOWNLOAD', status.DELETE, `Deleted message in "${guild.name}" - Reactions seen: ✅ (green check mark).`)
                            continue;
                        }

                        logEvent('DOWNLOAD', status.WARNING, `Skipping message in "${guild.name}" - Reactions seen: ${reactionSummary}`)
                        continue;
                    }

                    // Process image attachments
                    let success = false;
                    for (const attachment of message.attachments.values()) {
                        if (attachment.contentType?.startsWith('image/')) {
                            const url = attachment.url;
                            await processImage(url, 'Uploaded Attachment');
                            success = true;
                        } else {
                            logEvent('DOWNLOAD', status.WARNING, `Attachment "${attachment.name}" is not a valid image.`)
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
                logEvent('DOWNLOAD', status.WARNING, `No "toy-submission" channel found in guild: ${guild.name}`)
            }
        }
    } catch (error) {
        logEvent('DOWNLOAD', status.ERROR, `Error reading "toy-submission" channels: ${error.message}`)
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

        logEvent('DOWNLOAD', status.SAVE, `${label}: Saved image to "${filePath}".`);
    } catch (error) {
        logEvent('DOWNLOAD', status.ERROR, `${label}: Failed to download image from "${url}": ${error.message}`);
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

client.once('ready', async () => {
    logEvent('SYSTEM', status.STARTUP, `Logged in as ${client.user.tag}`)

    registerCollectionCommands(client, getUserBalanceFn);

    await cleanupOnStartup(client, channelsToClear, messageManager);

    persistData.load();
    await persistData.syncWithGuilds(client);

    logEvent('SYSTEM', status.STARTUP, 'Scheduling periodic tasks...')
    scheduleToyReview();

    toyManager.scheduleToyPost(client, updatePointsFn, userPoints)
    coinManager.scheduleCoinPost(client, updatePointsFn, userPoints, timers);

    scheduleUserReviewUpdates(client, userPoints, adminServer);
    scheduleServerReviewUpdates(client, userPoints, adminServer);
});

client.login(token);