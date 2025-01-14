const path = require('path');
const winston = require('winston');

// Define log file paths
const logFilePaths = {
    TOYS: path.join(__dirname, 'toyLog.txt'),
    COIN: path.join(__dirname, 'pointsLog.txt'),
    SYSTEM: path.join(__dirname, 'systemLog.txt'),
    DOWNLOAD: path.join(__dirname, 'downloadLog.txt'),
    COLLECT: path.join(__dirname, 'collectionLog.txt'),
    FILE: path.join(__dirname, 'fileLog.txt')
};

// Create individual loggers for each log file
const loggers = Object.entries(logFilePaths).reduce((acc, [key, filePath]) => {
    acc[key] = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message }) => `${timestamp} | ${level.toUpperCase()} | ${message}`)
        ),
        transports: [
            new winston.transports.File({ filename: filePath, level: 'info' }),
            new winston.transports.Console(), // Optional: Also log to the console
        ],
    });
    return acc;
}, {});

/**
 * Logs an event to the appropriate log file and console.
 * @param {string} file - The log file identifier (e.g., 'TOYS', 'COIN').
 * @param {string} status - The log level (e.g., 'info', 'warn', 'error').
 * @param {string} message - The message to log.
 */
const logEvent = (file, status, message) => {
    const logger = loggers[file];
    if (!logger) {
        console.error(`Invalid log file identifier: ${file}`);
        return;
    }

    logger.log({
        level: status.toLowerCase(),
        message,
    });
};

module.exports = {
    logEvent,
};