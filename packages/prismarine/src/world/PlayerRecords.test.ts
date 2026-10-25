import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import { lastPlayerRecord } from './PlayerRecords';
import type { World, WorldPlayerData } from './World';

/** A world that answers with one record, which is all this module reads a world for. */
const worldHolding = (name: string, data: Partial<WorldPlayerData>): World =>
    stub<World>({ getName: () => name, getPlayerData: async () => data });

const playerIn = (world: World): Player => stub<Player>({ getWorld: () => world });

describe('where a returning player left off', () => {
    it('takes the record of the world that wrote one last', async () => {
        const overworld = worldHolding('overworld', { gamemode: 'survival', savedAt: 1000 });
        const nether = worldHolding('nether', { gamemode: 'creative', savedAt: 2000 });

        const found = await lastPlayerRecord(playerIn(overworld), [overworld, nether]);

        expect(found.world).toBe(nether);
        expect(found.data.gamemode).toBe('creative');
    });

    it("stays in the player's own world when no record carries an instant", async () => {
        const overworld = worldHolding('overworld', { gamemode: 'survival' });
        const nether = worldHolding('nether', { gamemode: 'creative' });

        const found = await lastPlayerRecord(playerIn(overworld), [overworld, nether]);

        expect(found.world).toBe(overworld);
    });

    it('prefers a record with an instant over one written before the field existed', async () => {
        const overworld = worldHolding('overworld', { gamemode: 'survival' });
        const nether = worldHolding('nether', { gamemode: 'creative', savedAt: 1 });

        expect((await lastPlayerRecord(playerIn(overworld), [overworld, nether])).world).toBe(nether);
    });

    it("reads the player's own world when it is not among the loaded ones", async () => {
        const orphan = worldHolding('orphan', { gamemode: 'adventure' });

        const found = await lastPlayerRecord(playerIn(orphan), []);

        expect(found.world).toBe(orphan);
        expect(found.data.gamemode).toBe('adventure');
    });
});
