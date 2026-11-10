import { describe, expect, it } from 'vitest';

import { RespawnRequests } from './RespawnRequests';
import type { RespawnAnswer } from './RespawnSearch';

const answerFor = (player: string): RespawnAnswer => ({
    player,
    spawn: 'world',
    dimension: 'minecraft:overworld',
    announced: { x: 0.5, y: 64, z: 0.5 },
    block: { x: 0, y: 64, z: 0 },
    eyes: { x: 0.5, y: 65.62, z: 0.5 },
    spawnPointLost: false
});

/** A search the test answers when it chooses. */
const deferred = () => {
    let answer: (value: RespawnAnswer) => void = () => {};
    let fail: (error: unknown) => void = () => {};
    const promise = new Promise<RespawnAnswer>((resolve, reject) => {
        answer = resolve;
        fail = reject;
    });
    return { promise, answer, fail };
};

describe('respawn requests', () => {
    it('applies nothing until the input step, then every answer in the order the deaths filed them', async () => {
        const requests = new RespawnRequests(() => {});
        const applied: string[] = [];
        const first = deferred();
        const second = deferred();
        requests.request(first.promise, async (answer) => void applied.push(answer.player));
        requests.request(second.promise, async (answer) => void applied.push(answer.player));

        // The second search finishes first, and its answer still waits its turn.
        second.answer(answerFor('second'));
        await Promise.resolve();
        expect(applied).toEqual([]);

        first.answer(answerFor('first'));
        expect(await requests.admit()).toBe(2);
        expect(applied).toEqual(['first', 'second']);
        expect(requests.size).toBe(0);
    });

    it('leaves a request filed during the step for the next one', async () => {
        const requests = new RespawnRequests(() => {});
        const applied: string[] = [];
        requests.request(Promise.resolve(answerFor('dying')), async () => {
            applied.push('dying');
            requests.request(Promise.resolve(answerFor('later')), async () => void applied.push('later'));
        });

        await requests.admit();
        expect(applied).toEqual(['dying']);
        await requests.admit();
        expect(applied).toEqual(['dying', 'later']);
    });

    it('reports a failed search and still applies the answers behind it', async () => {
        const reported: unknown[] = [];
        const requests = new RespawnRequests((error) => reported.push(error));
        const failing = deferred();
        const applied: string[] = [];
        requests.request(failing.promise, async () => void applied.push('never'));
        requests.request(Promise.resolve(answerFor('after')), async (answer) => void applied.push(answer.player));
        failing.fail(new Error('the bed dimension failed to build'));

        expect(await requests.admit()).toBe(1);
        expect(applied).toEqual(['after']);
        expect(reported).toHaveLength(1);
    });
});
