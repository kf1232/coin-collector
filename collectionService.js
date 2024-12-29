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
 * Sends the user's toy collection as images in the chat, along with their coin balance.
 * @param {Message} message - The Discord message object.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {Object} collection - The collection data.
 * @param {number} userBalance - The user's coin balance.
 */
const sendUserCollectionImages = async (message, guildId, userId, collection, userBalance) => {
    if (!collection[guildId] || !collection[guildId][userId] || collection[guildId][userId].length === 0) {
        return message.channel.send(`No toys found for user <@${userId}> in this guild. They have ${userBalance} coins.`);
    }

    const filenames = collection[guildId][userId];
    const attachments = filenames
        .map((filename) => path.join(IMAGE_DIRECTORY, filename))
        .filter((filepath) => fs.existsSync(filepath))
        .map((filepath) => new AttachmentBuilder(filepath));

    if (attachments.length === 0) {
        return message.channel.send(`No valid images found for user <@${userId}>. They have ${userBalance} coins.`);
    }

    await message.channel.send({
        content: `**<@${userId}> has ${userBalance} coins and these toys in their collection:**`,
        files: attachments,
    });
};

/**
 * Handles the `!showCollection` command to display a user's toy collection.
 * @param {Message} message - The Discord message object.
 * @param {Function} getUserBalanceFn - Function to retrieve user's coin balance.
 */
const handleShowCollectionCommand = async (message, getUserBalanceFn) => {
    const collection = loadUserCollection();
    const guildId = message.guild.id;
    const userId = message.author.id;

    try {
        const userBalance = getUserBalanceFn(guildId, userId); // Fetch user's coin balance
        await sendUserCollectionImages(message, guildId, userId, collection, userBalance);
        // Delete the original command message
        await message.delete();
        console.log(`Deleted command message from ${message.author.tag}`);
    } catch (error) {
        console.error(`Error handling showCollection command: ${error.message}`);
    }
};



/**
 * Registers the `!showCollection` command handler with the bot.
 * @param {Client} client - The Discord client instance.
 */
const registerCollectionCommands = (client, getUserBalanceFn) => {
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;

        const content = message.content.trim();
        if (content.startsWith('!showCollection')) {
            handleShowCollectionCommand(message, getUserBalanceFn);
        }
    });
};

module.exports = {
    registerCollectionCommands,
};
