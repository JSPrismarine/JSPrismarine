import { BoxRenderable, CliRenderEvents, MouseButton, SelectRenderable, SelectRenderableEvents } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { columns } from '../text';
import type { SegmentBounds } from './segments';

/** A labeled value shown in a status dropdown. */
export interface DropdownOption {
    /** Text drawn for the option. */
    label: string;
    /** Value passed to the menu callback when the option is selected. */
    value: string;
}

/** Content and placement for one open dropdown. */
export interface DropdownRequest {
    /** Title shown in the menu border. */
    title: string;
    /** Status segment the menu opens above. */
    anchor: SegmentBounds;
    /** Options shown in their given order. */
    options: readonly DropdownOption[];
    /** Value selected when the menu opens, if present in `options`. */
    selectedValue?: string;
    /** Called after the menu closes with the chosen value. */
    onSelect(value: string): void;
}

/** One scrollable menu that can be anchored to any status segment. */
export interface Dropdown {
    /** Renderable to add to the console tree. */
    renderable: BoxRenderable;
    /** Opens the menu with the given options and anchor. */
    open(request: DropdownRequest): void;
    /** Hides the menu without changing its selection. */
    close(): void;
    /** Routes a key to the open menu's selection list. */
    handleKeyPress(key: KeyEvent): boolean;
    /** Whether a request is currently open. */
    readonly isOpen: boolean;
    /** Removes the resize listener and destroys the renderables. */
    dispose(): void;
}

const MAX_HEIGHT = 16;
const MAX_WIDTH = 44;
const Z_INDEX = 110;

/** Creates the shared, bounded dropdown used by status bar filters. */
export function createDropdown(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>): Dropdown {
    const { renderer, theme } = ctx;
    let request: DropdownRequest | undefined;

    const renderable = new BoxRenderable(renderer, {
        id: 'status-dropdown',
        position: 'absolute',
        zIndex: Z_INDEX,
        visible: false,
        flexDirection: 'column',
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.border,
        backgroundColor: theme.surface,
        titleColor: theme.accent,
        titleAlignment: 'center',
        overflow: 'hidden'
    });

    const select = new SelectRenderable(renderer, {
        id: 'status-dropdown-options',
        width: 1,
        height: 1,
        options: [],
        showDescription: false,
        showSelectionIndicator: true,
        showScrollIndicator: false,
        backgroundColor: theme.surface,
        textColor: theme.text,
        focusedBackgroundColor: theme.surface,
        focusedTextColor: theme.text,
        selectedBackgroundColor: theme.selection,
        selectedTextColor: theme.text,
        onMouseDown(event) {
            if (event.button !== MouseButton.LEFT || request === undefined) return;
            const visibleRows = Math.max(1, Math.floor(select.height));
            const maxOffset = Math.max(0, select.options.length - visibleRows);
            const scrollOffset = Math.max(
                0,
                Math.min(select.getSelectedIndex() - Math.floor(visibleRows / 2), maxOffset)
            );
            const localY = event.y - (event.currentTarget?.y ?? select.y);
            const index = scrollOffset + Math.floor(localY);
            if (index < 0 || index >= select.options.length) return;
            select.setSelectedIndex(index);
            select.selectCurrent();
            event.preventDefault();
        },
        onMouseScroll(event) {
            const scroll = event.scroll;
            if (request === undefined || scroll === undefined) return;
            const steps = Math.max(1, Math.floor(scroll.delta));
            if (scroll.direction === 'up') select.moveUp(steps);
            else if (scroll.direction === 'down') select.moveDown(steps);
            else return;
            event.preventDefault();
        }
    });
    renderable.add(select);

    const layout = () => {
        if (request === undefined) return;

        const maxHeight = Math.max(1, Math.min(MAX_HEIGHT, Math.floor(renderer.terminalHeight * 0.6)));
        const borderRows = maxHeight >= 3 ? 2 : 0;
        const menuHeight = Math.min(maxHeight, Math.max(borderRows + 1, request.options.length + borderRows));
        const visibleRows = Math.max(1, menuHeight - borderRows);
        const desiredWidth = request.options.reduce(
            (width, option) => Math.max(width, columns(option.label) + 5),
            Math.max(20, columns(request.title) + 4)
        );
        const menuWidth = Math.max(1, Math.min(renderer.terminalWidth, MAX_WIDTH, desiredWidth));
        const left = Math.max(0, Math.min(request.anchor.x, renderer.terminalWidth - menuWidth));

        renderable.title = request.title;
        renderable.border = borderRows > 0;
        renderable.width = menuWidth;
        renderable.height = menuHeight;
        renderable.left = left;
        renderable.top = Math.max(0, request.anchor.y - menuHeight);
        select.width = Math.max(1, menuWidth - borderRows);
        select.height = visibleRows;
        select.showScrollIndicator = visibleRows >= 3 && request.options.length > visibleRows;
    };

    const onResize = () => layout();
    renderer.on(CliRenderEvents.RESIZE, onResize);

    select.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
        const value: unknown = option.value;
        if (typeof value !== 'string') return;
        const onSelect = request?.onSelect;
        close();
        onSelect?.(value);
    });

    function close(): void {
        request = undefined;
        renderable.visible = false;
    }

    return {
        renderable,
        open(next) {
            request = next;
            renderable.visible = true;
            select.options = next.options.map((option) => ({
                name: option.label,
                description: '',
                value: option.value
            }));
            const selectedIndex = next.options.findIndex((option) => option.value === next.selectedValue);
            select.setSelectedIndex(selectedIndex < 0 ? 0 : selectedIndex);
            layout();
        },
        close,
        handleKeyPress(key) {
            if (request === undefined) return false;
            if (key.name === 'enter') {
                select.selectCurrent();
                return true;
            }
            if (key.name === 'pageup') {
                select.moveUp(Math.max(1, Math.floor(select.height) - 1));
                return true;
            }
            if (key.name === 'pagedown') {
                select.moveDown(Math.max(1, Math.floor(select.height) - 1));
                return true;
            }
            if (key.name === 'home') {
                select.setSelectedIndex(0);
                return true;
            }
            if (key.name === 'end') {
                select.setSelectedIndex(select.options.length - 1);
                return true;
            }
            return select.handleKeyPress(key);
        },
        get isOpen() {
            return request !== undefined;
        },
        dispose() {
            renderer.off(CliRenderEvents.RESIZE, onResize);
            renderable.destroyRecursively();
        }
    };
}
