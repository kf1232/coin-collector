const fs = require('fs');
const path = require('path');
const WHITELIST_FILE = path.join(__dirname, '../data/whitelist.json');

const getWhitelistedImages = (guildId) => {
    try {
        if (!fs.existsSync(WHITELIST_FILE)) {
            return [];
        }

        const whitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
        return whitelistData.guilds?.[guildId]?.whitelisted || [];
    } catch (error) {
        console.error(`Error reading whitelist for guild ${guildId}: ${error.message}`);
        return [];
    }
};

module.exports = {
    getWhitelistedImages,
};