const { ChannelType } = require('discord.js');
const { Client, GatewayIntentBits } = require('discord.js');
const { token, adminServer, files, timers, clearChannels } = require('./config.json');

const path = require('path');
const fs = require('fs');

const persistDataModule = require('./persistData');
const { registerCollectionCommands } = require('./collectionService');

const { postRandomImage, 
        handleReactionAdd: handleImageReactionAdd, 
        handleReactionRemove: handleImageReactionRemove
    } = require('./managerImage');

const { addImage } = require('./managerCollection'); 
    
const coinManager = require('./managerCoin');


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
                    console.log('Processing message details:');
                    console.log(`Guild: ${guild.name}`);
                    console.log(`Channel: #${toySubmissionChannel.name}`);
                    console.log(`Message Content: ${message.content}`);
                    console.log(`Message Author: ${message.author.tag}`);

                    // Process image attachments
                    for (const attachment of message.attachments.values()) {
                        if (attachment.contentType?.startsWith('image/')) {
                            const url = attachment.url;
                            const directory = path.join(__dirname, 'downloads');

                            if (!fs.existsSync(directory)) {
                                fs.mkdirSync(directory);
                            }

                            await addImage('Uploaded Image', url, directory);
                            await message.react('✅'); // React to indicate success
                        } else {
                            console.log(`Attachment "${attachment.name}" is not a valid image.`);
                            await message.react('⚠️'); // React with a warning
                        }
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
    schedulePosts();
    coinManager.scheduleCoinPost(client, updatePointsFn, userPoints, timers);
    coinManager.cleanupProcessedMessages()

    scheduleUserReviewUpdates(client, userPoints, adminServer);
    scheduleServerReviewUpdates(client, userPoints, adminServer);    
});

client.login(token);