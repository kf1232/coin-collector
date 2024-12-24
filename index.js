const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const path = require('path');
const fs = require('fs');

const { token, adminServer, files, timers } = require('./config.json');

const persistDataModule = require('./persistData'); // Import the module
const imageManager = require('./imageManager');

const scheduleUserReviewUpdates = require('./scheduleUserReviewUpdates');
const scheduleServerReviewUpdates = require('./scheduleServerReviewUpdates');

const updatePointsFactory = require('./pointsManager'); // Import the points manager

// Set to track processed message IDs
const processedMessages = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// List to keep track of recently posted images
const recentImages = [];

const userPointsFile = files.userPoints;
const userPoints = new Map();

const persistData = persistDataModule(userPoints, userPointsFile);
const updatePoints = updatePointsFactory(userPoints, persistData);

const cleanupOnStartup = async () => {
    console.log('Starting cleanup process...');
    const channelsToClear = ['coin-collectors', 'user-review', 'server-review'];

    try {
        for (const guild of client.guilds.cache.values()) {
            for (const channelName of channelsToClear) {
                const channel = guild.channels.cache.find(
                    (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
                );

                if (channel) {
                    console.log(`Clearing messages in ${channelName} for guild: ${guild.name}`);
                    await messageManager.cleanChannel(channel);
                } else {
                    console.log(`Channel "${channelName}" not found in guild: ${guild.name}`);
                }
            }
        }
        console.log('Cleanup completed.');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

const scheduleCoinPost = () => {
    const minDelay = timers.coinPostIntervalMin * 60000; // Convert to ms
    const maxDelay = timers.coinPostIntervalMax * 60000; // Convert to ms

    const postCoinMessage = async (guild) => {
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

            const createdAt = Date.now();
            await message.react('🪙');

            const collector = message.createReactionCollector({
                time: 60000, // 60 seconds
                filter: (reaction, user) => reaction.emoji.name === '🪙' && !user.bot,
            });

            collector.on('collect', async (reaction, user) => {
                const guildId = guild.id;
                const userId = user.id;

                if (processedMessages.has(`${message.id}-${userId}`)) {
                    console.log(`Duplicate reaction ignored for ${user.tag}`);
                    return;
                }

                // Mark message-user combination as processed
                processedMessages.set(`${message.id}-${userId}`);

                // Update points
                updatePoints(guildId, userId, 1, 'Coin collection');

                const guildUsers = userPoints.get(guildId);
                const userPointsTotal = guildUsers.get(userId) || 0;

                const reactionTime = ((Date.now() - createdAt) / 1000).toFixed(2);
                const updatedContent = `${user.username} collected the coin in ${reactionTime} seconds. Better luck next time, everyone! ${user.username} now has ${userPointsTotal} points.`;

                await message.edit(updatedContent);
                console.log(`Coin collected: ${updatedContent}`);
            });

            collector.on('end', () => {
                console.log(`Collector ended for message in ${guild.name}`);
            });
        } catch (error) {
            console.error(`Error in postCoinMessage: ${error.message}`);
        }
    };

    const scheduleGuildCoinPost = (guild) => {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        setTimeout(async () => {
            await postCoinMessage(guild);
            scheduleGuildCoinPost(guild); // Recursively schedule the next post
        }, delay);
    };

    client.guilds.cache.forEach((guild) => {
        scheduleGuildCoinPost(guild);
    });
};

// Schedule the toy submission review every minute
const scheduleToyReview = () => {
    setInterval(async () => {
        console.log("Running toy submission review...");
        await readLatestToySubmission();
    }, 60000); // 60 seconds
};

// Function to schedule periodic posts
const schedulePosts = () => {
    // Convert min and max delay from minutes to milliseconds
    const minDelay = timers.postIntervalMin * 60000; // Convert minutes to milliseconds
    const maxDelay = timers.postIntervalMax * 60000; // Convert minutes to milliseconds

    // Generate a random delay between min and max
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    // Schedule the post
    setTimeout(async () => {
        try {
            await postRandomImage(); // Call the function to post a random image
        } catch (error) {
            console.error('Error posting image:', error); // Log any errors
        }
        schedulePosts(); // Recursively schedule the next post
    }, delay);
};

const postRandomImage = async () => {
    try {
        const guilds = client.guilds.cache.values();

        for (const guild of guilds) {
            const coinCollectorsChannel = guild.channels.cache.find(
                (channel) => channel.type === ChannelType.GuildText && channel.name === 'coin-collectors'
            );

            if (!coinCollectorsChannel) {
                console.log(`No "coin-collectors" channel found in guild: ${guild.name}`);
                continue;
            }

            const randomImagePath = imageManager.getRandomImage(
                path.join(__dirname, 'downloads'),
                recentImages
            );

            if (!randomImagePath) {
                console.error('No image available for posting.');
                continue;
            }

            const cost = Math.floor(Math.random() * (10 - 5 + 1)) + 5;

            const message = await coinCollectorsChannel.send({
                content: `Claim prize now - ${cost} coins`,
                files: [randomImagePath],
            });

            console.log(`Posted image to ${guild.name} -> #coin-collectors with cost: ${cost} coins.`);

            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`Deleted message in ${guild.name} -> #coin-collectors`);
                } catch (error) {
                    console.error(`Error deleting message: ${error.message}`);
                }
            }, 60000);
        }
    } catch (error) {
        console.error(`Error posting image: ${error.message}`);
    }
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
                const messages = await toySubmissionChannel.messages.fetch({ limit: 100 }); // Fetch last 100 messages

                for (const message of messages.values()) {
                    console.log('Processing message details:');
                    console.log(`Guild: ${guild.name}`);
                    console.log(`Channel: #${toySubmissionChannel.name}`);
                    console.log(`Message Content: ${message.content}`);
                    console.log(`Message Author: ${message.author.tag}`);

                     // Check for the green checkmark reaction
                     const hasGreenCheck = message.reactions.cache.some(
                        (reaction) => reaction.emoji.name === '✅' && reaction.me
                    );

                    if (hasGreenCheck) {
                        console.log(
                            `Message in ${guild.name} -> #toy-submission already processed with ✅. Deleting message: ${message.content}`
                        );
                        try {
                            await message.delete(); // Delete the message
                            console.log(`Deleted message in ${guild.name} -> #toy-submission`);
                        } catch (error) {
                            console.error(`Error deleting message: ${error.message}`);
                        }
                        continue; // Skip further processing of this message
                    }

                    // Check for attachments and URLs
                    if (message.attachments.size > 0) {
                        console.log('Attachments found:');

                        for (const attachment of message.attachments.values()) {
                            const { url, name, contentType, size } = attachment;

                            console.log(`- Name: ${name}`);
                            console.log(`- URL: ${url}`);
                            console.log(`- Content Type: ${contentType}`);
                            console.log(`- Size: ${size} bytes`);

                            if (
                                contentType &&
                                contentType.startsWith('image/') &&
                                /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
                            ) {
                                const filepath = path.join(
                                    __dirname,
                                    'downloads',
                                    path.basename(url)
                                );

                                if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
                                    fs.mkdirSync(path.join(__dirname, 'downloads'));
                                }

                                await imageManager.downloadImage(url, filepath, message);
                            } else {
                                console.log(
                                    `Attachment "${name}" is not a valid media file. Skipping.`
                                );
                                await message.react('⚠️'); // React with a warning for invalid media
                            }
                        }
                    } else {
                        console.log('No attachments found in the message.');
                    }

                    const urlMatch = message.content.match(
                        /(https?:\/\/[^\s]+(?:\.jpg|\.jpeg|\.png|\.gif|\.webp))/i
                    );
                    if (urlMatch) {
                        const imageUrl = urlMatch[0];
                        const filename = path.basename(new URL(imageUrl).pathname);
                        const filepath = path.join(__dirname, 'downloads', filename);

                        await imageManager.downloadImage(imageUrl, filepath, message);
                    } else if (message.attachments.size === 0) {
                        console.log('No image URL or valid attachment found in the message.');
                        await message.react('⚠️'); // React with a warning if neither is present
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

// Utility for managing messages
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
            return lastMessage; // Return the last message sent
        } catch (error) {
            console.error(`Error sending message to ${channel.name}: ${error.message}`);
        }
    },
};

// Client ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Perform initial cleanup
    await cleanupOnStartup();

    // Load persistent data
    persistData.load();
    await persistData.syncWithGuilds(client);

    // Schedule periodic tasks
    console.log('Scheduling periodic tasks...');
    scheduleToyReview(); // Schedule toy reviews
    schedulePosts(); // Schedule image posts
    scheduleCoinPost(); // Schedule coin posts

    // Schedule user review updates
    scheduleUserReviewUpdates(client, userPoints, adminServer);
    scheduleServerReviewUpdates(client, userPoints, adminServer);
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (user.bot || !reaction.message.guild) return; // Ignore bot reactions and non-guild reactions

        const guildId = reaction.message.guild.id;
        const userId = user.id;

        if (reaction.message.content.includes('Coin Available')) {
            updatePoints(guildId, userId, -1, 'Coin return'); // Refund 1 coin
            console.log(`User ${user.tag} refunded 1 coin in guild: ${reaction.message.guild.name}`);
        }

        if (processedMessages.has(reaction.message.id)) {
            const cost = processedMessages.get(reaction.message.id);
            updatePoints(guildId, userId, cost, `Refunded prize cost of ${cost} coins`);
            console.log(`User ${user.tag} refunded prize cost in guild: ${reaction.message.guild.name}`);
        }
    } catch (error) {
        console.error(`Error handling messageReactionRemove: ${error.message}`);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot || !reaction.message.guild) return; // Ignore bot reactions and non-guild reactions

        const guildId = reaction.message.guild.id;
        const userId = user.id;
        const message = reaction.message;

        if (reaction.message.content.includes('Coin Available')) {
            //updatePoints(guildId, userId, 1, 'Coin collection');
            console.log(`User ${user.tag} collected a coin in guild: ${reaction.message.guild.name}`);
        }

        const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
        if (costMatch) {
            const cost = parseInt(costMatch[1], 10);

            if (processedMessages.has(message.id)) {
                console.log(`Message already processed: ${message.id}`);
                return;
            }

            processedMessages.set(message.id, cost);

            updatePoints(guildId, userId, -cost, `Claimed prize for ${cost} coins`);
            console.log(`User ${user.tag} claimed a prize in guild: ${reaction.message.guild.name}`);
        }
    } catch (error) {
        console.error(`Error handling messageReactionAdd: ${error.message}`);
    }
});



client.login(token);