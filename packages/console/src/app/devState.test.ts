import { describe, expect, it } from 'vitest';

import { INITIAL_DEV_STATE, reduceDevState } from './devState';

describe('reduceDevState', () => {
    it('stays off until the supervisor reports a watch root', () => {
        const next = reduceDevState(INITIAL_DEV_STATE, {
            type: 'supervisor.state',
            state: 'running',
            generation: 1
        });

        expect(next.state.badge).toBeUndefined();
        expect(next.toast).toBeUndefined();
    });

    it('shows the watch root once watching starts', () => {
        const next = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.watching', root: '/repo/packages' });

        expect(next.state.badge).toEqual({ text: 'watching packages', tone: 'muted' });
    });

    it('reports a change and a toast with the path', () => {
        const watching = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.watching', root: 'packages' }).state;
        const next = reduceDevState(watching, {
            type: 'supervisor.changed',
            path: 'packages/prismarine/src/Server.ts'
        });

        expect(next.state.badge).toEqual({ text: 'change detected', tone: 'warning' });
        expect(next.toast).toEqual({ tone: 'warning', text: 'change detected: packages/prismarine/src/Server.ts' });
    });

    it('tracks bedrock-data generation through start, success, and failure', () => {
        const started = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.generating' });
        expect(started.state.badge).toEqual({ text: 'generating bedrock-data', tone: 'warning' });

        const ok = reduceDevState(started.state, { type: 'supervisor.generating', ok: true });
        expect(ok.state.badge).toEqual({ text: 'bedrock-data generated', tone: 'ok' });

        const failed = reduceDevState(started.state, { type: 'supervisor.generating', ok: false });
        expect(failed.state.badge).toEqual({ text: 'bedrock-data generation failed', tone: 'danger' });
        expect(failed.toast?.sticky).toBe(true);
    });

    it('describes a crash with its exit code and keeps the toast until dismissed', () => {
        const watching = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.watching', root: 'packages' }).state;
        const next = reduceDevState(watching, { type: 'supervisor.state', state: 'crashed', code: 1, generation: 2 });

        expect(next.state.badge).toEqual({ text: 'crashed (exit 1)', tone: 'danger' });
        expect(next.toast).toEqual({ tone: 'danger', text: 'server crashed (exit 1)', sticky: true });
    });

    it('counts restarts from the generation and records when the last one started', () => {
        const first = reduceDevState(
            INITIAL_DEV_STATE,
            { type: 'supervisor.state', state: 'starting', generation: 1 },
            1000
        );
        expect(first.state.restarts).toBe(0);
        expect(first.state.lastRestartAt).toBeUndefined();

        const second = reduceDevState(
            first.state,
            { type: 'supervisor.state', state: 'starting', generation: 2 },
            2000
        );
        expect(second.state.restarts).toBe(1);
        expect(second.state.lastRestartAt).toBe(2000);
    });

    it('returns to watching when the server is running again in dev mode', () => {
        const watching = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.watching', root: 'packages' }).state;
        const restarting = reduceDevState(watching, { type: 'supervisor.state', state: 'restarting', generation: 1 });
        expect(restarting.state.badge).toEqual({ text: 'restarting', tone: 'accent' });
        expect(restarting.toast).toEqual({ tone: 'accent', text: 'restarting server' });

        const running = reduceDevState(restarting.state, { type: 'supervisor.state', state: 'running', generation: 2 });
        expect(running.state.badge).toEqual({ text: 'watching packages', tone: 'muted' });
    });

    it('ignores child output', () => {
        const next = reduceDevState(INITIAL_DEV_STATE, { type: 'supervisor.output', stream: 'stdout', text: 'x' });

        expect(next.state).toBe(INITIAL_DEV_STATE);
        expect(next.toast).toBeUndefined();
    });
});
