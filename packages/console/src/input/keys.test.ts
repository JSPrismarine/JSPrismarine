import { describe, expect, it } from 'vitest';

import type { InputKey, KeyState } from './keys';
import { keyToAction } from './keys';

const key = (name: string, overrides: Partial<InputKey> = {}): InputKey => ({
    name,
    ctrl: false,
    shift: false,
    meta: false,
    ...overrides
});

const state = (overrides: Partial<KeyState> = {}): KeyState => ({
    value: '',
    completing: false,
    disabled: false,
    interruptPresses: 0,
    ...overrides
});

describe('keyToAction', () => {
    describe('Enter', () => {
        it('submits a non-empty line', () => {
            expect(keyToAction(key('return'), state({ value: 'list' }))).toEqual({ type: 'submit' });
        });

        it('ignores an empty or whitespace line', () => {
            expect(keyToAction(key('return'), state())).toEqual({ type: 'ignore' });
            expect(keyToAction(key('return'), state({ value: '   ' }))).toEqual({ type: 'ignore' });
        });

        it('ignores submit while disabled', () => {
            expect(keyToAction(key('return'), state({ value: 'list', disabled: true }))).toEqual({ type: 'ignore' });
        });

        it('treats the keypad enter and linefeed as Enter', () => {
            expect(keyToAction(key('kpenter'), state({ value: 'a' }))).toEqual({ type: 'submit' });
            expect(keyToAction(key('linefeed'), state({ value: 'a' }))).toEqual({ type: 'submit' });
        });
    });

    describe('history', () => {
        it('maps Up and Down to history navigation', () => {
            expect(keyToAction(key('up'), state())).toEqual({ type: 'history', direction: 'previous' });
            expect(keyToAction(key('down'), state())).toEqual({ type: 'history', direction: 'next' });
        });

        it('leaves modified arrows to the editor', () => {
            expect(keyToAction(key('up', { shift: true }), state())).toEqual({ type: 'edit' });
        });
    });

    describe('completion', () => {
        it('requests completion on Tab when the strip is closed', () => {
            expect(keyToAction(key('tab'), state({ value: 'li' }))).toEqual({ type: 'complete' });
        });

        it('cycles on Tab and reverses on Shift+Tab while the strip is open', () => {
            expect(keyToAction(key('tab'), state({ completing: true }))).toEqual({ type: 'cycle', direction: 1 });
            expect(keyToAction(key('tab', { shift: true }), state({ completing: true }))).toEqual({
                type: 'cycle',
                direction: -1
            });
        });

        it('closes the strip on Escape and otherwise ignores Escape', () => {
            expect(keyToAction(key('escape'), state({ completing: true }))).toEqual({ type: 'close' });
            expect(keyToAction(key('escape'), state())).toEqual({ type: 'ignore' });
        });

        it('ignores Tab while disabled', () => {
            expect(keyToAction(key('tab'), state({ disabled: true }))).toEqual({ type: 'ignore' });
        });
    });

    describe('Ctrl+C', () => {
        const ctrlC = key('c', { ctrl: true });

        it('clears a line with text', () => {
            expect(keyToAction(ctrlC, state({ value: 'say hi' }))).toEqual({ type: 'interrupt', kind: 'clear' });
        });

        it('asks for a hint on the first empty-line press', () => {
            expect(keyToAction(ctrlC, state())).toEqual({ type: 'hint' });
        });

        it('stops on the second press and forces on the third', () => {
            expect(keyToAction(ctrlC, state({ interruptPresses: 1 }))).toEqual({ type: 'interrupt', kind: 'stop' });
            expect(keyToAction(ctrlC, state({ interruptPresses: 2 }))).toEqual({ type: 'interrupt', kind: 'force' });
            expect(keyToAction(ctrlC, state({ interruptPresses: 5 }))).toEqual({ type: 'interrupt', kind: 'force' });
        });

        it('still works while disabled', () => {
            expect(keyToAction(ctrlC, state({ disabled: true, interruptPresses: 1 }))).toEqual({
                type: 'interrupt',
                kind: 'stop'
            });
        });
    });

    it('passes everything else to the editor, catalog hotkeys included', () => {
        expect(keyToAction(key('a'), state())).toEqual({ type: 'edit' });
        expect(keyToAction(key('backspace'), state({ value: 'ab' }))).toEqual({ type: 'edit' });
        expect(keyToAction(key('?'), state())).toEqual({ type: 'edit' });
        expect(keyToAction(key('g', { shift: true }), state())).toEqual({ type: 'edit' });
        expect(keyToAction(key('w', { ctrl: true }), state())).toEqual({ type: 'edit' });
    });
});
