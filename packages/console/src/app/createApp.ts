import type { ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import { isLogLevel, LOG_LEVELS } from '@jsprismarine/logger';
import type { LogLevel } from '@jsprismarine/logger';
import { BoxRenderable, CliRenderEvents, MouseButton } from '@opentui/core';
import type { KeyEvent, MouseEvent } from '@opentui/core';

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
import type { SourceLocation } from '../log/sourceLocation';
import { HELP_SEGMENT, createStatusBar } from '../status/statusBar';
import { createDropdown } from '../status/dropdown';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime, stateSegment } from '../status/segments';
import type { Segment, SegmentBounds, ServerState } from '../status/segments';
import type { DropdownOption } from '../status/dropdown';
import { createToastStack } from '../status/toasts';
import type { ToastInput } from '../status/toastQueue';
import type { ConsoleContext } from '../context';
import { INITIAL_DEV_STATE, reduceDevState } from './devState';
import type { DevState } from './devState';
import { SIDE_PANE_RESIZER_WIDTH, SIDE_PANE_WIDTH, computeLayout } from './layout';
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
    /** Only called after a `supervisor.watching` event with `canRestart: true`. */
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
    /** Opens a source location in the host's configured editor. */
    openSourceLocation?(location: SourceLocation): Promise<void>;
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
    playerNames?: readonly string[];
    rssBytes?: number;
    uptimeMs?: number;
}

const TPS_HISTORY_LIMIT = 30;

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
    let namespaceFilterExact = false;
    let search: string | undefined;
    let wrap = false;
    let inputFocused = true;
    let sidePanePreference: boolean | undefined;
    let sidePaneWidth = SIDE_PANE_WIDTH;
    let tpsHistory: number[] = [];
    let resizingSidePane = false;
    let resizeStartX = 0;
    let resizeStartWidth = SIDE_PANE_WIDTH;
    /** Whether the host said a restart request will be acted on; only a watching host does. */
    let canRestart = false;
    /** Names the server completes an empty line with; `/name` lines go to the server when `name` is one. */
    let commandNames: ReadonlySet<string> = new Set();
    let layout: Layout = computeLayout(renderer.terminalWidth, renderer.terminalHeight, { sidePaneWidth });
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
    const sidePane = createSidePane(components, {
        onClose() {
            sidePanePreference = false;
            applyLayout();
        }
    });
    const sidePaneResizer = new BoxRenderable(renderer, {
        id: 'side-pane-resizer',
        position: 'absolute',
        width: SIDE_PANE_RESIZER_WIDTH,
        height: '100%',
        border: ['left'],
        borderColor: theme.border,
        visible: false,
        onMouseDown(event: MouseEvent) {
            if (event.button !== MouseButton.LEFT) return;
            event.preventDefault();
            resizingSidePane = true;
            resizeStartX = event.x;
            resizeStartWidth = layout.sidePaneWidth;
        },
        onMouseDrag(event: MouseEvent) {
            if (!resizingSidePane) return;
            sidePaneWidth = resizeStartWidth + resizeStartX - event.x;
            applyLayout();
            sidePaneWidth = layout.sidePaneWidth;
        },
        onMouseDragEnd() {
            resizingSidePane = false;
        },
        onMouseOver() {
            sidePaneResizer.borderColor = theme.borderFocused;
            renderer.setMousePointer('col-resize');
            renderer.requestRender();
        },
        onMouseOut() {
            if (resizingSidePane) return;
            sidePaneResizer.borderColor = theme.border;
            renderer.setMousePointer('default');
            renderer.requestRender();
        }
    });
    const statusBar = createStatusBar(components);
    const help = createHelpOverlay(components, { catalog: COMMAND_CATALOG });
    const dropdown = createDropdown(components);

    root.onMouseDown = (event: MouseEvent): void => {
        if (event.button !== MouseButton.LEFT) return;
        let inStatusBar = false;
        for (let target = event.target; target !== null; target = target.parent) {
            if (target === statusBar.renderable) {
                inStatusBar = true;
                break;
            }
        }
        if (inStatusBar && event.defaultPrevented) return;
        const contains = (renderable: BoxRenderable): boolean =>
            event.x >= renderable.x &&
            event.x < renderable.x + renderable.width &&
            event.y >= renderable.y &&
            event.y < renderable.y + renderable.height;
        if (layout.sidePane === 'overlay' && !contains(sidePane.renderable) && !contains(sidePaneResizer)) {
            sidePanePreference = false;
            applyLayout();
        }
        if (dropdown.isOpen && !contains(dropdown.renderable)) dropdown.close();
        if (help.isVisible && !contains(help.renderable)) help.hide();
    };

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

    const view: LogView = createLogView(components, {
        store,
        wrap,
        showNamespace: layout.showNamespace,
        levelStyle: layout.levelStyle,
        onFocus: focusLog,
        onOpenSourceLocation(location) {
            if (props.openSourceLocation === undefined) {
                toasts.push({ tone: 'muted', text: 'set VISUAL or EDITOR to open source locations' });
                return;
            }
            void props.openSourceLocation(location).catch(report);
        }
    });
    logColumn.add(view.renderable);

    const input = createInputBar(components, {
        history,
        now,
        onSubmit: guard(submit),
        onComplete: props.onComplete,
        onInterrupt: guard(interrupt),
        onHint: guard((text: string | undefined) => statusBar.setHint(text)),
        serverStopping: () => state === 'stopping',
        onFocusChange: guard((focused: boolean) => {
            if (inputFocused === focused) return;
            inputFocused = focused;
            refreshStatus();
        })
    });

    function focusInput(): void {
        inputFocused = true;
        input.focus();
        refreshStatus();
    }

    function focusLog(): void {
        inputFocused = false;
        input.blur();
        refreshStatus();
    }

    function toggleFocus(): void {
        if (inputFocused) focusLog();
        else focusInput();
    }

    logColumn.add(toasts.renderable);
    main.add(logColumn);
    main.add(sidePane.renderable);
    main.add(sidePaneResizer);
    root.add(titleBar.renderable);
    root.add(main);
    root.add(input.renderable);
    root.add(statusBar.renderable);
    root.add(help.renderable);
    root.add(dropdown.renderable);
    renderer.root.add(root);

    function refreshStatus(): void {
        const left: Segment[] = [stateSegment(state)];
        left.push({
            id: 'error-count',
            text: `ERR ${store.errorCount}`,
            tone: 'danger',
            priority: 98,
            onActivate: store.errorCount > 0 ? () => showLevel('error') : undefined
        });
        left.push({
            id: 'warning-count',
            text: `WARN ${store.warningCount}`,
            tone: 'warning',
            priority: 97,
            onActivate: store.warningCount > 0 ? () => showLevel('warn') : undefined
        });
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
        const focusSegment: Segment = inputFocused
            ? { id: 'focus', text: 'INPUT · Esc log', tone: 'muted', priority: 10 }
            : { id: 'focus', text: 'LOG · Esc input', tone: 'muted', priority: 10 };
        const helpSegment: Segment = {
            ...HELP_SEGMENT,
            tone: 'accent',
            priority: 110,
            onActivate: () => {
                dropdown.close();
                help.toggle();
            }
        };
        const detailsSegment: Segment = {
            id: 'details',
            text: layout.sidePane === 'overlay' ? '× details' : 'details',
            tone: 'accent',
            priority: 105,
            onActivate: () => {
                dropdown.close();
                help.hide();
                toggleSidePane();
            }
        };
        const filters: Segment[] = [
            {
                id: 'level-filter',
                text: levelFilter ?? 'all',
                tone: 'accent',
                priority: 100,
                onActivate: (bounds) => openLevelDropdown(bounds)
            },
            {
                id: 'namespace-filter',
                text: namespaceFilter ?? 'all',
                tone: 'accent',
                priority: 90,
                onActivate: (bounds) => openNamespaceDropdown(bounds)
            }
        ];
        if (store.hiddenCount > 0) {
            filters.push({
                id: 'hidden-count',
                text: `${store.hiddenCount} hidden ×`,
                tone: 'accent',
                priority: 50,
                onActivate: (bounds) => openHiddenDropdown(bounds)
            });
        }
        const right = layout.sidePane === 'inline' ? filters : [detailsSegment, ...filters];
        statusBar.setRight(layout.compactStatus ? [...right, helpSegment] : [focusSegment, ...right, helpSegment]);
    }

    function openLevelDropdown(anchor: SegmentBounds): void {
        help.hide();
        const options: DropdownOption[] = [
            { label: 'All levels', value: 'all' },
            ...LOG_LEVELS.map((level) => ({ label: `${level} and more severe`, value: level }))
        ];
        dropdown.open({
            title: 'Log level',
            anchor,
            options,
            selectedValue: levelFilter ?? 'all',
            onSelect(value) {
                if (value !== 'all' && !isLogLevel(value)) return;
                levelFilter = value === 'all' ? undefined : value;
                store.setLevelFilter(levelFilter);
                refreshStatus();
            }
        });
    }

    function openNamespaceDropdown(anchor: SegmentBounds): void {
        help.hide();
        const namespaces = store.namespaces();
        const options: DropdownOption[] = [{ label: 'All namespaces', value: 'all' }];
        if (namespaceFilter !== undefined && !namespaceFilterExact) {
            options.push({ label: `Pattern: ${namespaceFilter}`, value: `pattern:${namespaceFilter}` });
        }
        for (const namespace of namespaces) {
            options.push({ label: namespace, value: `namespace:${namespace}` });
        }
        if (namespaceFilter !== undefined && namespaceFilterExact && !namespaces.includes(namespaceFilter)) {
            options.push({ label: `Current: ${namespaceFilter}`, value: `namespace:${namespaceFilter}` });
        }

        dropdown.open({
            title: 'Namespace',
            anchor,
            options,
            selectedValue:
                namespaceFilter === undefined
                    ? 'all'
                    : namespaceFilterExact
                      ? `namespace:${namespaceFilter}`
                      : `pattern:${namespaceFilter}`,
            onSelect(value) {
                if (value === 'all') {
                    namespaceFilter = undefined;
                    namespaceFilterExact = false;
                } else if (value.startsWith('pattern:')) {
                    namespaceFilter = value.slice('pattern:'.length);
                    namespaceFilterExact = false;
                } else if (value.startsWith('namespace:')) {
                    namespaceFilter = value.slice('namespace:'.length);
                    namespaceFilterExact = true;
                } else {
                    return;
                }
                store.setNamespaceFilter(namespaceFilter, namespaceFilterExact, namespaceFilterExact);
                refreshStatus();
            }
        });
    }

    function openHiddenDropdown(anchor: SegmentBounds): void {
        help.hide();
        const options: DropdownOption[] = [{ label: 'Show all logs', value: 'clear-all' }];
        if (levelFilter !== undefined) options.push({ label: 'Clear level filter', value: 'clear-level' });
        if (namespaceFilter !== undefined) options.push({ label: 'Clear namespace filter', value: 'clear-namespace' });

        dropdown.open({
            title: `${store.hiddenCount} hidden`,
            anchor,
            options,
            onSelect(value) {
                if (value === 'clear-all') {
                    clearFilters();
                    return;
                }
                if (value === 'clear-level') {
                    levelFilter = undefined;
                    store.setLevelFilter(undefined);
                } else if (value === 'clear-namespace') {
                    namespaceFilter = undefined;
                    namespaceFilterExact = false;
                    store.setNamespaceFilter(undefined);
                } else {
                    return;
                }
                refreshStatus();
            }
        });
    }

    function clearFilters(): void {
        dropdown.close();
        levelFilter = undefined;
        namespaceFilter = undefined;
        namespaceFilterExact = false;
        store.setLevelFilter(undefined);
        store.setNamespaceFilter(undefined);
        refreshStatus();
    }

    function refreshSidePane(): void {
        sidePane.update({
            state,
            players: metrics.players,
            playerNames: metrics.playerNames,
            tps: metrics.tps,
            tpsHistory,
            tickMs: metrics.tickMs,
            server,
            uptimeMs: metrics.uptimeMs,
            rssBytes: metrics.rssBytes,
            dev
        });
    }

    function applyLayout(): void {
        const next = computeLayout(renderer.terminalWidth, renderer.terminalHeight, {
            sidePaneVisible: sidePanePreference,
            sidePaneWidth
        });
        const previous = layout;
        layout = next;

        titleBar.renderable.visible = next.titleBar;
        sidePane.setMode(next.sidePane, next.sidePaneWidth);
        sidePaneResizer.visible = next.sidePane !== 'hidden';
        sidePaneResizer.position = 'absolute';
        sidePaneResizer.width = SIDE_PANE_RESIZER_WIDTH;
        sidePaneResizer.height = '100%';
        sidePaneResizer.top = 0;
        if (next.sidePane === 'inline') {
            sidePaneResizer.left = next.logWidth;
            sidePaneResizer.right = undefined;
        } else if (next.sidePane === 'overlay') {
            sidePaneResizer.left = undefined;
            sidePaneResizer.right = next.sidePaneWidth - SIDE_PANE_RESIZER_WIDTH;
        } else {
            sidePaneResizer.left = undefined;
            sidePaneResizer.right = undefined;
        }
        sidePaneResizer.zIndex = next.sidePane === 'overlay' ? 6 : undefined;
        if (next.levelStyle !== previous.levelStyle) view.setLevelStyle(next.levelStyle);
        if (next.showNamespace !== previous.showNamespace) view.setShowNamespace(next.showNamespace);
        refreshStatus();
        refreshSidePane();
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

    /** Scrolls the visible record at `index` into view and remembers it for the next jump. */
    function scrollToIndex(index: number): void {
        view.scrollTo(index);
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

    function showLevel(level: LogLevel): void {
        dropdown.close();
        help.hide();
        levelFilter = level;
        namespaceFilter = undefined;
        namespaceFilterExact = false;
        search = undefined;
        store.setLevelFilter(level);
        store.setNamespaceFilter(undefined);
        store.setSearch(undefined);
        view.setSearchHighlight(undefined);
        jumpCursor = store.visible().length;
        refreshStatus();
        focusLog();
        jumpToLevel(level);
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

    /** Asks the server which command names it knows, so `/name` can be told apart from a search. */
    function learnCommandNames(): void {
        props.onComplete('', 0).then(
            guard((result: CompletionResult) => {
                commandNames = new Set(result.completions);
            }),
            () => {
                // Without names every `/` line stays local; the next hello asks again.
            }
        );
    }

    /**
     * Handles a `/` line locally: `/` clears the search, `/ns:pattern` filters namespaces, and
     * `/text` searches. Returns false when the line is a server command, which includes
     * `/name ...` for every `name` the server completes.
     */
    function localCommand(line: string): boolean {
        if (!line.startsWith('/')) return false;
        const body = line.slice(1).trim();
        if (body === '') {
            setSearch(undefined);
            focusLog();
            return true;
        }
        if (commandNames.has(body.split(/\s+/, 1)[0] ?? '')) return false;
        const namespace = /^(!?)ns:(.*)$/.exec(body);
        if (namespace) {
            const [, invert, pattern] = namespace;
            namespaceFilter = pattern === '' ? undefined : `${invert}${pattern}`;
            namespaceFilterExact = false;
            store.setNamespaceFilter(namespaceFilter);
            refreshStatus();
            focusLog();
            return true;
        }
        setSearch(body);
        const last = store.nextMatch(store.visible().length, -1);
        if (last === undefined) toasts.push({ tone: 'muted', text: `no matches for "${body}"` });
        else scrollToIndex(last);
        focusLog();
        return true;
    }

    function submit(line: string): void {
        if (localCommand(line)) return;
        props.onCommand(line).then(
            guard((outcome: CommandOutcome) => {
                if (!outcome.ok) {
                    const message = outcome.error ?? `command failed: ${line}`;
                    store.appendLocal('error', 'Console', message, now());
                    refreshStatus();
                    toasts.push({ tone: 'danger', text: message });
                }
            }),
            guard((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                store.appendLocal('error', 'Console', `${line}: ${message}`, now());
                refreshStatus();
                toasts.push({ tone: 'danger', text: message });
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
                focusInput();
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
            case 'log.copySelection': {
                const selectedText = view.getSelectedText();
                if (selectedText.length === 0) {
                    toasts.push({ tone: 'muted', text: 'select text to copy' });
                    return;
                }
                if (!renderer.copyToClipboardOSC52(selectedText)) {
                    toasts.push({ tone: 'muted', text: 'clipboard copy is unavailable in this terminal' });
                    return;
                }
                toasts.push({ tone: 'muted', text: 'copied selection to clipboard' });
                return;
            }
            case 'log.top':
                view.toTop();
                return;
            case 'log.bottom':
                view.toBottom();
                return;
            case 'log.search':
                focusInput();
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
                view.clearView();
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
            case 'view.toggleFocus':
                toggleFocus();
                return;
            case 'view.palette':
                toasts.push(NOT_AVAILABLE('the command palette'));
                return;
            case 'server.restart':
                if (canRestart) props.actions.restart();
                else toasts.push({ tone: 'muted', text: 'restart is only available with --watch' });
                return;
            case 'server.stop':
                props.actions.stop();
                return;
        }
    }

    function escape(): boolean {
        if (dropdown.isOpen) {
            dropdown.close();
            return true;
        }
        if (inputFocused && input.isCompleting()) return false;
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
        run('view.toggleFocus');
        return true;
    }

    /**
     * Runs before the input bar's handler. The catalog receives keys only while the log has
     * focus, so shortcut letters remain available to the command editor.
     */
    const onKey = guard((key: KeyEvent) => {
        if (key.name === 'escape' && !key.ctrl && !key.meta && !key.shift) {
            if (escape()) key.preventDefault();
            return;
        }
        if (dropdown.isOpen) {
            key.preventDefault();
            dropdown.handleKeyPress(key);
            return;
        }
        if (help.isVisible) {
            key.preventDefault();
            help.handleKeyPress(key);
            return;
        }
        const id = resolveCommand(key, { inputFocused });
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
                tpsHistory = [];
                refreshSidePane();
                learnCommandNames();
                return;
            case 'log': {
                const { seq, level, namespace, at, message: text, formatted } = message;
                store.append({ seq, level, namespace, at, message: text, formatted });
                refreshStatus();
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
                    playerNames: message.playerNames,
                    rssBytes: message.rssBytes,
                    uptimeMs: message.uptimeMs
                };
                tpsHistory.push(message.tps);
                if (tpsHistory.length > TPS_HISTORY_LIMIT) tpsHistory.shift();
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
        if (event.type === 'supervisor.watching') canRestart = event.canRestart === true;
        if (event.type === 'supervisor.state') {
            if (event.state === 'starting' && event.generation > 1) {
                store.startGeneration('server restarted', now());
                metrics = {};
                tpsHistory = [];
                refreshSidePane();
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
            focusInput();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            renderer.keyInput.off('keypress', onKey);
            renderer.off(CliRenderEvents.RESIZE, onResize);
            view.dispose();
            input.dispose();
            statusBar.dispose();
            dropdown.dispose();
            toasts.dispose();
            help.dispose();
            sidePane.dispose();
            titleBar.dispose();
            renderer.root.remove(root);
            root.destroyRecursively();
        }
    };
}
