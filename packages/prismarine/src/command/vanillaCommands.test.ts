import {
    BEDROCK_ONLY_COMMAND_NAMES,
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    registerVanillaCommands
} from '@jsprismarine/commands';
import { describe, expect, it } from 'vitest';

import { UNWIRED_COMMANDS, buildVanillaCommands } from './vanillaCommands';

/** Every command `@jsprismarine/commands` implements, wired here or not. */
const implemented = [...SHARED_COMMAND_NAMES, ...JAVA_ONLY_COMMAND_NAMES, ...BEDROCK_ONLY_COMMAND_NAMES];

describe('the vanilla command set this server runs', () => {
    const registry = buildVanillaCommands();

    it('accounts for every command the package implements', () => {
        // The whole point of the split: a name is either dispatchable or
        // explained, and a command that is neither is one the audit missed.
        const wired = registry.getNames();
        const unwired = Object.keys(UNWIRED_COMMANDS);

        expect([...wired, ...unwired].sort()).toEqual([...implemented].sort());
    });

    it('names a real command in every unwired row', () => {
        // A stale row would quietly hide nothing, and would still read as an
        // explanation for a command that is in fact available.
        expect(Object.keys(UNWIRED_COMMANDS).filter((name) => !implemented.includes(name))).toEqual([]);
    });

    it('gives a reason for every unwired command', () => {
        expect(Object.values(UNWIRED_COMMANDS).filter((reason) => reason.trim().length === 0)).toEqual([]);
    });

    it('registers nothing an unwired row names', () => {
        for (const name of Object.keys(UNWIRED_COMMANDS)) {
            expect(registry.getMetadata(name)).toBeUndefined();
        }
        expect(registry.getExcludedNames().sort()).toEqual(Object.keys(UNWIRED_COMMANDS).sort());
    });

    it('keeps the commands a player reaches for', () => {
        // Not an exhaustive list - the one above is - but the handful whose
        // absence would be the regression this wiring exists to avoid.
        for (const name of ['teleport', 'gamemode', 'give', 'kill', 'summon', 'time', 'say', 'kick', 'help', 'list']) {
            expect(registry.getMetadata(name)).toBeDefined();
        }
    });

    it('answers an alias as its owner', () => {
        expect(registry.getAliasOwner('tp')).toBe('teleport');
        expect(registry.getAliasOwner('msg')).toBe('tell');
    });

    it('registers no alias belonging to an unwired command', () => {
        // `/experience` is `/xp`'s alias and `/xp` is unwired, so neither
        // spelling may reach the client.
        expect(registry.getAliasOwner('experience')).toBeUndefined();
    });

    it('leaves the package itself holding everything', () => {
        // The filter is this server's, not the package's: a different host
        // with a scoreboard gets all fifty from the same call.
        expect(registerVanillaCommands().getNames().sort()).toEqual([...implemented].sort());
    });
});
