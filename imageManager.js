const fs = require('fs');
const path = require('path');
const { imageHistory } = require('./config.json');
const { v4: uuidv4 } = require('uuid');

/**
 * Downloads an image from the given URL and saves it to the specified file path.
 * @param {string} url - The URL of the image to download.
 * @param {string} filepath - The file path where the image should be saved.
 * @param {Object} message - The Discord message object (used for reactions).
 */
const downloadImage = async (url, filepath, message) => {
    try {
        const parsedUrl = new URL(url);
        const fileExtension = path.extname(parsedUrl.pathname);
        const baseName = path.basename(parsedUrl.pathname, fileExtension);
        const uniqueFilename = `${baseName}_${Date.now()}_${uuidv4()}${fileExtension}`;
        const uniqueFilepath = path.join(path.dirname(filepath), uniqueFilename);

        console.log(`Downloading image from: ${url}`);
        console.log(`Saving image as: ${uniqueFilepath}`);

        if (fs.existsSync(uniqueFilepath)) {
            console.log(`File already exists: ${uniqueFilepath}`);
            await message.react('✅');
            return;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        fs.writeFileSync(uniqueFilepath, buffer);
        console.log(`Image downloaded successfully: ${uniqueFilepath}`);
        await message.react('✅');
    } catch (error) {
        console.error(`Error downloading image from ${url}: ${error.message}`);
        await message.react('⚠️');
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
    const files = fs.readdirSync(downloadsDir).filter((file) =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );

    const availableFiles = files.filter((file) => !recentImages.includes(file));
    if (availableFiles.length === 0) {
        console.error('No available images to post.');
        return null;
    }

    const randomIndex = Math.floor(Math.random() * availableFiles.length);
    const selectedImage = availableFiles[randomIndex];

    recentImages.push(selectedImage);
    if (recentImages.length > imageHistory) {
        recentImages.shift();
    }

    return path.join(downloadsDir, selectedImage);
};

module.exports = { downloadImage, getRandomImage };
