import { BoxRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../theme/theme';
import { createToastStack } from './toasts';
import type { ToastTimers } from './toasts';

/** Manual timers: `advance(ms)` moves the clock and fires every timer that came due, in order. */
function manualTimers() {
    let now = 0;
    let nextHandle = 1;
    const pending = new Map<number, { at: number; fn: () => void }>();
    const timers: ToastTimers = {
        now: () => now,
        setTimeout(fn, delay) {
            const handle = nextHandle++;
            pending.set(handle, { at: now + delay, fn });
            return handle;
        },
        clearTimeout(handle) {
            pending.delete(handle);
        }
    };
    const advance = (ms: number) => {
        const target = now + ms;
        for (;;) {
            const due = [...pending.entries()]
                .filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            pending.delete(due[0]);
            now = due[1].at;
            due[1].fn();
        }
        now = target;
    };
    return { timers, advance, pendingCount: () => pending.size };
}

async function setup(width = 60, height = 10) {
    const test = await createTestRenderer({ width, height });
    const parent = new BoxRenderable(test.renderer, { id: 'pane', width, height });
    test.renderer.root.add(parent);
    return { ...test, parent };
}

describe('createToastStack', () => {
    it('shows a toast in a bordered box at the top right of its parent and removes it when the ttl fires', async () => {
        const test = await setup();
        const clock = manualTimers();
        try {
            const stack = createToastStack(
                { renderer: test.renderer, theme: defaultTheme },
                { defaultTtlMs: 4000, timers: clock.timers }
            );
            test.parent.add(stack.renderable);

            stack.push({ tone: 'ok', text: 'server restarted' });
            await test.renderOnce();
            const lines = test.captureCharFrame().split('\n');
            expect(lines[1]).toContain('server restarted');
            expect(lines[0]?.trimEnd().endsWith('╮')).toBe(true);
            expect(lines[1]?.trimEnd().endsWith('│')).toBe(true);
            expect(lines[2]?.trimEnd().endsWith('╯')).toBe(true);

            clock.advance(3999);
            await test.renderOnce();
            expect(test.captureCharFrame()).toContain('server restarted');

            clock.advance(1);
            await test.renderOnce();
            expect(test.captureCharFrame()).not.toContain('server restarted');
            expect(clock.pendingCount()).toBe(0);
        } finally {
            await test.dispose();
        }
    });

    it('stacks newest at the bottom, keeps sticky toasts, and dismisses by id', async () => {
        const test = await setup();
        const clock = manualTimers();
        try {
            const stack = createToastStack({ renderer: test.renderer, theme: defaultTheme }, { timers: clock.timers });
            test.parent.add(stack.renderable);

            const crash = stack.push({ tone: 'danger', text: 'server crashed', sticky: true });
            stack.push({ tone: 'warning', text: 'change detected', ttlMs: 1000 });
            await test.renderOnce();
            let frame = test.captureCharFrame();
            expect(frame.indexOf('server crashed')).toBeLessThan(frame.indexOf('change detected'));

            clock.advance(1000);
            await test.renderOnce();
            frame = test.captureCharFrame();
            expect(frame).toContain('server crashed');
            expect(frame).not.toContain('change detected');

            stack.dismiss(crash);
            await test.renderOnce();
            expect(test.captureCharFrame()).not.toContain('server crashed');
        } finally {
            await test.dispose();
        }
    });

    it('clears every toast and cancels the timer on dispose', async () => {
        const test = await setup();
        const clock = manualTimers();
        try {
            const stack = createToastStack({ renderer: test.renderer, theme: defaultTheme }, { timers: clock.timers });
            test.parent.add(stack.renderable);
            stack.push({ tone: 'ok', text: 'one' });
            stack.push({ tone: 'ok', text: 'two' });
            expect(clock.pendingCount()).toBe(1);

            stack.clear();
            await test.renderOnce();
            expect(test.captureCharFrame()).not.toContain('one');
            expect(clock.pendingCount()).toBe(0);

            stack.push({ tone: 'ok', text: 'three' });
            stack.dispose();
            expect(clock.pendingCount()).toBe(0);
        } finally {
            await test.dispose();
        }
    });
});
