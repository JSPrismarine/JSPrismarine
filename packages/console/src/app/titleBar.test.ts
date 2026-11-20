import { TextAttributes, TextRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultTheme, monochromeTheme } from '../theme/theme';
import type { Theme } from '../theme/theme';
import { createTitleBar } from './titleBar';

let dispose: (() => void) | undefined;

afterEach(() => {
    dispose?.();
    dispose = undefined;
});

/** The first chunk of the title bar, the state tile, drawn with `theme`. */
async function stateTile(theme: Theme) {
    const test = await createTestRenderer({ width: 80, height: 4 });
    const bar = createTitleBar({ renderer: test.renderer, theme }, { version: '0.22.0' });
    test.renderer.root.add(bar.renderable);
    dispose = () => test.renderer.destroy();
    const left = bar.renderable.findDescendantById('title-left');
    if (!(left instanceof TextRenderable)) throw new Error('the title bar has no left text');
    return left.content.chunks[0];
}

const reversed = (attributes = 0) => (attributes & TextAttributes.INVERSE) !== 0;

describe('createTitleBar', () => {
    it('paints the state tile in its tone when the theme has color', async () => {
        const tile = await stateTile(defaultTheme);
        expect(tile?.bg).toBeDefined();
        expect(reversed(tile?.attributes)).toBe(false);
    });

    it('draws the state tile in reverse video when the theme has no color', async () => {
        const tile = await stateTile(monochromeTheme);
        expect(reversed(tile?.attributes)).toBe(true);
    });
});
