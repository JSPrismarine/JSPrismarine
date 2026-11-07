/** Tone a graph column is drawn with, from the worst sample that lands in it. */
export type GraphTone = 'ok' | 'warning' | 'danger';

/** The ticks per second a server aims for unless it says otherwise. */
export const DEFAULT_TICK_RATE = 20;

/** Share of the tick rate below which the server is lagging. */
const DANGER_RATIO = 0.75;

/** Share of the tick rate below which the server is slower than it aims to be. */
const WARNING_RATIO = 0.95;

/** Share of a tick's period from which the status bar warns before the budget is gone. */
const TICK_WARNING_RATIO = 0.8;

/**
 * The reading the console shows for a server's TPS. The server reports a loop that is catching up
 * as above its tick rate, but a rate over the target is not extra health, so every view caps it.
 */
export const displayTps = (tps: number, rate: number = DEFAULT_TICK_RATE): number => Math.min(tps, rate);

/** The TPS below which a reading is yellow and the TPS below which it is red, for a tick rate. */
export const tpsThresholds = (rate: number): { warning: number; danger: number } => ({
    warning: rate * WARNING_RATIO,
    danger: rate * DANGER_RATIO
});

/** Colors a TPS reading against the tick rate: green near it, yellow below 95%, red below 75%. */
export function tpsTone(tps: number, rate: number = DEFAULT_TICK_RATE): GraphTone {
    if (tps < rate * DANGER_RATIO) return 'danger';
    if (tps < rate * WARNING_RATIO) return 'warning';
    return 'ok';
}

/**
 * Colors a tick duration, or returns `undefined` while it leaves comfortable headroom. A tick has
 * one period of `1000 / rate` milliseconds; yellow starts at 80% of it and red once it is gone.
 */
export function tickTone(tickMs: number, rate: number = DEFAULT_TICK_RATE): GraphTone | undefined {
    const period = 1000 / rate;
    if (tickMs >= period) return 'danger';
    if (tickMs >= period * TICK_WARNING_RATIO) return 'warning';
    return undefined;
}

/**
 * Value range the vertical axis covers and the size of the plot in terminal cells. `max` is also
 * the tick rate that colors the line.
 */
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
 * The values spread evenly over the plot's width and neighboring values are joined by a stroke. A
 * gap (`undefined`) leaves the columns it covers empty and breaks the line, and values outside `min` to `max` stick to the nearest edge.
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
    const plot = (x: number, fromY: number, toY: number, tone: GraphTone): void => {
        for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y += 1) dots[x * dotHeight + y] = 1;
        tones[x] = worse(tones[x], tone);
    };

    // Each column fills the dots between where the line leaves the previous column and where it
    // reaches this one, so a steep change draws a connected stroke instead of loose dots.
    let previous: { x: number; value: number } | undefined;
    samples.forEach((sample, index) => {
        if (sample === undefined) {
            previous = undefined;
            return;
        }
        const x = xFor(index);
        if (previous === undefined) {
            plot(x, yFor(sample), yFor(sample), tpsTone(sample, max));
        } else {
            const gap = Math.max(1, x - previous.x);
            for (let step = 1; step <= gap; step += 1) {
                const before = previous.value + ((sample - previous.value) * (step - 1)) / gap;
                const value = previous.value + ((sample - previous.value) * step) / gap;
                plot(
                    previous.x + step,
                    yFor(before),
                    yFor(value),
                    worse(tpsTone(before, max), tpsTone(value, max)) ?? 'ok'
                );
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
