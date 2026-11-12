/**
 * Whole terminal escape sequences: control strings (OSC, DCS, SOS, PM, APC) up to their
 * terminator, CSI sequences up to their final byte, and the two-byte escapes. Both the 7-bit
 * `ESC` forms and their 8-bit C1 equivalents are matched.
 */
const ESCAPE_SEQUENCE =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to match control characters.
    /(?:\u001B[\]PX^_]|[\u0090\u0098\u009D\u009E\u009F])[\s\S]*?(?:\u0007|\u001B\\|\u009C|$)|(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]|\u001B[ -~]/g;

/**
 * Control characters left over once sequences are gone, except tab and line feed, plus the
 * bidirectional overrides that make text display in a different order from how it reads.
 */
const CONTROL_CHARACTER =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to match control characters.
    /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/**
 * Makes text a server sent safe to print to a terminal. Removes escape sequences, which could
 * move the cursor, clear the screen, retitle the window or write a hyperlink, and the control
 * characters, such as carriage return and backspace, that could overwrite earlier output.
 *
 * Use it on remote text only, at the point it is printed; the CLI's own formatting is written
 * around it.
 *
 * @param text - Text from the server, such as a chat line or a MOTD.
 * @returns The text without escape sequences or control characters other than tab and line feed.
 */
export const terminalText = (text: string): string => text.replace(ESCAPE_SEQUENCE, '').replace(CONTROL_CHARACTER, '');
