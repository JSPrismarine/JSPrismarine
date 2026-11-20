import { fallbackFace, type Typeface } from './typefaces.ts';

/** How a run of text is set: its typeface, size in pixels, tracking in em and line height as a factor. */
export interface TextSetting {
    face: Typeface;
    size: number;
    tracking: number;
    lineHeight: number;
}

/** Text set on lines that `fitText` measured, so the card draws exactly these breaks. */
export interface FittedText {
    size: number;
    lines: string[];
    /** Whether nothing fit and the last line ends in an ellipsis. */
    truncated: boolean;
}

const ellipsis = '…';

/**
 * The width of a line in pixels, with satori's tracking after every character. A character the face
 * lacks is measured in the first card font that has it, as satori draws it from that font.
 */
export function measure(text: string, { face, size, tracking }: Omit<TextSetting, 'lineHeight'>) {
    let ems = 0;
    let characters = 0;
    for (const character of text) {
        const codePoint = character.codePointAt(0) ?? 0;
        const { metrics } = face.metrics.covers(codePoint) ? face : (fallbackFace(codePoint) ?? face);
        ems += metrics.advance(codePoint) / metrics.unitsPerEm;
        characters++;
    }
    return ems * size + tracking * size * characters;
}

/**
 * The places a word too long for a line may break: between a lowercase letter or digit and a capital,
 * so `ClientboundOnlineMusicPlaybackResponsePacket` splits between its words, and after a `/`, `.`,
 * `_` or `-`, so a package name splits after its scope.
 */
const breakPoints = /(?<=[a-z0-9])(?=[A-Z])|(?<=[/._-])(?=.)/;

/** The fewest characters a word broken with a hyphen leaves on a line beside other words. */
const minimumBrokenPart = 2;

/**
 * Breaks text into lines no wider than `width` where it can: at spaces, and inside a word only when it
 * does not fit on a line of its own. A piece with no break point that is wider than a line stays
 * whole, so it does not fit, unless `hyphenate` breaks it between characters with a hyphen.
 */
function wrap(text: string, setting: Omit<TextSetting, 'lineHeight'>, width: number, hyphenate: boolean) {
    const lines: string[] = [];
    let line = '';
    const place = (piece: string, glue: string) => {
        const joined = line ? `${line}${glue}${piece}` : piece;
        if (!line || measure(joined, setting) <= width) line = joined;
        else {
            lines.push(line);
            line = piece;
        }
    };
    const breakApart = (piece: string, firstGlue: string) => {
        let rest = [...piece];
        let glue = firstGlue;
        while (measure(rest.join(''), setting) > width) {
            const prefix = line ? `${line}${glue}` : '';
            let take = 0;
            while (take < rest.length - 1 && measure(`${prefix}${rest.slice(0, take + 1).join('')}-`, setting) <= width)
                take++;
            if (prefix && take < minimumBrokenPart) {
                lines.push(line);
                line = '';
                glue = '';
                continue;
            }
            lines.push(`${prefix}${rest.slice(0, Math.max(take, 1)).join('')}-`);
            line = '';
            glue = '';
            rest = rest.slice(Math.max(take, 1));
        }
        place(rest.join(''), glue);
    };
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const pieces = measure(word, setting) <= width ? [word] : word.split(breakPoints);
        pieces.forEach((piece, index) => {
            const glue = index === 0 ? ' ' : '';
            if (hyphenate && measure(piece, setting) > width) breakApart(piece, glue);
            else place(piece, glue);
        });
    }
    if (line) lines.push(line);
    return lines;
}

/** Ends a line in an ellipsis within `width`, dropping whole words first and trailing punctuation with them. */
function ellipsize(text: string, setting: Omit<TextSetting, 'lineHeight'>, width: number) {
    const fits = (candidate: string) => measure(`${candidate}${ellipsis}`, setting) <= width;
    let cut = text.trimEnd();
    while (cut.includes(' ') && !fits(cut)) cut = cut.replace(/\s+\S*$/, '');
    const characters = [...cut];
    while (characters.length > 1 && !fits(characters.join(''))) characters.pop();
    return `${characters.join('').replace(/[\s,;:.-]+$/, '')}${ellipsis}`;
}

/** Cuts one line to `width` with an ellipsis, or returns it as it is when it fits. */
export function clip(text: string, setting: Omit<TextSetting, 'lineHeight'>, width: number) {
    return measure(text, setting) <= width ? text : ellipsize(text, setting, width);
}

/**
 * Moves the last word of the line before up to a last line that holds one word alone, when it fits
 * there, so a paragraph does not end on a widow.
 */
function avoidWidow(lines: string[], setting: Omit<TextSetting, 'lineHeight'>, width: number) {
    const last = lines.at(-1) ?? '';
    const before = lines.at(-2) ?? '';
    const moved = /^(.*\S)\s+(\S+)$/.exec(before);
    if (lines.length < 2 || last.includes(' ') || !moved || !moved[1].includes(' ')) return lines;
    const pulled = `${moved[2]} ${last}`;
    return measure(pulled, setting) <= width ? [...lines.slice(0, -2), moved[1], pulled] : lines;
}

/** What `fitText` may use: the sizes to try, largest first, and the box to fill. */
export interface FitOptions extends Omit<TextSetting, 'size'> {
    sizes: readonly number[];
    width: number;
    maxLines: number;
    /** The height the lines may take, which can allow fewer lines than `maxLines` at a large size. */
    maxHeight?: number;
    /**
     * Sets text that fits on several lines on one instead, at the size that fills the width, when that
     * size is at least this share of the size the lines would take. An identifier reads best unbroken.
     */
    preferOneLine?: number;
    /** Keeps the last line from holding one word alone. */
    avoidWidows?: boolean;
}

/**
 * Sets text at the largest of `sizes` at which it fits the box. When it fits at none, it takes the
 * smallest size, breaks a word too long for a line between characters with a hyphen, and keeps as many
 * lines as the box holds. Only the last of them ends in an ellipsis, and only when lines are left
 * over, so text never runs off a card.
 */
export function fitText(
    text: string,
    {
        sizes,
        width,
        maxLines,
        maxHeight = Number.POSITIVE_INFINITY,
        preferOneLine,
        avoidWidows = false,
        ...setting
    }: FitOptions
): FittedText {
    const linesAt = (size: number) =>
        Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (size * setting.lineHeight))));
    const finish = (size: number, lines: string[]) => ({
        size,
        lines: avoidWidows ? avoidWidow(lines, { ...setting, size }, width) : lines,
        truncated: false
    });
    for (const size of sizes) {
        const sized = { ...setting, size };
        const lines = wrap(text, sized, width, false);
        if (lines.length > linesAt(size) || lines.some((line) => measure(line, sized) > width)) continue;
        if (preferOneLine !== undefined && lines.length > 1) {
            // Width grows in step with size, so the size that fills the width is one division away.
            const oneLine = Math.floor(width / measure(text, { ...setting, size: 1 }));
            if (oneLine >= size * preferOneLine)
                return { size: Math.min(oneLine, size), lines: [text], truncated: false };
        }
        return finish(size, lines);
    }
    const size = sizes.at(-1) ?? 16;
    const sized = { ...setting, size };
    const all = wrap(text, sized, width, true);
    const room = linesAt(size);
    if (all.length <= room) return finish(size, all);
    const lines = all.slice(0, room);
    lines[room - 1] = ellipsize(lines[room - 1] ?? '', sized, width);
    return { size, lines, truncated: true };
}
