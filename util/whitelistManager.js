const fs = require('fs');
const path = require('path');
const { logEvent } = require('../logs/logging');

const WHITELIST_FILE = path.join(__dirname, '../data/whitelist.json');

class WhitelistManager {
    constructor() {
        this.loadWhitelist();
    }

    loadWhitelist() {
        try {
            if (!fs.existsSync(WHITELIST_FILE)) {
                fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ guilds: {} }, null, 2));
            }
            this.whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
            
            // Ensure all guilds have the hidden array
            Object.keys(this.whitelist.guilds).forEach(guildId => {
                if (!this.whitelist.guilds[guildId].hidden) {
                    this.whitelist.guilds[guildId].hidden = [];
                }
            });
            
            fs.writeFileSync(WHITELIST_FILE, JSON.stringify(this.whitelist, null, 2));
            logEvent('SYSTEM', 'info', 'Whitelist data loaded successfully');
        } catch (error) {
            logEvent('SYSTEM', 'error', `Error loading whitelist: ${error.message}`);
            this.whitelist = { guilds: {} };
        }
    }

    isImageWhitelisted(guildId, imageName) {
        const guildData = this.whitelist.guilds[guildId];
        if (!guildData) {
            return false;
        }
        return guildData.whitelisted.includes(imageName) && 
               !guildData.hidden.includes(imageName);
    }

    getWhitelistedImages(guildId) {
        const guildData = this.whitelist.guilds[guildId];
        if (!guildData) {
            return [];
        }
        return guildData.whitelisted.filter(img => !guildData.hidden.includes(img));
    }

    isImageHidden(guildId, imageName) {
        return this.whitelist.guilds[guildId]?.hidden.includes(imageName) || false;
    }
}

module.exports = new WhitelistManager();