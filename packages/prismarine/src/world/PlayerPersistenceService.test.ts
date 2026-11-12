import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { stub } from '../testing/stub.test.helper';
import { PlayerPersistence } from './PlayerPersistence';

/** The smallest record the type allows, told apart by its name. */
const recordFor = (username: string): WorldPlayerData => ({
    uuid: '00000000-0000-4000-8000-000000000001',
    username,
    gamemode: 'survival',
    position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
    savedAt: 0
});

const quiet = () => stub<Logger>({ debug: () => {}, error: () => {} });

let folder: string;
beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-persistence-'));
});
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

describe('the player persistence service', () => {
    it('writes every record of a batch under its key', async () => {
        const stored = new Map<string, WorldPlayerData>();
        const persistence = new PlayerPersistence({
            levelName: 'test',
            folder,
            provider: { writePlayerData: async (key, data) => void stored.set(key, data) },
            logger: quiet,
            isClosed: () => false
        });

        await persistence.saveAll(
            new Map([
                ['2535400000000001', recordFor('Steve')],
                ['Alex', recordFor('Alex')]
            ])
        );

        expect([...stored].map(([key, data]) => [key, data.username])).toEqual([
            ['2535400000000001', 'Steve'],
            ['Alex', 'Alex']
        ]);
    });

    it('keeps a record in the fallback file for a provider without player storage, and reads it back', async () => {
        const persistence = new PlayerPersistence({
            levelName: 'test',
            folder,
            provider: {},
            logger: quiet,
            isClosed: () => false
        });

        await persistence.save('Alex', recordFor('Alex'));

        expect(fs.existsSync(path.join(folder, 'playerdata', 'Alex.json'))).toBe(true);
        expect((await persistence.load('Alex'))?.username).toBe('Alex');
        expect(await persistence.load('Steve')).toBeNull();
    });

    it('reads a record only once the write a tick handed off for its key has landed, and writes one key in order', async () => {
        const stored = new Map<string, WorldPlayerData>();
        const order: string[] = [];
        let finishFirst = () => {};
        const firstWrite = new Promise<void>((resolve) => {
            finishFirst = resolve;
        });
        const persistence = new PlayerPersistence({
            levelName: 'test',
            folder,
            provider: {
                writePlayerData: async (key, data) => {
                    order.push(`write ${data.username}`);
                    if (data.username === 'first') await firstWrite;
                    stored.set(key, data);
                },
                readPlayerData: async (key) => {
                    order.push('read');
                    return stored.get(key) ?? null;
                }
            },
            logger: quiet,
            isClosed: () => false
        });

        // A world change and then a leave, each started by a tick that did not wait for it.
        void persistence.save('Alex', recordFor('first'));
        void persistence.save('Alex', recordFor('second'));
        const read = persistence.load('Alex');
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(order).toEqual(['write first']);

        finishFirst();
        expect((await read)?.username).toBe('second');
        expect(order).toEqual(['write first', 'write second', 'read']);
    });

    it('writes nothing once the level has closed, and says so to a caller that needs the write', async () => {
        const stored = new Map<string, WorldPlayerData>();
        const persistence = new PlayerPersistence({
            levelName: 'test',
            folder,
            provider: { writePlayerData: async (key, data) => void stored.set(key, data) },
            logger: quiet,
            isClosed: () => true
        });

        await persistence.save('Alex', recordFor('Alex'));
        await expect(persistence.save('Alex', recordFor('Alex'), true)).rejects.toThrow(/after level test closed/);
        expect(stored.size).toBe(0);
    });
});
