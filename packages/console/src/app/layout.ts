/**
 * Columns from which the side pane sits beside the log, level tokens use their full names, and
 * the namespace column is shown.
 */
export const WIDE_COLUMNS = 100;

/** Rows from which the title bar is shown. */
export const TALL_ROWS = 30;

/** Columns below which the status bar keeps only the state, TPS, players, and the help hint. */
export const COMPACT_STATUS_COLUMNS = 60;

/** Columns the side pane takes, including its left border. */
export const SIDE_PANE_WIDTH = 25;

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

    return {
        titleBar,
        sidePane,
        sidePaneWidth: SIDE_PANE_WIDTH,
        logWidth: sidePane === 'inline' ? width - SIDE_PANE_WIDTH : width,
        logHeight: Math.max(1, height - FIXED_ROWS - (titleBar ? 1 : 0)),
        levelStyle: wide ? 'full' : 'short',
        showNamespace: wide,
        compactStatus: width < COMPACT_STATUS_COLUMNS
    };
}
