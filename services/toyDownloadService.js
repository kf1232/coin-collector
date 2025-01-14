const { ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { timers } = require('../config/config.json');
const { logEvent } = require('../logs/logging');

/**
 * Downloads and saves an image from a given URL to the "downloads" directory.
 * Logs the operation, including errors, for better traceability.
 * @param {string} url - The URL of the image.
 * @param {string} label - A label for logging purposes (e.g., "Uploaded Attachment" or "Uploaded URL").
 */
const processImage = async (url, label) => {
    try {
        const directory = path.join(__dirname, '../downloads');
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            logEvent('DOWNLOAD', 'info', `Created missing downloads directory at "${directory}".`);
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

        logEvent('DOWNLOAD', 'info', `${label}: Successfully saved image to "${filePath}".`);
    } catch (error) {
        logEvent('DOWNLOAD', 'error', `${label}: Failed to download image from "${url}": ${error.message}`);
    }
};

/**
 * Reads the latest messages in "toy-submission" channels and processes image attachments or URLs.
 * Logs and processes reactions, attachments, and URLs in messages.
 * @param {Client} client - The Discord client instance.
 */
const readLatestToySubmission = async (client) => {
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
                            logEvent('DOWNLOAD', 'info', `Deleted message in "${guild.name}" - Reactions seen: ✅ (green check mark).`);
                            continue;
                        }

                        logEvent('DOWNLOAD', 'warning', `Skipping message in "${guild.name}" - Reactions seen: ${reactionSummary}`);
                        continue;
                    }

                    let success = false;
                    for (const attachment of message.attachments.values()) {
                        if (attachment.contentType?.startsWith('image/')) {
                            const url = attachment.url;
                            await processImage(url, 'Uploaded Attachment');
                            success = true;
                        } else {
                            logEvent('DOWNLOAD', 'warning', `Attachment "${attachment.name}" is not a valid image.`);
                        }
                    }

                    const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))/gi;
                    const matches = [...message.content.matchAll(urlRegex)];

                    for (const match of matches) {
                        const url = match[1];
                        await processImage(url, 'Uploaded URL');
                        success = true;
                    }

                    if (success) {
                        await message.react('✅');
                        logEvent('DOWNLOAD', 'info', `Message in "${guild.name}" processed successfully and marked with ✅.`);
                    } else {
                        await message.react('⚠️');
                        logEvent('DOWNLOAD', 'warning', `Message in "${guild.name}" marked with ⚠️ due to processing issues.`);
                    }
                }
            } else {
                logEvent('DOWNLOAD', 'warning', `No "toy-submission" channel found in guild: "${guild.name}".`);
            }
        }
    } catch (error) {
        logEvent('DOWNLOAD', 'error', `Error reading "toy-submission" channels: ${error.message}`);
    }
};

/**
 * Initializes the toy submission review service.
 * @param {Client} client - The Discord client instance.
 */
const initializeToySubmissionService = (client) => {
    setInterval(async () => {
        try {
            logEvent('DOWNLOAD', 'info', 'Running periodic check for new toy submissions...');
            await readLatestToySubmission(client);
            logEvent('DOWNLOAD', 'info', 'Completed check for new toy submissions.');
        } catch (error) {
            logEvent('DOWNLOAD', 'error', `Error during periodic toy review: ${error.message}`);
        }
    }, timers.ONE_MINUTE);
};

module.exports = {
    initializeToySubmissionService,
};