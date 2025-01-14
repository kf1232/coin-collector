const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { adminServer } = require('../config/config.json');
const { logEvent } = require('../logs/logging');

class CommandHandler {
    constructor(client, getUserBalance) {
        this.client = client;
        this.commands = new Collection();
        this.adminCommands = new Collection();
        this.getUserBalance = getUserBalance;
        
        this.loadCommands();
        this.setupEventHandler();
    }

    loadCommands() {
        // Load public commands
        const publicCommandsPath = path.join(__dirname, 'public');
        const publicCommandFiles = fs.readdirSync(publicCommandsPath).filter(file => file.endsWith('.js'));

        console.log(publicCommandFiles)
        for (const file of publicCommandFiles) {
            const command = require(`./public/${file}`);
            this.commands.set(command.data.name, command);
            logEvent('SYSTEM', 'info', `Loaded public command: ${command.data.name}`);
        }

        // Load admin commands
        const adminCommandsPath = path.join(__dirname, 'admin');
        const adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of adminCommandFiles) {
            const command = require(`./admin/${file}`);
            this.adminCommands.set(command.data.name, command);
            logEvent('SYSTEM', 'info', `Loaded admin command: ${command.data.name}`);
        }
    }

    setupEventHandler() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            try {
                let command;
                const commandName = interaction.commandName;
                
                // First check if it's a public command
                command = this.commands.get(commandName);
                
                // If it's an admin command and we're in the admin server, use that instead
                if (interaction.guildId === adminServer.guildId && this.adminCommands.has(commandName)) {
                    command = this.adminCommands.get(commandName);
                }

                if (!command) {
                    logEvent('SYSTEM', 'warning', `Unknown command: ${commandName}`);
                    return;
                }

                await command.execute(interaction, this.getUserBalance);
                logEvent('SYSTEM', 'info', `Executed command: ${commandName} in guild ${interaction.guildId}`);
            } catch (error) {
                logEvent('SYSTEM', 'error', `Error executing command ${interaction.commandName}: ${error.message}`);
                
                const reply = {
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        });
    }
}

module.exports = CommandHandler;