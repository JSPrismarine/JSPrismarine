import { describe, expect, it } from 'vitest';

import type { SlotScripts, StartScripts } from './ScriptSlot';
import { ScriptSlot } from './ScriptSlot';

/** Scripts that record what happened to them. */
class RecordingScripts implements SlotScripts {
    public reloads = 0;
    public closed = false;

    public constructor(public readonly packs: readonly string[]) {}

    public reload(): void {
        this.reloads++;
    }

    public close(): void {
        this.closed = true;
    }
}

/** A start whose loads finish when the test says, in the order they were asked for. */
const heldStarts = () => {
    const pending: { packs: readonly string[]; finish: () => void }[] = [];
    const started: RecordingScripts[] = [];
    const start: StartScripts<RecordingScripts> = (packs) =>
        new Promise((resolve) => {
            pending.push({
                packs,
                finish: () => {
                    const scripts = new RecordingScripts(packs);
                    started.push(scripts);
                    resolve(scripts);
                }
            });
        });
    return { start, pending, started };
};

/** A start that finishes at once. */
const immediate: StartScripts<RecordingScripts> = async (packs) => new RecordingScripts(packs);

/** Lets every queued promise callback run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ScriptSlot', () => {
    it('reloads running scripts in place when the pack list is the same', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        await slot.start(['a'], immediate);
        const first = slot.current!;

        await expect(slot.reload(() => ['a'], immediate)).resolves.toBe(true);

        expect(slot.current).toBe(first);
        expect(first.reloads).toBe(1);
    });

    it('starts over from the same list when asked to restart, so manifests are read again', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        await slot.start(['a'], immediate);
        const first = slot.current!;

        await slot.reload(() => ['a'], immediate, { restart: true });

        expect(first.closed).toBe(true);
        expect(slot.current).not.toBe(first);
        expect(slot.current?.packs).toEqual(['a']);
    });

    it('starts again after a failed load once the list changes back', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        await slot.start(['a'], immediate);
        const failing: StartScripts<RecordingScripts> = () => Promise.reject(new TypeError('bad manifest'));

        await expect(slot.reload(() => ['a', 'broken'], failing)).rejects.toThrow('bad manifest');
        expect(slot.current).toBeUndefined();
        await slot.reload(() => ['a'], immediate);

        expect(slot.current?.packs).toEqual(['a']);
    });

    it('runs one reload at a time, so two reloads leave one set of scripts', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        await slot.start(['a'], immediate);
        const { start, pending, started } = heldStarts();

        const addon = slot.reload(() => ['a', 'b'], start);
        const command = slot.reload(() => ['a', 'b'], start);
        await settle();
        expect(pending).toHaveLength(1);
        pending[0]!.finish();
        await addon;
        await command;

        expect(started).toHaveLength(1);
        expect(started[0]!.reloads).toBe(1);
        expect(slot.current).toBe(started[0]);
    });

    it('closes what a start loads after a stop overtook it', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        const { start, pending, started } = heldStarts();

        const starting = slot.start(['a'], start);
        await settle();
        slot.stop();
        pending[0]!.finish();
        await starting;

        expect(started[0]!.closed).toBe(true);
        expect(slot.current).toBeUndefined();
        await expect(slot.reload(() => ['a'], immediate)).resolves.toBe(false);
    });

    it('runs a reload asked for during the first start after it, so one set of scripts runs', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        const { start, pending, started } = heldStarts();

        const starting = slot.start(['a'], start);
        const reloading = slot.reload(() => ['a'], start);
        await settle();
        expect(pending).toHaveLength(1);
        pending[0]!.finish();
        await starting;

        await expect(reloading).resolves.toBe(true);
        expect(started).toHaveLength(1);
        expect(started[0]!.reloads).toBe(1);
        expect(started[0]!.closed).toBe(false);
        expect(slot.current).toBe(started[0]);
    });

    it('starts over after the first start when a restart was asked for during it', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        const { start, pending, started } = heldStarts();

        const starting = slot.start(['a'], start);
        const restarting = slot.reload(() => ['a', 'b'], start, { restart: true });
        await settle();
        expect(pending).toHaveLength(1);
        pending[0]!.finish();
        await starting;
        await settle();
        expect(pending).toHaveLength(2);
        pending[1]!.finish();
        await restarting;

        expect(started[0]!.closed).toBe(true);
        expect(slot.current).toBe(started[1]);
        expect(slot.current?.packs).toEqual(['a', 'b']);
    });

    it('cancels the start loading when it stops, and the starts and reloads queued behind it', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        const { start, pending, started } = heldStarts();

        const first = slot.start(['a'], start);
        await settle();
        const second = slot.start(['b'], start);
        const reloading = slot.reload(() => ['b'], start);
        slot.stop();
        pending[0]!.finish();
        await first;
        await second;

        await expect(reloading).resolves.toBe(false);
        expect(pending).toHaveLength(1);
        expect(started[0]!.closed).toBe(true);
        expect(slot.current).toBeUndefined();
    });

    it('does nothing before it has started', async () => {
        const slot = new ScriptSlot<RecordingScripts>();
        const read: number[] = [];

        await expect(
            slot.reload(() => {
                read.push(1);
                return ['a'];
            }, immediate)
        ).resolves.toBe(false);

        expect(read).toEqual([]);
    });
});
