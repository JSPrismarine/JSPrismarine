import type { MouseEvent } from '@opentui/core';
import { BoxRenderable, MouseButton, TextBuffer, TextRenderable } from '@opentui/core';
import type { ConsoleContext } from '../context';
import { columns, sliceColumns } from '../text';
import { LEVEL_TOKEN_WIDTH } from '../theme/styled';
import { formatLogLine } from './logLine';
import { NAMESPACE_WIDTH } from './logLine';
import type { FormattedLogLine, LevelStyle } from './logLine';
import type { LogStore } from './logStore';
import { LogWindow } from './logWindow';
import { sourceLocationAtColumn, sourceLocationFromNamespace } from './sourceLocation';
import type { SourceLocation } from './sourceLocation';
import type { StoredRecord } from './types';

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
    /** Called when the user clicks the log pane. */
    onFocus?(): void;
    /** Opens the file and line under Ctrl-click or Alt-click when the record contains a source location. */
    onOpenSourceLocation?(location: SourceLocation): void;
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
    /** Returns selected log text with soft wraps and visual indentation removed. */
    getSelectedText(): string;
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
 * Creates a windowed log view: a box holding one row per visible record plus a badge, regardless
 * of how many records the store holds. Rows are repainted from the store's visible list on
 * change and on resize, coalesced into one repaint per animation frame.
 */
export function createLogView(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: LogViewProps): LogView {
    const { renderer, theme } = ctx;
    const { store } = props;
    let wrap = props.wrap ?? false;
    let showNamespace = props.showNamespace ?? true;
    let levelStyle = props.levelStyle ?? 'full';
    let highlight: string | undefined;
    let paintedRows: { record: StoredRecord; line: FormattedLogLine; text: string }[] = [];

    const window = new LogWindow(1);
    window.onReset(store.visible().length);
    const rows: { box: BoxRenderable; text: TextRenderable }[] = [];
    let scheduledFrame: number | undefined;

    const renderable = new BoxRenderable(renderer, {
        id: 'log-view',
        width: '100%',
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        onMouseDown(event: MouseEvent) {
            if (event.button === MouseButton.LEFT) props.onFocus?.();
        },
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
            renderable.remove(row.box);
            row.box.destroyRecursively();
        }
        while (rows.length < height) {
            const index = rows.length;
            const box = new BoxRenderable(renderer, {
                id: `log-row-${index}`,
                width: '100%',
                height: 1,
                flexDirection: 'row',
                border: ['left'],
                borderColor: theme.background,
                backgroundColor: theme.background,
                overflow: 'hidden'
            });
            const text = new TextRenderable(renderer, {
                id: `log-row-text-${index}`,
                width: '100%',
                height: 1,
                wrapMode: 'none',
                onMouseDown(event) {
                    openSourceAtRow(index, event);
                }
            });
            box.add(text);
            renderable.add(box, rows.length);
            rows.push({ box, text });
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
        const options = { width: Math.max(1, paneWidth() - 1), wrap, showNamespace, levelStyle, theme, highlight };
        const lines = window.slice(store.visible()).flatMap((record) =>
            formatLogLine(record, options).map((line) => ({
                record,
                line,
                text: line.chunks.map((chunk) => chunk.text).join('')
            }))
        );
        const painted = window.follow
            ? lines.slice(Math.max(0, lines.length - rows.length))
            : lines.slice(0, rows.length);
        paintedRows = painted;
        rows.forEach((row, index) => {
            const record = painted[index]?.record;
            const level =
                record?.kind === 'log'
                    ? record.level
                    : record?.kind === 'raw' && record.stream === 'stderr'
                      ? 'error'
                      : record?.kind === 'dropped'
                        ? 'warn'
                        : undefined;
            row.box.borderColor = level === 'error' ? theme.error : level === 'warn' ? theme.warn : theme.background;
            row.box.backgroundColor = level === 'error' ? theme.errorBackground : theme.background;
            row.text.content = painted[index]?.line ?? '';
        });
        badge.visible = window.unread > 0;
        if (window.unread > 0) badge.content = ` ▼ ${window.unread} new lines · End to follow `;
    }

    const unsubscribe = store.onChange((change) => {
        if (change.type === 'append') window.onAppended(change.count, change.evicted);
        else window.onReset(store.visible().length);
        schedule();
    });

    function openSourceAtRow(index: number, event: MouseEvent): void {
        if (
            event.button !== MouseButton.LEFT ||
            (!event.modifiers.ctrl && !event.modifiers.alt) ||
            props.onOpenSourceLocation === undefined
        ) {
            return;
        }

        const painted = paintedRows[index];
        if (painted === undefined) return;
        const column = event.x - renderable.x - 1;
        let location: SourceLocation | undefined;

        if (painted.line.sourceStart === 0 && painted.record.kind === 'log' && showNamespace) {
            const levelWidth = levelStyle === 'full' ? LEVEL_TOKEN_WIDTH : 1;
            const namespaceStart = 9 + levelWidth + 1;
            if (column >= namespaceStart && column < namespaceStart + NAMESPACE_WIDTH) {
                location = sourceLocationFromNamespace(painted.record.namespace);
            }
        }
        if (column >= painted.line.contentStart && column < columns(painted.text)) {
            location ??= sourceLocationAtColumn(
                painted.line.sourceText,
                painted.line.sourceStart + column - painted.line.contentStart
            );
        }
        if (location === undefined) return;

        event.preventDefault();
        props.onOpenSourceLocation(location);
    }

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
        getSelectedText() {
            const selection = renderer.getSelection();
            if (!selection) return '';
            if (selection.selectedRenderables.some((selected) => !rows.some((row) => row.text === selected))) {
                return selection.getSelectedText();
            }
            const parts: string[] = [];
            let previous: { record: StoredRecord; end: number } | undefined;
            const buffer = TextBuffer.create(renderer.widthMethod, renderer.nativeScene);
            try {
                rows.forEach((row, index) => {
                    const bounds = row.text.getSelection();
                    const painted = paintedRows[index];
                    if (!bounds || !painted) return;
                    const { line, record } = painted;
                    // OpenTUI selections count display cells; source mappings count code points.
                    buffer.setText(painted.text);
                    const startColumn = columns(buffer.getTextRange(0, bounds.start));
                    const endColumn = columns(buffer.getTextRange(0, bounds.end));
                    const start = line.sourceStart + Math.max(0, startColumn - line.contentStart);
                    const end = Math.min(line.sourceEnd, line.sourceStart + Math.max(0, endColumn - line.contentStart));
                    if (end <= start) return;
                    if (previous) {
                        parts.push(
                            previous.record === record ? sliceColumns(line.sourceText, previous.end, start) : '\n'
                        );
                    }
                    parts.push(sliceColumns(line.sourceText, start, end));
                    previous = { record, end };
                });
                return parts.join('');
            } finally {
                buffer.destroy();
            }
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
