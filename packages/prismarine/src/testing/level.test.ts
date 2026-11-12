import { describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import BaseProvider from '../world/providers/BaseProvider';
import type { ProviderSavePass } from '../world/providers/SavePass';
import type { World } from '../world/World';
import { fakeLevel } from './level';
import { stub, stubOf } from './stub.test.helper';

describe('fakeLevel', () => {
    it("writes the records a provider does not keep into the test's player map", async () => {
        const record: WorldPlayerData = {
            uuid: 'steve-uuid',
            username: 'Steve',
            gamemode: 'Survival',
            position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 }
        };
        const pass = stub<ProviderSavePass>({
            putPlayer: () => false,
            putLevelRecord: () => {},
            pendingEncodes: 0,
            encode: () => 0,
            commit: async () => {},
            abandon: () => {},
            stats: { keys: 0, bytes: 0, heldWrites: 0, subChunkEncodes: 0, forcedSubChunkEncodes: 0, bypassedWrites: 0 }
        });
        const provider = stubOf(BaseProvider, { holdOutsideWrites: () => {}, beginSavePass: () => pass });
        const playerData = new Map<string, Partial<WorldPlayerData>>([['Steve', { username: 'Steve' }]]);
        const level = fakeLevel({ provider, playerData });
        // A world whose cut holds one player's record, as a world with that player online does.
        const world = stub<World>({ cutSave: (_pass, players) => void players.set('Steve', record) });

        await level.saveWorlds([world]);

        expect(playerData.get('Steve')).toEqual(record);
    });
});
