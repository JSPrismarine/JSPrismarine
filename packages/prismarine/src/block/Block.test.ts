import { describe, it, expect, vi } from 'vitest';

import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { Block } from './Block';
import Item from '../item/Item';
import type Server from '../Server';

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
            getEventManager: () => ({
                emit: () => {}
            })
        }))();

        it('every block show have unique namespace id', async () => {
            const IDs: Set<string> = new Set();
            const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
            const blocks = fs.readdirSync(path.resolve(__dirname, 'blocks'));

            blocks.forEach(async (file) => {
                const block = new (await import(`./blocks/${file}`)).default() as Block;

                expect(IDs.has(block.getName())).toBe(false);
                IDs.add(block.getName());
            });
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
    });
});
