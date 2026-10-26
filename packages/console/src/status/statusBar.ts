import { BoxRenderable, CliRenderEvents, MouseButton, TextRenderable } from '@opentui/core';
import type { ColorInput } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { columns } from '../text';
import { layoutSegments } from './segments';
import type { Segment, SegmentBounds } from './segments';

/**
 * Initial contents of the status bar.
 */
export interface StatusBarProps {
    /** Server metrics shown on the left; laid out by priority in the space the right side leaves. */
    left?: readonly Segment[];
    /** Filter summary and key hints shown on the right. Defaults to `? help`. */
    right?: readonly Segment[];
}

/**
 * A one-row, full-width status line. Segments are re-fitted whenever the renderer resizes.
 */
export interface StatusBar {
    renderable: BoxRenderable;
    setLeft(segments: readonly Segment[]): void;
    setRight(segments: readonly Segment[]): void;
    /** Shows `text` in place of the left segments; pass `undefined` to show them again. */
    setHint(text: string | undefined): void;
    /** Removes the resize listener and destroys the renderables. */
    dispose(): void;
}

/**
 * Key hint shown at the right edge of the status bar unless the caller passes its own right side.
 */
export const HELP_SEGMENT: Segment = { id: 'help', text: '? help', tone: 'muted', priority: 100 };

const SEPARATOR = ' · ';
const PADDING = 1;
const GAP = 1;

interface StatusTextPart {
    id: string;
    text: string;
    color: ColorInput;
    bounds?: SegmentBounds;
    activate?: Segment['onActivate'];
    renderable: TextRenderable;
}

interface StatusTextGroup {
    ids: string[];
    parts: StatusTextPart[];
}

/**
 * Creates the status bar. The bar measures itself against the renderer's terminal width and
 * draws on the theme's `surface` color.
 */
export function createStatusBar(
    ctx: Pick<ConsoleContext, 'renderer' | 'theme'>,
    props: StatusBarProps = {}
): StatusBar {
    const { renderer, theme } = ctx;
    let left = props.left ?? [];
    let right = props.right ?? [HELP_SEGMENT];
    let hint: string | undefined;

    const renderable = new BoxRenderable(renderer, {
        id: 'status-bar',
        width: '100%',
        height: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: PADDING,
        paddingRight: PADDING,
        backgroundColor: theme.surface
    });
    const leftGroup = new BoxRenderable(renderer, {
        id: 'status-left',
        height: 1,
        flexDirection: 'row',
        overflow: 'hidden'
    });
    const rightGroup = new BoxRenderable(renderer, {
        id: 'status-right',
        height: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end'
    });
    renderable.add(leftGroup);
    renderable.add(rightGroup);
    const leftTextGroup: StatusTextGroup = { ids: [], parts: [] };
    const rightTextGroup: StatusTextGroup = { ids: [], parts: [] };

    const partsFor = (
        segments: readonly Segment[],
        startX: number,
        side: string
    ): Omit<StatusTextPart, 'renderable'>[] => {
        let x = startX;
        return segments.flatMap((segment, index) => {
            const parts: Omit<StatusTextPart, 'renderable'>[] = [];
            if (index > 0) {
                parts.push({ id: `status-${side}-separator-${index}`, text: SEPARATOR, color: theme.muted });
                x += columns(SEPARATOR);
            }
            const bounds: SegmentBounds = {
                x,
                y: renderer.terminalHeight - 1,
                width: columns(segment.text),
                height: 1
            };
            parts.push({
                id: `status-${side}-${segment.id}`,
                text: segment.text,
                color: theme[segment.tone],
                bounds,
                activate: segment.onActivate
            });
            x += columns(segment.text);
            return parts;
        });
    };

    const renderSegments = (
        group: BoxRenderable,
        rendered: StatusTextGroup,
        segments: readonly Segment[],
        startX: number,
        side: string
    ): void => {
        const parts = partsFor(segments, startX, side);
        const ids = parts.map((part) => part.id);
        const sameOrder = ids.length === rendered.ids.length && ids.every((id, index) => id === rendered.ids[index]);
        if (!sameOrder) {
            for (const child of group.getChildren()) {
                group.remove(child);
                child.destroyRecursively();
            }
            rendered.ids = ids;
            rendered.parts = parts.map((part) => {
                const text = new TextRenderable(renderer, {
                    id: part.id,
                    content: part.text,
                    fg: part.color
                });
                const current: StatusTextPart = { ...part, renderable: text };
                text.onMouseDown = (event) => {
                    if (
                        event.button !== MouseButton.LEFT ||
                        current.activate === undefined ||
                        current.bounds === undefined
                    ) {
                        return;
                    }
                    event.preventDefault();
                    current.activate(current.bounds);
                };
                group.add(text);
                return current;
            });
            return;
        }

        parts.forEach((part, index) => {
            const current = rendered.parts[index];
            if (current === undefined) return;
            current.text = part.text;
            current.color = part.color;
            current.bounds = part.bounds;
            current.activate = part.activate;
            current.renderable.content = part.text;
            current.renderable.fg = part.color;
        });
    };

    const layout = () => {
        const width = renderer.terminalWidth - PADDING * 2;
        const rightKept = layoutSegments(right, Math.floor(width / 2), SEPARATOR);
        const rightWidth = rightKept.reduce(
            (sum, segment, index) => sum + columns(segment.text) + (index === 0 ? 0 : columns(SEPARATOR)),
            0
        );
        const leftWidth = Math.max(0, width - rightWidth - (rightKept.length > 0 ? GAP : 0));

        const rightStart = renderer.terminalWidth - PADDING - rightWidth;
        rightGroup.width = rightWidth;
        renderSegments(rightGroup, rightTextGroup, rightKept, rightStart, 'right');
        leftGroup.width = leftWidth;
        if (hint !== undefined) {
            const [kept] = layoutSegments([{ id: 'hint', text: hint, tone: 'accent', priority: 0 }], leftWidth);
            renderSegments(leftGroup, leftTextGroup, kept ? [kept] : [], PADDING, 'left');
        } else {
            renderSegments(leftGroup, leftTextGroup, layoutSegments(left, leftWidth, SEPARATOR), PADDING, 'left');
        }
    };

    layout();
    renderer.on(CliRenderEvents.RESIZE, layout);

    return {
        renderable,
        setLeft(segments) {
            left = segments;
            layout();
        },
        setRight(segments) {
            right = segments;
            layout();
        },
        setHint(text) {
            hint = text;
            layout();
        },
        dispose() {
            renderer.off(CliRenderEvents.RESIZE, layout);
            renderable.destroyRecursively();
        }
    };
}
