/** Tone a graph column is drawn with, from the worst sample that lands in it. */
export type GraphTone = 'ok' | 'warning' | 'danger';

/** Ticks per second below which the server is lagging. */
export const TPS_DANGER_BELOW = 15;

/** Ticks per second below which the server is slower than its target of 20. */
export const TPS_WARNING_BELOW = 19;

/** Tick duration in milliseconds at which a 20 TPS server runs out of time. */
export const TICK_BUDGET_MS = 50;

/** Tick duration from which the status bar warns before the budget is gone. */
export const TICK_WARNING_MS = 40;

/** Colors a TPS reading: green at 19 or more, yellow from 15, red below. */
export function tpsTone(tps: number): GraphTone {
    if (tps < TPS_DANGER_BELOW) return 'danger';
    if (tps < TPS_WARNING_BELOW) return 'warning';
    return 'ok';
}

/** Colors a tick duration, or returns `undefined` while it leaves comfortable headroom. */
export function tickTone(tickMs: number): GraphTone | undefined {
    if (tickMs >= TICK_BUDGET_MS) return 'danger';
    if (tickMs >= TICK_WARNING_MS) return 'warning';
    return undefined;
}

/** Value range the vertical axis covers and the size of the plot in terminal cells. */
export interface PlotOptions {
    columns: number;
    rows: number;
    min: number;
    max: number;
}

/** One terminal row of a plot: braille cells and the tone of each. */
export interface PlotRow {
    cells: string;
    tones: readonly (GraphTone | undefined)[];
}

const DOTS_PER_ROW = 4;
const DOTS_PER_COLUMN = 2;
const BRAILLE_BASE = 0x2800;
const BRAILLE_DOT_BITS = [
    [0x01, 0x02, 0x04, 0x40],
    [0x08, 0x10, 0x20, 0x80]
] as const;
const TONE_SEVERITY: Record<GraphTone, number> = { ok: 0, warning: 1, danger: 2 };

const worse = (a: GraphTone | undefined, b: GraphTone | undefined): GraphTone | undefined =>
    a === undefined || (b !== undefined && TONE_SEVERITY[b] > TONE_SEVERITY[a]) ? b : a;

/**
 * Draws a line chart with braille cells, two dots across and four down per cell.
 *
 * The values spread evenly over the plot's width. A gap (`undefined`) leaves the columns it covers
 * empty and breaks the line, and values outside `min` to `max` stick to the nearest edge.
 *
 * @param values - One reading per horizontal position, oldest first.
 * @returns `options.rows` rows from the top of the plot down.
 */
export function plotGraph(values: readonly (number | undefined)[], options: PlotOptions): PlotRow[] {
    const { columns, rows, min, max } = options;
    const dotWidth = columns * DOTS_PER_COLUMN;
    const dotHeight = rows * DOTS_PER_ROW;
    const dots = new Array<number>(dotWidth * DOTS_PER_ROW * rows).fill(0);
    const tones = new Array<GraphTone | undefined>(dotWidth);
    const samples = values.slice(-dotWidth);

    const span = Math.max(Number.EPSILON, max - min);
    const yFor = (value: number): number => {
        const clamped = Math.max(min, Math.min(max, value));
        return Math.round(((max - clamped) / span) * (dotHeight - 1));
    };
    const xFor = (index: number): number =>
        samples.length <= 1 ? dotWidth - 1 : Math.round((index / (samples.length - 1)) * (dotWidth - 1));
    const plot = (x: number, y: number, tone: GraphTone): void => {
        dots[x * dotHeight + y] = 1;
        tones[x] = worse(tones[x], tone);
    };

    let previous: { x: number; value: number } | undefined;
    samples.forEach((sample, index) => {
        if (sample === undefined) {
            previous = undefined;
            return;
        }
        const x = xFor(index);
        plot(x, yFor(sample), tpsTone(sample));
        if (previous !== undefined) {
            const gap = x - previous.x;
            for (let step = 1; step < gap; step += 1) {
                const value = previous.value + ((sample - previous.value) * step) / gap;
                plot(previous.x + step, yFor(value), tpsTone(value));
            }
        }
        previous = { x, value: sample };
    });

    return Array.from({ length: rows }, (_, row) => {
        let cells = '';
        const cellTones: (GraphTone | undefined)[] = [];
        for (let column = 0; column < columns; column += 1) {
            let bits = 0;
            let tone: GraphTone | undefined;
            for (let side = 0; side < DOTS_PER_COLUMN; side += 1) {
                const x = column * DOTS_PER_COLUMN + side;
                tone = worse(tone, tones[x]);
                for (let dotY = 0; dotY < DOTS_PER_ROW; dotY += 1) {
                    if (dots[x * dotHeight + row * DOTS_PER_ROW + dotY] === 1) bits |= BRAILLE_DOT_BITS[side]![dotY]!;
                }
            }
            cells += String.fromCodePoint(BRAILLE_BASE + bits);
            cellTones.push(bits === 0 ? undefined : tone);
        }
        return { cells, tones: cellTones };
    });
}
