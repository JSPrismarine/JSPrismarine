import { describe, it, expect } from 'vitest';

import type { Block } from './Block';
import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

describe('block', () => {
    describe('Block', () => {
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
    });
});
