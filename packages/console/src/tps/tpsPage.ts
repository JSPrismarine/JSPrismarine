import { BoxRenderable, MouseButton, StyledText, TextRenderable, bg, bold, fg } from '@opentui/core';
import type { KeyEvent, MouseEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTickMs } from '../status/segments';
import { graphChunks } from './graphChunks';
import { DEFAULT_TICK_RATE, plotGraph, tpsThresholds, tpsTone } from './plotGraph';
import { TPS_WINDOWS, rateForWindow, seriesForWindow, summarizeWindow } from './tpsHistory';
import type { TpsSample } from './tpsHistory';

/** What the page draws; the host pushes a new model whenever a status message arrives. */
export interface TpsPageModel {
    samples: readonly TpsSample[];
    /** End of the charted window, in epoch milliseconds. */
    now: number;
    tickMs?: number;
}

/** Callbacks for page actions. */
export interface TpsPageProps {
    /** Runs when the user closes the page with its own controls. */
    onClose(): void;
}

/**
 * A page with a large TPS chart, a summary of the chosen span, and a span picker. It covers the
 * log pane and is hidden until `show` is called.
 */
export interface TpsPage {
    /** Absolutely positioned; add it to the pane the page should cover. */
    renderable: BoxRenderable;
    show(): void;
    hide(): void;
    /** Repaints from the latest model, if the page is showing. */
    update(model: TpsPageModel): void;
    /** Sets the size of the pane the page covers, in terminal cells. */
    setSize(width: number, height: number): void;
    /** Handles the page's keys and reports whether `key` was one of them. */
    handleKeyPress(key: KeyEvent): boolean;
    readonly isVisible: boolean;
    /** Removes the resize listener and destroys the renderables. */
    dispose(): void;
}

/** Below the toasts, so a notice stays readable while the page is open. */
const Z_INDEX = 9;
const PADDING_X = 1;
/** Border rows and columns on both sides. */
const BORDER = 2;
/** Rows inside the border besides the chart: summary, spans, time axis, and footer. */
const CHROME_ROWS = 4;
const MIN_CHART_ROWS = 2;
const DEFAULT_WINDOW = 1;
/** The axis always shows at least this share of the tick rate, so a healthy line sits near the top. */
const AXIS_STEPS = 4;
/** Widest tick label, such as `17.5`. */
const AXIS_LABEL_WIDTH = 4;
/** Tick label, a space, and the axis marker. */
const AXIS_WIDTH = AXIS_LABEL_WIDTH + 2;

const formatSpan = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes === 0) return `${rest}s`;
    return rest === 0 ? `${minutes}m` : `${minutes}m${String(rest).padStart(2, '0')}s`;
};

const formatTick = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** Tick labels by chart row: the top and bottom of the range, plus the middle when there is room. */
function axisLabels(rows: number, min: number, max: number): Map<number, string> {
    const labels = new Map<number, string>([
        [0, formatTick(max)],
        [rows - 1, formatTick(min)]
    ]);
    if (rows >= 5) labels.set(Math.floor((rows - 1) / 2), formatTick((min + max) / 2));
    return labels;
}

/** Places three labels on a line `width` cells wide: left aligned, centered, and right aligned. */
function spreadLabels(left: string, middle: string, right: string, width: number): string {
    const line = new Array<string>(width).fill(' ');
    const put = (text: string, start: number): void => {
        [...text].forEach((character, index) => {
            const column = start + index;
            if (column >= 0 && column < width) line[column] = character;
        });
    };
    put(left, 0);
    put(right, width - [...right].length);
    const centered = Math.floor((width - [...middle].length) / 2);
    if (centered > [...left].length + 1 && centered + [...middle].length < width - [...right].length - 1) {
        put(middle, centered);
    }
    return line.join('');
}

/**
 * Creates the TPS page. The chart range follows the data: it always tops out at the target of 20 and
 * drops in steps of 5, down to 0, when the server falls behind.
 */
export function createTpsPage(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: TpsPageProps): TpsPage {
    const { renderer, theme } = ctx;
    let model: TpsPageModel = { samples: [], now: 0 };
    let windowIndex = DEFAULT_WINDOW;
    let size = { width: renderer.terminalWidth, height: renderer.terminalHeight };

    const renderable = new BoxRenderable(renderer, {
        id: 'tps-page',
        position: 'absolute',
        zIndex: Z_INDEX,
        visible: false,
        flexDirection: 'column',
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.border,
        backgroundColor: theme.surface,
        title: ' TPS ',
        titleColor: theme.accent,
        titleAlignment: 'center',
        left: 0,
        top: 0,
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X
    });

    // The page is controls and a chart, not text to take: pressing a tab must not select it.
    const text = (id: string, chunks: TextChunk[]): TextRenderable => {
        const renderable = new TextRenderable(renderer, {
            id,
            height: 1,
            truncate: true,
            wrapMode: 'none',
            content: new StyledText(chunks)
        });
        renderable.selectable = false;
        return renderable;
    };

    const click = (handler: () => void) => (event: MouseEvent) => {
        if (event.button !== MouseButton.LEFT) return;
        event.preventDefault();
        handler();
    };

    const selectWindow = (index: number): void => {
        windowIndex = (index + TPS_WINDOWS.length) % TPS_WINDOWS.length;
        layout();
    };

    /** The highest tick rate in the chosen span; the chart tops out there and tones are measured against it. */
    const currentRate = (): number =>
        rateForWindow(model.samples, model.now, TPS_WINDOWS[windowIndex]!.ms) ?? DEFAULT_TICK_RATE;

    const summaryChunks = (): TextChunk[] => {
        const span = TPS_WINDOWS[windowIndex]!.ms;
        const rate = currentRate();
        const stats = summarizeWindow(model.samples, model.now, span);
        if (stats === undefined) return [fg(theme.textMuted)('waiting for the first status update')];
        const latest = model.samples.at(-1)?.tps ?? stats.average;
        const pair = (label: string, value: number): TextChunk[] => [
            fg(theme.textMuted)(`${label} `),
            fg(theme[tpsTone(value, rate)])(value.toFixed(2)),
            fg(theme.textMuted)('   ')
        ];
        return [
            ...pair('now', latest),
            ...pair('avg', stats.average),
            ...pair('min', stats.min),
            ...pair('max', stats.max),
            ...(model.tickMs === undefined
                ? []
                : [fg(theme.textMuted)('tick '), fg(theme.text)(formatTickMs(model.tickMs))])
        ];
    };

    const windowRow = (): BoxRenderable => {
        const row = new BoxRenderable(renderer, {
            id: 'tps-windows',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'space-between'
        });
        const tabs = new BoxRenderable(renderer, { id: 'tps-tabs', height: 1, flexDirection: 'row', flexShrink: 0 });
        tabs.add(text('tps-tabs-label', [fg(theme.textMuted)('span ')]));
        TPS_WINDOWS.forEach((window, index) => {
            const label = ` ${window.label} `;
            const chunk =
                index === windowIndex ? bg(theme.accent)(fg(theme.background)(bold(label))) : fg(theme.text)(label);
            const tab = text(`tps-tab-${window.label}`, [chunk]);
            tab.width = label.length;
            tab.onMouseDown = click(() => selectWindow(index));
            tabs.add(tab);
        });
        const { warning, danger } = tpsThresholds(currentRate());
        const legend = text('tps-legend', [
            fg(theme.ok)('● '),
            fg(theme.textMuted)(`${formatTick(warning)}+  `),
            fg(theme.warning)('● '),
            fg(theme.textMuted)(`${formatTick(danger)}-${formatTick(warning)}  `),
            fg(theme.danger)('● '),
            fg(theme.textMuted)(`<${formatTick(danger)}`)
        ]);
        legend.flexShrink = 1;
        row.add(tabs);
        row.add(legend);
        return row;
    };

    const footerRow = (): BoxRenderable => {
        const row = new BoxRenderable(renderer, {
            id: 'tps-footer',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'space-between'
        });
        const hint = text('tps-footer-hint', [fg(theme.accent)('1 2 3 or ←/→ span · t or Esc to close')]);
        hint.flexShrink = 1;
        const close = text('tps-close', [fg(theme.textMuted)('× close')]);
        close.width = '× close'.length;
        close.flexShrink = 0;
        close.onMouseDown = click(props.onClose);
        row.add(hint);
        row.add(close);
        return row;
    };

    function layout(): void {
        for (const child of renderable.getChildren()) {
            renderable.remove(child);
            child.destroyRecursively();
        }

        const width = size.width;
        const height = Math.max(BORDER + CHROME_ROWS + MIN_CHART_ROWS, size.height);
        renderable.width = width;
        renderable.height = height;

        const chartRows = Math.max(MIN_CHART_ROWS, height - BORDER - CHROME_ROWS);
        const innerWidth = Math.max(1, width - BORDER - PADDING_X * 2);

        const span = TPS_WINDOWS[windowIndex]!;
        const plotColumns = Math.max(1, innerWidth - AXIS_WIDTH);
        const series = seriesForWindow(model.samples, model.now, span.ms, plotColumns * 2);
        const present = series.filter((value) => value !== undefined);
        const max = currentRate();
        const step = max / AXIS_STEPS;
        const lowest = present.length === 0 ? max : Math.min(...present);
        const min = Math.max(0, Math.min(max - step, Math.floor(lowest / step) * step));
        const labels = axisLabels(chartRows, min, max);
        const plot = plotGraph(series, { columns: plotColumns, rows: chartRows, min, max });

        renderable.add(text('tps-summary', summaryChunks()));
        renderable.add(windowRow());
        plot.forEach((row, index) => {
            const label = labels.get(index);
            const marker = label === undefined ? '│' : index === chartRows - 1 ? '└' : '┤';
            const axis = `${(label ?? '').padStart(AXIS_LABEL_WIDTH)} ${marker}`;
            renderable.add(
                text(`tps-plot-${index}`, [fg(theme.textMuted)(axis), ...graphChunks(row, theme, label !== undefined)])
            );
        });
        renderable.add(
            text('tps-axis', [
                fg(theme.textMuted)(
                    ' '.repeat(AXIS_WIDTH) +
                        spreadLabels(`-${formatSpan(span.ms)}`, `-${formatSpan(span.ms / 2)}`, 'now', plotColumns)
                )
            ])
        );
        renderable.add(footerRow());
    }

    return {
        renderable,
        show() {
            layout();
            renderable.visible = true;
        },
        hide() {
            renderable.visible = false;
        },
        update(next) {
            model = next;
            if (renderable.visible) layout();
        },
        setSize(width, height) {
            size = { width, height };
            if (renderable.visible) layout();
        },
        handleKeyPress(key) {
            if (key.ctrl || key.meta || key.super) return false;
            switch (key.name) {
                case '1':
                case '2':
                case '3':
                    selectWindow(Number(key.name) - 1);
                    return true;
                case 'left':
                    selectWindow(windowIndex - 1);
                    return true;
                case 'right':
                    selectWindow(windowIndex + 1);
                    return true;
                case 'q':
                case 't':
                case 'escape':
                    props.onClose();
                    return true;
                default:
                    return false;
            }
        },
        get isVisible() {
            return renderable.visible;
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
