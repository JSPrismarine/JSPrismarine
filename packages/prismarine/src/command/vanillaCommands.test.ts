import {
    BEDROCK_ONLY_COMMAND_NAMES,
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    registerVanillaCommands
} from '@jsprismarine/commands';
import { describe, expect, it } from 'vitest';

import { CONTENT_ONLY_COMMANDS, UNWIRED_COMMANDS, buildVanillaCommands, unwiredCommands } from './vanillaCommands';

/** Every command `@jsprismarine/commands` implements, wired here or not. */
const implemented = [...SHARED_COMMAND_NAMES, ...JAVA_ONLY_COMMAND_NAMES, ...BEDROCK_ONLY_COMMAND_NAMES];

describe('the vanilla command set this server runs', () => {
    const registry = buildVanillaCommands(true);

    it('accounts for every command the package implements', () => {
        // The whole point of the split: a name is either dispatchable or
        // explained, and a command that is neither is one the audit missed.
        const wired = registry.getNames();
        const unwired = Object.keys(UNWIRED_COMMANDS);

        expect([...wired, ...unwired].sort()).toEqual([...implemented].sort());
    });

    it('leaves the content-backed commands out when the pack stack is off', () => {
        // `/loot` rolls Java's tables and a server with no content build has
        // none, so it is the one command whose availability is a question
        // about the configuration rather than about the code.
        const withoutContent = buildVanillaCommands(false);

        expect(withoutContent.getMetadata('loot')).toBeUndefined();
        expect(registry.getMetadata('loot')).toBeDefined();
        expect(withoutContent.getExcludedNames().sort()).toEqual(Object.keys(unwiredCommands(false)).sort());
    });

    it('gives a reason for every content-backed command it holds back', () => {
        expect(Object.values(CONTENT_ONLY_COMMANDS).filter((reason) => reason.trim().length === 0)).toEqual([]);
        expect(Object.keys(CONTENT_ONLY_COMMANDS).filter((name) => !implemented.includes(name))).toEqual([]);
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

    it('registers an alias exactly when its owner is wired', () => {
        // `/experience` is `/xp`'s alias, so the two spellings stand or fall
        // together: an alias reaching the client for a command nothing can
        // dispatch is the gap this filter exists to close.
        expect(registry.getAliasOwner('experience')).toBe('xp');

        const unwired = Object.keys(UNWIRED_COMMANDS);
        for (const name of registry.getNames()) {
            expect(unwired).not.toContain(name);
        }
    });

    it('leaves the package itself holding everything', () => {
        // The filter is this server's, not the package's: a host that can
        // answer every verb gets all 60 from the same call.
        expect(registerVanillaCommands().getNames()).toHaveLength(60);
        expect(registerVanillaCommands().getNames().sort()).toEqual([...implemented].sort());
    });

    it('offers 52 commands with the pack stack on and 50 with it off', () => {
        // The number a player sees in their client. Stated outright because
        // it is what a release note reports and what a regression moves.
        expect(registry.getNames()).toHaveLength(52);
        expect(buildVanillaCommands(false).getNames()).toHaveLength(50);
    });
});
