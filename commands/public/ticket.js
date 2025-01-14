const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { adminServer } = require('../../config/config.json');
const { logEvent } = require('../../logs/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Submit a support ticket')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your support message')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // Get the admin guild
            const adminGuild = await interaction.client.guilds.fetch(adminServer.guildId);
            if (!adminGuild) {
                logEvent('SYSTEM', 'error', 'Admin guild not found');
                await interaction.reply({
                    content: 'Unable to process ticket at this time.',
                    ephemeral: true
                });
                return;
            }

            // Get or create the tickets channel in admin guild
            let ticketsChannel = adminGuild.channels.cache.find(c => c.name === 'tickets');
            if (!ticketsChannel) {
                ticketsChannel = await adminGuild.channels.create({
                    name: 'tickets',
                    topic: 'Support ticket submissions from all guilds',
                    reason: 'Automated ticket tracking system'
                });
                logEvent('SYSTEM', 'info', 'Created tickets channel in admin guild');
            }

            // Get channel information
            const channelLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}`;
            const channelName = interaction.channel.name;

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('New Support Ticket')
                .setTimestamp()
                .addFields(
                    {
                        name: 'User Information',
                        value: [
                            `Username: ${interaction.user.username}`,
                            `User ID: ${interaction.user.id}`,
                            `Nickname: ${interaction.member.nickname || 'None'}`,
                            `Joined Server: ${interaction.member.joinedAt.toLocaleString()}`
                        ].join('\n')
                    },
                    {
                        name: 'Guild Information',
                        value: [
                            `Name: ${interaction.guild.name}`,
                            `ID: ${interaction.guild.id}`,
                            `Channel: [${channelName}](${channelLink})`
                        ].join('\n')
                    },
                    {
                        name: 'User Roles',
                        value: interaction.member.roles.cache.size > 1
                            ? interaction.member.roles.cache
                                .filter(role => role.id !== interaction.guild.id) // Filter out @everyone role
                                .map(role => role.name)
                                .join(', ')
                            : 'No roles'
                    },
                    {
                        name: 'Support Message',
                        value: interaction.options.getString('message')
                    }
                );

            // Send the embed to the tickets channel
            await ticketsChannel.send({ embeds: [embed] });
            logEvent('SYSTEM', 'info', `Ticket created by ${interaction.user.username} in ${interaction.guild.name}`);

            // Reply to the user
            await interaction.reply({
                content: 'Your ticket has been submitted successfully! Our support team will review it shortly.',
                ephemeral: true
            });

        } catch (error) {
            logEvent('SYSTEM', 'error', `Error creating ticket: ${error.message}`);
            await interaction.reply({
                content: 'There was an error submitting your ticket. Please try again later.',
                ephemeral: true
            });
        }
    }
};