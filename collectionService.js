const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const USER_COLLECTION_FILE = path.join(__dirname, 'userCollection.json');
const IMAGE_DIRECTORY = path.join(__dirname, 'downloads');
const DEBOUNCE_INTERVAL = 5000; // 5 seconds

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
 * Updates a message with a new page of attachments and content.
 * @param {Message} sentMessage - The existing message to update.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {Object} collection - The collection data.
 * @param {number} userBalance - The user's coin balance.
 * @param {number} page - The page number to display.
 */
const updatePaginatedMessage = async (sentMessage, guildId, userId, collection, userBalance, page) => {
    const itemsPerPage = 10;
    const filenames = collection[guildId]?.[userId] || [];
    const totalPages = Math.ceil(filenames.length / itemsPerPage);

    if (filenames.length === 0) {
        return sentMessage.edit({
            content: `No toys found for user <@${userId}> in this guild. They have ${userBalance} coins.`,
            files: [],
        });
    }

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const attachments = filenames.slice(start, end)
        .map((filename) => path.join(IMAGE_DIRECTORY, filename))
        .filter((filepath) => fs.existsSync(filepath))
        .map((filepath) => new AttachmentBuilder(filepath));

    await sentMessage.edit({
        content: `**<@${userId}> has ${userBalance} coins and these toys in their collection (Page ${page + 1}/${totalPages}):**`,
        files: attachments,
    });
};

/**
 * Sends a paginated view of the user's collection and sets up reactions.
 * @param {Message} message - The Discord message object.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {Object} collection - The collection data.
 * @param {number} userBalance - The user's coin balance.
 * @param {number} page - The initial page number to display.
 */
const sendPaginatedCollection = async (message, guildId, userId, collection, userBalance, page = 0) => {
    const itemsPerPage = 10;
    const filenames = collection[guildId]?.[userId] || [];
    const totalPages = Math.ceil(filenames.length / itemsPerPage);

    if (filenames.length === 0) {
        return message.channel.send(`No toys found for user <@${userId}> in this guild. They have ${userBalance} coins.`);
    }

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const attachments = filenames.slice(start, end)
        .map((filename) => path.join(IMAGE_DIRECTORY, filename))
        .filter((filepath) => fs.existsSync(filepath))
        .map((filepath) => new AttachmentBuilder(filepath));

    const sentMessage = await message.channel.send({
        content: `**<@${userId}> has ${userBalance} coins and these toys in their collection (Page ${page + 1}/${totalPages}):**`,
        files: attachments,
    });

    if (totalPages > 1) {
        await sentMessage.react('⬅️');
        await sentMessage.react('➡️');
        setupReactionCollector(sentMessage, guildId, userId, collection, userBalance, page, totalPages);
    }
};

/**
 * Sets up a reaction collector to handle pagination.
 * @param {Message} sentMessage - The sent message with reactions.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {Object} collection - The collection data.
 * @param {number} userBalance - The user's coin balance.
 * @param {number} currentPage - The current page being displayed.
 * @param {number} totalPages - The total number of pages.
 */
const setupReactionCollector = (sentMessage, guildId, userId, collection, userBalance, currentPage, totalPages) => {
    const collector = sentMessage.createReactionCollector({
        time: 30000, // 30s
        filter: (reaction, user) => ['⬅️', '➡️'].includes(reaction.emoji.name) && !user.bot,
    });

    let lastInteraction = Date.now();

    collector.on('collect', async (reaction, user) => {
        const now = Date.now();
        if (now - lastInteraction < DEBOUNCE_INTERVAL) return; // Debounce

        lastInteraction = now;
        await reaction.users.remove(user.id);

        if (reaction.emoji.name === '⬅️' && currentPage > 0) {
            currentPage--;
        } else if (reaction.emoji.name === '➡️' && currentPage < totalPages - 1) {
            currentPage++;
        } else {
            return;
        }

        await updatePaginatedMessage(sentMessage, guildId, userId, collection, userBalance, currentPage);
    });

    collector.on('end', () => {
        sentMessage.reactions.removeAll().catch(() => {});
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
        await sendPaginatedCollection(message, guildId, userId, collection, userBalance);
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
