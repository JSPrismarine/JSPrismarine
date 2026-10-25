import type { MouseEvent } from '@opentui/core';
import { BoxRenderable, TextRenderable } from '@opentui/core';
import type { ConsoleContext } from '../context';
import { formatLogLine } from './logLine';
import type { LevelStyle } from './logLine';
import type { LogStore } from './logStore';
import { LogWindow } from './logWindow';

/** Inputs for {@link createLogView}. */
export interface LogViewProps {
    /** Source of records; the view repaints on every change. */
    store: LogStore;
    /** Wrap messages instead of truncating them. Defaults to false. */
    wrap?: boolean;
    /** Show the namespace column. Defaults to true. */
    showNamespace?: boolean;
    /** Level column style. Defaults to `full`. */
    levelStyle?: LevelStyle;
}

/**
 * The log pane. Scrolling toward older rows pauses follow; `toBottom` resumes it.
 */
export interface LogView {
    renderable: BoxRenderable;
    /** Scrolls by `rows`; negative scrolls toward older rows. */
    scrollBy(rows: number): void;
    pageUp(): void;
    pageDown(): void;
    toTop(): void;
    toBottom(): void;
    /** Scrolls the visible record at `index` into view, moving as little as possible. */
    scrollTo(index: number): void;
    /** Hides every record shown so far without touching the store; later records paint from the top. */
    clearView(): void;
    setWrap(wrap: boolean): void;
    setShowNamespace(show: boolean): void;
    setLevelStyle(style: LevelStyle): void;
    /** Marks occurrences of `query` in visible messages; `undefined` clears the marks. */
    setSearchHighlight(query: string | undefined): void;
    /** Unsubscribes from the store and destroys the renderables. */
    dispose(): void;
}

const WHEEL_ROWS = 3;

/**
 * Creates a windowed log view: a box holding one `TextRenderable` per visible row plus a badge,
 * regardless of how many records the store holds. Rows are repainted from the store's visible
 * list on change and on resize, coalesced into one repaint per animation frame.
 */
export function createLogView(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: LogViewProps): LogView {
    const { renderer, theme } = ctx;
    const { store } = props;
    let wrap = props.wrap ?? false;
    let showNamespace = props.showNamespace ?? true;
    let levelStyle = props.levelStyle ?? 'full';
    let highlight: string | undefined;

    const window = new LogWindow(1);
    window.onReset(store.visible().length);
    const rows: TextRenderable[] = [];
    let scheduledFrame: number | undefined;

    const renderable = new BoxRenderable(renderer, {
        id: 'log-view',
        width: '100%',
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        onMouseScroll(event: MouseEvent) {
            const direction = event.scroll?.direction;
            if (direction === 'up') scrollBy(-WHEEL_ROWS);
            else if (direction === 'down') scrollBy(WHEEL_ROWS);
        },
        onSizeChange() {
            syncPool();
            schedule();
        }
    });

    const badge = new TextRenderable(renderer, {
        id: 'log-badge',
        position: 'absolute',
        bottom: 0,
        right: 1,
        zIndex: 1,
        height: 1,
        visible: false,
        fg: theme.accent,
        bg: theme.surface
    });
    renderable.add(badge);

    const paneWidth = () => (renderable.width > 0 ? renderable.width : renderer.width);

    function syncPool(): void {
        const height = Math.max(0, renderable.height);
        while (rows.length > height) {
            const row = rows.pop()!;
            renderable.remove(row);
            row.destroyRecursively();
        }
        while (rows.length < height) {
            const row = new TextRenderable(renderer, {
                id: `log-row-${rows.length}`,
                width: '100%',
                height: 1,
                wrapMode: 'none'
            });
            renderable.add(row, rows.length);
            rows.push(row);
        }
        if (height > 0 && height !== window.height) window.onResize(height);
    }

    function schedule(): void {
        if (scheduledFrame !== undefined) return;
        scheduledFrame = renderer.requestAnimationFrame(() => {
            scheduledFrame = undefined;
            paint();
        });
    }

    function paint(): void {
        if (rows.length === 0) return;
        const options = { width: paneWidth(), wrap, showNamespace, levelStyle, theme, highlight };
        const lines = window.slice(store.visible()).flatMap((record) => formatLogLine(record, options));
        const painted = window.follow
            ? lines.slice(Math.max(0, lines.length - rows.length))
            : lines.slice(0, rows.length);
        rows.forEach((row, index) => {
            row.content = painted[index] ?? '';
        });
        badge.visible = window.unread > 0;
        if (window.unread > 0) badge.content = ` ▼ ${window.unread} new lines · End to follow `;
    }

    const unsubscribe = store.onChange((change) => {
        if (change.type === 'append') window.onAppended(change.count, change.evicted);
        else window.onReset(store.visible().length);
        schedule();
    });

    function scrollBy(count: number): void {
        window.scrollBy(count);
        schedule();
    }

    return {
        renderable,
        scrollBy,
        pageUp() {
            window.pageUp();
            schedule();
        },
        pageDown() {
            window.pageDown();
            schedule();
        },
        toTop() {
            window.toTop();
            schedule();
        },
        toBottom() {
            window.toBottom();
            schedule();
        },
        scrollTo(index) {
            window.scrollTo(index);
            schedule();
        },
        clearView() {
            window.clear();
            schedule();
        },
        setWrap(value) {
            wrap = value;
            schedule();
        },
        setShowNamespace(value) {
            showNamespace = value;
            schedule();
        },
        setLevelStyle(style) {
            levelStyle = style;
            schedule();
        },
        setSearchHighlight(query) {
            highlight = query === '' ? undefined : query;
            schedule();
        },
        dispose() {
            unsubscribe();
            if (scheduledFrame !== undefined) renderer.cancelAnimationFrame(scheduledFrame);
            renderable.destroyRecursively();
        }
    };
}
