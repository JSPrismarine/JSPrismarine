import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { basename } from 'node:path';

import type { SegmentTone } from '../status/segments';

/** What the dev supervisor last did, as the activity line reports it. */
export type ActivityKind =
    | 'watching'
    | 'changed'
    | 'generating'
    | 'generated'
    | 'generationFailed'
    | 'restarting'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'crashed';

/** The latest supervisor event worth a line: its kind, tone, clock reading and details. */
export interface Activity {
    kind: ActivityKind;
    tone: SegmentTone;
    /** Clock reading when it happened. */
    at: number;
    /** The changed file, for `changed`, relative to the repository. */
    path?: string;
    /** How the server ended, for `crashed`: `exit 1` or a signal name. */
    exit?: string;
    /** The server generation, for `starting` and `running`. */
    generation?: number;
}

/** What the console knows about the dev supervisor. */
export interface DevState {
    /** Short name of the watched directory; set once `supervisor.watching` arrives. Undefined outside dev mode. */
    watchRoot?: string;
    /** The activity line's content, or undefined when the console is not in dev mode. */
    activity?: Activity;
    /** The file whose change started the current restart, until the server runs again. */
    cause?: string;
    /** Server generations spawned after the first. */
    restarts: number;
    /** Clock reading when the latest restart began. */
    lastRestartAt?: number;
}

/** The state before any supervisor event. */
export const INITIAL_DEV_STATE: DevState = { restarts: 0 };

/** How a server process ended, as `exit 1` or a signal name. */
export const exitText = (code: number | null | undefined, signal: string | null | undefined): string => {
    if (typeof code === 'number') return `exit ${code}`;
    if (signal) return signal;
    return 'unknown exit';
};

const STATE_ACTIVITY: Record<
    Extract<SupervisorEvent, { type: 'supervisor.state' }>['state'],
    { kind: ActivityKind; tone: SegmentTone } | undefined
> = {
    starting: { kind: 'starting', tone: 'warning' },
    running: { kind: 'running', tone: 'ok' },
    restarting: { kind: 'restarting', tone: 'warning' },
    stopping: { kind: 'stopping', tone: 'warning' },
    stopped: { kind: 'stopped', tone: 'muted' },
    crashed: { kind: 'crashed', tone: 'danger' },
    // The supervisor waits only after a crash; the crash stays the line's news.
    waiting: undefined
};

/**
 * Folds one supervisor event into the dev state. The activity line only appears once the
 * supervisor reports a watch root or starts generating, so a plain run without `--watch` shows
 * no dev chrome.
 *
 * @param now - Clock reading stored on the activity and as `lastRestartAt` when a restart
 * begins; defaults to `Date.now()`.
 */
export function reduceDevState(state: DevState, event: SupervisorEvent, now = Date.now()): DevState {
    switch (event.type) {
        case 'supervisor.watching': {
            const root = basename(event.root) || event.root;
            return { ...state, watchRoot: root, activity: { kind: 'watching', tone: 'muted', at: now } };
        }
        case 'supervisor.changed':
            return {
                ...state,
                cause: event.path,
                activity: { kind: 'changed', tone: 'warning', at: now, path: event.path }
            };
        case 'supervisor.generating': {
            const activity: Activity =
                event.ok === undefined
                    ? { kind: 'generating', tone: 'warning', at: now }
                    : event.ok
                      ? { kind: 'generated', tone: 'ok', at: now }
                      : { kind: 'generationFailed', tone: 'danger', at: now };
            return { ...state, activity };
        }
        case 'supervisor.state': {
            const restarted = event.state === 'starting' && event.generation > 1;
            const next: DevState = {
                ...state,
                restarts: Math.max(state.restarts, event.generation - 1),
                lastRestartAt: restarted ? now : state.lastRestartAt
            };
            const shape = STATE_ACTIVITY[event.state];
            if (state.activity === undefined || shape === undefined) return next;
            return {
                ...next,
                // The cause stays with the restart until the new server runs.
                cause: event.state === 'running' ? undefined : state.cause,
                activity: {
                    ...shape,
                    at: now,
                    generation: event.generation,
                    // A restart or a new generation keeps the change that caused it.
                    path: event.state === 'crashed' ? undefined : state.cause,
                    exit: event.state === 'crashed' ? exitText(event.code, event.signal) : undefined
                }
            };
        }
        case 'supervisor.output':
            return state;
    }
}

/**
 * The sentence the activity line shows for an activity.
 *
 * @param watchRoot - The watched directory's short name, for the lines that say what a save does.
 */
export function activityText(activity: Activity, watchRoot = 'the watched files'): string {
    const after = activity.path === undefined ? '' : ` after ${activity.path} changed`;
    switch (activity.kind) {
        case 'watching':
            return `Watching ${watchRoot} for changes.`;
        case 'changed':
            return `${activity.path ?? 'A file'} changed.`;
        case 'generating':
            return 'Generating bedrock-data.';
        case 'generated':
            return 'Generated bedrock-data.';
        case 'generationFailed':
            return 'Generating bedrock-data failed.';
        case 'restarting':
            return `Restarting${after}.`;
        case 'starting':
            return `Starting generation ${activity.generation ?? 1}${after}.`;
        case 'running':
            return activity.generation !== undefined && activity.generation > 1
                ? `Restarted${after}. Watching ${watchRoot} for changes.`
                : `Running. Watching ${watchRoot} for changes.`;
        case 'stopping':
            return 'Stopping.';
        case 'stopped':
            return 'Stopped.';
        case 'crashed':
            return `Crashed (${activity.exit ?? 'unknown exit'}). Saving a file under ${watchRoot} restarts it.`;
    }
}
