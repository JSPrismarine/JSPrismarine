import { BoxRenderable, CliRenderEvents, StyledText, TextRenderable, fg } from '@opentui/core';
import type { KeyEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { COMMAND_GROUPS, formatBinding } from '../keymap/catalog';
import type { CommandCatalog, CommandSpec } from '../keymap/catalog';
import { columns } from '../text';

/** Inputs for {@link createHelpOverlay}. */
export interface HelpOverlayProps {
    /** Commands to list. The overlay is generated from this, so it cannot drift from the bindings. */
    catalog: CommandCatalog;
}

/**
 * A compact, scrollable cheat sheet of key bindings that floats over the console.
 * Hidden until `show` or `toggle` is called.
 */
export interface HelpOverlay {
    /** Absolutely positioned; add it to the pane the overlay should float over. */
    renderable: BoxRenderable;
    show(): void;
    hide(): void;
    toggle(): void;
    /** Routes scrolling keys to the visible shortcut list. */
    handleKeyPress(key: KeyEvent): boolean;
    readonly isVisible: boolean;
    /** Removes the resize listener and destroys the renderables. */
    dispose(): void;
}

type HelpLine =
    { kind: 'header'; text: string } | { kind: 'command'; keys: string; title: string; alternateKeys?: string };

interface HelpLayout {
    columns: HelpLine[][];
    columnWidths: number[];
    /** Inner width of the box, excluding border and padding. */
    width: number;
    /** Number of body rows across all columns. */
    totalRows: number;
    /** Number of body rows visible at once. */
    visibleRows: number;
}

const TITLE = ' Keyboard shortcuts ';
const FOOTER = '↑/↓ PgUp/PgDn · Esc to close';
const KEY_GAP = 2;
const COLUMN_GAP = 3;
const PADDING_X = 1;
/** Border rows and columns on both sides. */
const BORDER = 2;
const FOOTER_ROWS = 1;
const MAX_HEIGHT = 20;
const Z_INDEX = 100;

const commandLine = (command: CommandSpec): HelpLine => {
    const bindings = command.bindings.map(formatBinding);
    const keys = bindings.join(', ');
    const compactKeys = keys.length > 16;

    return {
        kind: 'command',
        keys: compactKeys ? (bindings[0] ?? command.hint ?? '') : keys || (command.hint ?? ''),
        title: command.title,
        alternateKeys: compactKeys ? bindings.slice(1).join(', ') : undefined
    };
};

const linesFor = (catalog: CommandCatalog): HelpLine[][] =>
    COMMAND_GROUPS.map((group) => catalog.filter((command) => command.group === group))
        .filter((commands) => commands.length > 0)
        .map((commands) => [{ kind: 'header', text: commands[0]?.group ?? '' }, ...commands.map(commandLine)]);

const joinBlocks = (blocks: HelpLine[][]): HelpLine[] => blocks.flat();

/** Splits the group blocks into two columns of roughly equal height without breaking a group. */
const splitBlocks = (blocks: HelpLine[][]): [HelpLine[], HelpLine[]] => {
    const total = joinBlocks(blocks).length;
    let taken = 0;
    let split = 0;
    while (split < blocks.length - 1 && taken < total / 2) {
        taken += blocks[split]?.length ?? 0;
        split += 1;
    }
    return [joinBlocks(blocks.slice(0, split)), joinBlocks(blocks.slice(split))];
};

const keyColumnWidth = (lines: readonly HelpLine[]): number =>
    Math.max(0, ...lines.map((line) => (line.kind === 'command' ? columns(line.keys) : 0)));

const lineWidth = (lines: readonly HelpLine[]): number => {
    const keyWidth = keyColumnWidth(lines);
    return Math.max(
        0,
        ...lines.map((line) =>
            line.kind === 'command'
                ? keyWidth + KEY_GAP + columns(line.title) + (line.alternateKeys ? 3 + columns(line.alternateKeys) : 0)
                : columns(line.text)
        )
    );
};

function layoutHelp(catalog: CommandCatalog, terminalWidth: number, terminalHeight: number): HelpLayout {
    const blocks = linesFor(catalog);
    const maxInnerWidth = Math.max(1, terminalWidth - BORDER - PADDING_X * 2);
    const maxPanelHeight = Math.max(1, Math.min(MAX_HEIGHT, Math.ceil(terminalHeight * 0.6), terminalHeight));
    const maxBodyRows = Math.max(1, maxPanelHeight - BORDER - FOOTER_ROWS);

    const single = joinBlocks(blocks);
    const singleWidth = lineWidth(single);
    const [left, right] = splitBlocks(blocks);
    const twoColumnWidths = [lineWidth(left), lineWidth(right)];
    const twoColumnWidth = twoColumnWidths.reduce((sum, width) => sum + width, COLUMN_GAP);
    const useTwoColumns = blocks.length > 1 && twoColumnWidth <= maxInnerWidth;
    const laidOut = useTwoColumns ? [left, right] : [single];
    const columnWidths = useTwoColumns ? twoColumnWidths : [Math.min(maxInnerWidth, singleWidth)];
    const totalRows = Math.max(1, ...laidOut.map((column) => column.length));

    return {
        columns: laidOut,
        columnWidths,
        width: Math.min(
            maxInnerWidth,
            columnWidths.reduce((sum, width) => sum + width, COLUMN_GAP * (laidOut.length - 1))
        ),
        totalRows,
        visibleRows: Math.min(totalRows, maxBodyRows)
    };
}

/**
 * Creates the help overlay. It uses two columns when the terminal has room, otherwise it shows
 * a bounded page of shortcuts that can be scrolled with the keyboard or mouse.
 */
export function createHelpOverlay(
    ctx: Pick<ConsoleContext, 'renderer' | 'theme'>,
    props: HelpOverlayProps
): HelpOverlay {
    const { renderer, theme } = ctx;
    const { catalog } = props;

    const renderable = new BoxRenderable(renderer, {
        id: 'help-overlay',
        position: 'absolute',
        zIndex: Z_INDEX,
        visible: false,
        flexDirection: 'column',
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.border,
        backgroundColor: theme.surface,
        title: TITLE,
        titleColor: theme.accent,
        titleAlignment: 'center',
        paddingLeft: PADDING_X,
        paddingRight: PADDING_X
    });

    let scrollOffset = 0;
    let visibleRows = 1;
    let maxScrollOffset = 0;

    const chunksFor = (line: HelpLine, keyWidth: number): TextChunk[] => {
        switch (line.kind) {
            case 'header':
                return [fg(theme.accent)(line.text)];
            case 'command':
                return [
                    fg(theme.accent)(line.keys.padEnd(keyWidth + KEY_GAP)),
                    fg(theme.text)(line.title),
                    ...(line.alternateKeys ? [fg(theme.textMuted)(` (${line.alternateKeys})`)] : [])
                ];
        }
    };

    const scrollBy = (rows: number): void => {
        scrollOffset = Math.max(0, Math.min(maxScrollOffset, scrollOffset + rows));
        layout();
    };

    const layout = () => {
        for (const child of renderable.getChildren()) {
            renderable.remove(child);
            child.destroyRecursively();
        }

        const result = layoutHelp(catalog, renderer.terminalWidth, renderer.terminalHeight);
        visibleRows = result.visibleRows;
        maxScrollOffset = Math.max(0, result.totalRows - visibleRows);
        scrollOffset = Math.min(scrollOffset, maxScrollOffset);
        const footer = maxScrollOffset > 0 ? (result.columns.length === 1 ? `… ${FOOTER}` : FOOTER) : 'Esc to close';
        const columnsToRender = result.columns.map((column) => column.slice(scrollOffset, scrollOffset + visibleRows));
        const body = new BoxRenderable(renderer, {
            id: 'help-body',
            flexDirection: 'row',
            columnGap: COLUMN_GAP,
            height: visibleRows,
            onMouseScroll(event) {
                const scroll = event.scroll;
                if (scroll === undefined) return;
                if (scroll.direction === 'up') scrollBy(-Math.max(1, Math.floor(scroll.delta)));
                else if (scroll.direction === 'down') scrollBy(Math.max(1, Math.floor(scroll.delta)));
                else return;
                event.preventDefault();
            }
        });
        columnsToRender.forEach((lines, columnIndex) => {
            const column = new BoxRenderable(renderer, {
                id: `help-column-${columnIndex}`,
                flexDirection: 'column',
                width: result.columnWidths[columnIndex] ?? result.width
            });
            const keyWidth = keyColumnWidth(result.columns[columnIndex] ?? []);
            lines.forEach((line, rowIndex) => {
                column.add(
                    new TextRenderable(renderer, {
                        id: `help-line-${columnIndex}-${rowIndex}`,
                        height: 1,
                        truncate: true,
                        wrapMode: 'none',
                        content: new StyledText(chunksFor(line, keyWidth))
                    })
                );
            });
            body.add(column);
        });
        renderable.add(body);
        renderable.add(
            new TextRenderable(renderer, {
                id: 'help-footer',
                height: 1,
                truncate: true,
                wrapMode: 'none',
                content: new StyledText([fg(theme.accent)(footer)])
            })
        );

        const width = result.width + PADDING_X * 2 + BORDER;
        const height = visibleRows + FOOTER_ROWS + BORDER;
        renderable.width = width;
        renderable.height = height;
        renderable.left = Math.max(0, Math.floor((renderer.terminalWidth - width) / 2));
        renderable.top = Math.max(0, Math.floor((renderer.terminalHeight - height) / 2));
    };

    const onResize = () => {
        if (renderable.visible) layout();
    };
    renderer.on(CliRenderEvents.RESIZE, onResize);

    const show = () => {
        layout();
        renderable.visible = true;
    };
    const hide = () => {
        renderable.visible = false;
    };

    return {
        renderable,
        show,
        hide,
        toggle() {
            if (renderable.visible) hide();
            else show();
        },
        handleKeyPress(key) {
            if (!renderable.visible) return false;
            const page = Math.max(1, visibleRows - 1);
            switch (key.name) {
                case 'up':
                    scrollBy(-1);
                    return true;
                case 'down':
                    scrollBy(1);
                    return true;
                case 'pageup':
                    scrollBy(-page);
                    return true;
                case 'pagedown':
                    scrollBy(page);
                    return true;
                case 'home':
                    scrollBy(-maxScrollOffset);
                    return true;
                case 'end':
                    scrollBy(maxScrollOffset);
                    return true;
                default:
                    return false;
            }
        },
        get isVisible() {
            return renderable.visible;
        },
        dispose() {
            renderer.off(CliRenderEvents.RESIZE, onResize);
            renderable.destroyRecursively();
        }
    };
}
