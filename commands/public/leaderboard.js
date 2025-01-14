const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('../../logs/logging');

const USER_COLLECTION_FILE = path.join(__dirname, '../../data/userCollection.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View server leaderboard')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of leaderboard to view')
                .setRequired(true)
                .addChoices(
                    { name: 'Coins', value: 'coins' },
                    { name: 'Collection Size', value: 'collection' }
                )),

    async execute(interaction, getUserBalance) {
        try {
            const type = interaction.options.getString('type');
            const guildId = interaction.guildId;
            const guild = interaction.guild;

            const members = await guild.members.fetch();
            let leaderboardData = [];

            if (type === 'coins') {
                members.forEach(member => {
                    if (!member.user.bot) {
                        const balance = getUserBalance(guildId, member.id);
                        leaderboardData.push({
                            id: member.id,
                            name: member.user.username,
                            value: balance
                        });
                    }
                });
            } else {
                const collectionData = JSON.parse(fs.readFileSync(USER_COLLECTION_FILE, 'utf-8'));
                const guildCollections = collectionData[guildId] || {};

                members.forEach(member => {
                    if (!member.user.bot) {
                        const collection = guildCollections[member.id] || [];
                        leaderboardData.push({
                            id: member.id,
                            name: member.user.username,
                            value: collection.length
                        });
                    }
                });
            }

            leaderboardData.sort((a, b) => b.value - a.value);
            leaderboardData = leaderboardData.slice(0, 3);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${guild.name} Leaderboard - ${type === 'coins' ? 'Coins' : 'Collection Size'}`)
                .setTimestamp();

            if (leaderboardData.length === 0) {
                embed.setDescription('No data available.');
            } else {
                const description = leaderboardData
                    .map((entry, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
                        return `${medal} **${entry.name}**: ${entry.value} ${type === 'coins' ? 'coins' : 'toys'}`;
                    })
                    .join('\n');

                embed.setDescription(description);
            }

            await interaction.reply({ embeds: [embed] });
            logEvent('SYSTEM', 'info', `Displayed ${type} leaderboard in guild "${guildId}"`);

        } catch (error) {
            logEvent('SYSTEM', 'error', `Error executing leaderboard command: ${error.message}`);
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true
            });
        }
    },
};