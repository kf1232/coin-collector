const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const USER_COLLECTION_FILE = path.join(__dirname, 'userCollection.json');
const IMAGE_DIRECTORY = path.join(__dirname, 'downloads');

/**
 * Loads the user collection from the JSON file.
 * Initializes the file if it doesn't exist.
 * @returns {Object} The user collection data.
 */
const loadUserCollection = () => {
    if (!fs.existsSync(USER_COLLECTION_FILE)) {
        fs.writeFileSync(USER_COLLECTION_FILE, JSON.stringify({}, null, 2));
        console.log('Created new user collection file.');
    }
    return JSON.parse(fs.readFileSync(USER_COLLECTION_FILE, 'utf-8'));
};

/**
 * Sends the user's toy collection as images in the chat.
 * @param {Message} message - The Discord message object.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {Object} collection - The collection data.
 */
const sendUserCollectionImages = async (message, guildId, userId, collection) => {
    if (!collection[guildId] || !collection[guildId][userId] || collection[guildId][userId].length === 0) {
        return message.channel.send(`No toys found for user <@${userId}> in this guild.`);
    }

    const filenames = collection[guildId][userId];
    const attachments = filenames
        .map((filename) => path.join(IMAGE_DIRECTORY, filename))
        .filter((filepath) => fs.existsSync(filepath))
        .map((filepath) => new AttachmentBuilder(filepath));

    if (attachments.length === 0) {
        return message.channel.send(`No valid images found for user <@${userId}>.`);
    }

    await message.channel.send({
        content: `**Toy Collection for <@${userId}>**`,
        files: attachments,
    });
};

/**
 * Handles the `!showCollection` command to display a user's toy collection.
 * @param {Message} message - The Discord message object.
 */
const handleShowCollectionCommand = async (message) => {
    const collection = loadUserCollection();
    const guildId = message.guild.id;
    const userId = message.author.id;

    await sendUserCollectionImages(message, guildId, userId, collection);
};


/**
 * Registers the `!showCollection` command handler with the bot.
 * @param {Client} client - The Discord client instance.
 */
const registerCollectionCommands = (client) => {
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;

        const content = message.content.trim();
        if (content.startsWith('!showCollection')) {
            handleShowCollectionCommand(message);
        }
    });
};

module.exports = {
    registerCollectionCommands,
};
