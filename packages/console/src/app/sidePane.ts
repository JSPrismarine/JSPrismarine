import { BoxRenderable, MouseButton, StyledText, TextRenderable, fg } from '@opentui/core';
import type { MouseEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime } from '../status/segments';
import type { ServerState } from '../status/segments';
import type { DevState } from './devState';
import type { SidePaneMode } from './layout';

/** Live server data shown in the details pane. */
export interface SidePaneModel {
    state: ServerState;
    players?: { online: number; max: number };
    playerNames?: readonly string[];
    tps?: number;
    tpsHistory: readonly number[];
    tickMs?: number;
    server?: { version: string; pid: number };
    uptimeMs?: number;
    rssBytes?: number;
    dev: DevState;
}

/** Callbacks for details-pane actions. */
export interface SidePaneProps {
    /** Hides the pane when the user presses its close control. */
    onClose(): void;
}

/** The resizable server details column or narrow-terminal flyout. */
export interface SidePane {
    renderable: BoxRenderable;
    /** Repaints the rows from the latest server data. */
    update(model: SidePaneModel): void;
    /** Places the pane beside the log, over it, or hides it. */
    setMode(mode: SidePaneMode, width: number): void;
    dispose(): void;
}

type Row =
    | { kind: 'header'; text: string }
    | { kind: 'player'; name: string }
    | { kind: 'value'; label: string; value: string; tone?: GraphTone | 'muted' }
    | { kind: 'graph'; values: readonly number[] }
    | { kind: 'blank' };

const DASH = '—';
const MAX_VISIBLE_PLAYERS = 5;
const GRAPH_ROWS = 3;
const GRAPH_DOTS_PER_ROW = 4;
const GRAPH_MIN_TPS = 10;
const GRAPH_MAX_TPS = 20;
const BRAILLE_DOT_BITS = [
    [0x01, 0x02, 0x04, 0x40],
    [0x08, 0x10, 0x20, 0x80]
] as const;

type GraphTone = 'ok' | 'warning' | 'danger';

interface GraphLine {
    axis: string;
    cells: string;
    tones: readonly (GraphTone | undefined)[];
}

function graphTone(tps: number): GraphTone {
    if (tps < 15) return 'danger';
    if (tps < 19) return 'warning';
    return 'ok';
}

function graphLines(values: readonly number[], columns: number): GraphLine[] {
    const dotWidth = columns * 2;
    const height = GRAPH_ROWS * GRAPH_DOTS_PER_ROW;
    const dots = new Array<number>(dotWidth).fill(0);
    const tones = new Array<GraphTone | undefined>(dotWidth);
    const samples = values.slice(-dotWidth);
    const yFor = (value: number): number => {
        const tps = Math.max(GRAPH_MIN_TPS, Math.min(GRAPH_MAX_TPS, value));
        return Math.round(((GRAPH_MAX_TPS - tps) / (GRAPH_MAX_TPS - GRAPH_MIN_TPS)) * (height - 1));
    };
    const xFor = (index: number): number =>
        samples.length <= 1 ? dotWidth - 1 : Math.round((index / (samples.length - 1)) * (dotWidth - 1));
    const plot = (x: number, y: number, tone: GraphTone): void => {
        dots[x] = (dots[x] ?? 0) | (1 << y);
        tones[x] = tone;
    };

    samples.forEach((sample, index) => {
        const x = xFor(index);
        const y = yFor(sample);
        plot(x, y, graphTone(sample));
        if (index === 0) return;

        const previousX = xFor(index - 1);
        const previousValue = samples[index - 1] ?? sample;
        const span = x - previousX;
        for (let step = 1; step < span; step += 1) {
            const progress = step / span;
            const value = previousValue + (sample - previousValue) * progress;
            plot(previousX + step, yFor(value), graphTone(value));
        }
    });

    const axes = ['20 ┤', '15 ┤', '10 └'];
    return axes.map((axis, row) => {
        let cells = '';
        const cellTones: (GraphTone | undefined)[] = [];
        for (let column = 0; column < columns; column += 1) {
            let bits = 0;
            for (let side = 0; side < 2; side += 1) {
                const dotX = column * 2 + side;
                const dotMask = dots[dotX] ?? 0;
                for (let dotY = 0; dotY < GRAPH_DOTS_PER_ROW; dotY += 1) {
                    const y = row * GRAPH_DOTS_PER_ROW + dotY;
                    if ((dotMask & (1 << y)) !== 0) bits |= BRAILLE_DOT_BITS[side]![dotY]!;
                }
            }
            cells += String.fromCodePoint(0x2800 + bits);
            cellTones.push(tones[column * 2] ?? tones[column * 2 + 1]);
        }
        return { axis, cells, tones: cellTones };
    });
}

function rowsFor(model: SidePaneModel): Row[] {
    const names = model.playerNames ?? [];
    const online = model.players?.online ?? names.length;
    const rows: Row[] = [
        { kind: 'header', text: 'Server details' },
        { kind: 'header', text: 'Players' },
        {
            kind: 'value',
            label: 'online',
            value: model.players ? formatPlayers(model.players.online, model.players.max) : String(online)
        }
    ];

    if (names.length > 0) {
        for (const name of names.slice(0, MAX_VISIBLE_PLAYERS)) rows.push({ kind: 'player', name });
        const additional = Math.max(0, online - Math.min(names.length, MAX_VISIBLE_PLAYERS));
        if (additional > 0) rows.push({ kind: 'value', label: 'more', value: `${additional} players` });
    } else {
        rows.push({ kind: 'value', label: 'names', value: online === 0 ? 'none online' : 'unavailable' });
    }

    rows.push(
        { kind: 'blank' },
        { kind: 'header', text: 'Performance' },
        {
            kind: 'value',
            label: 'TPS',
            value: model.tps === undefined ? DASH : formatTps(model.tps).slice(4),
            tone: model.tps === undefined ? 'muted' : graphTone(model.tps)
        },
        { kind: 'graph', values: model.tpsHistory },
        { kind: 'value', label: 'tick', value: model.tickMs === undefined ? DASH : formatTickMs(model.tickMs) },
        { kind: 'value', label: 'memory', value: model.rssBytes === undefined ? DASH : formatMemory(model.rssBytes) },
        { kind: 'blank' },
        { kind: 'header', text: 'Server' },
        { kind: 'value', label: 'state', value: model.state },
        { kind: 'value', label: 'version', value: model.server?.version ?? DASH },
        { kind: 'value', label: 'uptime', value: model.uptimeMs === undefined ? DASH : formatUptime(model.uptimeMs) }
    );
    if (model.dev.badge !== undefined) {
        rows.push(
            { kind: 'blank' },
            { kind: 'header', text: 'Dev' },
            { kind: 'value', label: 'status', value: model.dev.badge.text },
            { kind: 'value', label: 'restarts', value: String(model.dev.restarts) },
            {
                kind: 'value',
                label: 'last',
                value: model.dev.lastRestartAt === undefined ? DASH : formatTime(model.dev.lastRestartAt)
            }
        );
    }
    return rows;
}

/**
 * Creates the server details pane with a live player list and recent TPS graph.
 */
export function createSidePane(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: SidePaneProps): SidePane {
    const { renderer, theme } = ctx;

    const renderable = new BoxRenderable(renderer, {
        id: 'side-pane',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
        backgroundColor: theme.surface,
        paddingLeft: 1,
        paddingRight: 1,
        visible: false
    });
    const closeButton = new TextRenderable(renderer, {
        id: 'side-pane-close',
        position: 'absolute',
        right: 1,
        top: 0,
        width: 1,
        height: 1,
        content: '×',
        fg: theme.textMuted,
        onMouseDown(event: MouseEvent) {
            if (event.button !== MouseButton.LEFT) return;
            event.preventDefault();
            props.onClose();
        }
    });
    renderable.add(closeButton);

    const chunksFor = (row: Exclude<Row, { kind: 'graph' }>, labelWidth: number): TextChunk[] => {
        switch (row.kind) {
            case 'header':
                return [fg(theme.accent)(row.text)];
            case 'player':
                return [fg(theme.text)(`• ${row.name}`)];
            case 'value':
                return [
                    fg(theme.textMuted)(` ${row.label.padEnd(labelWidth)} `),
                    fg(theme[row.tone ?? 'text'])(row.value)
                ];
            case 'blank':
                return [];
        }
    };

    return {
        renderable,
        update(model) {
            for (const child of renderable.getChildren()) {
                if (child === closeButton) continue;
                renderable.remove(child);
                child.destroyRecursively();
            }
            const rows = rowsFor(model);
            const labelWidth = Math.max(0, ...rows.map((row) => (row.kind === 'value' ? row.label.length : 0)));
            let line = 0;
            for (const row of rows) {
                if (row.kind === 'graph') {
                    const width = Math.max(1, Math.min(32, renderable.width - 6));
                    for (const graphLine of graphLines(row.values, width)) {
                        const chunks: TextChunk[] = [fg(theme.textMuted)(graphLine.axis)];
                        let chunkText = '';
                        let chunkTone: GraphTone | undefined;
                        graphLine.cells.split('').forEach((cell, column) => {
                            const tone = graphLine.tones[column];
                            if (tone !== chunkTone && chunkText !== '') {
                                chunks.push(fg(theme[chunkTone ?? 'muted'])(chunkText));
                                chunkText = '';
                            }
                            chunkText += cell;
                            chunkTone = tone;
                        });
                        if (chunkText !== '') chunks.push(fg(theme[chunkTone ?? 'muted'])(chunkText));
                        renderable.add(
                            new TextRenderable(renderer, {
                                id: `side-pane-row-${line}`,
                                height: 1,
                                truncate: true,
                                content: new StyledText(chunks)
                            })
                        );
                        line += 1;
                    }
                    if (row.values.length === 0) {
                        renderable.add(
                            new TextRenderable(renderer, {
                                id: `side-pane-row-${line}`,
                                height: 1,
                                truncate: true,
                                content: new StyledText([fg(theme.textMuted)('       awaiting samples')])
                            })
                        );
                        line += 1;
                    }
                    continue;
                }
                renderable.add(
                    new TextRenderable(renderer, {
                        id: `side-pane-row-${line}`,
                        height: 1,
                        truncate: true,
                        content: new StyledText(chunksFor(row, labelWidth))
                    })
                );
                line += 1;
            }
            renderable.remove(closeButton);
            renderable.add(closeButton);
        },
        setMode(mode, width) {
            renderable.visible = mode !== 'hidden';
            renderable.width = width;
            if (mode === 'overlay') {
                renderable.position = 'absolute';
                renderable.right = 0;
                renderable.top = 0;
                renderable.height = '100%';
                renderable.zIndex = 5;
            } else {
                renderable.position = 'relative';
                renderable.right = undefined;
                renderable.top = undefined;
                renderable.height = 'auto';
                renderable.zIndex = undefined;
            }
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
