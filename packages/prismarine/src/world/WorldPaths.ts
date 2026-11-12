/** The save-folder child that holds player JSON when the provider has no player storage. */
export const PLAYER_DATA_FOLDER = 'playerdata';

/**
 * Characters a player key may not carry into a file name as they are: path separators, the
 * characters Windows refuses in a name, `%` (the escape itself), and control characters.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to match control characters.
const UNSAFE_FILE_NAME_CHARACTERS = /[\u0000-\u001F\u007F/\\:*?"<>|%]/g;

/**
 * The file a player key is stored in under {@link PLAYER_DATA_FOLDER}.
 *
 * The key is a XUID or, for an offline player, the display name the client chose, and a name
 * such as `../../config` used to name a file outside the folder. Every character that could
 * leave the folder or that a file system refuses is written as `%` and its code point in hex,
 * so the result is always one file name in that folder, and two keys never share one. A key of
 * digits or an ordinary gamertag is unchanged, so existing files keep their names.
 *
 * @param key - The player's key.
 * @returns The file name, `.json` included.
 */
export const playerDataFileName = (key: string): string =>
    `${key.replace(UNSAFE_FILE_NAME_CHARACTERS, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}.json`;
