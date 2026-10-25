import { describe, expect, it } from 'vitest';

import { flattenCommandTree } from './flatten';
import { literal } from '@jsprismarine/brigadier';
import { CommandRegistry } from './tree';

const ran = () => 1;

describe('CommandRegistry', () => {
    it('registers a command and its aliases', () => {
        const registry = new CommandRegistry<void>();
        registry.register(literal<void>('teleport').executes(ran), { aliases: ['tp'] });

        expect(registry.getNames()).toEqual(['teleport']);
        expect(registry.getAliasOwner('tp')).toBe('teleport');
    });

    it('refuses a name twice', () => {
        const registry = new CommandRegistry<void>();
        registry.register(literal<void>('say').executes(ran));

        expect(() => registry.register(literal<void>('say').executes(ran))).toThrow("'say' is already registered");
    });

    describe('with an include filter', () => {
        const build = () => {
            const registry = new CommandRegistry<void>({ include: (name) => name !== 'effect' });
            registry.register(literal<void>('give').executes(ran));
            const excluded = registry.register(literal<void>('effect').executes(ran), { aliases: ['eff'] });
            return { registry, excluded };
        };

        it('keeps an included command', () => {
            expect(build().registry.getNames()).toEqual(['give']);
        });

        it('reports what it turned away', () => {
            expect(build().registry.getExcludedNames()).toEqual(['effect']);
        });

        it('hands back a node the dispatcher does not hold', () => {
            const { registry, excluded } = build();

            expect(excluded.getName()).toBe('effect');
            expect([...registry.getRoot().getChildren()].map((child) => child.getName())).toEqual(['give']);
        });

        it('leaves an excluded command unparseable', () => {
            const { registry } = build();

            expect(registry.getDispatcher().parse('effect give @s speed', undefined).getReader().getRemaining()).toBe(
                'effect give @s speed'
            );
        });

        it('registers no alias for an excluded command', () => {
            expect(build().registry.getAliasOwner('eff')).toBeUndefined();
        });

        it('keeps an excluded command out of the packet', () => {
            const { registry } = build();

            expect(flattenCommandTree(registry).commands.map((command) => command.name)).toEqual(['give']);
        });

        it('refuses to register an excluded name a second time', () => {
            const { registry } = build();

            expect(() => registry.register(literal<void>('effect').executes(ran))).toThrow(
                "'effect' is already registered"
            );
        });
    });
});
