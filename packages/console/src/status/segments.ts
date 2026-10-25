import { columns, sliceColumns } from '../text';
import type { ThemeRole } from '../theme/theme';

/**
 * Color role a status segment or toast is drawn with. Each tone is a theme role, so components
 * read `theme[segment.tone]`.
 */
export type SegmentTone = Extract<ThemeRole, 'ok' | 'warning' | 'danger' | 'muted' | 'accent'>;

/**
 * One item in the status bar. Higher `priority` segments survive longer when the bar narrows.
 */
export interface Segment {
    /** Stable identifier so callers can replace one segment without rebuilding the list. */
    id: string;
    text: string;
    tone: SegmentTone;
    priority: number;
}

/**
 * Lifecycle states of the server process as reported by the supervisor.
 */
export type ServerState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'restarting' | 'waiting';

const ELLIPSIS = '…';

/**
 * Picks the segments that fit in `width` columns, dropping the lowest priority ones first.
 *
 * The highest priority segment always survives; when even it does not fit, its text is cut and
 * ends with an ellipsis. A segment that does not fit is skipped, and shorter lower priority
 * segments may still be kept.
 *
 * @param segments - Candidates in display order.
 * @param width - Columns available for the segments and the separators between them.
 * @param separator - Text drawn between kept segments; only its width matters here.
 * @returns The kept segments in their original order.
 */
export function layoutSegments(segments: readonly Segment[], width: number, separator = ' · '): Segment[] {
    if (segments.length === 0 || width <= 0) return [];

    const byPriority = segments
        .map((segment, index) => ({ segment, index }))
        .sort((a, b) => b.segment.priority - a.segment.priority || a.index - b.index);

    const [first, ...rest] = byPriority;
    if (first === undefined) return [];
    const firstWidth = columns(first.segment.text);
    if (firstWidth > width) {
        const cut = sliceColumns(first.segment.text, 0, width - 1);
        return [{ ...first.segment, text: `${cut}${ELLIPSIS}` }];
    }

    const kept = [first];
    let used = firstWidth;
    const separatorWidth = columns(separator);
    for (const candidate of rest) {
        const needed = separatorWidth + columns(candidate.segment.text);
        if (used + needed > width) continue;
        kept.push(candidate);
        used += needed;
    }

    return kept.sort((a, b) => a.index - b.index).map(({ segment }) => segment);
}

/**
 * Formats ticks per second with two decimals, for example `TPS 20.00`.
 */
export function formatTps(tps: number): string {
    return `TPS ${tps.toFixed(2)}`;
}

/**
 * Formats the average tick duration with one decimal, for example `4.1 ms`.
 */
export function formatTickMs(ms: number): string {
    return `${ms.toFixed(1)} ms`;
}

/**
 * Formats the player count as online over capacity, for example `2/20`.
 */
export function formatPlayers(online: number, max: number): string {
    return `${online}/${max}`;
}

const MIB = 1024 * 1024;
const GIB = MIB * 1024;

/**
 * Formats resident memory in whole megabytes, switching to gigabytes with one decimal at 1 GB.
 *
 * @param rssBytes - Resident set size in bytes; units use 1024 multiples.
 */
export function formatMemory(rssBytes: number): string {
    if (rssBytes >= GIB) return `${(rssBytes / GIB).toFixed(1)} GB`;
    return `${Math.round(rssBytes / MIB)} MB`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Formats a duration as `hh:mm:ss`, prefixed with whole days once it passes 24 hours.
 *
 * @param ms - Elapsed time in milliseconds; sub-second remainders are dropped.
 */
export function formatUptime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return days > 0 ? `${days}d ${clock}` : clock;
}

const STATE_TONES: Record<ServerState, SegmentTone> = {
    starting: 'warning',
    running: 'ok',
    stopping: 'warning',
    stopped: 'muted',
    crashed: 'danger',
    restarting: 'accent',
    waiting: 'muted'
};

/**
 * Priority of the server state segment; it is the last segment to go when the bar narrows.
 */
export const STATE_PRIORITY = 100;

/**
 * Builds the server state segment: a bullet, the state name, and the tone that colors both.
 */
export function stateSegment(state: ServerState): Segment {
    return { id: 'state', text: `● ${state}`, tone: STATE_TONES[state], priority: STATE_PRIORITY };
}
