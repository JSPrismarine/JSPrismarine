import { describe, expect, it } from 'vitest';

import { CompletionState, formatCompletionStrip } from './completion';

describe('CompletionState', () => {
    it('starts closed', () => {
        const state = new CompletionState();

        expect(state.isOpen).toBe(false);
        expect(state.candidates).toEqual([]);
        expect(state.selected).toBeUndefined();
    });

    it('opens on the first candidate and remembers the text to replace', () => {
        const state = new CompletionState();
        state.open(['list', 'login'], 'l');

        expect(state.isOpen).toBe(true);
        expect(state.candidates).toEqual(['list', 'login']);
        expect(state.replace).toBe('l');
        expect(state.selectedIndex).toBe(0);
        expect(state.selected).toBe('list');
    });

    it('stays closed when opened with no candidates', () => {
        const state = new CompletionState();
        state.open([], 'x');

        expect(state.isOpen).toBe(false);
    });

    it('cycles forward and backward with wrap-around', () => {
        const state = new CompletionState();
        state.open(['a', 'b', 'c'], '');

        expect(state.cycle(1)).toBe('b');
        expect(state.cycle(1)).toBe('c');
        expect(state.cycle(1)).toBe('a');
        expect(state.cycle(-1)).toBe('c');
    });

    it('returns nothing from cycle while closed', () => {
        const state = new CompletionState();

        expect(state.cycle(1)).toBeUndefined();
    });

    it('accept returns the selected candidate and closes', () => {
        const state = new CompletionState();
        state.open(['stop', 'status'], 'st');
        state.cycle(1);

        expect(state.accept()).toBe('status');
        expect(state.isOpen).toBe(false);
        expect(state.accept()).toBeUndefined();
    });

    it('close clears the candidates', () => {
        const state = new CompletionState();
        state.open(['stop'], 's');
        state.close();

        expect(state.isOpen).toBe(false);
        expect(state.candidates).toEqual([]);
        expect(state.replace).toBe('');
    });
});

describe('formatCompletionStrip', () => {
    it('brackets the selected candidate and pads the others', () => {
        expect(formatCompletionStrip(['list', 'stop', 'help'], 1, 80)).toBe(' list  [stop]  help ');
    });

    it('drops leading candidates until the selected one fits', () => {
        expect(formatCompletionStrip(['alpha', 'beta', 'gamma'], 2, 16)).toBe(' beta  [gamma]');
    });

    it('cuts the row at the width', () => {
        expect(formatCompletionStrip(['alpha', 'beta', 'gamma'], 0, 10)).toBe('[alpha]  b');
    });
});
