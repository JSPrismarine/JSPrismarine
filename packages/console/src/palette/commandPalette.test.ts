import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../theme/theme';
import { createCommandPalette } from './commandPalette';
import type { PaletteItem } from './paletteItems';

const items: PaletteItem[] = [
    { kind: 'command', name: 'deop' },
    { kind: 'command', name: 'op' },
    { kind: 'command', name: 'stop' },
    { kind: 'player', name: 'filfat' }
];

async function setup() {
    const test = await createTestRenderer({ width: 100, height: 30 });
    /** Each choice, with whether the palette was still open when it arrived. */
    const chosen: { item: PaletteItem; open: boolean }[] = [];
    const palette = createCommandPalette(
        { renderer: test.renderer, theme: defaultTheme },
        { onChoose: (item) => chosen.push({ item, open: palette.isOpen }) }
    );
    test.renderer.root.add(palette.renderable);
    // The app routes keys to an open palette; the test does the same through the real parser.
    test.renderer.keyInput.on('keypress', (key) => palette.handleKeyPress(key));
    const keys = (names: readonly string[]) => {
        for (const name of names) {
            if (name === 'up' || name === 'down') test.mockInput.pressArrow(name);
            else if (name === 'return') test.mockInput.pressEnter();
            else if (name === 'backspace') test.mockInput.pressBackspace();
            else test.mockInput.pressKey(name);
        }
    };
    return { test, palette, chosen, keys };
}

describe('createCommandPalette', () => {
    it('shortens a long description before the command name it describes', async () => {
        const { test, palette } = await setup();
        try {
            palette.open([{ kind: 'command', name: 'gamerule', description: 'Reads and writes. '.repeat(6) }]);
            await test.renderOnce();
            const row = test
                .captureCharFrame()
                .split('\n')
                .find((line) => line.includes('▸'));
            expect(row).toContain('gamerule');
        } finally {
            await test.dispose();
        }
    });

    it('chooses the first item for an empty query, and closes before handing it over', async () => {
        const { test, palette, chosen, keys } = await setup();
        try {
            palette.open(items);
            keys(['return']);
            expect(chosen).toEqual([{ item: items[0], open: false }]);
        } finally {
            await test.dispose();
        }
    });

    it('moves the selection with the arrows and wraps at both ends', async () => {
        const { test, palette, chosen, keys } = await setup();
        try {
            palette.open(items);
            keys(['up', 'return']);
            expect(chosen.at(-1)?.item).toBe(items[3]);

            palette.open(items);
            keys(['down', 'down', 'return']);
            expect(chosen.at(-1)?.item).toBe(items[2]);
        } finally {
            await test.dispose();
        }
    });

    it('narrows by the typed query and widens again on backspace', async () => {
        const { test, palette, chosen, keys } = await setup();
        try {
            palette.open(items);
            keys(['f', 'i', 'backspace', 'backspace', 'o', 'p', 'return']);
            expect(chosen.at(-1)?.item).toBe(items[1]);
        } finally {
            await test.dispose();
        }
    });

    it('stays open and chooses nothing when nothing matches', async () => {
        const { test, palette, chosen, keys } = await setup();
        try {
            palette.open(items);
            keys(['z', 'z', 'return']);
            expect(chosen).toHaveLength(0);
            expect(palette.isOpen).toBe(true);
        } finally {
            await test.dispose();
        }
    });
});
