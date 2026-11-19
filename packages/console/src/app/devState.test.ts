import type { SupervisorEvent } from '@jsprismarine/console-protocol';
import { describe, expect, it } from 'vitest';

import type { DevState } from './devState';
import { activityText, INITIAL_DEV_STATE, reduceDevState } from './devState';

/** Folds events in order, each at the next whole second. */
const fold = (events: readonly SupervisorEvent[], from: DevState = INITIAL_DEV_STATE): DevState =>
    events.reduce((state, event, index) => reduceDevState(state, event, (index + 1) * 1000), from);

const watching = fold([{ type: 'supervisor.watching', root: '/repo/packages' }]);
const change = 'packages/prismarine/dist/Server.js';

describe('reduceDevState', () => {
    it('stays off until the supervisor reports a watch root', () => {
        const next = fold([{ type: 'supervisor.state', state: 'running', generation: 1 }]);
        expect(next.activity).toBeUndefined();
        expect(next.watchRoot).toBeUndefined();
    });

    it('starts watching under the root directory name', () => {
        expect(watching.watchRoot).toBe('packages');
        expect(watching.activity).toMatchObject({ kind: 'watching', tone: 'muted', at: 1000 });
    });

    it('carries the changed file through the restart it causes, and drops it once the server runs', () => {
        const states: DevState[] = [];
        const events: SupervisorEvent[] = [
            { type: 'supervisor.changed', path: change },
            { type: 'supervisor.state', state: 'restarting', generation: 1 },
            { type: 'supervisor.state', state: 'starting', generation: 2 },
            { type: 'supervisor.state', state: 'running', generation: 2 }
        ];
        let state = watching;
        for (const event of events) {
            state = reduceDevState(state, event, 5000);
            states.push(state);
        }

        expect(states.map((step) => [step.activity?.kind, step.activity?.path])).toEqual([
            ['changed', change],
            ['restarting', change],
            ['starting', change],
            ['running', change]
        ]);
        expect(state.cause).toBeUndefined();
        expect(state.restarts).toBe(1);
        expect(state.lastRestartAt).toBe(5000);
    });

    it('tracks bedrock-data generation through start, success, and failure', () => {
        const generating = fold([{ type: 'supervisor.generating' }], watching);
        const generated = fold([{ type: 'supervisor.generating', ok: true }], generating);
        const failed = fold([{ type: 'supervisor.generating', ok: false }], generating);

        expect(generating.activity).toMatchObject({ kind: 'generating', tone: 'warning' });
        expect(generated.activity).toMatchObject({ kind: 'generated', tone: 'ok' });
        expect(failed.activity).toMatchObject({ kind: 'generationFailed', tone: 'danger' });
    });

    it('reports a crash with how it ended, and keeps it while the supervisor waits', () => {
        const crashed = fold([{ type: 'supervisor.state', state: 'crashed', code: 1, generation: 2 }], watching);
        const waiting = fold([{ type: 'supervisor.state', state: 'waiting', generation: 2 }], crashed);
        const killed = fold(
            [{ type: 'supervisor.state', state: 'crashed', signal: 'SIGKILL', generation: 2 }],
            watching
        );

        expect(crashed.activity).toMatchObject({ kind: 'crashed', tone: 'danger', exit: 'exit 1' });
        expect(waiting.activity).toEqual(crashed.activity);
        expect(killed.activity?.exit).toBe('SIGKILL');
    });

    it('ignores child output', () => {
        expect(fold([{ type: 'supervisor.output', stream: 'stderr', text: 'oops\n' }], watching)).toEqual(watching);
    });
});

describe('activityText', () => {
    it('names the changed file and, after a crash, the directory a save restarts from', () => {
        const restarting = fold(
            [
                { type: 'supervisor.changed', path: change },
                { type: 'supervisor.state', state: 'restarting', generation: 1 }
            ],
            watching
        ).activity!;
        const crashed = fold(
            [{ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 }],
            watching
        ).activity!;

        expect(activityText(restarting, 'packages')).toContain(change);
        expect(activityText(crashed, 'packages')).toContain('packages');
    });
});
