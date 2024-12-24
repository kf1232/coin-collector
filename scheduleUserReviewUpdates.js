const { ChannelType } = require('discord.js');
const timers = require('./config.json').timers;

let lastMessage = null;

/**
 * Updates the "user-review" channel in the admin guild with the latest points data.
 * @param {Client} client - The Discord client.
 * @param {Map} userPoints - The map of user points by guild.
 * @param {Object} adminServer - Admin server configuration from config.json.
 */
const scheduleUserReviewUpdates = async (client, userPoints, adminServer) => {
    const adminGuild = client.guilds.cache.get(adminServer.guildId);
    if (!adminGuild) {
        console.error(`Admin guild not found: ${adminServer.guildId}`);
        return;
    }

    const userReviewChannel = adminGuild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && channel.name === 'user-review'
    );

    if (!userReviewChannel) {
        console.error('No "user-review" channel found in the admin guild.');
        return;
    }

    const postUserReview = async () => {
        console.log('Updating user-review channel with the latest points data...');

        try {
            let reviewContent = '';

            for (const [guildId, guildUsers] of userPoints) {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const pointsArray = Array.from(guildUsers.values());
                const totalPoints = pointsArray.reduce((sum, points) => sum + points, 0);
                const maxPoints = Math.max(...pointsArray, 0);
                const minPoints = Math.min(...pointsArray, 0);
                const averagePoints = (totalPoints / pointsArray.length || 0).toFixed(2);
                const meanPoints =
                    pointsArray.sort((a, b) => a - b)[Math.floor(pointsArray.length / 2)] || 0;

                const topUsers = Array.from(guildUsers.entries())
                    .sort(([, pointsA], [, pointsB]) => pointsB - pointsA) // Sort by points descending
                    .slice(0, 20) // Take top 20 users
                    .map(([userId, points]) => {
                        const member = guild.members.cache.get(userId);
                        const userName = member ? member.user.username : 'Unknown User';
                        return `- (${userId.slice(-4)}) ${userName}: ${points}`;
                    })
                    .join('\n');

                reviewContent += `**${guild.name} (${guildId})**\n` +
                    `Members: ${guild.memberCount}\n` +
                    `Max: ${maxPoints}, Min: ${minPoints}, Avg: ${averagePoints}, Mean: ${meanPoints}\n` +
                    `${topUsers}\n\n`;
            }

            if (!reviewContent) {
                reviewContent = 'No data available for connected servers.';
            }

            // Clear last message if exists
            if (lastMessage) {
                await lastMessage.delete();
            }

            // Post new message
            lastMessage = await userReviewChannel.send(reviewContent);
            console.log('User-review channel updated successfully.');
        } catch (error) {
            console.error('Error updating user-review channel:', error);
        }
    };

    // Post an initial full review
    await postUserReview();

    // Schedule periodic updates
    const refreshInterval = timers.userReviewUpdateTimer * 60000; // Convert minutes to milliseconds
    setInterval(postUserReview, refreshInterval);
};

module.exports = scheduleUserReviewUpdates;
