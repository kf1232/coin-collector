const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('../../logs/logging');

const WHITELIST_FILE = path.join(__dirname, '../../data/whitelist.json');
const DOWNLOADS_DIR = path.join(__dirname, '../../downloads');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manage whitelisted images for a guild')
        .addStringOption(option =>
            option.setName('guild-id')
                .setDescription('The ID of the guild to manage')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'View Current Images', value: 'view' },
                    { name: 'Add Current Images', value: 'add' },
                    { name: 'Remove All Images', value: 'remove' },
                    { name: 'View Status', value: 'status' },
                    { name: 'Hide Images', value: 'hide' },
                    { name: 'View Hidden', value: 'view-hidden' },
                    { name: 'Unhide Images', value: 'unhide' }
                ))
        .addStringOption(option =>
            option.setName('images')
                .setDescription('Comma-separated list of image filenames (for hide/unhide)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const guildId = interaction.options.getString('guild-id');
            const action = interaction.options.getString('action');
            const images = interaction.options.getString('images');

            // Load whitelist data
            let whitelistData = { guilds: {} };
            if (fs.existsSync(WHITELIST_FILE)) {
                whitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
            }

            // Initialize guild data if it doesn't exist
            if (!whitelistData.guilds[guildId]) {
                whitelistData.guilds[guildId] = {
                    whitelisted: [],
                    hidden: [],
                    lastUpdated: null
                };
            }
            // Ensure hidden array exists for guild
            if (!whitelistData.guilds[guildId].hidden) {
                whitelistData.guilds[guildId].hidden = [];
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Whitelist Management - ${guildId}`)
                .setTimestamp();

            switch (action) {
                case 'view': {
                    const guildData = whitelistData.guilds[guildId];
                    const whitelistedImages = guildData.whitelisted
                        .filter(img => !guildData.hidden.includes(img));
                    
                    if (whitelistedImages.length === 0) {
                        embed.setDescription('No whitelisted images for this guild.');
                    } else {
                        embed.setDescription(`Total whitelisted images: ${whitelistedImages.length}\n\nWhitelisted Images:\n${whitelistedImages.join('\n')}`);
                    }
                    break;
                }

                case 'add': {
                    const guildData = whitelistData.guilds[guildId];
                    const currentImages = fs.readdirSync(DOWNLOADS_DIR)
                        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
                        .filter(file => !guildData.hidden.includes(file));
                    
                    guildData.whitelisted = currentImages;
                    guildData.lastUpdated = new Date().toISOString();
                    
                    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));
                    
                    embed.setDescription(`Added ${currentImages.length} images to whitelist.\n\nImages:\n${currentImages.join('\n')}`);
                    logEvent('SYSTEM', 'info', `Updated whitelist for guild ${guildId} with ${currentImages.length} images`);
                    break;
                }

                case 'hide': {
                    if (!images) {
                        embed.setDescription('Please provide image filenames to hide.');
                        break;
                    }

                    const guildData = whitelistData.guilds[guildId];
                    const imageList = images.split(',').map(img => img.trim());
                    const newHidden = imageList.filter(img => 
                        fs.existsSync(path.join(DOWNLOADS_DIR, img)) && 
                        !guildData.hidden.includes(img)
                    );

                    guildData.hidden.push(...newHidden);
                    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));

                    embed.setDescription(`Hidden ${newHidden.length} images for guild ${guildId}:\n${newHidden.join('\n')}`);
                    logEvent('SYSTEM', 'info', `Added ${newHidden.length} images to hidden list for guild ${guildId}`);
                    break;
                }

                case 'unhide': {
                    if (!images) {
                        embed.setDescription('Please provide image filenames to unhide.');
                        break;
                    }

                    const guildData = whitelistData.guilds[guildId];
                    const imageList = images.split(',').map(img => img.trim());
                    guildData.hidden = guildData.hidden.filter(img => !imageList.includes(img));
                    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));

                    embed.setDescription(`Unhidden ${imageList.length} images for guild ${guildId}:\n${imageList.join('\n')}`);
                    logEvent('SYSTEM', 'info', `Removed ${imageList.length} images from hidden list for guild ${guildId}`);
                    break;
                }

                case 'view-hidden': {
                    const guildData = whitelistData.guilds[guildId];
                    if (guildData.hidden.length === 0) {
                        embed.setDescription('No hidden images for this guild.');
                    } else {
                        embed.setDescription(`Hidden Images for guild ${guildId} (${guildData.hidden.length}):\n${guildData.hidden.join('\n')}`);
                    }
                    break;
                }

                case 'remove': {
                    const guildData = whitelistData.guilds[guildId];
                    const previousCount = guildData.whitelisted.length;
                    guildData.whitelisted = [];
                    guildData.lastUpdated = new Date().toISOString();
                    
                    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData, null, 2));
                    
                    embed.setDescription(`Removed ${previousCount} images from whitelist for guild ${guildId}.`);
                    logEvent('SYSTEM', 'info', `Cleared whitelist for guild ${guildId}`);
                    break;
                }

                case 'status': {
                    const guildData = whitelistData.guilds[guildId];
                    const lastUpdated = guildData.lastUpdated ? new Date(guildData.lastUpdated).toLocaleString() : 'Never';
                    const visibleImages = guildData.whitelisted.filter(img => !guildData.hidden.includes(img));
                    
                    embed.setDescription(`Whitelist Status for Guild ${guildId}:\n\n` +
                        `Total Whitelisted Images: ${visibleImages.length}\n` +
                        `Hidden Images: ${guildData.hidden.length}\n` +
                        `Last Updated: ${lastUpdated}`);
                    break;
                }
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
            logEvent('SYSTEM', 'info', `Executed whitelist command (${action}) for guild ${guildId}`);

        } catch (error) {
            logEvent('SYSTEM', 'error', `Error in whitelist command: ${error.message}`);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        }
    },
};