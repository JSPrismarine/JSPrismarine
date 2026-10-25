import { BoxRenderable, CliRenderEvents, StyledText, TextRenderable, fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { layoutSegments } from './segments';
import type { Segment } from './segments';

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

const columns = (text: string) => [...text].length;

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
    const leftText = new TextRenderable(renderer, { id: 'status-left', fg: theme.text, truncate: true });
    const rightText = new TextRenderable(renderer, { id: 'status-right', fg: theme.text });
    renderable.add(leftText);
    renderable.add(rightText);

    const chunksFor = (segments: readonly Segment[]): TextChunk[] =>
        segments.flatMap((segment, index) => {
            const chunk = fg(theme[segment.tone])(segment.text);
            return index === 0 ? [chunk] : [fg(theme.muted)(SEPARATOR), chunk];
        });

    const layout = () => {
        const width = renderer.terminalWidth - PADDING * 2;
        const rightKept = layoutSegments(right, Math.floor(width / 2), SEPARATOR);
        const rightWidth = rightKept.reduce(
            (sum, segment, index) => sum + columns(segment.text) + (index === 0 ? 0 : columns(SEPARATOR)),
            0
        );
        const leftWidth = Math.max(0, width - rightWidth - (rightKept.length > 0 ? GAP : 0));

        rightText.content = new StyledText(chunksFor(rightKept));
        if (hint !== undefined) {
            const [kept] = layoutSegments([{ id: 'hint', text: hint, tone: 'accent', priority: 0 }], leftWidth);
            leftText.content = new StyledText(kept ? chunksFor([kept]) : []);
        } else {
            leftText.content = new StyledText(chunksFor(layoutSegments(left, leftWidth, SEPARATOR)));
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
