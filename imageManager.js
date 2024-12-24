const fs = require('fs');
const path = require('path');
const { imageHistory } = require('./config.json');
const { v4: uuidv4 } = require('uuid');

/**
 * Logs and reacts to a message for success or failure.
 * @param {Object} message - The Discord message object (used for reactions).
 * @param {string} reaction - The reaction emoji to add to the message.
 * @param {string} logMessage - The message to log.
 */
const handleReaction = async (message, reaction, logMessage) => {
    console.log(logMessage);
    if (message && message.react) {
        await message.react(reaction);
    }
};

/**
 * Downloads an image from the given URL and saves it to the specified file path.
 * @param {string} url - The URL of the image to download.
 * @param {string} filepath - The directory where the image should be saved.
 * @param {Object} message - The Discord message object (used for reactions).
 */
const downloadImage = async (url, filepath, message) => {
    try {
        const parsedUrl = new URL(url);
        const fileExtension = path.extname(parsedUrl.pathname);
        const baseName = path.basename(parsedUrl.pathname, fileExtension);
        const uniqueFilename = `${baseName}_${Date.now()}_${uuidv4()}${fileExtension}`;
        const uniqueFilepath = path.join(filepath, uniqueFilename);

        console.log(`Downloading image from: ${url}`);
        console.log(`Saving image as: ${uniqueFilepath}`);

        if (fs.existsSync(uniqueFilepath)) {
            await handleReaction(message, '✅', `File already exists: ${uniqueFilepath}`);
            return;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(uniqueFilepath, buffer);

        await handleReaction(message, '✅', `Image downloaded successfully: ${uniqueFilepath}`);
    } catch (error) {
        await handleReaction(message, '⚠️', `Error downloading image from ${url}: ${error.message}`);
    }
};

/**
 * Retrieves a random image file path from the specified directory.
 * Filters out recently used images based on the provided list.
 * @param {string} downloadsDir - The directory to scan for images.
 * @param {Array<string>} recentImages - A list of recently used images to exclude.
 * @returns {string|null} The file path of a random image, or null if none available.
 */
const getRandomImage = (downloadsDir, recentImages) => {
    const allFiles = fs.readdirSync(downloadsDir);
    const imageFiles = allFiles.filter((file) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    const availableFiles = imageFiles.filter((file) => !recentImages.includes(file));

    if (availableFiles.length === 0) {
        console.error('No available images to post.');
        return null;
    }

    const randomIndex = Math.floor(Math.random() * availableFiles.length);
    const selectedImage = availableFiles[randomIndex];

    // Update recent images history
    recentImages.push(selectedImage);
    if (recentImages.length > imageHistory) {
        recentImages.shift();
    }

    return path.join(downloadsDir, selectedImage);
};

module.exports = { downloadImage, getRandomImage };
