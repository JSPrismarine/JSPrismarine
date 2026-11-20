import { TextAttributes, parseColor } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultTheme, monochromeTheme } from '../theme/theme';
import type { Theme } from '../theme/theme';
import { createTitleBar } from './titleBar';

let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
    await dispose?.();
    dispose = undefined;
});

/** The span the terminal paints at the title bar's left edge, which is the state tile. */
async function stateTile(theme: Theme) {
    const test = await createTestRenderer({ width: 80, height: 4 });
    dispose = () => test.dispose();
    const bar = createTitleBar({ renderer: test.renderer, theme }, { version: '0.22.0' });
    test.renderer.root.add(bar.renderable);
    await test.renderOnce();
    const tile = test.captureSpans().lines[0]?.spans[0];
    if (tile === undefined) throw new Error('the title bar painted nothing');
    return tile;
}

const reversed = (attributes: number) => (attributes & TextAttributes.INVERSE) !== 0;

describe('createTitleBar', () => {
    it('paints the state tile in its tone when the theme has color', async () => {
        const tile = await stateTile(defaultTheme);
        // A new title bar shows a starting server, which is in progress.
        expect(tile.bg.equals(parseColor(defaultTheme.warning))).toBe(true);
        expect(reversed(tile.attributes)).toBe(false);
    });

    it('draws the state tile in reverse video when the theme has no color', async () => {
        const tile = await stateTile(monochromeTheme);
        expect(reversed(tile.attributes)).toBe(true);
    });
});
