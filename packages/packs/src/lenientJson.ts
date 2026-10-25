/**
 * Error thrown when a pack file is not valid JSON even after comments and
 * trailing commas are removed.
 */
export class JsonParseError extends Error {
    public override name = 'JsonParseError';
}

/**
 * Parses JSON the way the Bedrock engine reads pack files: line and block
 * comments and trailing commas before `]` or `}` are accepted. Vanilla trade
 * tables and root definition files use both.
 *
 * Strict JSON is tried first and is the same answer the cleanup would reach.
 * Outside a string, valid JSON holds no `/` to start a comment and no comma
 * before a `]` or `}`, so neither pass can touch a text `JSON.parse` already
 * accepts. It is worth the extra attempt because the cleanup rewrites the
 * whole text character by character twice over, and 8486 of the 8556 files in
 * the composed vanilla Bedrock stack are strict JSON.
 *
 * @throws {JsonParseError} When the text is not JSON after lenient cleanup.
 */
export const parseLenientJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        // A comment, a trailing comma, or a genuine syntax error. The cleanup
        // below tells them apart and reports the ones it cannot fix.
    }

    try {
        return JSON.parse(stripTrailingCommas(stripComments(text))) as unknown;
    } catch (error) {
        throw new JsonParseError(error instanceof Error ? error.message : String(error));
    }
};

const isWhitespace = (char: string): boolean => ' \t\r\n'.includes(char);

/**
 * Replaces comments with spaces, leaving strings untouched. Replacing rather
 * than deleting keeps JSON.parse error positions close to the original text.
 */
const stripComments = (text: string): string => {
    const out = text.split('');
    let inString = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (char === '\\') i++;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') out[i++] = ' ';
            continue;
        }

        if (char === '/' && text[i + 1] === '*') {
            out[i] = ' ';
            out[i + 1] = ' ';
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                if (text[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < text.length) {
                out[i] = ' ';
                out[i + 1] = ' ';
                i++;
            }
        }
    }

    return out.join('');
};

/**
 * Replaces a comma with a space when the next non-whitespace character closes
 * an array or object. Runs after comment stripping, so only whitespace can
 * separate the comma from the closing bracket.
 */
const stripTrailingCommas = (text: string): string => {
    const out = text.split('');
    let inString = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (char === '\\') i++;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === ',') {
            let j = i + 1;
            while (j < text.length && isWhitespace(text[j]!)) j++;
            const next = text[j];
            if (next === ']' || next === '}') out[i] = ' ';
        }
    }

    return out.join('');
};
