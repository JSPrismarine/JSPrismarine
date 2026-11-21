import { BoxRenderable, MouseButton, StyledText, TextRenderable, fg } from '@opentui/core';
import type { MouseEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime } from '../status/segments';
import type { ServerState } from '../status/segments';
import { DEFAULT_TICK_RATE, tickTone, tpsTone } from '../tps/plotGraph';
import type { GraphTone } from '../tps/plotGraph';
import { sparkline, sparklineChunks } from '../tps/sparkline';
import type { SparkCell } from '../tps/sparkline';
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
    /** The steps of the current start, in order; shown while the server is starting. */
    boot?: readonly BootStep[];
    /** Clock reading in epoch milliseconds, for how long the running boot step has taken so far. */
    now?: number;
}

/** One step of the server's start as the console saw it, with its clock readings. */
export interface BootStep {
    /** The server's id for the step, such as `prismarine:content`. */
    id: string;
    startedAt: number;
    /** Unset while the step runs. */
    finishedAt?: number;
}

/** How long a running boot step has run, in whole seconds, or `now` in its first second. */
const runningFor = (startedAt: number, now: number | undefined): string => {
    const seconds = now === undefined ? 0 : Math.floor((now - startedAt) / 1000);
    if (seconds < 1) return 'now';
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};

/** A step's id as the pane names it: `prismarine:load-functions` reads `load functions`. */
export const bootStepLabel = (id: string): string => (id.split(':').at(-1) ?? id).replaceAll('-', ' ');

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

/** One row of the pane, as {@link sidePaneRows} lists them. */
export type SidePaneRow =
    | { kind: 'header'; key: SidePaneSection; text: string; hint?: string; opensTps?: true }
    | { kind: 'player'; name: string }
    | { kind: 'note'; text: string }
    | { kind: 'value'; label: string; value: string; tone?: GraphTone | 'muted' | 'text'; opensTps?: true }
    | { kind: 'graph'; values: readonly number[]; opensTps?: true }
    | { kind: 'blank' };

/** The pane's sections; each header row's renderable id is `side-pane-<section>`. */
export type SidePaneSection = 'details' | 'boot' | 'players' | 'performance' | 'server' | 'dev';

const DASH = '—';
const MAX_VISIBLE_PLAYERS = 5;
/** The graph spans the top half of the tick rate: 10 to 20 at the default. */
const GRAPH_MIN_SHARE = 0.5;

/**
 * The bars of the TPS graph for the pane's width. The range is the top half of the server's own
 * tick rate, so a server aiming for 40 is measured against 40.
 */
export function graphCells(values: readonly number[], tickRate: number | undefined, columns: number): SparkCell[] {
    const max = tickRate ?? DEFAULT_TICK_RATE;
    return sparkline(values, { columns, min: max * GRAPH_MIN_SHARE, max });
}

/** The rows the pane draws for a model, top to bottom. */
export function sidePaneRows(model: SidePaneModel): SidePaneRow[] {
    const names = model.playerNames ?? [];
    const online = model.players?.online ?? names.length;
    const rows: SidePaneRow[] = [{ kind: 'header', key: 'details', text: 'Server details' }];
    // While the server starts, what it is doing is the most useful thing the pane can show.
    if (model.state === 'starting' && model.boot !== undefined && model.boot.length > 0) {
        rows.push({ kind: 'header', key: 'boot', text: 'Starting' });
        for (const step of model.boot) {
            const { finishedAt } = step;
            const done = finishedAt !== undefined;
            rows.push({
                kind: 'value',
                label: `${done ? '✓' : '●'} ${bootStepLabel(step.id)}`,
                value: done
                    ? `${((finishedAt - step.startedAt) / 1000).toFixed(1)} s`
                    : runningFor(step.startedAt, model.now),
                tone: done ? 'muted' : 'warning'
            });
        }
        rows.push({ kind: 'blank' });
    }
    rows.push({
        kind: 'header',
        key: 'players',
        text: 'Players',
        hint: ` ${model.players ? formatPlayers(model.players.online, model.players.max) : String(online)}`
    });

    if (names.length > 0) {
        for (const name of names.slice(0, MAX_VISIBLE_PLAYERS)) rows.push({ kind: 'player', name });
        const additional = Math.max(0, online - Math.min(names.length, MAX_VISIBLE_PLAYERS));
        if (additional > 0) rows.push({ kind: 'note', text: `and ${additional} more` });
    } else {
        rows.push({ kind: 'note', text: online === 0 ? 'nobody online' : 'names unavailable' });
    }

    const low = model.tpsHistory.length > 1 ? Math.min(...model.tpsHistory) : undefined;
    rows.push(
        { kind: 'blank' },
        { kind: 'header', key: 'performance', text: 'Performance', hint: ' ▸ graph', opensTps: true },
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
        // The state is the title bar's tile; this section keeps what nothing else shows.
        { kind: 'header', key: 'server', text: 'Server' },
        { kind: 'value', label: 'version', value: model.server?.version ?? DASH },
        { kind: 'value', label: 'uptime', value: model.uptimeMs === undefined ? DASH : formatUptime(model.uptimeMs) }
    );
    // What the watcher is doing is the activity line's; the pane only adds the restart history,
    // once there is one.
    if (model.dev.watchRoot !== undefined && model.dev.restarts > 0) {
        rows.push(
            { kind: 'blank' },
            { kind: 'header', key: 'dev', text: 'Dev' },
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

    const chunksFor = (row: Exclude<SidePaneRow, { kind: 'graph' }>, labelWidth: number): TextChunk[] => {
        switch (row.kind) {
            case 'header':
                return [fg(theme.accent)(row.text), ...(row.hint === undefined ? [] : [fg(theme.textMuted)(row.hint)])];
            case 'player':
                return [fg(theme.text)(`• ${row.name}`)];
            case 'note':
                return [fg(theme.textMuted)(` ${row.text}`)];
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
            const rows = sidePaneRows(model);
            const labelWidth = Math.max(0, ...rows.map((row) => (row.kind === 'value' ? row.label.length : 0)));
            let line = 0;
            const addRow = (chunks: TextChunk[], opensTps = false, id = `side-pane-row-${line}`): void => {
                const text = new TextRenderable(renderer, {
                    id,
                    height: 1,
                    truncate: true,
                    content: new StyledText(chunks)
                });
                text.selectable = false;
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
                    const id = row.kind === 'header' ? `side-pane-${row.key}` : undefined;
                    addRow(chunksFor(row, labelWidth), 'opensTps' in row, id);
                    continue;
                }
                if (row.values.length === 0) {
                    addRow([fg(theme.textMuted)(' awaiting samples')], true, 'side-pane-graph');
                    continue;
                }
                const cells = graphCells(row.values, model.tpsRate, Math.max(1, renderable.width - 3));
                addRow([fg(theme.textMuted)(' '), ...sparklineChunks(cells, theme)], true, 'side-pane-graph');
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
