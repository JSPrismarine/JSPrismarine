import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { LootSequences } from '@jsprismarine/loot';
import { seededRandom } from '@jsprismarine/predicates';

import { RandomSequences } from '../command/host/randomSequences';
import type { ServerReplayRandomState } from '../Server';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Anvil from '../world/providers/anvil/Anvil';
import {
    deserializeReplayInitialStateManifest,
    replayInputFingerprint,
    restoreReplayInitialStateSnapshot,
    serializeReplayInitialStateManifest
} from './ReplayManifest';
import type { ReplayInitialStateManifest } from './ReplayManifest';

const randomState = (): ServerReplayRandomState => ({
    version: 1,
    server: seededRandom(1).saveState(),
    contentWorlds: [],
    javaLoot: new LootSequences(1n).saveState(),
    bedrockLoot: new LootSequences(1n).saveState(),
    commandSequences: new RandomSequences(() => 1n).saveState()
});

const snapshot = Buffer.from('test provider snapshot');

const manifest = (): ReplayInitialStateManifest => ({
    format: 'jsprismarine-replay-initial-state',
    version: 2,
    level: {
        name: 'test',
        seed: '1',
        tick: 12,
        weather: { clearWeatherTime: 0, rainTime: 0, thunderTime: 0, raining: false, thundering: false },
        gameRules: [{ name: 'doWeatherCycle', value: true, editable: true }],
        dimensions: [{ id: 'minecraft:overworld', type: 'minecraft:overworld', generator: 'minecraft:flat' }]
    },
    contentFingerprint: replayInputFingerprint({ content: 'test' }),
    worldgenFingerprint: replayInputFingerprint({ stems: [] }),
    activeContentFingerprint: replayInputFingerprint({ content: 'test', worldgen: 'test' }),
    randomState: randomState(),
    loadedWorldDigests: [['minecraft:overworld', 'a'.repeat(64)]],
    storageBoundary: {
        provider: 'LevelDB',
        kind: 'provider-snapshot',
        includesUnloadedPersistentState: true,
        captureAtomic: true,
        restoreAtomic: false,
        restoresWorldState: true,
        snapshot: snapshot.toString('base64'),
        snapshotDigest: createHash('sha256').update(snapshot).digest('hex')
    }
});

describe('replay initial-state manifest', () => {
    it('round-trips the versioned JSON manifest and random state', () => {
        const initial = manifest();

        expect(deserializeReplayInitialStateManifest(serializeReplayInitialStateManifest(initial))).toEqual(initial);
    });

    it('rejects unsupported versions and incomplete random state', () => {
        const initial = manifest();
        const unsupported = Buffer.from(JSON.stringify({ ...initial, version: 3 }));
        const incomplete = Buffer.from(JSON.stringify({ ...initial, randomState: { version: 1 } }));

        expect(() => deserializeReplayInitialStateManifest(unsupported)).toThrow('Unsupported or invalid');
        expect(() => deserializeReplayInitialStateManifest(incomplete)).toThrow('Unsupported or invalid');
    });

    it('rejects a snapshot whose bytes do not match the recorded digest', () => {
        const initial = manifest();
        const tampered = {
            ...initial,
            storageBoundary: {
                ...initial.storageBoundary,
                snapshot: Buffer.from('different snapshot').toString('base64')
            }
        };

        expect(() => deserializeReplayInitialStateManifest(Buffer.from(JSON.stringify(tampered)))).toThrow(
            'Unsupported or invalid'
        );
    });

    it('rejects a provider that does not support snapshot restoration', async () => {
        const initial = manifest();
        const anvil = new Anvil('.', stub<Server>());
        const anvilManifest = {
            ...initial,
            storageBoundary: { ...initial.storageBoundary, provider: 'Anvil' }
        };

        await expect(restoreReplayInitialStateSnapshot(anvil, anvilManifest)).rejects.toThrow(
            "Provider 'Anvil' cannot restore replay snapshots"
        );
    });

    it('fingerprints map data without depending on insertion order', () => {
        const first = replayInputFingerprint({
            rules: new Map([
                ['b', 2],
                ['a', 1]
            ])
        });
        const second = replayInputFingerprint({
            rules: new Map([
                ['a', 1],
                ['b', 2]
            ])
        });

        expect(first).toBe(second);
    });
});
