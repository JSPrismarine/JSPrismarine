import { beforeEach, describe, expect, it } from 'vitest';

import { testEntityServer } from '../testing/entityServer';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import { Position } from '../world/Position';
import { DamageCause } from './DamageCause';
import Human from './Human';

/** A stack of one vanilla item, whose armor points come from its Java components. */
const item = (name: string) => new Item({ name });

/**
 * Armor, finally doing something.
 *
 * Both ends of this were complete long before the middle was: two dozen armor items have declared
 * their protection since they were written, and the damage formula has known what to do with it
 * since the pipeline was laid - but there were no armor slots to read, so every blow landed as
 * though the player were naked.
 */
const scene = () => {
    const world: any = {
        getName: () => 'test',
        getServer: () => testEntityServer(),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getLoadedChunk: () => null
    };

    const wearer = () => new Human({ position: new Position(0, 64, 0, world) });

    return { wearer };
};

/** Puts a piece on, in the slot the client numbers it. */
const wear = (human: Human, slot: number, piece: any) =>
    human
        .getInventory()
        .getArmor()
        .setItem(slot, new ContainerEntry({ item: piece, count: 1 }));

describe('armor', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    it('protects nothing when nothing is worn', () => {
        expect(stage.wearer().getArmorDefensePoints()).toBe(0);
        expect(stage.wearer().getArmorToughness()).toBe(0);
    });

    it('reads the points the item itself declares', () => {
        const human = stage.wearer();
        wear(human, 1, item('minecraft:iron_chestplate'));

        expect(human.getArmorDefensePoints()).toBe(6);
    });

    it('adds the pieces up', () => {
        const human = stage.wearer();
        wear(human, 0, item('minecraft:diamond_helmet'));
        wear(human, 1, item('minecraft:diamond_chestplate'));

        const helmet = item('minecraft:diamond_helmet').getArmorDefensePoints();
        const chest = item('minecraft:diamond_chestplate').getArmorDefensePoints();

        expect(human.getArmorDefensePoints()).toBe(helmet + chest);
    });

    it('carries toughness, which only the good armor has', () => {
        const iron = stage.wearer();
        wear(iron, 1, item('minecraft:iron_chestplate'));

        const diamond = stage.wearer();
        wear(diamond, 1, item('minecraft:diamond_chestplate'));

        expect(diamond.getArmorToughness()).toBeGreaterThan(iron.getArmorToughness());
    });

    describe('in a fight', () => {
        it('takes the edge off a blow', async () => {
            const bare = stage.wearer();
            const armored = stage.wearer();
            wear(armored, 1, item('minecraft:iron_chestplate'));

            await bare.damage(10);
            await armored.damage(10);

            expect(armored.getHealth()).toBeGreaterThan(bare.getHealth());
        });

        it('does nothing against drowning, which is not a blow', async () => {
            const bare = stage.wearer();
            const armored = stage.wearer();
            wear(armored, 1, item('minecraft:iron_chestplate'));

            await bare.damage(6, DamageCause.Drowning);
            await armored.damage(6, DamageCause.Drowning);

            expect(armored.getHealth()).toBe(bare.getHealth());
        });

        it('protects less as the blow gets harder, which is what toughness softens', async () => {
            const soft = stage.wearer();
            const hard = stage.wearer();
            wear(soft, 1, item('minecraft:iron_chestplate'));
            wear(hard, 1, item('minecraft:iron_chestplate'));

            await soft.damage(4);
            await hard.damage(16);

            const softFraction = (20 - soft.getHealth()) / 4;
            const hardFraction = (20 - hard.getHealth()) / 16;

            expect(hardFraction).toBeGreaterThan(softFraction);
        });
    });
});
