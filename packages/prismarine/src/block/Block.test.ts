import type Block from './Block';
import fs from 'fs';
import path from 'path';

describe('block', () => {
    describe('Block', () => {
        it('every block show have unique namespace id', (done) => {
            jest.setTimeout(35000);
            const IDs: Set<string> = new Set();
            const blocks = fs.readdirSync(path.resolve(__dirname, 'blocks'));

            blocks.forEach((file) => {
                const block = new (require(`./blocks/${file}`).default)() as Block;

                expect(IDs.has(block.getName())).toBe(false);
                IDs.add(block.getName());
            });
            done();
        });
    });
});
