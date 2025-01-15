const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { logEvent } = require('../../logs/logging');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const WHITELIST_FILE = path.join(__dirname, '../../data/whitelist.json');
const IMAGE_DIRECTORY = path.join(__dirname, '../../downloads'); // Ensure this points to your image storage location.

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hidden')
        .setDescription('View hidden images')
        .addStringOption(option =>
            option.setName('guildid')
                .setDescription('Guild ID')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const guildId = interaction.options.getString('guildid');
            const ITEMS_PER_PAGE = 10;

            // Load whitelist data
            let whitelistData = { guilds: {} };
            if (fs.existsSync(WHITELIST_FILE)) {
                whitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE));
            }

            // Get hidden images for the specified guild
            const guildData = whitelistData.guilds[guildId] || { hidden: [] };
            const hiddenImages = guildData.hidden;

            if (hiddenImages.length === 0) {
                await interaction.reply({
                    content: 'No hidden images found for this guild.',
                    ephemeral: true,
                });
                return;
            }

            const totalPages = Math.ceil(hiddenImages.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            const getPageContent = (page) => {
                const startIndex = page * ITEMS_PER_PAGE;
                const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, hiddenImages.length);
                const pageImages = hiddenImages.slice(startIndex, endIndex);

                let content = `**Hidden Images (Page ${page + 1} of ${totalPages})**\n\n`;
                pageImages.forEach((img, idx) => {
                    content += `${startIndex + idx + 1}. \`${img}\`\n`;
                });

                return content;
            };

            const getAttachments = (page) => {
                const startIndex = page * ITEMS_PER_PAGE;
                const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, hiddenImages.length);
                const pageImages = hiddenImages.slice(startIndex, endIndex);

                return pageImages.map((img) => {
                    const filePath = path.join(IMAGE_DIRECTORY, img);
                    if (fs.existsSync(filePath)) {
                        return new AttachmentBuilder(filePath).setName(img);
                    }
                    return null; // Exclude non-existent files
                }).filter(Boolean);
            };

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('⬅️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(totalPages <= 1)
                );

            const message = await interaction.reply({
                content: getPageContent(currentPage),
                files: getAttachments(currentPage),
                components: [row],
                fetchReply: true,
            });

            const filter = (i) => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'prev_page') {
                    currentPage = Math.max(currentPage - 1, 0);
                } else if (i.customId === 'next_page') {
                    currentPage = Math.min(currentPage + 1, totalPages - 1);
                }

                await i.update({
                    content: getPageContent(currentPage),
                    files: getAttachments(currentPage),
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('prev_page')
                                    .setLabel('⬅️')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(currentPage === 0),
                                new ButtonBuilder()
                                    .setCustomId('next_page')
                                    .setLabel('➡️')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(currentPage === totalPages - 1)
                            )
                    ],
                });
            });

            collector.on('end', async () => {
                await message.edit({
                    content: `${getPageContent(currentPage)}\n*Pagination session expired. Use /hidden to view again.*`,
                    components: [],
                });
            });

            logEvent('SYSTEM', 'info', `Displayed hidden images for guild ${guildId}, starting at page 1`);
        } catch (error) {
            logEvent('SYSTEM', 'error', `Error in hidden command: ${error.message}`);
            await interaction.reply({
                    content: 'There was an error while executing this command!',
                    ephemeral: true,
            });
        }
    },
};
