import { BoxRenderable, CliRenderEvents, StyledText, TextRenderable, fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

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
 * A centered cheat sheet of key bindings that floats over the rest of the console. Hidden until
 * `show` or `toggle` is called.
 */
export interface HelpOverlay {
    /** Absolutely positioned; add it to the pane the overlay should float over. */
    renderable: BoxRenderable;
    show(): void;
    hide(): void;
    toggle(): void;
    readonly isVisible: boolean;
    /** Removes the resize listener and destroys the renderables. */
    dispose(): void;
}

type HelpLine = { kind: 'header'; text: string } | { kind: 'command'; keys: string; title: string } | { kind: 'blank' };

interface HelpLayout {
    columns: HelpLine[][];
    /** Inner width of the box, excluding border and padding. */
    width: number;
    /** Number of body rows shown, including a trailing ellipsis row when truncated. */
    rows: number;
    truncated: boolean;
}

const TITLE = ' Keyboard shortcuts ';
const FOOTER = 'Esc to close';
const ELLIPSIS = '…';
const KEY_GAP = 2;
const COLUMN_GAP = 3;
const PADDING_X = 1;
/** Border rows and columns on both sides. */
const BORDER = 2;
/** The blank row above the footer plus the footer itself. */
const FOOTER_ROWS = 2;
const Z_INDEX = 100;

const keysOf = (command: CommandSpec): string =>
    command.bindings.length > 0 ? command.bindings.map(formatBinding).join(', ') : (command.hint ?? '');

const linesFor = (catalog: CommandCatalog): HelpLine[][] =>
    COMMAND_GROUPS.map((group) => catalog.filter((command) => command.group === group))
        .filter((commands) => commands.length > 0)
        .map((commands) => [
            { kind: 'header', text: commands[0]?.group ?? '' },
            ...commands.map((command): HelpLine => ({ kind: 'command', keys: keysOf(command), title: command.title }))
        ]);

const joinBlocks = (blocks: HelpLine[][]): HelpLine[] =>
    blocks.flatMap((block, index) => (index === 0 ? block : [{ kind: 'blank' }, ...block]));

/** Splits the group blocks into two columns of roughly equal height without breaking a group. */
const splitBlocks = (blocks: HelpLine[][]): [HelpLine[], HelpLine[]] => {
    const total = joinBlocks(blocks).length;
    let taken = 0;
    let split = 0;
    while (split < blocks.length - 1 && taken < total / 2) {
        taken += (blocks[split]?.length ?? 0) + 1;
        split += 1;
    }
    return [joinBlocks(blocks.slice(0, split)), joinBlocks(blocks.slice(split))];
};

function layoutHelp(catalog: CommandCatalog, terminalWidth: number, terminalHeight: number): HelpLayout {
    const blocks = linesFor(catalog);
    const commands = blocks.flat().filter((line) => line.kind === 'command');
    const keyWidth = Math.max(0, ...commands.map((line) => columns(line.keys)));
    const titleWidth = Math.max(0, ...commands.map((line) => columns(line.title)));
    const columnWidth = keyWidth + KEY_GAP + titleWidth;

    const maxInnerWidth = Math.max(1, terminalWidth - BORDER - PADDING_X * 2);
    const maxBodyRows = Math.max(1, terminalHeight - BORDER - FOOTER_ROWS);

    const single = joinBlocks(blocks);
    const twoColumnsFit = columnWidth * 2 + COLUMN_GAP <= maxInnerWidth && blocks.length > 1;
    const laidOut = single.length > maxBodyRows && twoColumnsFit ? splitBlocks(blocks) : [single];

    const height = Math.max(...laidOut.map((column) => column.length));
    const truncated = height > maxBodyRows;
    const rows = truncated ? maxBodyRows : height;
    const width = Math.min(maxInnerWidth, laidOut.length * columnWidth + (laidOut.length - 1) * COLUMN_GAP);

    const visibleRows = truncated ? rows - 1 : rows;
    return {
        columns: laidOut.map((column) => column.slice(0, visibleRows)),
        width,
        rows,
        truncated
    };
}

/**
 * Creates the help overlay. The box lays itself out from the catalog on every `show` and on
 * resize: one column when it fits, two when the terminal is too short but wide enough, and a
 * trailing `…` row when even that does not fit.
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

    const chunksFor = (line: HelpLine, keyWidth: number): TextChunk[] => {
        switch (line.kind) {
            case 'header':
                return [fg(theme.textMuted)(line.text)];
            case 'command':
                return [fg(theme.accent)(line.keys.padEnd(keyWidth + KEY_GAP)), fg(theme.text)(line.title)];
            case 'blank':
                return [];
        }
    };

    const layout = () => {
        for (const child of renderable.getChildren()) {
            renderable.remove(child);
            child.destroyRecursively();
        }

        const result = layoutHelp(catalog, renderer.terminalWidth, renderer.terminalHeight);
        const keyWidth = Math.max(
            0,
            ...result.columns.flat().map((line) => (line.kind === 'command' ? columns(line.keys) : 0))
        );
        const columnWidth = Math.floor(
            (result.width - COLUMN_GAP * (result.columns.length - 1)) / result.columns.length
        );

        const body = new BoxRenderable(renderer, {
            id: 'help-body',
            flexDirection: 'row',
            columnGap: COLUMN_GAP,
            height: result.rows
        });
        result.columns.forEach((lines, columnIndex) => {
            const column = new BoxRenderable(renderer, {
                id: `help-column-${columnIndex}`,
                flexDirection: 'column',
                width: columnWidth
            });
            lines.forEach((line, rowIndex) => {
                column.add(
                    new TextRenderable(renderer, {
                        id: `help-line-${columnIndex}-${rowIndex}`,
                        height: 1,
                        truncate: true,
                        content: new StyledText(chunksFor(line, keyWidth))
                    })
                );
            });
            if (result.truncated && columnIndex === 0) {
                column.add(
                    new TextRenderable(renderer, {
                        id: 'help-ellipsis',
                        height: 1,
                        content: new StyledText([fg(theme.textMuted)(ELLIPSIS)])
                    })
                );
            }
            body.add(column);
        });
        renderable.add(body);
        renderable.add(
            new TextRenderable(renderer, {
                id: 'help-footer',
                height: 1,
                marginTop: 1,
                content: new StyledText([fg(theme.textMuted)(FOOTER)])
            })
        );

        const width = result.width + PADDING_X * 2 + BORDER;
        const height = result.rows + FOOTER_ROWS + BORDER;
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
        get isVisible() {
            return renderable.visible;
        },
        dispose() {
            renderer.off(CliRenderEvents.RESIZE, onResize);
            renderable.destroyRecursively();
        }
    };
}
