import { fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

import type { Theme } from '../theme/theme';
import type { PlotRow } from './plotGraph';

const BLANK_CELL = '⠀';
const GRID_CELL = '┈';

/**
 * Colors a plot row, merging neighboring cells of one tone into a single chunk. With `grid`, the
 * empty cells draw a faint dotted line so the row reads as a reference line across the plot.
 */
export function graphChunks(row: PlotRow, theme: Theme, grid = false): TextChunk[] {
    const chunks: TextChunk[] = [];
    let run = '';
    let runColor: Theme['border'] | undefined;
    const flush = (): void => {
        if (run !== '' && runColor !== undefined) chunks.push(fg(runColor)(run));
        run = '';
    };
    for (const [column, cell] of [...row.cells].entries()) {
        const tone = row.tones[column];
        const drawsGrid = grid && cell === BLANK_CELL;
        const color = drawsGrid ? theme.border : theme[tone ?? 'muted'];
        if (color !== runColor) {
            flush();
            runColor = color;
        }
        run += drawsGrid ? GRID_CELL : cell;
    }
    flush();
    return chunks;
}
