import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AccessorImplementation, GetterImplementation, ImplementationOf, MemberFunction } from './implementations';
import { ScriptApiImplementations } from './implementations';

describe('ScriptApiImplementations', () => {
    it('finds what was registered by module, class and member', () => {
        const getDimension: MemberFunction = () => 'overworld';
        const implementations = new ScriptApiImplementations().implement(
            '@minecraft/server',
            'World',
            'getDimension',
            getDimension
        );

        expect(implementations.find('@minecraft/server', 'World', 'getDimension')).toBe(getDimension);
        expect(implementations.find('@minecraft/server', 'World', 'sendMessage')).toBeUndefined();
    });

    it('refuses a second implementation of one member', () => {
        const implementations = new ScriptApiImplementations().implement(
            '@minecraft/server',
            'World',
            'getDimension',
            () => 1
        );

        expect(() => implementations.implement('@minecraft/server', 'World', 'getDimension', () => 2)).toThrow(
            'World.getDimension from @minecraft/server is implemented twice'
        );
    });

    it('types each member by how it binds', () => {
        expectTypeOf<ImplementationOf<'method'>>().toEqualTypeOf<MemberFunction>();
        expectTypeOf<ImplementationOf<'getter'>>().toEqualTypeOf<GetterImplementation>();
        expectTypeOf<ImplementationOf<'accessor'>>().toEqualTypeOf<AccessorImplementation>();

        const implementations = new ScriptApiImplementations();
        implementations.implement('@minecraft/server', 'World', 'seed', { get: () => '0' });
        implementations.implement('@minecraft/server', 'ItemStack', 'amount', { set: () => {} });
        implementations.implement('@minecraft/server-graphics', '', 'getBiomeLighting', () => undefined);
        // @ts-expect-error World has no member BDS does not list
        implementations.implement('@minecraft/server', 'World', 'teleportEverything', () => undefined);
        // @ts-expect-error no generated module has this name
        implementations.implement('@minecraft/server-editor', 'World', 'seed', () => undefined);
        // @ts-expect-error a read-only property takes a getter, not a function
        new ScriptApiImplementations().implement('@minecraft/server', 'World', 'seed', () => '0');
    });
});
