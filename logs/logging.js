const fs = require('fs');
const path = require('path');

const fileSelector = (file) => {
    if (file === 'TOYS')
        return path.join(__dirname, 'toyLog.txt');

    if (file === 'COIN')
        return path.join(__dirname, 'pointsLog.txt');

    if (file === 'SYSTEM')
        return path.join(__dirname, 'systemLog.txt');

    if (file === 'DOWNLOAD')
        return path.join(__dirname, 'downloadLog.txt');
}

const logEvent = (file, status, message) => {
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const logEntry = `${timestamp} | ${status.toUpperCase()} | ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(fileSelector(file), logEntry);
};

module.exports = {
    logEvent
}