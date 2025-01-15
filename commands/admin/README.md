# Admin Commands User Guide

This guide provides detailed instructions for using the admin commands available in your Discord bot. These commands include `/whitelist`, `/unsorted`, `/lookup`, and `/hidden`. They help manage image datasets for your Discord server by handling whitelisted, hidden, and unsorted images.

---

## Command: `/whitelist`

### Purpose
View a paginated list of whitelisted images for a specific guild.

### Usage
```
/whitelist @guildID
```

### Features
- **Pagination**: Displays 10 images per page.
- **Dynamic Navigation**: Navigate through pages using buttons (`⬅️` and `➡️`).
- **Image Attachments**: Includes attached images for easy reference.

### Workflow
1. **Run the Command**: Type `/whitelist @guildID` in the Discord chat.
2. **View the Response**: The bot replies with a list of up to 10 whitelisted images and navigation buttons.
3. **Navigate Pages**: Use the `⬅️` and `➡️` buttons to move between pages.
4. **Session Timeout**: The session times out after 60 seconds, removing navigation buttons.

### Notes
- If no whitelisted images are found, the bot responds with "No whitelisted images found for this guild."
- Images are sourced from `../../data/whitelist.json`.

---

## Command: `/unsorted`

### Purpose
Display and sort unsorted images for a specific guild.

### Usage
```
/unsorted @guildID
```

### Features
- **Image Selection**: Displays up to 5 unsorted images at a time.
- **User Reactions**:
  - ✅: Add all displayed images to the whitelist.
  - ❌: Add all displayed images to the hidden list.
  - 1️⃣, 2️⃣, etc.: Select specific images for sorting.
- **Image Attachments**: Provides visual context with attached images.

### Workflow
1. **Run the Command**: Type `/unsorted @guildID` in the Discord chat.
2. **View the Response**: The bot responds with up to 5 unsorted images and reaction options.
3. **React to Sort**:
   - ✅ to whitelist the images.
   - ❌ to hide the images.
   - 1️⃣, 2️⃣, etc., to select individual images for action.
4. **Dynamic Updates**: The bot dynamically updates the list and reactions as actions are performed.
5. **Session Timeout**: The session times out after 5 minutes, removing reactions.

### Notes
- Unsorted images are derived from the `../../downloads` directory.
- Updates are saved to `../../data/whitelist.json`.

---

## Command: `/lookup`

### Purpose
Retrieve and display a specific image by its ID.

### Usage
```
/lookup <imageID>
```

### Features
- Fetches a specific image based on its ID.
- Responds with the image as an attachment.

### Workflow
1. **Run the Command**: Type `/lookup <imageID>` in the Discord chat.
2. **Image Search**:
   - The bot searches for the specified image in the `../../downloads` directory.
3. **Receive Response**:
   - If found, the bot replies with the image attached.
   - If not found, the bot responds with "Image with ID `<imageID>` not found."

### Notes
- Ensure the image ID matches the file name (e.g., `image123.jpg`).

---

## Command: `/hidden`

### Purpose
View a paginated list of hidden images for a specific guild.

### Usage
```
/hidden @guildID
```

### Features
- **Pagination**: Displays 10 hidden images per page.
- **Dynamic Navigation**: Navigate between pages using buttons (`⬅️` and `➡️`).
- **Image Attachments**: Includes attached images for visual reference.

### Workflow
1. **Run the Command**: Type `/hidden @guildID` in the Discord chat.
2. **View the Response**: The bot replies with a list of up to 10 hidden images and navigation buttons.
3. **Navigate Pages**: Use the `⬅️` and `➡️` buttons to navigate through pages.
4. **Session Timeout**: The session times out after 60 seconds, removing navigation buttons.

### Notes
- If no hidden images are found, the bot responds with "No hidden images found for this guild."
- Hidden images are sourced from `../../data/whitelist.json`.

---

## General Notes
- **File and Directory Setup**:
  - Ensure that the `../../data/whitelist.json` file and the `../../downloads` directory are properly configured and accessible.
- **Timeouts**:
  - Each command's session includes a timeout for security and resource efficiency.
- **Logging**:
  - All actions, such as adding to the whitelist or hidden list, are logged via the `logEvent` function for traceability.

---

For further assistance or troubleshooting, consult the project's documentation or contact the system administrator.
