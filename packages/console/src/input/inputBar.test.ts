import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { CommandHistory } from './history';
import type { CompletionResult, InputBarProps } from './inputBar';
import { createInputBar } from './inputBar';
import type { InterruptKind, ToggleAction } from './keys';

const SHIFT_TAB = '\u001B[Z';

const noCompletions = async (): Promise<CompletionResult> => ({ completions: [], replace: '' });

async function setup(overrides: Partial<InputBarProps> = {}) {
    const test = await createTestRenderer({ width: 40, height: 4, exitOnCtrlC: false });
    const submitted: string[] = [];
    const interrupts: InterruptKind[] = [];
    const hints: (string | undefined)[] = [];
    const toggles: ToggleAction[] = [];
    const history = new CommandHistory();
    let clock = 10_000;

    const bar = createInputBar(
        { renderer: test.renderer },
        {
            promptColor: '#ffffff',
            textColor: '#ffffff',
            ghostColor: '#888888',
            disabledColor: '#444444',
            history,
            onSubmit: (line) => submitted.push(line),
            onComplete: noCompletions,
            onInterrupt: (kind) => interrupts.push(kind),
            onHint: (text) => hints.push(text),
            onToggle: (action) => toggles.push(action),
            now: () => clock,
            ...overrides
        }
    );
    test.renderer.root.add(bar.renderable);
    bar.focus();
    await test.renderOnce();

    return {
        ...test,
        bar,
        history,
        submitted,
        interrupts,
        hints,
        toggles,
        advance: (ms: number) => {
            clock += ms;
        }
    };
}

describe('createInputBar', () => {
    let dispose: (() => Promise<void>) | undefined;

    afterEach(async () => {
        await dispose?.();
        dispose = undefined;
    });

    it('draws the prompt and placeholder', async () => {
        const t = await setup();
        dispose = t.dispose;

        expect(t.captureCharFrame()).toContain('> type a command, ? for help');
    });

    it('submits a typed line on Enter, records it, and clears the line', async () => {
        const t = await setup();
        dispose = t.dispose;

        await t.mockInput.typeText('say hi');
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('> say hi');

        t.mockInput.pressEnter();
        await t.renderOnce();

        expect(t.submitted).toEqual(['say hi']);
        expect(t.history.entries).toEqual(['say hi']);
        expect(t.bar.getValue()).toBe('');
    });

    it('ignores Enter on an empty line', async () => {
        const t = await setup();
        dispose = t.dispose;

        t.mockInput.pressEnter();
        await t.renderOnce();

        expect(t.submitted).toEqual([]);
    });

    it('recalls history with Up and restores the draft with Down', async () => {
        const t = await setup();
        dispose = t.dispose;
        t.history.push('list');
        t.history.push('stop');

        await t.mockInput.typeText('dr');
        t.mockInput.pressArrow('up');
        expect(t.bar.getValue()).toBe('stop');
        t.mockInput.pressArrow('up');
        expect(t.bar.getValue()).toBe('list');
        t.mockInput.pressArrow('down');
        t.mockInput.pressArrow('down');
        expect(t.bar.getValue()).toBe('dr');
    });

    it('fills the line from a single completion candidate', async () => {
        const t = await setup({
            onComplete: async (line) => ({ completions: ['list'], replace: line })
        });
        dispose = t.dispose;

        await t.mockInput.typeText('li');
        t.mockInput.pressTab();
        await t.waitFor(() => t.bar.getValue() === 'list');

        expect(t.captureCharFrame()).not.toContain('[list]');
    });

    it('replaces only the word before the cursor', async () => {
        const t = await setup({
            onComplete: async () => ({ completions: ['Steve'], replace: 'St' })
        });
        dispose = t.dispose;

        await t.mockInput.typeText('kick St');
        t.mockInput.pressTab();
        await t.waitFor(() => t.bar.getValue() === 'kick Steve');
    });

    it('opens a strip for several candidates, cycles with Tab, and closes on Escape', async () => {
        const t = await setup({
            onComplete: async (line) => ({ completions: ['list', 'login', 'lint'], replace: line })
        });
        dispose = t.dispose;

        await t.mockInput.typeText('l');
        t.mockInput.pressTab();
        await t.waitForFrame((frame) => frame.includes('[list]'));
        expect(t.bar.getValue()).toBe('list');

        t.mockInput.pressTab();
        await t.waitForFrame((frame) => frame.includes('[login]'));
        expect(t.bar.getValue()).toBe('login');

        t.mockInput.pressKey(SHIFT_TAB);
        await t.waitForFrame((frame) => frame.includes('[list]'));

        t.mockInput.pressEscape();
        // A lone ESC byte stays pending until the parser's 20 ms timeout fires.
        await new Promise((resolve) => setTimeout(resolve, 30));
        await t.waitForFrame((frame) => !frame.includes('[list]'));
        expect(t.bar.getValue()).toBe('list');
    });

    it('closes the strip when typing continues', async () => {
        const t = await setup({
            onComplete: async (line) => ({ completions: ['list', 'login'], replace: line })
        });
        dispose = t.dispose;

        await t.mockInput.typeText('l');
        t.mockInput.pressTab();
        await t.waitForFrame((frame) => frame.includes('[list]'));

        await t.mockInput.typeText(' ');
        await t.renderOnce();
        expect(t.captureCharFrame()).not.toContain('[list]');
        expect(t.bar.getValue()).toBe('list ');
    });

    it('drops a completion result that arrives after a newer request', async () => {
        let resolveFirst: ((result: CompletionResult) => void) | undefined;
        let calls = 0;
        const t = await setup({
            onComplete: () => {
                calls += 1;
                if (calls === 1) {
                    return new Promise<CompletionResult>((resolve) => {
                        resolveFirst = resolve;
                    });
                }
                return Promise.resolve({ completions: ['second'], replace: '' });
            }
        });
        dispose = t.dispose;

        t.mockInput.pressTab();
        t.mockInput.pressTab();
        await t.waitFor(() => t.bar.getValue() === 'second');
        resolveFirst?.({ completions: ['first'], replace: '' });
        await t.flush();

        expect(t.bar.getValue()).toBe('second');
    });

    describe('Ctrl+C', () => {
        it('clears a line with text', async () => {
            const t = await setup();
            dispose = t.dispose;

            await t.mockInput.typeText('say hi');
            t.mockInput.pressCtrlC();

            expect(t.bar.getValue()).toBe('');
            expect(t.interrupts).toEqual(['clear']);
            expect(t.hints).toEqual([]);
        });

        it('hints on the first empty press, stops on the second, forces on the third', async () => {
            const t = await setup();
            dispose = t.dispose;

            t.mockInput.pressCtrlC();
            expect(t.hints).toEqual(['press Ctrl+C again to stop the server']);
            expect(t.interrupts).toEqual([]);

            t.advance(500);
            t.mockInput.pressCtrlC();
            expect(t.interrupts).toEqual(['stop']);
            expect(t.hints.at(-1)).toBeUndefined();

            t.advance(500);
            t.mockInput.pressCtrlC();
            expect(t.interrupts).toEqual(['stop', 'force']);
        });

        it('starts over after the window passes', async () => {
            const t = await setup();
            dispose = t.dispose;

            t.mockInput.pressCtrlC();
            t.advance(2_001);
            t.mockInput.pressCtrlC();

            expect(t.interrupts).toEqual([]);
            expect(t.hints).toEqual(['press Ctrl+C again to stop the server', 'press Ctrl+C again to stop the server']);
        });

        it('forgets the first press when the user types instead', async () => {
            const t = await setup();
            dispose = t.dispose;

            t.mockInput.pressCtrlC();
            await t.mockInput.typeText('x');
            expect(t.hints).toEqual(['press Ctrl+C again to stop the server', undefined]);

            t.mockInput.pressCtrlC();
            expect(t.interrupts).toEqual(['clear']);
            t.mockInput.pressCtrlC();
            expect(t.interrupts).toEqual(['clear']);
            expect(t.hints.at(-1)).toBe('press Ctrl+C again to stop the server');
        });
    });

    it('routes empty-line hotkeys to onToggle without typing them', async () => {
        const t = await setup();
        dispose = t.dispose;

        t.mockInput.pressKey('?');
        t.mockInput.pressKey('G');
        expect(t.toggles).toEqual(['help', 'bottom']);
        expect(t.bar.getValue()).toBe('');

        await t.mockInput.typeText('a?');
        expect(t.bar.getValue()).toBe('a?');
        expect(t.toggles).toEqual(['help', 'bottom']);
    });

    it('types the hotkeys when no onToggle is wired', async () => {
        const t = await setup({ onToggle: undefined });
        dispose = t.dispose;

        t.mockInput.pressKey('?');
        expect(t.bar.getValue()).toBe('?');
    });

    it('shows a hint and refuses Enter while disabled', async () => {
        const t = await setup();
        dispose = t.dispose;

        t.bar.setDisabled(true, 'server stopped');
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('> server stopped');

        await t.mockInput.typeText('list');
        t.mockInput.pressEnter();
        expect(t.submitted).toEqual([]);

        t.bar.setDisabled(false);
        t.mockInput.pressEnter();
        expect(t.submitted).toEqual(['list']);
    });

    it('exposes setValue and getValue', async () => {
        const t = await setup();
        dispose = t.dispose;

        t.bar.setValue('stop');
        await t.renderOnce();

        expect(t.bar.getValue()).toBe('stop');
        expect(t.captureCharFrame()).toContain('> stop');
    });
});
