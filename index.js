const { v4: uuidv4 } = require('uuid');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { token, adminServer, allowedChannels, files, timers } = require('./config.json');
const persistDataModule = require('./persistData'); // Import the module
const imageManager = require('./imageManager');
const path = require('path');
const fs = require('fs');

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
            const messages = await channel.messages.fetch({ limit: 50 });
            for (const message of messages.values()) {
                await message.delete().catch(console.error);
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

    persistData.load();
    await persistData.syncWithGuilds(client);

    console.log('Fetching latest messages from "toy-submission" channels...');
    scheduleToyReview(); // Schedule the review process every minute    

    schedulePosts(); // Start posting randomly

    const adminGuild = client.guilds.cache.get(adminServer.guildId);

    if (!adminGuild) {
        console.error(`Admin guild not found: ${adminServer.guildId}`);
        return;
    }

    const serverReviewChannel = adminGuild.channels.cache.get(adminServer.channels.serverReview);
    const userReviewChannel = adminGuild.channels.cache.get(adminServer.channels.userReview)

    if (!serverReviewChannel) {
        console.error(`Server review channel not found: ${adminServer.channels.serverReview}`);
        return;
    }

    if (!userReviewChannel) {
        console.error(`User review channel not found: ${adminServer.channels.userReview}`);
        return;
    }

    try {
        await messageManager.cleanChannel(serverReviewChannel);

        for (const [guildId, guildUsers] of userPoints) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            // Filter channels to only include specified ones
            const filteredChannels = guild.channels.cache
                .filter((channel) => channel.type === ChannelType.GuildText && allowedChannels.includes(channel.name))
                .map((channel) =>  - `${channel.name} (${channel.id.slice(-4)})`)
                .join('\n');

            const memberCount = guild.memberCount;
            const totalPoints = Array.from(guildUsers.values()).reduce((sum, points) => sum + points, 0);
            const maxPoints = Math.max(...Array.from(guildUsers.values()), 0);
            const averagePoints = (totalPoints / guildUsers.size || 0).toFixed(2);
            const meanPoints = Array.from(guildUsers.values())
                .sort((a, b) => a - b)[Math.floor(guildUsers.size / 2)] || 0;

            // If no allowed channels found, add a default message
            const channelSummary = filteredChannels || ' - No allowed channels found';

            // Create the guild summary
            const guildSummary = `Guild: "${guild.name}" (${guildId})\n` +
                `- Member count: ${memberCount}\n` +
                `- Total: ${totalPoints}, Max: ${maxPoints}, Average: ${averagePoints}, Mean: ${meanPoints}\n` +
                `${channelSummary}`;

            await messageManager.sendMessage(serverReviewChannel, guildSummary);
            console.log(`Posted server review for guild: ${guild.name} (${guildId})`);
        }
    } catch (error) {
        console.error(`Error posting server review summaries: ${error.message}`);
    }
    
    try {
        await messageManager.cleanChannel(userReviewChannel);
    
        for (const [guildId, guildUsers] of userPoints) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;
    
            const userSummaries = [];
            for (const [userId, points] of guildUsers) {
                const member = guild.members.cache.get(userId);
                const userName = member ? member.user.username : 'Unknown User';
                userSummaries.push(`- (${userId.slice(-4)}) ${userName}: ${points}`);
            }
    
            const memberCount = guild.memberCount;
            const totalPoints = Array.from(guildUsers.values()).reduce((sum, points) => sum + points, 0);
            const maxPoints = Math.max(...Array.from(guildUsers.values()), 0);
            const averagePoints = (totalPoints / guildUsers.size || 0).toFixed(2);
            const meanPoints = Array.from(guildUsers.values())
                .sort((a, b) => a - b)[Math.floor(guildUsers.size / 2)] || 0;
    
            // Create the guild summary
            const guildSummary = `Guild: "${guild.name}" (${guildId})\n` +
                `- Member count: ${memberCount}\n` +
                `- Total Points: ${totalPoints}, Max: ${maxPoints}, Average: ${averagePoints}, Mean: ${meanPoints}\n` +
                `${userSummaries.join('\n')}`;
    
            await messageManager.sendMessage(userReviewChannel, guildSummary);
            console.log(`Posted user review for guild: ${guild.name} (${guildId})`);
        }
    } catch (error) {
        console.error(`Error posting user review summaries: ${error.message}`);
    }
    

});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        // Ignore bot reactions and ensure the reaction is in a guild
        if (user.bot || !reaction.message.guild) return;

        const guildId = reaction.message.guild.id;
        const userId = user.id;
        const message = reaction.message;

        // Ensure the reaction is on a "Claim prize now - X coins" message
        if (processedMessages.has(message.id)) {
            const cost = processedMessages.get(message.id);

            // Ensure the guild's user points are initialized
            if (!userPoints.has(guildId)) userPoints.set(guildId, new Map());
            const guildUsers = userPoints.get(guildId);

            // Refund the cost to the user
            const currentPoints = guildUsers.get(userId) || 0;
            const newPoints = currentPoints + cost;
            guildUsers.set(userId, newPoints);

            // Save the updated points to the file
            persistData.save();

            console.log(
                `User ${user.tag} (${userId}) removed their reaction. Refunded ${cost} points. New balance: ${newPoints} points.`
            );

            // Optionally remove the processed message ID if no further tracking is required
            processedMessages.delete(message.id);
        }
    } catch (error) {
        console.error(`Error handling reaction removal: ${error.message}`);
    }
});


client.on('messageReactionAdd', async (reaction, user) => {
    try {
        // Ignore bot reactions and ensure the reaction is in a guild
        if (user.bot || !reaction.message.guild) return;

        const guildId = reaction.message.guild.id;
        const userId = user.id;
        const message = reaction.message;

        // Ensure the reaction is on a "Claim prize now - X coins" message
        const costMatch = message.content.match(/Claim prize now - (\d+) coins/);
        if (costMatch) {
            const cost = parseInt(costMatch[1], 10);

            // Check if the message has already been processed
            if (processedMessages.has(message.id)) {
                console.log(`Message already processed: ${message.id}`);
                return;
            }

            // Mark the message as processed and store the cost
            processedMessages.set(message.id, cost);

            // Ensure the guild's user points are initialized
            if (!userPoints.has(guildId)) userPoints.set(guildId, new Map());
            const guildUsers = userPoints.get(guildId);

            // Deduct the cost from the user, allowing negative balances
            const currentPoints = guildUsers.get(userId) || 0;
            const newPoints = currentPoints - cost;
            guildUsers.set(userId, newPoints);

            // Save the updated points to the file
            persistData.save();

            console.log(
                `User ${user.tag} (${userId}) claimed the prize for ${cost} points. New balance: ${newPoints} points.`
            );
        }
    } catch (error) {
        console.error(`Error handling reaction: ${error.message}`);
    }
});


client.login(token);