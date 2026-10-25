import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { basename } from 'node:path';

import type { SegmentTone } from '../status/segments';
import type { ToastInput } from '../status/toastQueue';

/** Text and tone of the dev badge shown in the title bar or, when the title bar is hidden, the status bar. */
export interface DevBadge {
    text: string;
    tone: SegmentTone;
}

/** What the console knows about the dev supervisor. */
export interface DevState {
    /** Short name of the watched directory; set once `supervisor.watching` arrives. Undefined outside dev mode. */
    watchRoot?: string;
    /** Badge to show, or undefined when the console is not in dev mode. */
    badge?: DevBadge;
    /** Server generations spawned after the first. */
    restarts: number;
    /** Clock reading when the latest restart began. */
    lastRestartAt?: number;
}

/** The result of applying one event: the next state and a toast to show, if any. */
export interface DevTransition {
    state: DevState;
    toast?: ToastInput;
}

/** The state before any supervisor event. */
export const INITIAL_DEV_STATE: DevState = { restarts: 0 };

const watchingBadge = (root: string): DevBadge => ({ text: `watching ${root}`, tone: 'muted' });

const exitText = (code: number | null | undefined, signal: string | null | undefined): string => {
    if (typeof code === 'number') return `exit ${code}`;
    if (signal) return signal;
    return 'unknown exit';
};

function stateBadge(state: DevState, event: Extract<SupervisorEvent, { type: 'supervisor.state' }>): DevBadge {
    switch (event.state) {
        case 'running':
            return state.watchRoot === undefined ? { text: 'running', tone: 'ok' } : watchingBadge(state.watchRoot);
        case 'restarting':
            return { text: 'restarting', tone: 'accent' };
        case 'crashed':
            return { text: `crashed (${exitText(event.code, event.signal)})`, tone: 'danger' };
        case 'waiting':
            return { text: 'waiting for changes', tone: 'muted' };
        case 'starting':
        case 'stopping':
            return { text: event.state, tone: 'warning' };
        case 'stopped':
            return { text: 'stopped', tone: 'muted' };
    }
}

function stateToast(event: Extract<SupervisorEvent, { type: 'supervisor.state' }>): ToastInput | undefined {
    switch (event.state) {
        case 'crashed':
            return { tone: 'danger', text: `server crashed (${exitText(event.code, event.signal)})`, sticky: true };
        case 'restarting':
            return { tone: 'accent', text: 'restarting server' };
        case 'waiting':
            return { tone: 'muted', text: 'waiting for changes' };
        default:
            return undefined;
    }
}

/**
 * Folds one supervisor event into the dev state. The badge only appears once the supervisor
 * reports a watch root or starts generating, so a plain run without `--watch` shows no dev
 * chrome. Server state changes also update the badge so the title bar follows a restart.
 *
 * @param now - Clock reading stored as `lastRestartAt` when a restart begins; defaults to `Date.now()`.
 */
export function reduceDevState(state: DevState, event: SupervisorEvent, now = Date.now()): DevTransition {
    switch (event.type) {
        case 'supervisor.watching': {
            const root = basename(event.root) || event.root;
            return { state: { ...state, watchRoot: root, badge: watchingBadge(root) } };
        }
        case 'supervisor.changed':
            return {
                state: { ...state, badge: { text: 'change detected', tone: 'warning' } },
                toast: { tone: 'warning', text: `change detected: ${event.path}` }
            };
        case 'supervisor.generating':
            if (event.ok === undefined) {
                return {
                    state: { ...state, badge: { text: 'generating bedrock-data', tone: 'warning' } },
                    toast: { tone: 'warning', text: 'generating bedrock-data' }
                };
            }
            if (event.ok) {
                return {
                    state: { ...state, badge: { text: 'bedrock-data generated', tone: 'ok' } },
                    toast: { tone: 'ok', text: 'bedrock-data generated' }
                };
            }
            return {
                state: { ...state, badge: { text: 'bedrock-data generation failed', tone: 'danger' } },
                toast: { tone: 'danger', text: 'bedrock-data generation failed', sticky: true }
            };
        case 'supervisor.state': {
            const restarted = event.state === 'starting' && event.generation > 1;
            const next: DevState = {
                ...state,
                restarts: Math.max(state.restarts, event.generation - 1),
                lastRestartAt: restarted ? now : state.lastRestartAt,
                badge: state.badge === undefined && state.watchRoot === undefined ? undefined : stateBadge(state, event)
            };
            return { state: next, toast: stateToast(event) };
        }
        case 'supervisor.output':
            return { state };
    }
}
