import { describe, expect, it } from 'vitest';

import type { GenerationPriority } from '@jsprismarine/chunkgen';

import type { ChunkAdmissionRecord, ChunkCompletion } from './ChunkAdmissions';
import { ChunkAdmissions } from './ChunkAdmissions';

const WORLD = 'world/minecraft:overworld';

/** A completion that logs its application, with content that differs per chunk. */
const completion = (
    applied: string[],
    x: number,
    priority: GenerationPriority = 'immediate',
    content = Uint8Array.of(x)
): ChunkCompletion => ({
    world: WORLD,
    change: 'enter',
    x,
    z: 0,
    priority,
    content: () => content,
    apply: () => {
        applied.push(`${x}`);
        return true;
    }
});

const recording = (queue: ChunkAdmissions): ChunkAdmissionRecord[] => {
    const records: ChunkAdmissionRecord[] = [];
    queue.setRecorder({ record: (record) => void records.push(record) });
    return records;
};

describe('ChunkAdmissions', () => {
    it('applies a completion at once while no tick loop runs', async () => {
        const queue = new ChunkAdmissions(() => 7);
        const records = recording(queue);
        const applied: string[] = [];

        await expect(queue.hold(completion(applied, 1))).resolves.toBe(true);

        expect(applied).toEqual(['1']);
        expect(records).toMatchObject([{ order: 0, tick: 7, x: 1, step: 'inline' }]);
        expect(queue.snapshot()).toMatchObject({ admittedIdle: 1, admitted: 0, admittedInTick: 0 });
    });

    it('holds a completion until the input step and records the tick that admitted it', async () => {
        const queue = new ChunkAdmissions();
        const records = recording(queue);
        const applied: string[] = [];
        queue.activate();

        const held = queue.hold(completion(applied, 1));
        await Promise.resolve();
        expect(applied).toEqual([]);
        expect(queue.pending).toBe(1);

        expect(queue.admit(12)).toBe(1);
        await expect(held).resolves.toBe(true);
        expect(applied).toEqual(['1']);
        expect(records).toEqual([
            {
                order: 0,
                tick: 12,
                world: WORLD,
                change: 'enter',
                x: 1,
                z: 0,
                step: 'input',
                // SHA-256 of the single byte 0x01.
                digest: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a'
            }
        ]);
    });

    it('admits up to its count and carries the rest to the next step in order', async () => {
        const queue = new ChunkAdmissions(() => 0, 2);
        const applied: string[] = [];
        queue.activate();
        for (let x = 0; x < 5; x++) void queue.hold(completion(applied, x));

        expect(await queue.admit(1)).toBe(2);
        expect(applied).toEqual(['0', '1']);
        expect(await queue.admit(2)).toBe(2);
        expect(await queue.admit(3)).toBe(1);
        expect(applied).toEqual(['0', '1', '2', '3', '4']);
    });

    it('leaves a completion held during a step for the next step', async () => {
        const queue = new ChunkAdmissions();
        const applied: string[] = [];
        queue.activate();
        void queue.hold({
            ...completion(applied, 1),
            apply: () => {
                applied.push('1');
                void queue.hold(completion(applied, 2));
                return true;
            }
        });

        expect(await queue.admit(1)).toBe(1);
        expect(applied).toEqual(['1']);
        expect(await queue.admit(2)).toBe(1);
        expect(applied).toEqual(['1', '2']);
    });

    it('gives background work a turn while player-visible work keeps arriving', async () => {
        const queue = new ChunkAdmissions(() => 0, 5);
        const applied: string[] = [];
        queue.activate();
        for (let x = 0; x < 8; x++) void queue.hold(completion(applied, x));
        void queue.hold(completion(applied, 100, 'soon'));
        void queue.hold(completion(applied, 200, 'idle'));

        await queue.admit(1);

        expect(applied).toEqual(['0', '1', '100', '2', '200']);
    });

    it('applies a held completion at once for a tick that waits for it, and counts it', async () => {
        const queue = new ChunkAdmissions(() => 4);
        const records = recording(queue);
        const applied: string[] = [];
        queue.activate();
        const held = queue.hold(completion(applied, 3, 'idle'));

        expect(queue.admitNow({ world: WORLD, change: 'enter', x: 3, z: 0 })).toBe(true);
        await held;

        expect(applied).toEqual(['3']);
        expect(records).toMatchObject([{ tick: 4, step: 'inline' }]);
        expect(queue.snapshot()).toMatchObject({ pending: 0, admittedInTick: 1 });
        expect(queue.admitNow({ world: WORLD, change: 'enter', x: 3, z: 0 })).toBe(false);
    });

    it('applies every held completion when it stops', async () => {
        const queue = new ChunkAdmissions();
        const applied: string[] = [];
        queue.activate();
        const held = [queue.hold(completion(applied, 1, 'idle')), queue.hold(completion(applied, 2))];

        await queue.deactivate();

        await Promise.all(held);
        expect(applied).toEqual(['2', '1']);
        expect(queue.isActive).toBe(false);
    });

    it('admits exactly the recorded completions at the recorded ticks under a trace', async () => {
        const capture = new ChunkAdmissions(() => 0, 10);
        const captured = recording(capture);
        capture.activate();
        const live: string[] = [];
        for (let x = 0; x < 4; x++) void capture.hold(completion(live, x));
        await capture.admit(20);
        void capture.hold(completion(live, 4));
        await capture.admit(21);

        // A replay that would admit one completion a step, four ticks later than its capture.
        const replay = new ChunkAdmissions(() => 0, 1);
        const replayed = recording(replay);
        replay.replay({ records: captured, tickOffset: 4 });
        replay.activate();
        const applied: string[] = [];
        for (let x = 0; x < 5; x++) void replay.hold(completion(applied, x));

        expect(await replay.admit(23)).toBe(0);
        expect(await replay.admit(24)).toBe(4);
        expect(applied).toEqual(['0', '1', '2', '3']);
        expect(await replay.admit(25)).toBe(1);

        expect(replayed.map(({ tick, x, digest }) => [tick - 4, x, digest])).toEqual(
            captured.map(({ tick, x, digest }) => [tick, x, digest])
        );
        expect(replay.snapshot().divergences).toEqual([]);
    });

    it('reports a recorded completion that is not ready and content that differs', async () => {
        const capture = new ChunkAdmissions();
        const captured = recording(capture);
        capture.activate();
        void capture.hold(completion([], 1));
        void capture.hold(completion([], 2));
        await capture.admit(5);

        const replay = new ChunkAdmissions();
        replay.replay({ records: captured });
        replay.activate();
        void replay.hold(completion([], 1, 'immediate', Uint8Array.of(9)));

        expect(await replay.admit(5)).toBe(1);
        expect(replay.snapshot().divergences).toEqual([
            expect.stringContaining('chunk 2,0 was not ready'),
            expect.stringContaining('chunk 1,0 has digest')
        ]);
    });

    it('chooses as live play does before the trace starts', async () => {
        const capture = new ChunkAdmissions();
        const captured = recording(capture);
        capture.activate();
        void capture.hold(completion([], 1));
        await capture.admit(10);

        const replay = new ChunkAdmissions();
        replay.replay({ records: captured, fromTick: 10 });
        replay.activate();
        const applied: string[] = [];
        void replay.hold(completion(applied, 7));

        expect(await replay.admit(9)).toBe(1);
        expect(applied).toEqual(['7']);
    });
});
