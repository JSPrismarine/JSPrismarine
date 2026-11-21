import { describe, expect, it } from 'vitest';

import {
    COMMAND_CATALOG,
    COMMAND_GROUPS,
    KEY_PLATFORMS,
    bindingsFor,
    commandKeys,
    formatBinding,
    keyPlatformFor,
    resolveCommand
} from './catalog';
import type { CommandId, KeyBinding } from './catalog';

const key = (name: string, modifiers: Partial<Pick<KeyBinding, 'ctrl' | 'shift' | 'meta' | 'super'>> = {}) => ({
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

    it('gives each key at most one command while the log has focus', () => {
        const seen = new Map<string, CommandId>();
        for (const command of COMMAND_CATALOG) {
            const labels = new Set(
                KEY_PLATFORMS.flatMap((platform) => bindingsFor(command, platform)).map((b) => formatBinding(b))
            );
            for (const label of labels) {
                expect(seen.get(label), `${label} bound to ${seen.get(label)} and ${command.id}`).toBeUndefined();
                seen.set(label, command.id);
            }
        }
    });
});

describe('keyPlatformFor', () => {
    it('uses the Mac convention on macOS only', () => {
        expect(keyPlatformFor('darwin')).toBe('mac');
        expect(keyPlatformFor('linux')).toBe('pc');
        expect(keyPlatformFor('win32')).toBe('pc');
    });
});

describe('commandKeys', () => {
    const keysOf = (id: CommandId, platform: 'mac' | 'pc') => {
        const command = COMMAND_CATALOG.find((candidate) => candidate.id === id);
        if (command === undefined) throw new TypeError(`no ${id}`);
        return commandKeys(command, platform);
    };

    it('leads with Command for app shortcuts on a Mac and keeps Ctrl as a fallback', () => {
        expect(keysOf('view.palette', 'mac')).toEqual(['⌘K', '⌃K']);
        expect(keysOf('view.toggleSidePane', 'mac')).toEqual(['⌘B', '⌃B']);
        expect(keysOf('log.filter', 'mac')).toEqual(['⌘F', '⌃F']);
        expect(keysOf('server.restart', 'mac')).toEqual(['⇧⌘R', '⌃⇧R']);
    });

    it('uses Ctrl for the same shortcuts elsewhere', () => {
        expect(keysOf('view.palette', 'pc')).toEqual(['Ctrl+K']);
        expect(keysOf('server.restart', 'pc')).toEqual(['Ctrl+Shift+R']);
    });

    it('lists only the copy and paste chords of the platform', () => {
        expect(keysOf('log.copySelection', 'mac')).toEqual(['⌘C']);
        expect(keysOf('input.paste', 'mac')).toEqual(['⌘V']);
        expect(keysOf('log.copySelection', 'pc')).toEqual(['Ctrl+Shift+C']);
        expect(keysOf('input.paste', 'pc')).toEqual(['Ctrl+Shift+V']);
    });

    it('keeps Ctrl for terminal conventions on a Mac', () => {
        expect(keysOf('input.historySearch', 'mac')).toEqual(['⌃R']);
        expect(keysOf('log.nextWarning', 'mac')).toEqual(['⌃W']);
        expect(keysOf('server.stop', 'mac')).toEqual(['⌃C twice']);
        expect(keysOf('server.stop', 'pc')).toEqual(['Ctrl+C twice']);
    });
});

describe('formatBinding', () => {
    it('spells keys the way the UX table does', () => {
        expect(formatBinding({ name: 'pageup' })).toBe('PgUp');
        expect(formatBinding({ name: 'pagedown' })).toBe('PgDn');
        expect(formatBinding({ name: 'home' })).toBe('Home');
        expect(formatBinding({ name: 'u', ctrl: true })).toBe('Ctrl+U');
        expect(formatBinding({ name: 'n', shift: true })).toBe('N');
        expect(formatBinding({ name: 'r', ctrl: true, shift: true })).toBe('Ctrl+Shift+R');
        expect(formatBinding({ name: '?' })).toBe('?');
        expect(formatBinding({ name: 'escape' })).toBe('Esc');
    });

    it('writes Mac modifiers as the symbols on the keys, in Apple order', () => {
        expect(formatBinding({ name: 'k', super: true }, 'mac')).toBe('⌘K');
        expect(formatBinding({ name: 'u', ctrl: true }, 'mac')).toBe('⌃U');
        expect(formatBinding({ name: 'r', super: true, shift: true }, 'mac')).toBe('⇧⌘R');
        expect(formatBinding({ name: 'n', shift: true }, 'mac')).toBe('N');
        expect(formatBinding({ name: 'pageup' }, 'mac')).toBe('PgUp');
        expect(formatBinding({ name: 'home', ctrl: true }, 'mac')).toBe('⌃ Home');
    });
});

describe('resolveCommand', () => {
    const inputFocused = { inputFocused: true };
    const logFocused = { inputFocused: false };

    it.each([
        ['u', 'log.pageUp'],
        ['d', 'log.pageDown'],
        ['e', 'log.nextError'],
        ['w', 'log.nextWarning'],
        ['f', 'log.filter'],
        ['b', 'view.toggleSidePane']
    ] as const)('resolves %s only while the log has focus, since the line editor uses it', (name, expected) => {
        const press = name.length === 1 ? ctrl(name) : key(name);
        expect(resolveCommand(press, logFocused)).toBe(expected);
        expect(resolveCommand(press, inputFocused)).toBeUndefined();
    });

    it.each([
        [key('pageup'), 'log.pageUp'],
        [key('pagedown'), 'log.pageDown'],
        [ctrl('l'), 'log.clearView'],
        [ctrl('r'), 'input.historySearch'],
        [key('r', { ctrl: true, shift: true }), 'server.restart'],
        [key('b', { super: true }), 'view.toggleSidePane'],
        [key('f', { super: true }), 'log.filter']
    ] as const)('resolves %o whichever side has focus, since the line editor leaves it alone', (press, expected) => {
        expect(resolveCommand(press, logFocused)).toBe(expected);
        expect(resolveCommand(press, inputFocused)).toBe(expected);
    });

    it('opens the palette on Cmd+K or Ctrl+K whichever side has focus', () => {
        for (const context of [logFocused, inputFocused]) {
            expect(resolveCommand(ctrl('k'), context)).toBe('view.palette');
            expect(resolveCommand(key('k', { super: true }), context)).toBe('view.palette');
        }
    });

    it('runs the Command forms of app shortcuts while the log has focus', () => {
        expect(resolveCommand(key('b', { super: true }), logFocused)).toBe('view.toggleSidePane');
        expect(resolveCommand(key('f', { super: true }), logFocused)).toBe('log.filter');
        expect(resolveCommand(key('r', { super: true, shift: true }), logFocused)).toBe('server.restart');
        // Cmd+W closes the terminal tab, so it is not bound.
        expect(resolveCommand(key('w', { super: true }), logFocused)).toBeUndefined();
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
    ] as const)('resolves %o only while the log has focus', (press, expected) => {
        expect(resolveCommand(press, logFocused)).toBe(expected);
        expect(resolveCommand(press, inputFocused)).toBeUndefined();
    });

    it('resolves copy and paste chords whichever pane has focus', () => {
        const cmdC = { ...key('c'), super: true };
        const cmdV = { ...key('v'), super: true };
        for (const context of [inputFocused, logFocused]) {
            expect(resolveCommand(cmdC, context)).toBe('log.copySelection');
            expect(resolveCommand(key('c', { ctrl: true, shift: true }), context)).toBe('log.copySelection');
            expect(resolveCommand(cmdV, context)).toBe('input.paste');
            expect(resolveCommand(key('v', { ctrl: true, shift: true }), context)).toBe('input.paste');
        }
    });

    it('keeps bare Ctrl+C for the input line', () => {
        expect(resolveCommand(ctrl('c'), inputFocused)).toBeUndefined();
    });

    it('restarts on Ctrl+Shift+R and searches history on Ctrl+R', () => {
        expect(resolveCommand(key('r', { ctrl: true, shift: true }), logFocused)).toBe('server.restart');
        expect(resolveCommand(ctrl('r'), logFocused)).toBe('input.historySearch');
    });

    it('does not bind a key to stop the server', () => {
        const stop = COMMAND_CATALOG.find((command) => command.id === 'server.stop');
        expect(stop?.bindings).toEqual([]);
    });

    it('ignores unbound keys and extra modifiers', () => {
        expect(resolveCommand(key('x'), logFocused)).toBeUndefined();
        expect(resolveCommand(key('pageup', { meta: true }), logFocused)).toBeUndefined();
        expect(resolveCommand(key('u', { ctrl: true, shift: true }), logFocused)).toBeUndefined();
    });
});
