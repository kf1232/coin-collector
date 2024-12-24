const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const COLLECTION_FILE = path.join(__dirname, 'collectionData.json');

/**
 * Loads the current collection data from the JSON file.
 * Creates the file if it doesn't exist.
 * @returns {Object} Collection data.
 */
const loadCollection = () => {
    if (!fs.existsSync(COLLECTION_FILE)) {
        fs.writeFileSync(COLLECTION_FILE, JSON.stringify({}, null, 2));
        console.log('Created new collection file.');
    }
    return JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf8'));
};

/**
 * Saves the collection data to the JSON file.
 * @param {Object} collectionData - The collection data to save.
 */
const saveCollection = (collectionData) => {
    fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collectionData, null, 2));
    console.log('Collection file updated.');
};

/**
 * Downloads an image from the given URL and saves it to the specified directory.
 * @param {string} url - The URL of the image.
 * @param {string} directory - The directory to save the image.
 * @returns {string} The unique file path of the downloaded image.
 */
const downloadImage = async (url, directory) => {
    const parsedUrl = new URL(url);
    const fileExtension = path.extname(parsedUrl.pathname);
    const baseName = path.basename(parsedUrl.pathname, fileExtension);
    const uniqueFilename = `${baseName}_${Date.now()}_${uuidv4()}${fileExtension}`;
    const uniqueFilepath = path.join(directory, uniqueFilename);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(uniqueFilepath, buffer);
    console.log(`Downloaded image to: ${uniqueFilepath}`);
    return uniqueFilepath;
};

/**
 * Adds an image to the collection. Removes duplicates if found.
 * @param {string} imageName - The name of the image.
 * @param {string} url - The URL of the image.
 * @param {string} directory - The directory to save the image.
 */
const addImage = async (imageName, url, directory) => {
    const collection = loadCollection();
    const imageFilePath = await downloadImage(url, directory);

    // Check for duplicate
    for (const [id, entry] of Object.entries(collection)) {
        if (entry.imageFileName === path.basename(imageFilePath)) {
            console.log(`Duplicate found. Deleting new file: ${imageFilePath}`);
            fs.unlinkSync(imageFilePath);
            return;
        }
    }

    const imageId = uuidv4();
    collection[imageId] = { imageName, imageFileName: path.basename(imageFilePath) };
    saveCollection(collection);
    console.log(`Added image "${imageName}" to collection.`);
};

/**
 * Removes an image from the collection and deletes the file.
 * @param {string} imageId - The ID of the image to remove.
 * @param {string} directory - The directory containing the image files.
 */
const removeImage = (imageId, directory) => {
    const collection = loadCollection();

    if (collection[imageId]) {
        const { imageFileName } = collection[imageId];
        const filePath = path.join(directory, imageFileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted image file: ${imageFileName}`);
        }

        delete collection[imageId];
        saveCollection(collection);
        console.log(`Removed image with ID: ${imageId} from collection.`);
    } else {
        console.log(`Image with ID: ${imageId} not found.`);
    }
};

/**
 * Retrieves a random image file path from the specified directory.
 * Excludes recently used files.
 * @param {string} directory - The directory to scan for images.
 * @param {Set<string>} excludeSet - A Set of filenames to exclude.
 * @returns {string|null} A random image file path or null.
 */
const getRandomImage = (directory, excludeSet = new Set()) => {
    const files = fs.readdirSync(directory).filter((file) => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    const availableFiles = files.filter((file) => !excludeSet.has(file));
    if (availableFiles.length === 0) return null;

    const randomFile = availableFiles[Math.floor(Math.random() * availableFiles.length)];
    return path.join(directory, randomFile);
};

module.exports = { loadCollection, saveCollection, addImage, removeImage, getRandomImage };
