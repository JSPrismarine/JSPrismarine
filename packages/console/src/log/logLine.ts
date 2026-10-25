import type { LogLevel } from '@jsprismarine/logger';
import type { TextChunk } from '@opentui/core';
import { parseColor, StyledText, TextAttributes } from '@opentui/core';
import { columns, sliceColumns } from '../text';
import { LEVEL_TOKEN_WIDTH, levelToken, plainChunk, styleMinecraftText } from '../theme/styled';
import type { Theme } from '../theme/theme';
import type { StoredRecord } from './types';

/**
 * How the level column is drawn: `full` pads level names to the longest one, `short` uses the
 * one-letter tokens the UX design specifies below 100 columns.
 */
export type LevelStyle = 'full' | 'short';

/** Layout and styling inputs for {@link formatLogLine}. */
export interface LogLineOptions {
    /** Columns available for the row. */
    width: number;
    /** Wrap the message on word boundaries instead of truncating it with an ellipsis. */
    wrap: boolean;
    /** Show the fixed-width namespace column. */
    showNamespace: boolean;
    levelStyle: LevelStyle;
    /** Resolved theme for colors and `§` codes. */
    theme: Theme;
    /** Search query to mark inside the message, matched without regard to case. */
    highlight?: string;
}

/** Characters in the namespace column, before the space that separates it from the message. */
export const NAMESPACE_WIDTH = 12;

const ELLIPSIS = '…';
const RULE = '─';

/** Formats a timestamp in milliseconds as `HH:mm:ss` local time. */
export function formatTime(at: number): string {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Formats one stored record as the rows a log pane paints.
 *
 * Log records get a time column, a level token in the level's color, an optional namespace
 * column, and the message with `§` codes mapped through the theme. Separators render as a rule
 * across the width with the generation appended to the reason; raw child output is muted and
 * prefixed by its stream; dropped notices show the store's message in the warning color. With
 * `wrap` off a long message ends in an ellipsis and the result is one row; with it on,
 * continuation rows are indented to the message column. Widths are measured in code points.
 */
export function formatLogLine(record: StoredRecord, options: LogLineOptions): StyledText[] {
    const width = Math.max(1, options.width);
    switch (record.kind) {
        case 'separator':
            return [separatorRow(record, width, options.theme)];
        case 'raw':
            return layout(
                [
                    plainChunk(`${formatTime(record.at)} `, options.theme, 'textMuted'),
                    plainChunk(`${record.stream.padEnd(levelWidth(options))} `, options.theme, 'textMuted')
                ],
                [plainChunk(record.message, options.theme, 'textMuted')],
                width,
                options
            );
        case 'dropped':
            return layout(
                [plainChunk(`${formatTime(record.at)} `, options.theme, 'textMuted')],
                [plainChunk(record.message, options.theme, 'warning', TextAttributes.BOLD)],
                width,
                options
            );
        case 'log': {
            const token = levelToken(record.level, options.theme);
            const prefix: TextChunk[] = [
                plainChunk(`${formatTime(record.at)} `, options.theme, 'textMuted'),
                { ...token, text: `${levelText(record.level, options)} ` }
            ];
            if (options.showNamespace) {
                prefix.push(plainChunk(`${fit(record.namespace, NAMESPACE_WIDTH)} `, options.theme, 'textMuted'));
            }
            let message = styleMinecraftText(record.message, options.theme).chunks;
            if (options.highlight) message = highlightChunks(message, options.highlight, options.theme);
            return layout(prefix, message, width, options);
        }
    }
}

function levelWidth(options: LogLineOptions): number {
    return options.levelStyle === 'full' ? LEVEL_TOKEN_WIDTH : 1;
}

function levelText(level: LogLevel, options: LogLineOptions): string {
    const upper = level.toUpperCase();
    return options.levelStyle === 'full' ? upper.padEnd(LEVEL_TOKEN_WIDTH) : upper.charAt(0);
}

function fit(text: string, width: number): string {
    const used = columns(text);
    if (used <= width) return text + ' '.repeat(width - used);
    return `${sliceColumns(text, 0, Math.max(0, width - 1))}${ELLIPSIS}`;
}

function separatorRow(record: StoredRecord, width: number, theme: Theme): StyledText {
    const label = ` ${formatTime(record.at)} ${record.message} (generation ${record.generation}) `;
    const lead = RULE.repeat(3);
    const tail = RULE.repeat(Math.max(3, width - columns(lead) - columns(label)));
    const row = fit(`${lead}${label}${tail}`, width);
    return new StyledText([plainChunk(row, theme, 'textMuted')]);
}

function layout(prefix: TextChunk[], message: TextChunk[], width: number, options: LogLineOptions): StyledText[] {
    const prefixWidth = chunkColumns(prefix);
    const available = width - prefixWidth;
    if (available < 1) {
        return [new StyledText(sliceChunks(prefix, 0, width))];
    }
    const plain = message.map((chunk) => chunk.text).join('');
    if (!options.wrap) {
        const body =
            columns(plain) <= available
                ? message
                : [...sliceChunks(message, 0, available - 1), plainChunk(ELLIPSIS, options.theme, 'textMuted')];
        return [new StyledText([...prefix, ...body])];
    }
    const indent = plainChunk(' '.repeat(prefixWidth), options.theme);
    return wrapRanges([...plain], available).map(
        ([start, end], index) =>
            new StyledText([index === 0 ? prefix : [indent], sliceChunks(message, start, end)].flat())
    );
}

/** Splits code points into `[start, end)` ranges of at most `width` columns, breaking at spaces. */
function wrapRanges(points: readonly string[], width: number): [number, number][] {
    const ranges: [number, number][] = [];
    let start = 0;
    while (points.length - start > width) {
        const limit = start + width;
        const space = points.lastIndexOf(' ', limit);
        if (space > start) {
            ranges.push([start, space]);
            start = space + 1;
        } else {
            ranges.push([start, limit]);
            start = limit;
        }
    }
    ranges.push([start, points.length]);
    return ranges;
}

function chunkColumns(chunks: readonly TextChunk[]): number {
    return chunks.reduce((sum, chunk) => sum + columns(chunk.text), 0);
}

/** The chunks covering columns `[start, end)` of the joined text, cut at the edges. */
function sliceChunks(chunks: readonly TextChunk[], start: number, end: number): TextChunk[] {
    const result: TextChunk[] = [];
    let position = 0;
    for (const chunk of chunks) {
        const chunkStart = position;
        const chunkEnd = position + columns(chunk.text);
        position = chunkEnd;
        if (chunkEnd <= start || chunkStart >= end) continue;
        const text = sliceColumns(chunk.text, Math.max(0, start - chunkStart), Math.min(chunkEnd, end) - chunkStart);
        if (text.length > 0) result.push({ ...chunk, text });
    }
    return result;
}

function highlightChunks(chunks: readonly TextChunk[], query: string, theme: Theme): TextChunk[] {
    const needle = query.toLowerCase();
    const selection = parseColor(theme.selection);
    const result: TextChunk[] = [];
    for (const chunk of chunks) {
        const lower = chunk.text.toLowerCase();
        let cursor = 0;
        let hit = lower.indexOf(needle);
        while (hit !== -1) {
            if (hit > cursor) result.push({ ...chunk, text: chunk.text.slice(cursor, hit) });
            result.push({ ...chunk, text: chunk.text.slice(hit, hit + needle.length), bg: selection });
            cursor = hit + needle.length;
            hit = lower.indexOf(needle, cursor);
        }
        if (cursor < chunk.text.length) result.push({ ...chunk, text: chunk.text.slice(cursor) });
    }
    return result;
}
