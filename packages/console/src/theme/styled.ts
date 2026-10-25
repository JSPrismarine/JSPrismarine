import type { ColorInput, TextChunk } from '@opentui/core';
import { parseColor, StyledText, TextAttributes } from '@opentui/core';
import {
    isMinecraftColorCode,
    isMinecraftFormatCode,
    MINECRAFT_FORMATS,
    MINECRAFT_RESET_CODE
} from './minecraftColors';
import type { LevelRole, Theme, ThemeRole } from './theme';
import { LEVEL_ROLES } from './theme';

const CODE_PREFIX = '§';

/**
 * Width of every level token, so level columns align across lines.
 */
export const LEVEL_TOKEN_WIDTH = Math.max(...LEVEL_ROLES.map((level) => level.length));

/**
 * Attributes that emphasize a level without color: errors and warnings stand
 * out in bold, the verbose levels and supervisor notices recede in dim.
 */
const LEVEL_ATTRIBUTES: Readonly<Record<LevelRole, number>> = {
    error: TextAttributes.BOLD,
    warn: TextAttributes.BOLD,
    info: TextAttributes.NONE,
    verbose: TextAttributes.DIM,
    debug: TextAttributes.DIM,
    silly: TextAttributes.DIM,
    dev: TextAttributes.DIM
};

const chunk = (text: string, fg: ColorInput, attributes: number): TextChunk => ({
    __isChunk: true,
    text,
    fg: parseColor(fg),
    attributes
});

/**
 * Builds one styled chunk from a theme role.
 *
 * @param role - Theme role for the foreground; defaults to `text`.
 * @param attributes - `TextAttributes` bit mask; defaults to none.
 */
export function plainChunk(
    text: string,
    theme: Theme,
    role: ThemeRole = 'text',
    attributes: number = TextAttributes.NONE
): TextChunk {
    return chunk(text, theme[role], attributes);
}

/**
 * Builds the level column for a log line: the level in upper case, padded to
 * `LEVEL_TOKEN_WIDTH`, in the level's theme color and emphasis attributes.
 */
export function levelToken(level: LevelRole, theme: Theme): TextChunk {
    return chunk(level.toUpperCase().padEnd(LEVEL_TOKEN_WIDTH), theme[level], LEVEL_ATTRIBUTES[level]);
}

/**
 * Converts text with Minecraft `§` codes into styled chunks.
 *
 * Color codes set the foreground from the theme's chat palette; format codes
 * add bold, italic, underline, or strikethrough; `§k` renders as plain text;
 * `§r` returns to the `text` role with no attributes. Formatting survives a
 * color code, as it does on Bedrock. A `§` followed by an unknown character or
 * nothing stays in the text. Codes are lower case only, matching the server's
 * console parser.
 */
export function styleMinecraftText(text: string, theme: Theme): StyledText {
    const chunks: TextChunk[] = [];
    let fg: ColorInput = theme.text;
    let attributes: number = TextAttributes.NONE;
    let pending = '';

    const flush = () => {
        if (pending.length === 0) return;
        chunks.push(chunk(pending, fg, attributes));
        pending = '';
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const code = text[index + 1];
        if (character !== CODE_PREFIX || code === undefined) {
            pending += character;
            continue;
        }
        if (isMinecraftColorCode(code)) {
            flush();
            fg = theme.chat[code];
        } else if (isMinecraftFormatCode(code)) {
            flush();
            attributes |= MINECRAFT_FORMATS[code];
        } else if (code === MINECRAFT_RESET_CODE) {
            flush();
            fg = theme.text;
            attributes = TextAttributes.NONE;
        } else {
            pending += character;
            continue;
        }
        index += 1;
    }
    flush();

    return new StyledText(chunks);
}
