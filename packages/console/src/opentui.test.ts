import { BoxRenderable, TextRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it } from 'vitest';

describe('@opentui/core under vitest', () => {
    it('renders a text renderable into a captured frame', async () => {
        const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 40, height: 5 });

        try {
            const box = new BoxRenderable(renderer, { id: 'box', width: 40, height: 5 });
            box.add(new TextRenderable(renderer, { id: 'text', content: 'JSPrismarine' }));
            renderer.root.add(box);

            await renderOnce();

            expect(captureCharFrame()).toContain('JSPrismarine');
        } finally {
            renderer.destroy();
        }
    });
});
