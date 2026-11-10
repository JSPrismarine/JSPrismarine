import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { advancementsOf, loadAdvancements } from './progress';

/** Tears a fake player down in the order `ClientConnection.closePlayerSession` does. */
const leave = async (player: ReturnType<typeof fakePlayer>['player']): Promise<void> => {
    await player.disable();
    player.getNetworkSession().disable();
};

describe('advancement progress', () => {
    it('keeps one progress for each player', () => {
        const first = fakePlayer({ name: 'first' }).player;
        const second = fakePlayer({ name: 'second' }).player;

        expect(advancementsOf(first)).toBe(advancementsOf(first));
        expect(advancementsOf(first)).not.toBe(advancementsOf(second));
    });

    it('files the progress under the key the player is saved by', () => {
        const { player } = fakePlayer({ name: 'KeyedProgressTester' });
        loadAdvancements('KeyedProgressTester', {});

        expect(advancementsOf(player)).toBe(advancementsOf('KeyedProgressTester'));
        expect(advancementsOf({ key: 'KeyedProgressTester', server: player.getServer() })).toBe(advancementsOf(player));
    });

    it('holds what was loaded for the player until its session is torn down', async () => {
        const { player } = fakePlayer();
        loadAdvancements(player, { 'minecraft:story/root': { criteria: { crafting_table: 'now' }, done: true } });
        const loaded = advancementsOf(player);

        await player.disable();
        expect(advancementsOf(player)).toBe(loaded);

        player.getNetworkSession().disable();
        expect(advancementsOf(player)).not.toBe(loaded);
    });

    it('lets go of the progress of a player whose join never completed', async () => {
        const { player } = fakePlayer();
        player['connected'] = false;
        const held = advancementsOf(player);

        await leave(player);

        expect(advancementsOf(player)).not.toBe(held);
    });
});
