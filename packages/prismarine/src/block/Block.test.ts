/// <reference types="vite/client" />
import { describe, it, expect, vi } from 'vitest';

import { Block } from './Block';
import { Item } from '../item/Item';
import type Server from '../Server';
import { BlockToolType } from './BlockToolType';
import { Solid } from './Solid';
import Air from './blocks/Air';
import Stone from './blocks/Stone';

const blockModules = import.meta.glob<{ default: new () => Block }>('./blocks/*.ts', { eager: true });

describe('block', () => {
    describe('Block', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {}
            }),
            getSessionManager: () => ({
                getAllPlayers: () => []
            }),
            on: vi.fn(),
            emit: vi.fn().mockResolvedValue({})
        }))();

        it('every block show have unique namespace id', () => {
            const IDs: Set<string> = new Set();

            for (const module of Object.values(blockModules)) {
                const block = new module.default();

                expect(IDs.has(block.getName())).toBe(false);
                IDs.add(block.getName());
            }
        });

        it('should return the correct name', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 0.5
            });

            expect(block.getName()).toBe('block1');
        });

        it('should return the correct block ID', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 0.5
            });

            expect(block.getId()).toBe(1);
        });

        it('should return the correct network ID', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 0.5
            });

            expect(block.getNetworkId()).toBe(1);
        });

        it('should return the correct hardness value', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 0.5
            });

            expect(block.getHardness()).toBe(0.5);
        });

        it('should return the correct blast resistance', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 1
            });

            expect(block.getBlastResistance()).toBe(5);
        });

        it('should return the correct silk touch drops', () => {
            const block = new Block({
                id: 1,
                name: 'block1',
                hardness: 0.5
            });
            const item = new Item({
                id: 1,
                name: 'item1'
            });

            const silkTouchDrops = block.getSilkTouchDrops(item, server);

            expect(silkTouchDrops).toEqual([block]);
        });

        // The break time drives the speed of the client's cracking animation. Returning the
        // hardness on its own, as this used to, made every block appear to break well before
        // it did.
        describe('break time', () => {
            it('scales hardness by 1.5 for a block that needs no tool', () => {
                // Dirt: 0.5 hardness, 0.75s in vanilla.
                const block = new Block({ id: 1, name: 'block1', hardness: 0.5 });

                expect(block.getBreakTime(null, server)).toBeCloseTo(0.75, 10);
            });

            it('scales hardness by 5 when the tool cannot harvest the block', () => {
                // Stone by hand: 1.5 hardness, 7.5s in vanilla.
                const block = new Block({ id: 1, name: 'block1', hardness: 1.5 });
                vi.spyOn(block, 'isCompatibleWithTool').mockReturnValue(false);

                expect(block.getBreakTime(null, server)).toBeCloseTo(7.5, 10);
            });
        });
    });
});

/**
 * That a block is the class it was built from.
 *
 * `Block`'s constructor used to call `Object.setPrototypeOf(this, Block.prototype)`. A
 * subclass constructor calls `super` before anything else, so this ran on a half-built
 * subclass and flattened it: every instance in the package was a plain `Block`, and every
 * override in every one of the two hundred and sixty block files was dead code.
 *
 * It cost three unrelated-looking things at once - none of which pointed here.
 */
describe('block subclasses survive construction', () => {
    it('keeps the subclass, so overrides run', () => {
        const stone = new Stone();

        expect(stone).toBeInstanceOf(Stone);
        expect(stone).toBeInstanceOf(Solid);
        expect(stone).toBeInstanceOf(Block);
    });

    it('is solid, which is what an item falls onto', () => {
        // Every block answered `false`, so a dropped stack fell through the ground for ever.
        expect(new Stone().isSolid()).toBe(true);
        expect(new Air().isSolid()).toBe(false);
    });

    it('drops what it is supposed to drop', () => {
        // Stone has said `cobblestone` since it was written; the base `[this]` was answering.
        const server: any = { getBlockManager: () => ({ getBlock: (name: string) => ({ getName: () => name }) }) };

        const drops = new Stone().getDropsForCompatibleTool(null as any, server);

        expect(drops.map((drop: any) => drop.getName())).toEqual(['minecraft:cobblestone']);
    });

    it('asks for the tool it is supposed to ask for', () => {
        expect(new Stone().getToolType()).toContain(BlockToolType.Pickaxe);
    });
});
