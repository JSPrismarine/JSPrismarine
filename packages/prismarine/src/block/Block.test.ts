import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { fixtureContentOptions } from '../content/testing';
import { Item } from '../item/Item';
import { Block, javaBlockFactsOf } from './Block';

/** A block in its default state, with no content build behind it. */
const named = (name: string) => new Block({ name });

/**
 * The same block with `requires_correct_tool` forced on.
 *
 * Stone carries it in vanilla, but the fixture content's two blocks do not,
 * so the flag is set here rather than relying on which block happens to have
 * it in whichever table answered.
 */
const needsATool = (name: string, content?: ServerContent) =>
    new Block({ name, facts: { ...javaBlockFactsOf(name), requiresCorrectTool: true }, content });

describe('block', () => {
    describe('Block', () => {
        it('is its name', () => {
            expect(named('minecraft:stone').getName()).toBe('minecraft:stone');
            expect(`${named('minecraft:stone')}`).toBe('minecraft:stone');
        });

        it('places the vanilla state it is given, which is its own name unless told otherwise', () => {
            expect(named('minecraft:stone').getStateName()).toBe('minecraft:stone');
            expect(new Block({ name: 'minecraft:black_bed', stateName: 'minecraft:bed' }).getStateName()).toBe(
                'minecraft:bed'
            );
        });

        // Every number here used to be restated in one of 260 block files, where
        // only the blocks somebody had written a class for had one at all. They
        // now come from the Java 26.3 property dump, which covers the whole palette.
        describe('the Java-sourced property table', () => {
            it('answers hardness and blast resistance from the table', () => {
                expect(named('minecraft:stone').getHardness()).toBe(1.5);
                expect(named('minecraft:stone').getBlastResistance()).toBe(6);
                expect(named('minecraft:obsidian').getHardness()).toBe(50);
                expect(named('minecraft:obsidian').getBlastResistance()).toBe(1200);
                expect(named('minecraft:bedrock').getBlastResistance()).toBe(3600000);
                // The registered class used to read 0 through `Flowable`; Java says 4.
                expect(named('minecraft:web').getHardness()).toBe(4);
            });

            it('answers light, light filtering and flammability from the table', () => {
                expect(named('minecraft:torch').getLightLevel()).toBe(14);
                expect(named('minecraft:glowstone').getLightLevel()).toBe(15);
                expect(named('minecraft:water').getLightFilter()).toBe(1);
                expect(named('minecraft:stone').getLightFilter()).toBe(15);
                expect(named('minecraft:oak_planks').getFlammability()).toBe(20);
                expect(named('minecraft:stone').getFlammability()).toBe(0);
            });

            it('answers friction, which is the one column Mojang truncates', () => {
                // `minecraft:friction` caps at 0.9, so blue ice would read wrong
                // through the Bedrock component; the Java value is 0.989.
                expect(named('minecraft:blue_ice').getFriction()).toBeCloseTo(0.989, 10);
                expect(named('minecraft:stone').getFriction()).toBeCloseTo(0.6, 10);
            });

            it('knows what can be stood on', () => {
                expect(named('minecraft:stone').isSolid()).toBe(true);
                expect(named('minecraft:air').isSolid()).toBe(false);
            });

            it('leaves a Bedrock-only block at its defaults rather than guessing', () => {
                // The chemistry blocks have no Java source, so the table has no row.
                const outside = named('minecraft:element_1');

                expect(outside.getHardness()).toBe(0);
                expect(outside.getBlastResistance()).toBe(0);
                expect(outside.getLightLevel()).toBe(0);
                expect(outside.getLightFilter()).toBe(15);
            });
        });

        // The break time drives the speed of the client's cracking animation.
        // Returning the hardness on its own, as this once did, made every block
        // appear to break well before it did.
        describe('break time', () => {
            it('scales hardness by 1.5 for a block that needs no tool', () => {
                // Dirt: 0.5 hardness, 0.75s in vanilla.
                expect(named('minecraft:dirt').getBreakTime(null)).toBeCloseTo(0.75, 10);
            });

            it('scales hardness by 5 when the hand cannot harvest the block', () => {
                // Stone needs a pickaxe: 1.5 hardness, 7.5s bare-handed in vanilla.
                const stone = needsATool('minecraft:stone', buildServerContent(fixtureContentOptions()));

                expect(stone.getBreakTime(null)).toBeCloseTo(7.5, 10);
            });

            it('never finishes breaking the unbreakable', () => {
                expect(named('minecraft:bedrock').getBreakTime(null)).toBe(Number.POSITIVE_INFINITY);
                expect(named('minecraft:bedrock').isBreakable()).toBe(false);
            });
        });

        describe('harvesting', () => {
            it('lets anything harvest a block that needs no particular tool', () => {
                expect(named('minecraft:dirt').isCompatibleWithTool(null)).toBe(true);
                expect(named('minecraft:dirt').isCompatibleWithTool(new Item({ name: 'minecraft:stick' }))).toBe(true);
            });

            it('refuses a bare hand on a block that needs a tool', () => {
                expect(
                    needsATool('minecraft:stone', buildServerContent(fixtureContentOptions())).isCompatibleWithTool(
                        null
                    )
                ).toBe(false);
            });

            // The rules name their blocks by tag, and the merged tag set only
            // exists once a pack stack is loaded. Refusing every tool offline
            // would mean nothing that needs one ever dropped.
            it('lets anything harvest when the server loaded no tags to check against', () => {
                expect(needsATool('minecraft:stone').isCompatibleWithTool(null)).toBe(true);
            });
        });

        describe('drops', () => {
            it('yields itself when the server has no loot tables to roll', () => {
                const stone = named('minecraft:stone');

                expect(stone.getDrops(null)).toEqual([stone]);
            });
        });
    });
});
