import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG, COMMAND_GROUPS, formatBinding, resolveCommand } from './catalog';
import type { CommandId, KeyBinding } from './catalog';

const key = (name: string, modifiers: Partial<Pick<KeyBinding, 'ctrl' | 'shift' | 'meta'>> = {}) => ({
    name,
    ctrl: false,
    shift: false,
    meta: false,
    ...modifiers
});

const ctrl = (name: string) => key(name, { ctrl: true });

describe('COMMAND_CATALOG', () => {
    it('places every command in a known group', () => {
        for (const command of COMMAND_CATALOG) {
            expect(COMMAND_GROUPS).toContain(command.group);
        }
    });

    it('gives each key at most one command per input state', () => {
        for (const inputEmpty of [true, false]) {
            const seen = new Map<string, CommandId>();
            for (const command of COMMAND_CATALOG) {
                for (const binding of command.bindings) {
                    if (binding.emptyLineOnly && !inputEmpty) continue;
                    const label = formatBinding(binding);
                    expect(seen.get(label), `${label} bound to ${seen.get(label)} and ${command.id}`).toBeUndefined();
                    seen.set(label, command.id);
                }
            }
        }
    });
});

describe('formatBinding', () => {
    it('spells keys the way the UX table does', () => {
        expect(formatBinding({ name: 'pageup' })).toBe('PgUp');
        expect(formatBinding({ name: 'pagedown' })).toBe('PgDn');
        expect(formatBinding({ name: 'home' })).toBe('Home');
        expect(formatBinding({ name: 'u', ctrl: true })).toBe('Ctrl+U');
        expect(formatBinding({ name: 'n', shift: true })).toBe('N');
        expect(formatBinding({ name: '?' })).toBe('?');
    });
});

describe('resolveCommand', () => {
    const empty = { inputEmpty: true };
    const typing = { inputEmpty: false };

    it.each([
        ['pageup', 'log.pageUp'],
        ['pagedown', 'log.pageDown'],
        ['u', 'log.pageUp'],
        ['d', 'log.pageDown'],
        ['e', 'log.nextError'],
        ['w', 'log.nextWarning'],
        ['l', 'log.clearView'],
        ['f', 'log.filter'],
        ['b', 'view.toggleSidePane'],
        ['k', 'view.palette'],
        ['r', 'input.historySearch']
    ] as const)('resolves %s with or without input text', (name, expected) => {
        const press = name.length === 1 ? ctrl(name) : key(name);
        expect(resolveCommand(press, empty)).toBe(expected);
        expect(resolveCommand(press, typing)).toBe(expected);
    });

    it.each([
        [key('home'), 'log.top'],
        [key('g'), 'log.top'],
        [key('end'), 'log.bottom'],
        [key('g', { shift: true }), 'log.bottom'],
        [key('/'), 'log.search'],
        [key('n'), 'log.searchNext'],
        [key('n', { shift: true }), 'log.searchPrev'],
        [key('w'), 'log.toggleWrap'],
        [key('?'), 'view.help']
    ] as const)('resolves %o only while the input line is empty', (press, expected) => {
        expect(resolveCommand(press, empty)).toBe(expected);
        expect(resolveCommand(press, typing)).toBeUndefined();
    });

    it('does not bind a key to stop the server', () => {
        const stop = COMMAND_CATALOG.find((command) => command.id === 'server.stop');
        expect(stop?.bindings).toEqual([]);
    });

    it('ignores unbound keys and extra modifiers', () => {
        expect(resolveCommand(key('x'), empty)).toBeUndefined();
        expect(resolveCommand(key('pageup', { meta: true }), empty)).toBeUndefined();
        expect(resolveCommand(key('u', { ctrl: true, shift: true }), empty)).toBeUndefined();
    });
});
