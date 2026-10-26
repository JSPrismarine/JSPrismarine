/**
 * Columns from which the side pane sits beside the log, level tokens use their full names, and
 * the namespace column is shown.
 */
export const WIDE_COLUMNS = 100;

/** Rows from which the title bar is shown. */
export const TALL_ROWS = 30;

/** Columns below which the footer drops secondary runtime metrics. */
export const COMPACT_STATUS_COLUMNS = 60;

/** Default side-pane width, including its draggable divider. */
export const SIDE_PANE_WIDTH = 30;

/** Smallest width that leaves labels and player names readable. */
export const SIDE_PANE_MIN_WIDTH = 20;

/** Widest useful side pane on large terminals. */
export const SIDE_PANE_MAX_WIDTH = 44;

/** Width reserved for the draggable divider between the log and the side pane. */
export const SIDE_PANE_RESIZER_WIDTH = 1;

const MIN_LOG_WIDTH = 55;

/** Rows outside the log pane: the input line and the status bar. */
const FIXED_ROWS = 2;

/** How the side pane is placed, if at all. */
export type SidePaneMode = 'hidden' | 'inline' | 'overlay';

/** Caller choices that override the breakpoints. */
export interface LayoutOptions {
    /**
     * Whether the user asked for the side pane. `undefined` follows the breakpoint: inline on a
     * wide terminal, hidden on a narrow one. `true` shows it inline when wide and as an overlay
     * over the log when narrow. `false` hides it everywhere.
     */
    sidePaneVisible?: boolean;
    /** Requested side-pane width. The layout clamps it to the current terminal width. */
    sidePaneWidth?: number;
}

/** Sizes and flags the app applies to its regions for one terminal size. */
export interface Layout {
    titleBar: boolean;
    sidePane: SidePaneMode;
    sidePaneWidth: number;
    /** Columns the log pane gets; the full width unless the side pane is inline. */
    logWidth: number;
    /** Rows the log pane gets, at least one. */
    logHeight: number;
    levelStyle: 'full' | 'short';
    showNamespace: boolean;
    /** Whether the status bar should keep only its highest priority segments. */
    compactStatus: boolean;
}

const sidePaneMode = (wide: boolean, visible: boolean | undefined): SidePaneMode => {
    if (visible === false) return 'hidden';
    if (wide) return 'inline';
    return visible === true ? 'overlay' : 'hidden';
};

/**
 * Applies the UX note's breakpoints to a terminal size: the side pane hides below 100 columns
 * (and returns as an overlay when asked for), the title bar goes below 30 rows, level tokens
 * shorten and the namespace column disappears below 100 columns, and the status bar turns
 * compact below 60 columns.
 */
export function computeLayout(width: number, height: number, options: LayoutOptions): Layout {
    const wide = width >= WIDE_COLUMNS;
    const titleBar = height >= TALL_ROWS;
    const sidePane = sidePaneMode(wide, options.sidePaneVisible);
    const availableWidth = sidePane === 'overlay' ? Math.floor(width * 0.6) : wide ? width - MIN_LOG_WIDTH : width - 1;
    const maxWidth = Math.max(1, Math.min(SIDE_PANE_MAX_WIDTH, availableWidth));
    const minWidth = Math.min(SIDE_PANE_MIN_WIDTH, maxWidth);
    const sidePaneWidth = Math.max(minWidth, Math.min(maxWidth, options.sidePaneWidth ?? SIDE_PANE_WIDTH));

    return {
        titleBar,
        sidePane,
        sidePaneWidth,
        logWidth: sidePane === 'inline' ? width - sidePaneWidth : width,
        logHeight: Math.max(1, height - FIXED_ROWS - (titleBar ? 1 : 0)),
        levelStyle: wide ? 'full' : 'short',
        showNamespace: wide,
        compactStatus: width < COMPACT_STATUS_COLUMNS
    };
}
