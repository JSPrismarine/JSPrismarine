import type { LogEntry } from '@jsprismarine/console-protocol';
import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { defaultTheme } from '../theme';
import { LogStore } from './logStore';
import { createLogView } from './logView';
import type { SourceLocation } from './sourceLocation';

let seq = 0;
function entry(message: string): LogEntry {
    seq += 1;
    return {
        seq,
        level: 'info',
        namespace: 'Server',
        at: new Date(2024, 0, 1, 12, 5, 33).getTime(),
        message,
        formatted: message
    };
}

const lines = (frame: string) =>
    frame
        .replace(/\n$/, '')
        .split('\n')
        .map((line) => line.trimEnd());

async function setup(width = 100, height = 20, onOpenSourceLocation?: (location: SourceLocation) => void) {
    const test = await createTestRenderer({ width, height });
    const store = new LogStore();
    const view = createLogView({ renderer: test.renderer, theme: defaultTheme }, { store, onOpenSourceLocation });
    test.renderer.root.add(view.renderable);
    await test.renderOnce();
    const frame = async () => {
        await test.renderOnce();
        return lines(test.captureCharFrame());
    };
    return { ...test, store, view, frame };
}

describe('createLogView', () => {
    it.each([
        'the quick brown fox jumps over the lazy dog '.repeat(3).trimEnd(),
        'https://example.com/' + 'abcdefghij'.repeat(8),
        '  preserve   real spaces  ' + 'word '.repeat(20),
        '§chello é😀 world ' + 'words '.repeat(20)
    ])('copies wrapped text without visual whitespace: %s', async (message) => {
        const t = await setup(60, 10);
        try {
            t.store.append(entry(message));
            t.view.setWrap(true);
            const frame = await t.frame();
            const last = frame.findLastIndex((row) => row.trim().length > 1);
            await t.mockMouse.drag(31, 0, 59, last);
            expect(t.view.getSelectedText()).toBe(message.replace('§c', ''));
            await t.mockMouse.drag(59, last, 31, 0);
            expect(t.view.getSelectedText()).toBe(message.replace('§c', ''));
        } finally {
            await t.dispose();
        }
    });

    it.each(['éééabcéé', '界界界abc界界', '😀😀😀abc😀😀'])(
        'copies a partial selection after wide or multibyte characters: %s',
        async (message) => {
            const t = await setup(60, 10);
            try {
                t.store.append(entry(message));
                t.view.setWrap(true);
                await t.frame();
                const start = message.startsWith('é') ? 34 : 37;
                await t.mockMouse.drag(start, 0, start + 2, 0);
                expect(t.view.getSelectedText()).toBe('abc');
            } finally {
                await t.dispose();
            }
        }
    );

    it('copies partial continuation rows and separates different records', async () => {
        const t = await setup(60, 10);
        try {
            t.store.append(entry('a'.repeat(50)));
            t.store.append(entry('next'));
            t.view.setWrap(true);
            await t.frame();
            await t.mockMouse.drag(34, 1, 38, 1);
            expect(t.view.getSelectedText()).toBe('aaaaa');
            await t.mockMouse.drag(1, 0, 59, 2);
            expect(t.view.getSelectedText()).toBe(
                '12:05:33 INFO    Server       ' + 'a'.repeat(50) + '\n12:05:33 INFO    Server       next'
            );
        } finally {
            await t.dispose();
        }
    });

    it('opens a source reference from either wrapped fragment, but ignores continuation indentation', async () => {
        const open = vi.fn();
        const t = await setup(60, 10, open);
        try {
            const path = 'packages/server/src/Server.ts';
            t.store.append(entry(`${path}:88:9`));
            t.view.setWrap(true);
            await t.frame();
            await t.mockMouse.click(32, 0, 0, { modifiers: { ctrl: true } });
            await t.mockMouse.click(32, 1, 0, { modifiers: { alt: true } });
            expect(open.mock.calls).toEqual([[{ path, line: 88, column: 9 }], [{ path, line: 88, column: 9 }]]);
            await t.mockMouse.click(20, 1, 0, { modifiers: { ctrl: true } });
            expect(open).toHaveBeenCalledTimes(2);
        } finally {
            await t.dispose();
        }
    });

    it('shows the newest records at the bottom after appending more than fit', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50; i += 1) t.store.append(entry(`line ${i}`));
            const rows = await t.frame();
            expect(rows[0]).toContain('line 31');
            expect(rows[19]).toContain('line 50');
            expect(t.view.renderable.getChildrenCount()).toBe(21);
        } finally {
            await t.dispose();
        }
    });

    it('collapses adjacent identical log and raw records and preserves each stored record', async () => {
        const t = await setup();
        try {
            t.store.append(entry('repeated'));
            t.store.append(entry('repeated'));
            t.store.append(entry('between'));
            t.store.append(entry('repeated'));
            t.store.appendRaw('stdout', 'child output', 1);
            t.store.appendRaw('stdout', 'child output', 1);

            const rows = await t.frame();
            const output = rows.join('\n');
            expect(output.match(/repeated \(x2\)/g)).toHaveLength(1);
            expect(output).toContain('between');
            expect(output).toContain('repeated\n');
            expect(output).toContain('child output (x2)');
            expect(t.store.visible()).toHaveLength(6);
        } finally {
            await t.dispose();
        }
    });

    it('pauses follow when scrolling up and shows the new lines badge', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50; i += 1) t.store.append(entry(`line ${i}`));
            await t.frame();
            t.view.scrollBy(-5);
            for (let i = 51; i <= 53; i += 1) t.store.append(entry(`line ${i}`));
            const rows = await t.frame();
            expect(rows[0]).toContain('line 26');
            expect(rows.join('\n')).toContain('▼ 3 new lines · End to follow');
            expect(rows.join('\n')).not.toContain('line 53');

            t.view.toBottom();
            const resumed = await t.frame();
            expect(resumed.join('\n')).not.toContain('new lines');
            expect(resumed[19]).toContain('line 53');
        } finally {
            await t.dispose();
        }
    });

    it('counts newly visible groups instead of repeated records while follow is paused', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 30; i += 1) t.store.append(entry(`line ${i}`));
            await t.frame();
            t.view.scrollBy(-2);

            t.store.append(entry('line 30'));
            const repeated = await t.frame();
            expect(repeated.join('\n')).not.toContain('new lines');

            t.store.append(entry('line 31'));
            expect((await t.frame()).join('\n')).toContain('1 new lines');
        } finally {
            await t.dispose();
        }
    });

    it('renders a generation separator as a rule', async () => {
        const t = await setup();
        try {
            t.store.append(entry('before'));
            t.store.startGeneration('server restarted', new Date(2024, 0, 1, 12, 6, 0).getTime());
            t.store.append(entry('after'));
            const rows = await t.frame();
            expect(rows[1]).toMatch(/^│─── 12:06:00 server restarted \(generation 2\) ─+$/);
            expect(rows[1]).toHaveLength(100);
        } finally {
            await t.dispose();
        }
    });

    it('rebuilds the row pool when the pane is resized', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50; i += 1) t.store.append(entry(`line ${i}`));
            await t.frame();
            t.resize(100, 10);
            await t.renderOnce();
            const rows = await t.frame();
            expect(t.view.renderable.getChildrenCount()).toBe(11);
            expect(rows[9]).toContain('line 50');
            expect(rows[0]).toContain('line 41');
        } finally {
            await t.dispose();
        }
    });

    it('keeps the renderable count bounded under a large append burst', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50_000; i += 1) t.store.append(entry(`line ${i}`));
            const rows = await t.frame();
            expect(t.view.renderable.getChildrenCount()).toBe(21);
            expect(rows[19]).toContain('line 50000');
        } finally {
            await t.dispose();
        }
    });

    it('wraps long messages when wrap is on and the newest row stays visible', async () => {
        const t = await setup(60, 4);
        try {
            t.store.append(entry('short'));
            t.store.append(entry('a long message that will not fit on one row of sixty columns'));
            t.view.setWrap(true);
            const rows = await t.frame();
            expect(rows).toEqual([
                '│12:05:33 INFO    Server       short',
                '│12:05:33 INFO    Server       a long message that will not',
                '│                              fit on one row of sixty',
                '│                              columns'
            ]);
        } finally {
            await t.dispose();
        }
    });

    it('marks search hits when a highlight is set', async () => {
        const t = await setup();
        try {
            t.store.append(entry('player joined'));
            t.view.setSearchHighlight('player');
            await t.frame();
            const spans = t.captureSpans();
            expect(JSON.stringify(spans)).toContain('player');
        } finally {
            await t.dispose();
        }
    });

    it('stops painting and stays silent on appends after dispose', async () => {
        const t = await setup();
        try {
            t.store.append(entry('before'));
            await t.frame();
            t.view.dispose();
            expect(() => {
                for (let i = 1; i <= 30; i += 1) t.store.append(entry(`after ${i}`));
            }).not.toThrow();
            const rows = await t.frame();
            expect(rows.join('\n')).not.toContain('after');
        } finally {
            await t.dispose();
        }
    });

    it('clears the view without touching the store and shows later records', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50; i += 1) t.store.append(entry(`line ${i}`));
            await t.frame();
            t.view.clearView();
            const cleared = await t.frame();
            expect(cleared.join('\n')).not.toContain('line');
            expect(t.store.visible()).toHaveLength(50);

            t.store.append(entry('after clear'));
            const rows = await t.frame();
            expect(rows[0]).toContain('after clear');
            expect(rows.join('\n')).not.toContain('line 50');
        } finally {
            await t.dispose();
        }
    });

    it('shows a repeated record again when it arrives after clearing the view', async () => {
        const t = await setup();
        try {
            t.store.append(entry('same'));
            t.store.append(entry('same'));
            await t.frame();
            t.view.clearView();
            await t.frame();

            t.store.append(entry('same'));
            const rows = await t.frame();
            expect(rows.join('\n')).toContain('same');
            expect(rows.join('\n')).not.toContain('same (x3)');
        } finally {
            await t.dispose();
        }
    });

    it('scrolls a record into view with scrollTo and pauses follow', async () => {
        const t = await setup();
        try {
            for (let i = 1; i <= 50; i += 1) t.store.append(entry(`line ${i}`));
            await t.frame();
            t.view.scrollTo(9);
            const rows = await t.frame();
            expect(rows[0]).toContain('line 10');
            expect(rows[19]).toContain('line 29');
            t.store.append(entry('line 51'));
            expect((await t.frame()).join('\n')).toContain('1 new lines');
        } finally {
            await t.dispose();
        }
    });

    it('switches the level column style in place', async () => {
        const t = await setup();
        try {
            t.store.append(entry('styled'));
            t.view.setShowNamespace(false);
            t.view.setLevelStyle('short');
            expect((await t.frame())[0]).toBe('│12:05:33 I styled');
            t.view.setLevelStyle('full');
            expect((await t.frame())[0]).toBe('│12:05:33 INFO    styled');
        } finally {
            await t.dispose();
        }
    });
});
