import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG } from '../keymap/catalog';
import { defaultTheme } from '../theme/theme';
import { createHelpOverlay } from './helpOverlay';

const rows = (frame: string) => frame.replace(/\n$/, '').split('\n');

async function setup(width: number, height: number) {
    const test = await createTestRenderer({ width, height });
    const overlay = createHelpOverlay({ renderer: test.renderer, theme: defaultTheme }, { catalog: COMMAND_CATALOG });
    test.renderer.root.add(overlay.renderable);
    const frame = async () => {
        await test.renderOnce();
        return test.captureCharFrame();
    };
    return { ...test, overlay, frame };
}

describe('createHelpOverlay', () => {
    it('is hidden until shown', async () => {
        const t = await setup(120, 40);
        try {
            expect(t.overlay.isVisible).toBe(false);
            expect(await t.frame()).not.toContain('Esc to close');
        } finally {
            await t.dispose();
        }
    });

    it('lists every group and binding at 120x40 with the footer', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            const frame = await t.frame();
            expect(t.overlay.isVisible).toBe(true);
            for (const group of ['Input', 'Log', 'View', 'Server']) expect(frame).toContain(group);
            expect(frame).toMatch(/PgUp, Ctrl\+U\s+Page up/);
            expect(frame).toMatch(/N\s+Previous match/);
            expect(frame).toMatch(/Ctrl\+C twice\s+Stop server/);
            expect(frame).toContain('Esc to close');
        } finally {
            await t.dispose();
        }
    });

    it('aligns the key column within a group', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            const lines = rows(await t.frame());
            const pageUp = lines.find((line) => line.includes('Page up')) ?? '';
            const clear = lines.find((line) => line.includes('Clear view')) ?? '';
            expect(pageUp.indexOf('Page up')).toBe(clear.indexOf('Clear view'));
        } finally {
            await t.dispose();
        }
    });

    it('centers the box in the terminal', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            const lines = rows(await t.frame());
            const top = lines.findIndex((line) => line.trim().length > 0);
            const bottom = lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim().length > 0);
            const first = lines[top] ?? '';
            const left = first.search(/\S/);
            const right = first.trimEnd().length - 1;
            expect(Math.abs(top - (lines.length - 1 - bottom))).toBeLessThanOrEqual(1);
            expect(Math.abs(left - (120 - 1 - right))).toBeLessThanOrEqual(1);
        } finally {
            await t.dispose();
        }
    });

    it('fits 80x24 by laying groups out in two columns', async () => {
        const t = await setup(80, 24);
        try {
            t.overlay.show();
            const lines = rows(await t.frame());
            const frame = lines.join('\n');
            expect(frame).toMatch(/PgUp, Ctrl\+U\s+Page up/);
            expect(frame).toContain('Stop server');
            expect(frame).toContain('Esc to close');
            expect(frame).not.toContain('…');
            const sideBySide = lines.some(
                (line) => line.includes('Search history') && line.includes('Toggle side pane')
            );
            expect(sideBySide).toBe(true);
        } finally {
            await t.dispose();
        }
    });

    it('truncates with an ellipsis when the terminal is too short', async () => {
        const t = await setup(60, 12);
        try {
            t.overlay.show();
            const frame = await t.frame();
            expect(frame).toContain('Page up');
            expect(frame).toContain('…');
            expect(frame).toContain('Esc to close');
            expect(rows(frame).length).toBe(12);
        } finally {
            await t.dispose();
        }
    });

    it('hide removes the box and toggle brings it back', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            await t.frame();
            t.overlay.hide();
            expect(t.overlay.isVisible).toBe(false);
            expect(await t.frame()).not.toContain('Esc to close');
            t.overlay.toggle();
            expect(await t.frame()).toContain('Esc to close');
        } finally {
            await t.dispose();
        }
    });

    it('re-centers after a resize', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            await t.frame();
            t.resize(80, 30);
            const lines = rows(await t.frame());
            const first = lines.find((line) => line.trim().length > 0) ?? '';
            const left = first.search(/\S/);
            const right = first.trimEnd().length - 1;
            expect(Math.abs(left - (80 - 1 - right))).toBeLessThanOrEqual(1);
        } finally {
            await t.dispose();
        }
    });

    it('dispose destroys the renderable', async () => {
        const t = await setup(120, 40);
        try {
            t.overlay.show();
            await t.frame();
            t.overlay.dispose();
            expect(await t.frame()).not.toContain('Esc to close');
        } finally {
            await t.dispose();
        }
    });
});
