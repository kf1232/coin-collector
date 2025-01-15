const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { logEvent } = require('../../logs/logging');

const WHITELIST_FILE = path.join(__dirname, '../../data/whitelist.json');
const IMAGE_DIRECTORY = path.join(__dirname, '../../downloads');

const WHITELIST_EMOJI = '✅';
const HIDDEN_EMOJI = '❌';
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsorted')
        .setDescription('View and sort unsorted images')
        .addStringOption(option =>
            option.setName('guildid')
                .setDescription('Guild ID')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const guildId = interaction.options.getString('guildid');

            // Load whitelist data
            let whitelistData = { guilds: {} };
            if (fs.existsSync(WHITELIST_FILE)) {
                whitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE));
            }

            // Initialize guild data if missing
            if (!whitelistData.guilds[guildId]) {
                whitelistData.guilds[guildId] = { whitelisted: [], hidden: [] };
            }
            const guildData = whitelistData.guilds[guildId];

            // Get unsorted images
            const allImages = fs.readdirSync(IMAGE_DIRECTORY).filter(file =>
                /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
            );
            const unsortedImages = allImages.filter(img =>
                !guildData.whitelisted.includes(img) && !guildData.hidden.includes(img)
            );

            if (unsortedImages.length === 0) {
                await interaction.reply({
                    content: 'No unsorted images found.',
                    ephemeral: true,
                });
                return;
            }

            // Select up to 5 images
            const selectedImages = unsortedImages.slice(0, 5);
            const attachments = selectedImages.map(image => {
                const filePath = path.join(IMAGE_DIRECTORY, image);
                return new AttachmentBuilder(filePath).setName(image);
            });

            // Generate message content
            let content = `**Review the following images:**\n\n`;
            content += `${WHITELIST_EMOJI} - Add to whitelist\n${HIDDEN_EMOJI} - Add to hidden\n\n`;
            selectedImages.forEach((img, idx) => {
                content += `${NUMBER_EMOJIS[idx]} \`${img}\`\n`;
            });

            const message = await interaction.reply({
                content,
                files: attachments,
                fetchReply: true,
            });

            // Add reactions
            await message.react(WHITELIST_EMOJI);
            await message.react(HIDDEN_EMOJI);
            for (let i = 0; i < selectedImages.length; i++) {
                await message.react(NUMBER_EMOJIS[i]);
            }

            let selectedAction = null;

            // Reaction collector
            const collector = message.createReactionCollector({
                time: 5 * 60 * 1000,
            });

            collector.on('collect', async (reaction, user) => {
                if (user.bot) return;

                // Remove user's reaction
                await reaction.users.remove(user.id);
                const emoji = reaction.emoji.name;

                // Handle whitelist/hidden selection
                if (emoji === WHITELIST_EMOJI || emoji === HIDDEN_EMOJI) {
                    selectedAction = emoji;
                    return;
                }

                // Handle image selection
                if (NUMBER_EMOJIS.includes(emoji) && selectedAction) {
                    const index = NUMBER_EMOJIS.indexOf(emoji);
                    const imageToProcess = selectedImages[index];

                    if (selectedAction === WHITELIST_EMOJI) {
                        if (!guildData.whitelisted.includes(imageToProcess)) {
                            guildData.whitelisted.push(imageToProcess);
                            content = content.replace(
                                `${NUMBER_EMOJIS[index]} \`${imageToProcess}\``,
                                `${NUMBER_EMOJIS[index]} \`${imageToProcess}\` (Whitelisted ✅)`
                            );
                        }
                    } else if (selectedAction === HIDDEN_EMOJI) {
                        if (!guildData.hidden.includes(imageToProcess)) {
                            guildData.hidden.push(imageToProcess);
                            content = content.replace(
                                `${NUMBER_EMOJIS[index]} \`${imageToProcess}\``,
                                `${NUMBER_EMOJIS[index]} \`${imageToProcess}\` (Hidden ❌)`
                            );
                        }
                    }

                    // Save updated data and reset selected action
                    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));
                    await message.edit({ content });
                    selectedAction = null;
                }
            });

            collector.on('end', async () => {
                await message.edit({
                    content: `${content}\n*Sorting session expired. Use /unsorted to restart.*`,
                });
                await message.reactions.removeAll();
            });

        } catch (error) {
            logEvent('SYSTEM', 'error', `Error in unsorted command: ${error.message}`);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true,
            });
        }
    },
};
