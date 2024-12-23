const fs = require('fs');

module.exports = (userPoints, userPointsFile) => {
    return {
        save: () => {
            try {
                const serializedData = JSON.stringify(
                    Object.fromEntries(
                        [...userPoints].map(([guildId, users]) => [
                            guildId,
                            Object.fromEntries(users),
                        ])
                    ),
                    null,
                    2
                );
                fs.writeFileSync(userPointsFile, serializedData);
                console.log(`User points successfully saved to ${userPointsFile}.`);
            } catch (error) {
                console.error(`Error saving user points: ${error.message}`);
            }
        },

        load: () => {
            try {
                if (!fs.existsSync(userPointsFile)) {
                    fs.writeFileSync(userPointsFile, JSON.stringify({}));
                    console.log(`Created new user points file: ${userPointsFile}`);
                }
                const rawData = fs.readFileSync(userPointsFile, 'utf-8');
                const data = JSON.parse(rawData);

                if (typeof data === 'object') {
                    for (const [guildId, users] of Object.entries(data)) {
                        userPoints.set(guildId, new Map(Object.entries(users)));
                    }
                    console.log(`User points successfully loaded from ${userPointsFile}.`);
                } else {
                    throw new Error('Invalid file structure.');
                }
            } catch (error) {
                console.error(`Error loading user points: ${error.message}`);
                fs.writeFileSync(userPointsFile, JSON.stringify({}));
            }
        },

        syncWithGuilds: async (client) => {
            try {
                const guilds = client.guilds.cache.values();

                for (const guild of guilds) {
                    const guildUsers = userPoints.get(guild.id) || new Map();
                    const members = await guild.members.fetch();

                    members.forEach((member) => {
                        if (!guildUsers.has(member.id)) {
                            guildUsers.set(member.id, 0);
                        }
                    });

                    userPoints.set(guild.id, guildUsers);
                }

                this.save();
                console.log('Synchronized guilds and updated user points.');
            } catch (error) {
                console.error(`Error synchronizing guilds: ${error.message}`);
            }
        },
    };
};
