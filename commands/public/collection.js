const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { logEvent } = require('../../logs/logging');

const IMAGE_DIRECTORY = path.join(__dirname, '../../downloads');
const USER_COLLECTION_FILE = path.join(__dirname, '../../data/userCollection.json');
const DEBOUNCE_INTERVAL = 5000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your toy collection')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number to view')
                .setRequired(false)),

    async execute(interaction, getUserBalance) {
        try {
            const page = interaction.options.getInteger('page') || 0;
            const guildId = interaction.guildId;
            const userId = interaction.user.id;
            
            // Load collection data
            const collection = JSON.parse(fs.readFileSync(USER_COLLECTION_FILE, 'utf-8'));
            const userBalance = getUserBalance(guildId, userId);
            
            const itemsPerPage = 10;
            const filenames = collection[guildId]?.[userId] || [];
            const totalPages = Math.ceil(filenames.length / itemsPerPage);

            if (filenames.length === 0) {
                logEvent('COLLECT', 'info', `No toys found for user ${userId} in guild "${guildId}". User balance: ${userBalance} coins.`);
                await interaction.reply({
                    content: `${interaction.user.username} doesn't have any toys in their collection yet. They have ${userBalance} coins.`
                });
                return;
            }

            if (page >= totalPages) {
                await interaction.reply({
                    content: `Invalid page number. Total pages: ${totalPages}`
                });
                return;
            }

            const start = page * itemsPerPage;
            const end = Math.min(start + itemsPerPage, filenames.length);
            const attachments = filenames.slice(start, end)
                .map((filename) => path.join(IMAGE_DIRECTORY, filename))
                .filter((filepath) => fs.existsSync(filepath))
                .map((filepath) => new AttachmentBuilder(filepath));

            const reply = await interaction.reply({
                content: `${interaction.user.username}'s collection (Page ${page + 1}/${totalPages}) - Balance: ${userBalance} coins`,
                files: attachments,
                fetchReply: true
            });

            // Only add pagination reactions if there are multiple pages
            if (totalPages > 1) {
                await reply.react('⬅️');
                await reply.react('➡️');
                
                // Set up reaction collector
                const collector = reply.createReactionCollector({
                    time: 600000, // 10 minutes
                    filter: (reaction, user) => 
                        ['⬅️', '➡️'].includes(reaction.emoji.name) && 
                        !user.bot
                });

                let currentPage = page;
                let lastInteraction = Date.now();

                collector.on('collect', async (reaction, user) => {
                    try {
                        const now = Date.now();
                        if (now - lastInteraction < DEBOUNCE_INTERVAL) {
                            return; // Debounce
                        }
                        lastInteraction = now;

                        // Remove user's reaction
                        await reaction.users.remove(user.id);

                        // Update current page based on reaction
                        if (reaction.emoji.name === '⬅️' && currentPage > 0) {
                            currentPage--;
                        } else if (reaction.emoji.name === '➡️' && currentPage < totalPages - 1) {
                            currentPage++;
                        } else {
                            return;
                        }

                        // Get new page attachments
                        const newStart = currentPage * itemsPerPage;
                        const newEnd = Math.min(newStart + itemsPerPage, filenames.length);
                        const newAttachments = filenames.slice(newStart, newEnd)
                            .map((filename) => path.join(IMAGE_DIRECTORY, filename))
                            .filter((filepath) => fs.existsSync(filepath))
                            .map((filepath) => new AttachmentBuilder(filepath));

                        // Update message
                        await reply.edit({
                            content: `${interaction.user.username}'s collection (Page ${currentPage + 1}/${totalPages}) - Balance: ${userBalance} coins`,
                            files: newAttachments
                        });

                        logEvent('COLLECT', 'info', `Updated collection page to ${currentPage + 1}/${totalPages} for user ${userId} in guild "${guildId}"`);
                    } catch (error) {
                        logEvent('COLLECT', 'error', `Error handling reaction: ${error.message}`);
                    }
                });

                collector.on('end', async () => {
                    try {
                        await reply.reactions.removeAll();
                        logEvent('COLLECT', 'info', `Removed reactions from collection message for user ${userId} in guild "${guildId}"`);
                    } catch (error) {
                        logEvent('COLLECT', 'error', `Error removing reactions: ${error.message}`);
                    }
                });
            }

            logEvent('COLLECT', 'info', `Displayed collection page ${page + 1}/${totalPages} for user ${userId} in guild "${guildId}"`);
        } catch (error) {
            logEvent('COLLECT', 'error', `Error executing collection command: ${error.message}`);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        }
    },
};