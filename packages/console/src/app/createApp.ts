import type { ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import type { LogLevel } from '@jsprismarine/logger';
import { BoxRenderable, CliRenderEvents } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';

import { createHelpOverlay } from '../help/helpOverlay';
import { createInputBar } from '../input/inputBar';
import type { CompletionResult } from '../input/inputBar';
import type { CommandHistory } from '../input/history';
import type { InterruptKind } from '../input/keys';
import { COMMAND_CATALOG, resolveCommand } from '../keymap/catalog';
import type { CommandId } from '../keymap/catalog';
import type { LogStore } from '../log/logStore';
import { createLogView } from '../log/logView';
import type { LogView } from '../log/logView';
import { HELP_SEGMENT, createStatusBar } from '../status/statusBar';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime, stateSegment } from '../status/segments';
import type { Segment, ServerState } from '../status/segments';
import { createToastStack } from '../status/toasts';
import type { ToastInput } from '../status/toastQueue';
import type { ConsoleContext } from '../context';
import { INITIAL_DEV_STATE, reduceDevState } from './devState';
import type { DevState } from './devState';
import { computeLayout } from './layout';
import type { Layout } from './layout';
import { createSidePane } from './sidePane';
import { createTitleBar } from './titleBar';

/** Shared objects the app and its components read. */
export interface AppContext extends ConsoleContext {
    store: LogStore;
    history: CommandHistory;
    /** Clock in epoch milliseconds; defaults to `Date.now`. */
    now?: () => number;
}

/** What the server answered to a command line. */
export interface CommandOutcome {
    ok: boolean;
    error?: string;
}

/** Supervisor controls the app triggers from the keyboard. */
export interface AppActions {
    restart(): void;
    stop(): void;
    forceStop(): void;
}

/** Callbacks and labels the host passes to the app. */
export interface AppProps {
    /** Runs a command line on the server. The app shows a toast when the outcome is not ok. */
    onCommand(line: string): Promise<CommandOutcome>;
    /** Completes the text before `cursor` on the server. */
    onComplete(line: string, cursor: number): Promise<CompletionResult>;
    actions: AppActions;
    serverName?: string;
    version?: string;
}

/** The composed console. Messages and events are pushed in; everything else happens on keys. */
export interface App {
    /** Routes a server message to the store, the status bar, or the side pane. */
    applyServerMessage(message: ServerMessage): void;
    /** Routes a supervisor event to the state segment, the dev badge, the toasts, or the store. */
    applySupervisorEvent(event: SupervisorEvent): void;
    /** Grays the input while the server cannot take commands. */
    setDisabled(flag: boolean): void;
    /** Gives the input line keyboard focus. */
    focus(): void;
    /** Unsubscribes from the renderer and destroys every renderable. */
    dispose(): void;
}

/** The level filter cycle for Ctrl+F; `undefined` shows every level. */
const LEVEL_CYCLE: readonly (LogLevel | undefined)[] = ['error', 'warn', 'info', undefined];

/** The level filter the console starts with, as the UX note recommends. */
const DEFAULT_LEVEL: LogLevel = 'info';

const NOT_AVAILABLE = (what: string): ToastInput => ({ tone: 'muted', text: `${what} is not yet available` });

interface Metrics {
    tps?: number;
    tickMs?: number;
    players?: { online: number; max: number };
    rssBytes?: number;
    uptimeMs?: number;
}

/**
 * Builds the console tree and wires its components together.
 *
 * The tree is a column: the title bar, a row with the log pane (toasts float over it) and the
 * side pane, the input bar, and the status bar, with the help overlay above everything. The
 * layout follows the terminal size on every resize. Every handler the renderer calls is
 * wrapped so a thrown error becomes a toast and a raw stderr line in the store instead of
 * ending the host.
 */
export function createApp(ctx: AppContext, props: AppProps): App {
    const { renderer, theme, store, history } = ctx;
    const now = ctx.now ?? Date.now;
    const components = { renderer, theme };

    let disposed = false;
    let state: ServerState = 'starting';
    let dev: DevState = INITIAL_DEV_STATE;
    let metrics: Metrics = {};
    let server: { version: string; pid: number } | undefined;
    let levelFilter: LogLevel | undefined = DEFAULT_LEVEL;
    let namespaceFilter: string | undefined;
    let search: string | undefined;
    let wrap = false;
    let sidePanePreference: boolean | undefined;
    let layout: Layout = computeLayout(renderer.terminalWidth, renderer.terminalHeight, {});
    let jumpCursor = 0;

    store.setLevelFilter(levelFilter);

    const root = new BoxRenderable(renderer, {
        id: 'app',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: theme.background
    });
    const main = new BoxRenderable(renderer, {
        id: 'app-main',
        width: '100%',
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'row'
    });
    const logColumn = new BoxRenderable(renderer, {
        id: 'app-log',
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'column',
        overflow: 'hidden'
    });

    const toasts = createToastStack(components);
    const titleBar = createTitleBar(components, { serverName: props.serverName, version: props.version });
    const sidePane = createSidePane(components);
    const statusBar = createStatusBar(components);
    const help = createHelpOverlay(components, { catalog: COMMAND_CATALOG });

    /** Turns an exception from a handler into a toast and a raw stderr line. */
    const report = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        try {
            toasts.push({ tone: 'danger', text: `console error: ${message}`, sticky: true });
            const lines = (error instanceof Error && error.stack ? error.stack : message).split('\n');
            for (const line of lines) store.appendRaw('stderr', `console: ${line}`, store.generation);
        } catch {
            // The toast stack or the store failed too; there is nothing left to show it in.
        }
    };

    const guard =
        <Args extends unknown[]>(fn: (...args: Args) => void) =>
        (...args: Args): void => {
            if (disposed) return;
            try {
                fn(...args);
            } catch (error) {
                report(error);
            }
        };

    let view: LogView = mountLogView();

    function mountLogView(): LogView {
        const created = createLogView(components, {
            store,
            wrap,
            showNamespace: layout.showNamespace,
            levelWidth: layout.levelWidth
        });
        created.setSearchHighlight(search);
        logColumn.add(created.renderable, 0);
        return created;
    }

    const input = createInputBar(components, {
        history,
        now,
        onSubmit: guard(submit),
        onComplete: props.onComplete,
        onInterrupt: guard(interrupt),
        onHint: guard((text: string | undefined) => statusBar.setHint(text))
    });

    logColumn.add(toasts.renderable);
    main.add(logColumn);
    main.add(sidePane.renderable);
    root.add(titleBar.renderable);
    root.add(main);
    root.add(input.renderable);
    root.add(statusBar.renderable);
    root.add(help.renderable);
    renderer.root.add(root);

    function filterText(): string {
        const parts = [levelFilter ?? 'all', namespaceFilter ?? 'all'];
        if (store.hiddenCount > 0) parts.push(`${store.hiddenCount} hidden`);
        return parts.join(' · ');
    }

    function refreshStatus(): void {
        const left: Segment[] = [stateSegment(state)];
        if (metrics.tps !== undefined) left.push({ id: 'tps', text: formatTps(metrics.tps), tone: 'ok', priority: 90 });
        if (metrics.players) {
            left.push({
                id: 'players',
                text: formatPlayers(metrics.players.online, metrics.players.max),
                tone: 'accent',
                priority: 80
            });
        }
        if (!layout.compactStatus) {
            if (metrics.tickMs !== undefined) {
                left.push({ id: 'tick', text: formatTickMs(metrics.tickMs), tone: 'muted', priority: 50 });
            }
            if (metrics.rssBytes !== undefined) {
                left.push({ id: 'memory', text: formatMemory(metrics.rssBytes), tone: 'muted', priority: 60 });
            }
            if (metrics.uptimeMs !== undefined) {
                left.push({ id: 'uptime', text: `up ${formatUptime(metrics.uptimeMs)}`, tone: 'muted', priority: 40 });
            }
            if (!layout.titleBar && dev.badge) {
                left.push({ id: 'dev', text: `dev ● ${dev.badge.text}`, tone: dev.badge.tone, priority: 70 });
            }
        }
        statusBar.setLeft(left);
        statusBar.setRight(
            layout.compactStatus
                ? [{ ...HELP_SEGMENT, text: '?' }]
                : [{ id: 'filter', text: filterText(), tone: 'muted', priority: 10 }, HELP_SEGMENT]
        );
    }

    function refreshSidePane(): void {
        sidePane.update({
            state,
            players: metrics.players,
            server,
            uptimeMs: metrics.uptimeMs,
            rssBytes: metrics.rssBytes,
            dev
        });
    }

    function applyLayout(): void {
        const next = computeLayout(renderer.terminalWidth, renderer.terminalHeight, {
            sidePaneVisible: sidePanePreference
        });
        const previous = layout;
        layout = next;

        titleBar.renderable.visible = next.titleBar;
        sidePane.setMode(next.sidePane, next.sidePaneWidth);
        if (next.levelWidth !== previous.levelWidth) {
            view.dispose();
            view = mountLogView();
        } else {
            view.setShowNamespace(next.showNamespace);
        }
        refreshStatus();
    }

    function setState(next: ServerState): void {
        state = next;
        refreshStatus();
        refreshSidePane();
    }

    function setDev(next: DevState): void {
        dev = next;
        titleBar.setBadge(next.badge);
        refreshStatus();
        refreshSidePane();
    }

    function setSearch(query: string | undefined): void {
        search = query;
        store.setSearch(query);
        view.setSearchHighlight(query);
        refreshStatus();
    }

    /** Scrolls so the visible record at `index` is the top row. */
    function scrollToIndex(index: number): void {
        view.toTop();
        view.scrollBy(index);
        jumpCursor = index;
    }

    function jumpToLevel(level: LogLevel): void {
        const total = store.visible().length;
        const from = jumpCursor > 0 && jumpCursor < total ? jumpCursor : total;
        const index = store.nextOfLevel(from, level, -1);
        if (index === undefined) {
            jumpCursor = total;
            toasts.push({ tone: 'muted', text: `no earlier ${level === 'warn' ? 'warnings' : 'errors'}` });
            return;
        }
        scrollToIndex(index);
    }

    function jumpToMatch(direction: 1 | -1): void {
        if (search === undefined) {
            toasts.push({ tone: 'muted', text: 'no search; type /text to search' });
            return;
        }
        const index = store.nextMatch(jumpCursor, direction);
        if (index === undefined) {
            toasts.push({ tone: 'muted', text: `no matches for "${search}"` });
            return;
        }
        scrollToIndex(index);
    }

    function cycleLevelFilter(): void {
        const next = LEVEL_CYCLE[(LEVEL_CYCLE.indexOf(levelFilter) + 1) % LEVEL_CYCLE.length];
        levelFilter = next;
        store.setLevelFilter(next);
        refreshStatus();
        toasts.push({ tone: 'muted', text: `showing ${next ?? 'all'} ${next ? 'and above' : 'levels'}` });
    }

    function toggleSidePane(): void {
        sidePanePreference = layout.sidePane === 'hidden';
        applyLayout();
    }

    /** Handles a `/` line locally. Returns false when the line is a server command. */
    function localCommand(line: string): boolean {
        if (!line.startsWith('/')) return false;
        const body = line.slice(1).trim();
        if (body === '') {
            setSearch(undefined);
            return true;
        }
        const namespace = /^(!?)ns:(.*)$/.exec(body);
        if (namespace) {
            const [, invert, pattern] = namespace;
            namespaceFilter = pattern === '' ? undefined : `${invert}${pattern}`;
            store.setNamespaceFilter(namespaceFilter);
            refreshStatus();
            return true;
        }
        setSearch(body);
        const last = store.nextMatch(store.visible().length, -1);
        if (last === undefined) toasts.push({ tone: 'muted', text: `no matches for "${body}"` });
        else scrollToIndex(last);
        return true;
    }

    function submit(line: string): void {
        if (localCommand(line)) return;
        props.onCommand(line).then(
            guard((outcome: CommandOutcome) => {
                if (!outcome.ok) toasts.push({ tone: 'danger', text: outcome.error ?? `command failed: ${line}` });
            }),
            guard((error: unknown) => {
                toasts.push({ tone: 'danger', text: error instanceof Error ? error.message : String(error) });
            })
        );
    }

    function interrupt(kind: InterruptKind): void {
        switch (kind) {
            case 'clear':
                return;
            case 'stop':
                toasts.push({ tone: 'warning', text: 'stopping the server' });
                props.actions.stop();
                return;
            case 'force':
                toasts.push({ tone: 'danger', text: 'forcing the server to stop' });
                props.actions.forceStop();
                return;
        }
    }

    function toggleWrap(): void {
        wrap = !wrap;
        view.setWrap(wrap);
        toasts.push({ tone: 'muted', text: wrap ? 'wrapping long lines' : 'truncating long lines' });
    }

    function run(id: CommandId): void {
        switch (id) {
            case 'input.historySearch': {
                const match = history.search(input.getValue());
                if (match === undefined) toasts.push({ tone: 'muted', text: 'no history entry matches' });
                else input.setValue(match);
                return;
            }
            case 'log.pageUp':
                view.pageUp();
                return;
            case 'log.pageDown':
                view.pageDown();
                return;
            case 'log.top':
                view.toTop();
                return;
            case 'log.bottom':
                view.toBottom();
                return;
            case 'log.search':
                input.setValue('/');
                return;
            case 'log.searchNext':
                jumpToMatch(1);
                return;
            case 'log.searchPrev':
                jumpToMatch(-1);
                return;
            case 'log.nextError':
                jumpToLevel('error');
                return;
            case 'log.nextWarning':
                jumpToLevel('warn');
                return;
            case 'log.toggleWrap':
                toggleWrap();
                return;
            case 'log.clearView':
                toasts.push(NOT_AVAILABLE('clearing the view'));
                return;
            case 'log.filter':
                cycleLevelFilter();
                return;
            case 'view.toggleSidePane':
                toggleSidePane();
                return;
            case 'view.help':
                help.toggle();
                return;
            case 'view.palette':
                toasts.push(NOT_AVAILABLE('the command palette'));
                return;
            case 'server.stop':
                props.actions.stop();
                return;
        }
    }

    function escape(): boolean {
        if (help.isVisible) {
            help.hide();
            return true;
        }
        if (search !== undefined) {
            setSearch(undefined);
            return true;
        }
        if (layout.sidePane === 'overlay') {
            toggleSidePane();
            return true;
        }
        toasts.clear();
        return false;
    }

    /**
     * Runs before the input bar's handler: the catalog is the only key table, so a bound key is
     * consumed here and never typed into the line.
     */
    const onKey = guard((key: KeyEvent) => {
        if (key.name === 'escape' && !key.ctrl && !key.meta && !key.shift) {
            if (escape()) key.preventDefault();
            return;
        }
        const id = resolveCommand(key, { inputEmpty: input.getValue().length === 0 });
        if (id === undefined) return;
        key.preventDefault();
        run(id);
    });
    const onResize = guard(applyLayout);

    renderer.keyInput.on('keypress', onKey);
    renderer.on(CliRenderEvents.RESIZE, onResize);
    applyLayout();
    refreshSidePane();

    function applyServerMessage(message: ServerMessage): void {
        switch (message.type) {
            case 'hello':
                server = { version: message.serverVersion, pid: message.pid };
                refreshSidePane();
                return;
            case 'log': {
                const { seq, level, namespace, at, message: text, formatted } = message;
                store.append({ seq, level, namespace, at, message: text, formatted });
                if (store.hiddenCount > 0) refreshStatus();
                return;
            }
            case 'log.dropped':
                store.appendDropped(message.count);
                return;
            case 'status':
                metrics = {
                    tps: message.tps,
                    tickMs: message.tickMs,
                    players: { online: message.players, max: message.maxPlayers },
                    rssBytes: message.rssBytes,
                    uptimeMs: message.uptimeMs
                };
                refreshStatus();
                refreshSidePane();
                return;
            case 'lifecycle':
                setState(message.state);
                return;
            case 'command.result':
            case 'complete.result':
                return;
        }
    }

    function applySupervisorEvent(event: SupervisorEvent): void {
        if (event.type === 'supervisor.output') {
            const lines = event.text.split(/\r?\n/);
            if (lines.at(-1) === '') lines.pop();
            for (const line of lines) store.appendRaw(event.stream, line, store.generation);
            return;
        }
        if (event.type === 'supervisor.state') {
            if (event.state === 'starting' && event.generation > 1) {
                store.startGeneration(`server restarted (generation ${event.generation})`, now());
            }
            state = event.state;
        }
        const transition = reduceDevState(dev, event, now());
        setDev(transition.state);
        if (transition.toast) toasts.push(transition.toast);
    }

    return {
        applyServerMessage: guard(applyServerMessage),
        applySupervisorEvent: guard(applySupervisorEvent),
        setDisabled(flag) {
            input.setDisabled(flag);
        },
        focus() {
            input.focus();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            renderer.keyInput.off('keypress', onKey);
            renderer.off(CliRenderEvents.RESIZE, onResize);
            view.dispose();
            input.dispose();
            statusBar.dispose();
            toasts.dispose();
            help.dispose();
            sidePane.dispose();
            titleBar.dispose();
            renderer.root.remove(root);
            root.destroyRecursively();
        }
    };
}
