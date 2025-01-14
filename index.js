const { Client, GatewayIntentBits } = require('discord.js');
const { token, adminServer, files, timers, clearChannels } = require('./config/config.json');

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { logEvent } = require('./logs/logging');

const persistDataModule = require('./util/persistData');
const { initializeToySubmissionService } = require('./services/toyDownloadService');
const deployCommands = require('./commands/deployCommands');
const CommandHandler = require('./commands/commandHandler');

const coinManager = require('./managers/managerCoin');
const toyManager = require('./managers/managerToy');

const cleanupOnStartup = require('./util/cleanupOnStartup');
const scheduleUserReviewUpdates = require('./scheduleUserReviewUpdates');
const scheduleServerReviewUpdates = require('./scheduleServerReviewUpdates');

const { updatePoints, getUserBalance } = require('./managers/managerPoints');

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

const messageManager = {
    cleanChannel: async (channel) => {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            for (const message of messages.values()) {
                if (message.author.id === client.user.id) {
                    await message.delete();
                }
            }
            logEvent('SYSTEM', 'info', `Cleared messages from channel: "${channel.name}" in guild: "${channel.guild.name}".`);
        } catch (error) {
            logEvent('SYSTEM', 'error', `Error cleaning channel "${channel.name}" in guild "${channel.guild.name}": ${error.message}`);
        }
    },

    sendMessage: async (channel, content) => {
        try {
            const chunks = content.match(/[\s\S]{1,2000}/g) || [];
            let lastMessage;
            for (const chunk of chunks) {
                lastMessage = await channel.send(chunk);
            }
            logEvent('SYSTEM', 'info', `Message sent to channel: "${channel.name}" in guild: "${channel.guild.name}".`);
            return lastMessage;
        } catch (error) {
            logEvent('SYSTEM', 'error', `Error sending message to channel "${channel.name}" in guild "${channel.guild.name}": ${error.message}`);
        }
    },
};

client.once('ready', async () => {
    try {
        logEvent('SYSTEM', 'info', `Logged in as ${client.user.tag}.`);

        // Deploy slash commands
        await deployCommands();
        
        // Initialize command handler
        new CommandHandler(client, getUserBalanceFn);
        
        logEvent('SYSTEM', 'info', 'Initialized command system.');

        await cleanupOnStartup(client, channelsToClear, messageManager);
        logEvent('SYSTEM', 'info', 'Completed cleanup operations on startup.');

        persistData.load();
        await persistData.syncWithGuilds(client);
        logEvent('SYSTEM', 'info', 'Persistent data loaded and synced with guilds.');

        logEvent('SYSTEM', 'info', 'Scheduling periodic tasks...');
        initializeToySubmissionService(client);
        toyManager.scheduleToyPost(client, updatePointsFn, userPoints);
        coinManager.scheduleCoinPost(client, updatePointsFn, userPoints, timers);

        scheduleUserReviewUpdates(client, userPoints, adminServer);
        scheduleServerReviewUpdates(client, userPoints, adminServer);
        logEvent('SYSTEM', 'info', 'Periodic tasks scheduled successfully.');
    } catch (error) {
        logEvent('SYSTEM', 'error', `Error during client ready event: ${error.message}`);
    }
});

client.login(token);