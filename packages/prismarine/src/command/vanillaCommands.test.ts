import {
    BEDROCK_ONLY_COMMAND_NAMES,
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    createCommandSource,
    registerVanillaCommands,
    testCommandHost
} from '@jsprismarine/commands';
import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../../.test/reportProgress';

import type { EnchantmentRegistry } from '@jsprismarine/enchantments';
import type { Registry } from '@jsprismarine/content';
import type { EntityType } from '@jsprismarine/entities';
import type { BlockType } from '@jsprismarine/blocks';
import type { ItemType } from '@jsprismarine/items';

import type {
    ServerContent,
    ServerContentBlocks,
    ServerContentEntities,
    ServerContentItems
} from '../content/ServerContent';
import { stub } from '../testing/stub.test.helper';
import { UNWIRED_COMMANDS, buildVanillaCommands, contentRegistryIds } from './vanillaCommands';

/** Every command `@jsprismarine/commands` implements, wired here or not. */
const implemented = [...SHARED_COMMAND_NAMES, ...JAVA_ONLY_COMMAND_NAMES, ...BEDROCK_ONLY_COMMAND_NAMES];

describe('the vanilla command set this server runs', () => {
    const registry = buildVanillaCommands({});

    it('accounts for every command the package implements', () => {
        // The whole point of the split: a name is either dispatchable or
        // explained, and a command that is neither is one the audit missed.
        const wired = registry.getNames();
        const unwired = Object.keys(UNWIRED_COMMANDS);

        expect([...wired, ...unwired].sort()).toEqual([...implemented].sort());
        reportProgress(`${wired.length} commands wired; ${unwired.length} commands documented as unwired.`);
    });

    it('offers the content-backed commands whatever the registry lists hold', () => {
        // `/loot` and `/recipe` used to be held back until the pack stack was
        // turned on. The stack is no longer optional, so the two are offered
        // even when a caller passes no registry ids at all.
        const withoutIds = buildVanillaCommands();

        expect(withoutIds.getMetadata('loot')).toBeDefined();
        expect(withoutIds.getMetadata('recipe')).toBeDefined();
        expect(withoutIds.getExcludedNames().sort()).toEqual(Object.keys(UNWIRED_COMMANDS).sort());
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
        // A host that can answer every verb gets every command declared by the package.
        expect(registerVanillaCommands().getNames().sort()).toEqual([...implemented].sort());
    });

    it('reads the four validated registries off the content build', () => {
        const content = stub<ServerContent>({
            entities: stub<ServerContentEntities>({
                registry: stub<Registry<EntityType>>({ keys: () => ['mypack:dragon'] })
            }),
            blocks: stub<ServerContentBlocks>({ types: new Map([['mypack:brass_block', stub<BlockType>()]]) }),
            items: stub<ServerContentItems>({ types: new Map([['mypack:wrench', stub<ItemType>()]]) }),
            enchantments: stub<EnchantmentRegistry>({ ids: ['mypack:keen'] })
        });

        expect(contentRegistryIds(content)).toEqual({
            entityTypes: ['mypack:dragon'],
            blocks: ['mypack:brass_block'],
            items: ['mypack:wrench'],
            enchantments: ['mypack:keen']
        });
    });

    it('lets a pack entity through the parse gate it used to fail at', () => {
        // The registry argument validated against Mojang's frozen enum, so
        // `/summon mypack:dragon` was refused before it reached the host.
        const source = createCommandSource({ host: testCommandHost(), permissionLevel: 4 });
        const withPack = buildVanillaCommands({ entityTypes: ['mypack:dragon'] });

        expect(() => withPack.getDispatcher().execute('summon mypack:dragon 0 0 0', source)).not.toThrow();
        expect(() => registry.getDispatcher().execute('summon mypack:dragon 0 0 0', source)).toThrow(
            'minecraft:entity_type registry'
        );
    });
});
