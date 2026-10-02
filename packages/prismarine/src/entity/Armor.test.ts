import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty } from '@jsprismarine/minecraft';
import ContainerEntry from '../inventory/ContainerEntry';
import DiamondChestplate from '../item/items/DiamondChestplate';
import DiamondHelmet from '../item/items/DiamondHelmet';
import IronChestplate from '../item/items/IronChestplate';
import { Position } from '../world/Position';
import { DamageCause } from './DamageCause';
import Human from './Human';

/**
 * Armour, finally doing something.
 *
 * Both ends of this were complete long before the middle was: two dozen armour items have declared
 * their protection since they were written, and the damage formula has known what to do with it
 * since the pipeline was laid - but there were no armour slots to read, so every blow landed as
 * though the player were naked.
 */
const scene = () => {
    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {}, warn: () => {} }),
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
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

describe('armour', () => {
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
        wear(human, 1, new IronChestplate());

        expect(human.getArmorDefensePoints()).toBe(6);
    });

    it('adds the pieces up', () => {
        const human = stage.wearer();
        wear(human, 0, new DiamondHelmet());
        wear(human, 1, new DiamondChestplate());

        const helmet = new DiamondHelmet().getArmorDefensePoints();
        const chest = new DiamondChestplate().getArmorDefensePoints();

        expect(human.getArmorDefensePoints()).toBe(helmet + chest);
    });

    it('carries toughness, which only the good armour has', () => {
        const iron = stage.wearer();
        wear(iron, 1, new IronChestplate());

        const diamond = stage.wearer();
        wear(diamond, 1, new DiamondChestplate());

        expect(diamond.getArmorToughness()).toBeGreaterThan(iron.getArmorToughness());
    });

    describe('in a fight', () => {
        it('takes the edge off a blow', async () => {
            const bare = stage.wearer();
            const armoured = stage.wearer();
            wear(armoured, 1, new IronChestplate());

            await bare.damage(10);
            await armoured.damage(10);

            expect(armoured.getHealth()).toBeGreaterThan(bare.getHealth());
        });

        it('does nothing against drowning, which is not a blow', async () => {
            const bare = stage.wearer();
            const armoured = stage.wearer();
            wear(armoured, 1, new IronChestplate());

            await bare.damage(6, DamageCause.Drowning);
            await armoured.damage(6, DamageCause.Drowning);

            expect(armoured.getHealth()).toBe(bare.getHealth());
        });

        it('protects less as the blow gets harder, which is what toughness softens', async () => {
            const soft = stage.wearer();
            const hard = stage.wearer();
            wear(soft, 1, new IronChestplate());
            wear(hard, 1, new IronChestplate());

            await soft.damage(4);
            await hard.damage(16);

            const softFraction = (20 - soft.getHealth()) / 4;
            const hardFraction = (20 - hard.getHealth()) / 16;

            expect(hardFraction).toBeGreaterThan(softFraction);
        });
    });
});
