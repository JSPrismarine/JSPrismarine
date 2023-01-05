import type Block from './Block.js';
import { jest } from '@jest/globals';
import url from 'url';
import fs from 'fs';
import path from 'path';

describe('block', () => {
    describe('Block', () => {
        it('every block show have unique namespace id', async () => {
            jest.setTimeout(35000);
            const IDs: Set<string> = new Set();
            const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
            const blocks = fs.readdirSync(path.resolve(__dirname, 'blocks'));

            blocks.forEach(async(file) => {
                const block = new ((await import(`./blocks/${file}`)).default)() as Block;

                expect(IDs.has(block.getName())).toBe(false);
                IDs.add(block.getName());
            });
        });
    });
});
