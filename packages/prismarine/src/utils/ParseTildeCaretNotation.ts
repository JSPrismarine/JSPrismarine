import type { Entity } from '../entity/Entity';

/**
 * Reads one coordinate written as a plain number.
 *
 * `Number()` rather than `parseFloat()`, so `1abc` is refused instead of being read as `1`.
 * Infinity is refused as well, since no position can hold it.
 *
 * @param input - The raw text of the coordinate, after any `~` or `^` has been removed.
 * @param original - The text as the user wrote it, for the error message.
 * @throws Error when the text is empty or does not name a finite number.
 */
const readNumber = (input: string, original = input): number => {
    const value = input.trim() === '' ? Number.NaN : Number(input);
    if (!Number.isFinite(value)) throw new Error(`Expected a coordinate, got "${original}"`);
    return value;
};

/**
 * Reads one coordinate that must be an absolute number, as the console has no position to be
 * relative to.
 *
 * @throws Error when the text is not a finite number.
 */
export const parseAbsoluteCoordinate = (input: string): number => readNumber(input);

/**
 * Reads one coordinate as a command writes it: an absolute number, or `~` and `^` with an
 * optional offset, resolved against the source entity.
 *
 * @throws Error when the text is not a coordinate, such as a player name or an empty string.
 */
const ParseTildeCaretNotation = ({
    input,
    type,
    source
}: {
    input: string;
    type: 'x' | 'y' | 'z';
    source: Entity;
}): number => {
    if (!input.startsWith('~') && !input.startsWith('^')) return readNumber(input);

    const offset = readNumber(input.slice(1) || '0', input);

    switch (input[0]) {
        case '~': {
            const position = source.getPosition();
            const base = type === 'x' ? position.getX() : type === 'y' ? position.getY() : position.getZ();
            return base + offset;
        }
        case '^':
            // FIXME: `^` should be relative to where the source is looking, not to the origin.
            return offset;
        default:
            throw new Error(`invalid input`);
    }
};

export default ParseTildeCaretNotation;
