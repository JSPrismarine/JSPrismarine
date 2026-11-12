import { describe, expect, it } from 'vitest';

import { stub } from '../testing/stub.test.helper';
import { RespawnRequests } from './RespawnRequests';
import type { RespawnAnswer, RespawnAttempt, RespawnRequest, RespawnSearch } from './RespawnSearch';

const answerFor = (player: string): RespawnAnswer => ({
    player,
    spawn: 'world',
    dimension: 'minecraft:overworld',
    announced: { x: 0.5, y: 64, z: 0.5 },
    block: { x: 0, y: 64, z: 0 },
    eyes: { x: 0.5, y: 65.62, z: 0.5 },
    spawnPointLost: false,
    spawnPoint: undefined
});

const requestOf = (player: string): RespawnRequest => ({
    player,
    spawnPoint: undefined,
    body: { width: 0.6, height: 1.8, eyeHeight: 1.62 }
});

/** A search that waits for each player the test names in `waiting`, and counts its attempts. */
const searchOf = (waiting: Set<string>, failing = new Set<string>()) => {
    const attempts: string[] = [];
    const search = stub<RespawnSearch>({
        attempt: ({ player }): RespawnAttempt => {
            attempts.push(player);
            if (failing.has(player)) throw new Error(`the search for ${player} failed`);
            return waiting.has(player) ? { kind: 'waiting' } : { kind: 'answer', answer: answerFor(player) };
        }
    });
    return { search, attempts };
};

describe('respawn requests', () => {
    it('tries nothing until the input step, then applies every answer in the order filed', async () => {
        const requests = new RespawnRequests(() => {});
        const { search, attempts } = searchOf(new Set());
        const applied: string[] = [];
        requests.request(search, requestOf('first'), async (answer) => void applied.push(answer.player));
        requests.request(search, requestOf('second'), async (answer) => void applied.push(answer.player));

        expect(attempts).toEqual([]);
        expect(requests.admit()).toBe(2);
        expect(applied).toEqual(['first', 'second']);
        expect(requests.size).toBe(0);
    });

    it('keeps a waiting request, and the later ones of its player, for a later step', async () => {
        const requests = new RespawnRequests(() => {});
        const waiting = new Set(['steve']);
        const { search, attempts } = searchOf(waiting);
        const applied: string[] = [];
        const apply = (label: string) => async () => void applied.push(label);
        requests.request(search, requestOf('steve'), apply('steve death'));
        requests.request(search, requestOf('alex'), apply('alex death'));
        requests.request(search, requestOf('steve'), apply('steve respawn'));

        // Steve's chunks are not in: his first request waits, his second is not even tried,
        // and Alex's answer does not wait for either.
        expect(requests.admit()).toBe(1);
        expect(applied).toEqual(['alex death']);
        expect(attempts).toEqual(['steve', 'alex']);
        expect(requests.size).toBe(2);

        // Another step without the chunks tries the head again and nothing else.
        expect(requests.admit()).toBe(0);
        expect(attempts).toEqual(['steve', 'alex', 'steve']);

        waiting.delete('steve');
        expect(requests.admit()).toBe(2);
        expect(applied).toEqual(['alex death', 'steve death', 'steve respawn']);
        expect(requests.size).toBe(0);
    });

    it('leaves a request filed during the step for the next one', async () => {
        const requests = new RespawnRequests(() => {});
        const { search } = searchOf(new Set());
        const applied: string[] = [];
        requests.request(search, requestOf('dying'), async () => {
            applied.push('dying');
            requests.request(search, requestOf('later'), async () => void applied.push('later'));
        });

        requests.admit();
        expect(applied).toEqual(['dying']);
        requests.admit();
        expect(applied).toEqual(['dying', 'later']);
    });

    it('reports a failed search, drops it and still applies the answers behind it', async () => {
        const reported: unknown[] = [];
        const requests = new RespawnRequests((error) => reported.push(error));
        const { search } = searchOf(new Set(), new Set(['broken']));
        const applied: string[] = [];
        requests.request(search, requestOf('broken'), async () => void applied.push('never'));
        requests.request(search, requestOf('after'), async (answer) => void applied.push(answer.player));

        expect(requests.admit()).toBe(1);
        expect(applied).toEqual(['after']);
        expect(reported).toHaveLength(1);
        expect(requests.size).toBe(0);
    });

    it('answers the world spawn for a player whose own spawn point the search failed on', async () => {
        const reported: unknown[] = [];
        const requests = new RespawnRequests((error) => reported.push(error));
        const asked: (string | undefined)[] = [];
        const search = stub<RespawnSearch>({
            attempt: ({ player, spawnPoint }): RespawnAttempt => {
                asked.push(spawnPoint?.dimension);
                if (spawnPoint !== undefined) throw new Error('the bed world did not build');
                return { kind: 'answer', answer: answerFor(player) };
            }
        });
        const applied: string[] = [];
        const bed = { x: 1, y: 64, z: 1, dimension: 'minecraft:nether' };
        requests.request(search, { ...requestOf('steve'), spawnPoint: bed }, async () => void applied.push('death'));
        requests.request(search, requestOf('steve'), async () => void applied.push('respawn'));

        expect(requests.admit()).toBe(0);
        expect(reported).toHaveLength(1);
        expect(requests.admit()).toBe(2);

        expect(asked).toEqual(['minecraft:nether', undefined, undefined]);
        expect(applied).toEqual(['death', 'respawn']);
        expect(requests.size).toBe(0);
    });
});
