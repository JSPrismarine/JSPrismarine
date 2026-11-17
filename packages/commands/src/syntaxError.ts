import { CommandSyntaxException } from '@jsprismarine/brigadier';

/** How many characters of the command line BDS shows on each side of the token it could not read. */
const CONTEXT = 10;

const isSpace = (character: string | undefined): boolean => character !== undefined && /\s/.test(character);

/**
 * Words a parse error the way the Bedrock Dedicated Server does, from the console and in chat:
 * `Syntax error: Unexpected "nonsense": at "/time set >>nonsense<<"`. The token is the word at
 * the error, or nothing when the line ended before the command did, and up to ten characters of
 * the line stand on each side of it.
 *
 * @param error - The exception the dispatcher threw.
 * @param leading - What BDS shows before the line the dispatcher read, which is `/` for a line
 *   typed in chat or at the console.
 * @returns The message, or `undefined` when the exception does not point into a command line,
 *   such as a refusal a command's body threw.
 */
export const bedrockSyntaxError = (error: CommandSyntaxException, leading = '/'): string | undefined => {
    const input = error.getInput();
    const cursor = error.getCursor();
    if (input === null || cursor < 0) return undefined;

    let start = Math.min(cursor, input.length);
    // An argument type that read part of its token before refusing it leaves the cursor inside or
    // after the word. BDS names the whole word, so back up to where it starts. The dispatcher's
    // unknown command at the end of the line is the one error that names nothing.
    const incomplete = error.getType() === CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand();
    if (!incomplete) while (start > 0 && !isSpace(input[start - 1])) start--;

    let end = start;
    while (end < input.length && !isSpace(input[end])) end++;

    const line = leading + input;
    const offset = leading.length;
    const token = line.slice(start + offset, end + offset);
    const before = line.slice(Math.max(0, start + offset - CONTEXT), start + offset);
    const after = line.slice(end + offset, end + offset + CONTEXT);
    return `Syntax error: Unexpected "${token}": at "${before}>>${token}<<${after}"`;
};
