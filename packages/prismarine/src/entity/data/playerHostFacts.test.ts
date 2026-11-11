/**
 * The live host's store player facts: the item in hand and the finish of a meal, read from the
 * server's store players.
 */
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../../inventory/ContainerEntry';
import { Item } from '../../item/Item';
import { StorePlayer } from '../storePlayer';
import { storePlayerHostFacts } from './playerHostFacts';
import { StorePlayers } from './storePlayers';

const holding = (item?: string) => {
    const players = new StorePlayers();
    const player = new StorePlayer(7, { uuid: UUID.fromRandom(), name: 'Steve', xuid: '' });
    if (item !== undefined)
        player.getInventory().setItem(0, new ContainerEntry({ item: new Item({ name: item }), count: 1 }));
    players.add(player);
    const finished: { player: StorePlayer; item: string }[] = [];
    const facts = storePlayerHostFacts(players, (eater, eaten) => finished.push({ player: eater, item: eaten }));
    return { player, facts, finished };
};

describe('the store player host facts', () => {
    it('name the item in a store player hand, and nothing for an empty hand or an unknown id', () => {
        expect(holding('minecraft:bread').facts.heldItemOf(7)).toBe('minecraft:bread');
        expect(holding().facts.heldItemOf(7)).toBeUndefined();
        expect(holding('minecraft:bread').facts.heldItemOf(8)).toBeUndefined();
    });

    it('finish a meal of the item still in hand, and no other', () => {
        const { player, facts, finished } = holding('minecraft:bread');

        facts.finishMeal(7, 'minecraft:apple');
        facts.finishMeal(8, 'minecraft:bread');
        facts.finishMeal(7, 'minecraft:bread');

        expect(finished).toEqual([{ player, item: 'minecraft:bread' }]);
    });
});
