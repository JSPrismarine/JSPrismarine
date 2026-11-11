import { describe, expect, it, vi } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { advancementsOf, loadAdvancements } from './progress';

/** Tears a fake player down in the order `ClientConnection.closePlayerSession` does. */
const leave = async (session: ReturnType<typeof fakePlayer>['session']): Promise<void> => {
    await session.leave();
    session.disable();
};

describe('advancement progress', () => {
    it('keeps one progress for each player', () => {
        const first = fakePlayer({ name: 'first' }).session.keyed();
        const second = fakePlayer({ name: 'second' }).session.keyed();

        expect(advancementsOf(first)).toBe(advancementsOf(first));
        expect(advancementsOf(first)).not.toBe(advancementsOf(second));
    });

    it('files the progress under the key the player is saved by', () => {
        const { session } = fakePlayer({ name: 'KeyedProgressTester' });
        loadAdvancements('KeyedProgressTester', {});

        expect(advancementsOf(session.keyed())).toBe(advancementsOf('KeyedProgressTester'));
        expect(advancementsOf({ key: 'KeyedProgressTester', server: session.getServer() })).toBe(
            advancementsOf(session.keyed())
        );
    });

    it('holds what was loaded for the player until its record is saved, and lets go after', async () => {
        const { session, world } = fakePlayer();
        loadAdvancements(session.keyed(), {
            'minecraft:story/root': { criteria: { crafting_table: 'now' }, done: true }
        });
        const loaded = advancementsOf(session.keyed());
        let saved: unknown;
        vi.spyOn(world, 'savePlayerData').mockImplementation(
            async () => void (saved = advancementsOf(session.keyed()))
        );

        await session.leave();

        expect(saved).toBe(loaded);
        expect(advancementsOf(session.keyed())).not.toBe(loaded);
    });

    it('lets go of the progress of a player whose join never completed', async () => {
        const { session } = fakePlayer();
        session['joined'] = false;
        const held = advancementsOf(session.keyed());

        await leave(session);

        expect(advancementsOf(session.keyed())).not.toBe(held);
    });
});
