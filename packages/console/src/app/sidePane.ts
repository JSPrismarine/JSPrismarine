import { BoxRenderable, MouseButton, StyledText, TextRenderable, fg } from '@opentui/core';
import type { MouseEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime } from '../status/segments';
import type { ServerState } from '../status/segments';
import { graphChunks } from '../tps/graphChunks';
import { DEFAULT_TICK_RATE, plotGraph, tickTone, tpsTone } from '../tps/plotGraph';
import type { GraphTone } from '../tps/plotGraph';
import type { DevState } from './devState';
import type { SidePaneMode } from './layout';

/** Live server data shown in the details pane. */
export interface SidePaneModel {
    state: ServerState;
    players?: { online: number; max: number };
    playerNames?: readonly string[];
    tps?: number;
    tpsHistory: readonly number[];
    /** The tick rate the server aims for; the graph tops out there. Defaults to 20. */
    tpsRate?: number;
    tickMs?: number;
    /** The tick rate the server aims for; a tick has `1000 / tickRate` milliseconds. Defaults to 20. */
    tickRate?: number;
    server?: { version: string; pid: number };
    uptimeMs?: number;
    rssBytes?: number;
    dev: DevState;
}

/** Callbacks for details-pane actions. */
export interface SidePaneProps {
    /** Hides the pane when the user presses its close control. */
    onClose(): void;
    /** Opens the TPS page when the user clicks the performance section. */
    onOpenTps(): void;
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
    | { kind: 'header'; text: string; hint?: string; opensTps?: true }
    | { kind: 'player'; name: string }
    | { kind: 'value'; label: string; value: string; tone?: GraphTone | 'muted' | 'text'; opensTps?: true }
    | { kind: 'graph'; values: readonly number[]; opensTps?: true }
    | { kind: 'blank' };

const DASH = '—';
const MAX_VISIBLE_PLAYERS = 5;
const GRAPH_ROWS = 3;
/** The graph spans the top half of the tick rate: 10 to 20 at the default. */
const GRAPH_MIN_SHARE = 0.5;

const formatAxis = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

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

    const low = model.tpsHistory.length > 1 ? Math.min(...model.tpsHistory) : undefined;
    rows.push(
        { kind: 'blank' },
        { kind: 'header', text: 'Performance', hint: ' ▸ graph', opensTps: true },
        {
            kind: 'value',
            label: 'TPS',
            value: model.tps === undefined ? DASH : formatTps(model.tps).slice(4),
            tone: model.tps === undefined ? 'muted' : tpsTone(model.tps, model.tpsRate),
            opensTps: true
        },
        { kind: 'graph', values: model.tpsHistory, opensTps: true },
        {
            kind: 'value',
            label: 'low',
            value: low === undefined ? DASH : low.toFixed(2),
            tone: low === undefined ? 'muted' : tpsTone(low, model.tpsRate),
            opensTps: true
        },
        {
            kind: 'value',
            label: 'tick',
            value: model.tickMs === undefined ? DASH : formatTickMs(model.tickMs),
            tone: model.tickMs === undefined ? 'muted' : (tickTone(model.tickMs, model.tickRate) ?? 'text')
        },
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
                return [fg(theme.accent)(row.text), ...(row.hint === undefined ? [] : [fg(theme.textMuted)(row.hint)])];
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
            const addRow = (chunks: TextChunk[], opensTps = false): void => {
                const text = new TextRenderable(renderer, {
                    id: `side-pane-row-${line}`,
                    height: 1,
                    truncate: true,
                    content: new StyledText(chunks)
                });
                if (opensTps) {
                    text.onMouseDown = (event: MouseEvent) => {
                        if (event.button !== MouseButton.LEFT) return;
                        event.preventDefault();
                        props.onOpenTps();
                    };
                }
                renderable.add(text);
                line += 1;
            };
            for (const row of rows) {
                if (row.kind !== 'graph') {
                    addRow(chunksFor(row, labelWidth), 'opensTps' in row);
                    continue;
                }
                const max = model.tpsRate ?? DEFAULT_TICK_RATE;
                const min = max * GRAPH_MIN_SHARE;
                const labels = [max, (max + min) / 2, min].map(formatAxis);
                const axisWidth = Math.max(...labels.map((label) => label.length));
                const columns = Math.max(1, Math.min(32, renderable.width - 4 - axisWidth));
                const plot = plotGraph(row.values, { columns, rows: GRAPH_ROWS, min, max });
                plot.forEach((graphRow, index) => {
                    const axis = `${(labels[index] ?? '').padStart(axisWidth)} ${index === GRAPH_ROWS - 1 ? '└' : '┤'}`;
                    addRow([fg(theme.textMuted)(axis), ...graphChunks(graphRow, theme)], true);
                });
                if (row.values.length === 0) addRow([fg(theme.textMuted)('       awaiting samples')], true);
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
