import { BoxRenderable, StyledText, TextRenderable, fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import { formatMemory, formatPlayers, formatUptime } from '../status/segments';
import type { ServerState } from '../status/segments';
import type { DevState } from './devState';
import type { SidePaneMode } from './layout';

/** Everything the side pane shows. Missing fields render as a dash until the server reports them. */
export interface SidePaneModel {
    state: ServerState;
    players?: { online: number; max: number };
    server?: { version: string; pid: number };
    uptimeMs?: number;
    rssBytes?: number;
    dev: DevState;
}

/** The column beside the log with player, server, and dev summaries. */
export interface SidePane {
    renderable: BoxRenderable;
    /** Repaints the rows from the model. */
    update(model: SidePaneModel): void;
    /** Places the pane beside the log, over it, or hides it. */
    setMode(mode: SidePaneMode, width: number): void;
    dispose(): void;
}

type Row = { kind: 'header'; text: string } | { kind: 'value'; label: string; value: string } | { kind: 'blank' };

const DASH = '—';

function rowsFor(model: SidePaneModel): Row[] {
    const rows: Row[] = [
        { kind: 'header', text: 'Players' },
        {
            kind: 'value',
            label: 'online',
            value: model.players ? formatPlayers(model.players.online, model.players.max) : DASH
        },
        { kind: 'blank' },
        { kind: 'header', text: 'Server' },
        { kind: 'value', label: 'state', value: model.state },
        { kind: 'value', label: 'version', value: model.server?.version ?? DASH },
        { kind: 'value', label: 'pid', value: model.server ? String(model.server.pid) : DASH },
        { kind: 'value', label: 'uptime', value: model.uptimeMs === undefined ? DASH : formatUptime(model.uptimeMs) },
        { kind: 'value', label: 'memory', value: model.rssBytes === undefined ? DASH : formatMemory(model.rssBytes) }
    ];
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
 * Creates the side pane. Rows are rebuilt on every `update`; the pane holds at most a dozen
 * of them, so that costs less than keeping the rows in step by hand.
 */
export function createSidePane(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>): SidePane {
    const { renderer, theme } = ctx;

    const renderable = new BoxRenderable(renderer, {
        id: 'side-pane',
        flexDirection: 'column',
        flexShrink: 0,
        border: ['left'],
        borderColor: theme.border,
        backgroundColor: theme.background,
        paddingLeft: 1,
        paddingRight: 1,
        visible: false
    });

    const chunksFor = (row: Row, labelWidth: number): TextChunk[] => {
        switch (row.kind) {
            case 'header':
                return [fg(theme.accent)(row.text)];
            case 'value':
                return [fg(theme.textMuted)(` ${row.label.padEnd(labelWidth)} `), fg(theme.text)(row.value)];
            case 'blank':
                return [];
        }
    };

    return {
        renderable,
        update(model) {
            for (const child of renderable.getChildren()) {
                renderable.remove(child);
                child.destroyRecursively();
            }
            const rows = rowsFor(model);
            const labelWidth = Math.max(0, ...rows.map((row) => (row.kind === 'value' ? row.label.length : 0)));
            rows.forEach((row, index) => {
                renderable.add(
                    new TextRenderable(renderer, {
                        id: `side-pane-row-${index}`,
                        height: 1,
                        truncate: true,
                        content: new StyledText(chunksFor(row, labelWidth))
                    })
                );
            });
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
