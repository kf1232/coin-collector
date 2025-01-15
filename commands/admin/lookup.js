const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('../../logs/logging');

const IMAGE_DIRECTORY = path.join(__dirname, '../../downloads');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lookup')
        .setDescription('Look up an image by ID')
        .addStringOption(option =>
            option.setName('imageid')
                .setDescription('The ID of the image to look up')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const imageId = interaction.options.getString('imageid');

            // Check if file exists
            const filePath = path.join(IMAGE_DIRECTORY, imageId);
            if (!fs.existsSync(filePath)) {
                await interaction.reply({
                    content: `Image with ID \`${imageId}\` not found.`,
                    ephemeral: true
                });
                return;
            }

            // Create attachment and send
            const attachment = new AttachmentBuilder(filePath);
            await interaction.reply({
                content: `Image: \`${imageId}\``,
                files: [attachment]
            });

            logEvent('SYSTEM', 'info', `Looked up image ${imageId} for user ${interaction.user.id}`);

        } catch (error) {
            logEvent('SYSTEM', 'error', `Error in lookup command: ${error.message}`);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        }
    },
};