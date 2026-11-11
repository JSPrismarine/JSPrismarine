import { beforeEach, describe, expect, it } from 'vitest';

import type PlayerSession from '../network/PlayerSession';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import { DamageCause } from './DamageCause';

/** A stack of one vanilla item, whose armor points come from its Java components. */
const item = (name: string) => new Item({ name });

/**
 * Armor, finally doing something.
 *
 * Both ends of this were complete long before the middle was: two dozen armor items have declared
 * their protection since they were written, and the damage formula has known what to do with it
 * since the pipeline was laid - but there were no armor slots to read, so every blow landed as
 * though the player were naked. A player is a store player, whose blows run the store's damage
 * pipeline with the armor its inventory holds.
 */
const scene = () => ({ wearer: () => fakePlayer().session });

/** Puts a piece on, in the slot the client numbers it. */
const wear = (player: PlayerSession, slot: number, piece: Item) =>
    player
        .getInventory()
        .getArmor()
        .setItem(slot, new ContainerEntry({ item: piece, count: 1 }));

/** The armor points and toughness a player's inventory gives it. */
const armorOf = (player: PlayerSession) => ({
    points: player.getInventory().getArmorDefensePoints(),
    toughness: player.getInventory().getArmorToughness()
});

describe('armor', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    it('protects nothing when nothing is worn', () => {
        expect(armorOf(stage.wearer()).points).toBe(0);
        expect(armorOf(stage.wearer()).toughness).toBe(0);
    });

    it('reads the points the item itself declares', () => {
        const human = stage.wearer();
        wear(human, 1, item('minecraft:iron_chestplate'));

        expect(armorOf(human).points).toBe(6);
    });

    it('adds the pieces up', () => {
        const human = stage.wearer();
        wear(human, 0, item('minecraft:diamond_helmet'));
        wear(human, 1, item('minecraft:diamond_chestplate'));

        const helmet = item('minecraft:diamond_helmet').getArmorDefensePoints();
        const chest = item('minecraft:diamond_chestplate').getArmorDefensePoints();

        expect(armorOf(human).points).toBe(helmet + chest);
    });

    it('carries toughness, which only the good armor has', () => {
        const iron = stage.wearer();
        wear(iron, 1, item('minecraft:iron_chestplate'));

        const diamond = stage.wearer();
        wear(diamond, 1, item('minecraft:diamond_chestplate'));

        expect(armorOf(diamond).toughness).toBeGreaterThan(armorOf(iron).toughness);
    });

    describe('in a fight', () => {
        it('takes the edge off a blow', async () => {
            const bare = stage.wearer();
            const armored = stage.wearer();
            wear(armored, 1, item('minecraft:iron_chestplate'));

            await bare.getActor()?.damage(10);
            await armored.getActor()?.damage(10);

            expect(armored.getPlayer().getHealth()).toBeGreaterThan(bare.getPlayer().getHealth());
        });

        it('does nothing against drowning, which is not a blow', async () => {
            const bare = stage.wearer();
            const armored = stage.wearer();
            wear(armored, 1, item('minecraft:iron_chestplate'));

            await bare.getActor()?.damage(6, DamageCause.Drowning);
            await armored.getActor()?.damage(6, DamageCause.Drowning);

            expect(armored.getPlayer().getHealth()).toBe(bare.getPlayer().getHealth());
        });

        it('protects less as the blow gets harder, which is what toughness softens', async () => {
            const soft = stage.wearer();
            const hard = stage.wearer();
            wear(soft, 1, item('minecraft:iron_chestplate'));
            wear(hard, 1, item('minecraft:iron_chestplate'));

            await soft.getActor()?.damage(4);
            await hard.getActor()?.damage(16);

            const softFraction = (20 - soft.getPlayer().getHealth()) / 4;
            const hardFraction = (20 - hard.getPlayer().getHealth()) / 16;

            expect(hardFraction).toBeGreaterThan(softFraction);
        });
    });
});
