import { fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

import type { Theme } from '../theme/theme';
import { tpsTone } from './plotGraph';
import type { GraphTone } from './plotGraph';

/** Bar heights from lowest to highest. */
const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

/** One column of a sparkline: the bar's height, from 0 to 7, and the tone of its reading. */
export interface SparkCell {
    level: number;
    tone: GraphTone;
}

/** The value range the bars cover and how many columns there are room for. */
export interface SparklineOptions {
    columns: number;
    min: number;
    /** The top of the range, which is also the tick rate that colors the bars. */
    max: number;
}

/**
 * Draws the newest readings as one row of bars, oldest on the left. A reading at or above `max`
 * is a full bar and one at or below `min` the lowest, so a healthy server is a solid line rather
 * than the faint top edge of a braille plot. Fewer readings than columns give a shorter row.
 */
export function sparkline(values: readonly number[], { columns, min, max }: SparklineOptions): SparkCell[] {
    // `slice(-0)` is the whole array, so no room has to mean no bars explicitly.
    if (columns <= 0) return [];
    const span = max - min;
    return values.slice(-columns).map((value) => {
        const share = span > 0 ? (value - min) / span : 1;
        const level = Math.round(Math.min(1, Math.max(0, share)) * (BARS.length - 1));
        return { level, tone: tpsTone(value, max) };
    });
}

/** Colors a sparkline, one chunk per run of bars that share a tone. */
export function sparklineChunks(cells: readonly SparkCell[], theme: Theme): TextChunk[] {
    const chunks: TextChunk[] = [];
    let run = '';
    let tone: GraphTone | undefined;
    for (const cell of cells) {
        if (cell.tone !== tone && run !== '' && tone !== undefined) {
            chunks.push(fg(theme[tone])(run));
            run = '';
        }
        tone = cell.tone;
        run += BARS[cell.level] ?? BARS[0];
    }
    if (run !== '' && tone !== undefined) chunks.push(fg(theme[tone])(run));
    return chunks;
}
