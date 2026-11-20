import { BoxRenderable, CliRenderEvents, StyledText, TextRenderable, bg, bold, fg } from '@opentui/core';
import type { KeyEvent, TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { columns, sliceColumns } from '../text';
import type { PaletteItem, PaletteResult } from './paletteItems';
import { filterPalette, paletteLabel } from './paletteItems';

/** Callbacks for {@link createCommandPalette}. */
export interface CommandPaletteProps {
    /** Called with the chosen item after the palette has closed. */
    onChoose(item: PaletteItem): void;
}

/** The Ctrl+K overlay that finds a console action, a server command or a player by name. */
export interface CommandPalette {
    /** Absolutely positioned; add it to the app's root. */
    renderable: BoxRenderable;
    /** Opens with an empty query over `items`. */
    open(items: readonly PaletteItem[]): void;
    close(): void;
    readonly isOpen: boolean;
    /** Edits the query and moves the selection; Enter and Tab choose. */
    handleKeyPress(key: KeyEvent): void;
    /** Adds pasted text to the query, up to its first line break. */
    paste(text: string): void;
    dispose(): void;
}

const MAX_WIDTH = 72;
const MAX_ROWS = 10;
const Z_INDEX = 100;
/** Border rows plus the query row and the rule under it. */
const CHROME_ROWS = 4;

const kindLabel = (item: PaletteItem): string => {
    switch (item.kind) {
        case 'action':
            return item.keys ?? '';
        case 'command':
            return item.description ?? 'server command';
        case 'player':
            return 'player';
    }
};

/**
 * Creates the palette. It lists every result that fits under the query, best first, with the
 * matched characters marked, and keeps the selection on screen as it moves.
 */
export function createCommandPalette(
    ctx: Pick<ConsoleContext, 'renderer' | 'theme'>,
    props: CommandPaletteProps
): CommandPalette {
    const { renderer, theme } = ctx;

    const renderable = new BoxRenderable(renderer, {
        id: 'command-palette',
        position: 'absolute',
        zIndex: Z_INDEX,
        visible: false,
        flexDirection: 'column',
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.borderFocused,
        backgroundColor: theme.surface,
        paddingLeft: 1,
        paddingRight: 1
    });
    const queryRow = new TextRenderable(renderer, { id: 'palette-query', height: 1 });
    const rule = new TextRenderable(renderer, { id: 'palette-rule', height: 1, fg: theme.border });
    const list = new BoxRenderable(renderer, { id: 'palette-list', flexDirection: 'column' });
    renderable.add(queryRow);
    renderable.add(rule);
    renderable.add(list);
    for (const text of [queryRow, rule]) text.selectable = false;

    let items: readonly PaletteItem[] = [];
    let results: PaletteResult[] = [];
    let query = '';
    let selected = 0;
    let offset = 0;

    const innerWidth = () => Math.max(1, Math.min(MAX_WIDTH, renderer.terminalWidth - 4) - 4);
    const visibleRows = () => Math.max(1, Math.min(MAX_ROWS, renderer.terminalHeight - CHROME_ROWS - 4));

    const labelChunks = (result: PaletteResult, isSelected: boolean, width: number): TextChunk[] => {
        const label = paletteLabel(result.item);
        // The name is what tells rows apart, so a long description gives way to it: the name
        // keeps at least a third of the row (or all of itself, when shorter).
        const nameFloor = Math.min(columns(label), Math.max(8, Math.floor(width / 3)));
        const rightRoom = Math.max(0, width - 3 - nameFloor);
        const kind = kindLabel(result.item);
        const right =
            columns(kind) <= rightRoom ? kind : rightRoom > 1 ? `${sliceColumns(kind, 0, rightRoom - 1)}…` : '';
        const room = Math.max(1, width - columns(right) - 3);
        const shown = columns(label) > room ? `${sliceColumns(label, 0, room - 1)}…` : label;
        const matched = new Set(result.positions);
        const chunks: TextChunk[] = [fg(isSelected ? theme.accent : theme.textMuted)(isSelected ? '▸ ' : '  ')];
        [...shown].forEach((point, index) => {
            chunks.push(matched.has(index) ? fg(theme.accent)(bold(point)) : fg(theme.text)(point));
        });
        const gap = Math.max(1, width - 2 - columns(shown) - columns(right));
        chunks.push(fg(theme.textMuted)(`${' '.repeat(gap)}${right}`));
        return isSelected ? chunks.map((chunk) => bg(theme.selection)(chunk)) : chunks;
    };

    const paint = () => {
        const width = innerWidth();
        const rows = visibleRows();
        if (selected < offset) offset = selected;
        if (selected >= offset + rows) offset = selected - rows + 1;

        queryRow.content = new StyledText([
            fg(theme.prompt)(bold('› ')),
            fg(theme.text)(query),
            bg(theme.prompt)(' '),
            fg(theme.textMuted)(`${' '.repeat(Math.max(1, width - columns(query) - 14))}${results.length} found`)
        ]);
        rule.content = '─'.repeat(width);

        for (const child of list.getChildren()) {
            list.remove(child);
            child.destroyRecursively();
        }
        const shown = results.slice(offset, offset + rows);
        if (shown.length === 0) {
            list.add(
                new TextRenderable(renderer, {
                    id: 'palette-empty',
                    height: 1,
                    fg: theme.textMuted,
                    content: '  Nothing matches.'
                })
            );
        }
        shown.forEach((result, index) => {
            const row = new TextRenderable(renderer, {
                id: `palette-row-${offset + index}`,
                height: 1,
                content: new StyledText(labelChunks(result, offset + index === selected, width))
            });
            row.selectable = false;
            list.add(row);
        });

        // Centered from the width set here: the renderable reports its new width only after layout.
        const outerWidth = width + 4;
        renderable.width = outerWidth;
        renderable.height = Math.max(1, shown.length) + CHROME_ROWS;
        renderable.left = Math.max(0, Math.floor((renderer.terminalWidth - outerWidth) / 2));
        renderable.top = Math.max(0, Math.floor(renderer.terminalHeight / 6));
    };

    const refilter = () => {
        results = filterPalette(items, query);
        selected = 0;
        offset = 0;
        paint();
    };

    const close = () => {
        renderable.visible = false;
    };

    const choose = () => {
        const result = results[selected];
        if (result === undefined) return;
        close();
        props.onChoose(result.item);
    };

    const onResize = () => {
        if (renderable.visible) paint();
    };
    renderer.on(CliRenderEvents.RESIZE, onResize);

    return {
        renderable,
        open(next) {
            items = next;
            query = '';
            renderable.visible = true;
            refilter();
        },
        close,
        get isOpen() {
            return renderable.visible;
        },
        handleKeyPress(key) {
            const move = (by: number) => {
                if (results.length === 0) return;
                selected = (selected + by + results.length) % results.length;
                paint();
            };
            if (key.name === 'up' || (key.ctrl && key.name === 'p')) return move(-1);
            if (key.name === 'down' || (key.ctrl && key.name === 'n')) return move(1);
            if (key.name === 'return' || key.name === 'enter' || key.name === 'tab') return choose();
            if (key.name === 'backspace') {
                query = [...query].slice(0, -1).join('');
                return refilter();
            }
            const typed = key.sequence;
            if (!key.ctrl && !key.meta && !key.super && typed.length > 0 && [...typed].every((point) => point >= ' ')) {
                query += typed;
                refilter();
            }
        },
        paste(text) {
            const line = text.split(/[\r\n]/, 1)[0] ?? '';
            const printable = [...line].filter((point) => point >= ' ').join('');
            if (printable === '') return;
            query += printable;
            refilter();
        },
        dispose() {
            renderer.off(CliRenderEvents.RESIZE, onResize);
            renderable.destroyRecursively();
        }
    };
}
