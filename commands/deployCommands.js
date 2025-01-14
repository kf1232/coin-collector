const { REST, Routes } = require('discord.js');
const { clientId, token, adminServer } = require('../config/config.json');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('../logs/logging');

async function deployCommands() {
    const commands = [];
    const adminCommands = [];

    // Load public commands
    const publicCommandsPath = path.join(__dirname, 'public');
    const publicCommandFiles = fs.readdirSync(publicCommandsPath).filter(file => file.endsWith('.js'));

    for (const file of publicCommandFiles) {
        const command = require(`./public/${file}`);
        commands.push(command.data.toJSON());
        logEvent('SYSTEM', 'info', `Loaded public command: ${file}`);
    }

    // Load admin commands
    const adminCommandsPath = path.join(__dirname, 'admin');
    const adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

    for (const file of adminCommandFiles) {
        const command = require(`./admin/${file}`);
        adminCommands.push(command.data.toJSON());
        logEvent('SYSTEM', 'info', `Loaded admin command: ${file}`);
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        // Deploy public commands globally
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        logEvent('SYSTEM', 'info', 'Successfully deployed global commands');

        // Deploy admin commands to admin server only
        await rest.put(
            Routes.applicationGuildCommands(clientId, adminServer.guildId),
            { body: adminCommands },
        );
        logEvent('SYSTEM', 'info', 'Successfully deployed admin commands to admin server');
    } catch (error) {
        logEvent('SYSTEM', 'error', `Error deploying commands: ${error.message}`);
    }
}

module.exports = deployCommands;