import { describe, expect, it } from 'vitest';

import type { PlaceholderOwner, PlaceholderProvider } from './placeholders';
import { ScriptPlaceholders } from './placeholders';

const steve = '-4294967295';

/** A registry that records what it reports, with `fatal` naming errors that end a render. */
const registry = (fatal?: (error: unknown) => boolean) => {
    const failures: string[] = [];
    const placeholders = new ScriptPlaceholders({
        failed: (owner, namespace, error) => failures.push(`${owner.name} ${namespace} ${String(error)}`),
        ...(fatal === undefined ? {} : { fatal })
    });
    return { placeholders, failures };
};

const pack: PlaceholderOwner = { name: 'pack' };
const other: PlaceholderOwner = { name: 'other' };

/** A provider that answers each key from a table, with `name` as the player's id. */
const table = (values: Record<string, string | number | undefined>): PlaceholderProvider => ({
    keys: Object.keys(values),
    resolve: (key, player) => (key === 'name' ? player : values[key])
});

describe('ScriptPlaceholders', () => {
    it('replaces the tokens a provider answers and leaves every other one as written', () => {
        const { placeholders } = registry();
        placeholders.register(pack, 'player', table({ name: undefined, ping: 42, hearts: 'ten' }));

        expect(placeholders.resolve('{player:name} {player:ping}ms {player:hearts}', steve)).toBe(`${steve} 42ms ten`);
        expect(
            placeholders.resolve(
                '{server:tps} {player:level} {Player:ping} {player} {player:ping } {{player:ping}}',
                steve
            )
        ).toBe('{server:tps} {player:level} {Player:ping} {player} {player:ping } {42}');
    });

    it('leaves a token whose resolver gives undefined, or something that is not text or a number', () => {
        const { placeholders } = registry();
        const odd: PlaceholderProvider = {
            keys: ['name', 'flag', 'list'],
            resolve: (key, player) => {
                if (key === 'name') return player;
                // A provider written in JavaScript may give anything; the types say what renders.
                const values: Record<string, unknown> = { flag: true, list: [1, 2] };
                return values[key] as string;
            }
        };
        placeholders.register(pack, 'player', odd);

        expect(placeholders.resolve('{player:name} {player:flag} {player:list}', undefined)).toBe(
            '{player:name} {player:flag} {player:list}'
        );
        expect(placeholders.resolve('{player:name}', steve)).toBe(steve);
    });

    it('leaves the token of a resolver that throws and reports the first throw per registration', () => {
        const { placeholders, failures } = registry();
        let calls = 0;
        placeholders.register(pack, 'bad', {
            keys: ['boom', 'fine'],
            resolve: (key) => {
                calls++;
                if (key === 'boom') throw new TypeError('no');
                return 'ok';
            }
        });

        expect(placeholders.resolve('{bad:boom} {bad:fine} {bad:boom}', undefined)).toBe('{bad:boom} ok {bad:boom}');
        expect(placeholders.resolve('{bad:boom}', undefined)).toBe('{bad:boom}');
        expect(calls).toBe(4);
        expect(failures).toEqual(['pack bad TypeError: no']);
    });

    it('lets a fatal error end the render instead', () => {
        const { placeholders, failures } = registry((error) => error instanceof RangeError);
        placeholders.register(pack, 'bad', {
            keys: ['hang'],
            resolve: () => {
                throw new RangeError('out of steps');
            }
        });

        expect(() => placeholders.resolve('{bad:hang}', undefined)).toThrow('out of steps');
        expect(failures).toEqual([]);
    });

    it('refuses a malformed namespace or key, a provider without keys and a namespace in use', () => {
        const { placeholders } = registry();
        placeholders.register(pack, 'player', table({ ping: 1 }));

        for (const name of ['Player', '1up', 'my-ns', 'a b', '', 'ns:key']) {
            expect(() => placeholders.register(pack, name, table({ ping: 1 }))).toThrow(TypeError);
            expect(() => placeholders.register(pack, 'fine', table({ [name]: 1 }))).toThrow(TypeError);
        }
        expect(() => placeholders.register(pack, 'empty', { keys: [], resolve: () => 1 })).toThrow(TypeError);
        expect(() => placeholders.register(other, 'player', table({ ping: 2 }))).toThrow(
            'The placeholder namespace player is registered already'
        );
        expect(() => placeholders.register(pack, 'player', table({ ping: 2 }))).toThrow(Error);
        expect(placeholders.namespaces()).toEqual([{ namespace: 'player', keys: ['ping'] }]);
    });

    it('ends a registration for its owner only, disposing the provider once, and frees the name', () => {
        const { placeholders } = registry();
        let disposed = 0;
        const id = placeholders.register(pack, 'player', { ...table({ ping: 1 }), dispose: () => disposed++ });

        placeholders.unregister(id, other);
        expect(placeholders.resolve('{player:ping}', undefined)).toBe('1');
        placeholders.unregister(id, pack);
        placeholders.unregister(id, pack);
        expect(placeholders.resolve('{player:ping}', undefined)).toBe('{player:ping}');
        expect(disposed).toBe(1);

        placeholders.register(other, 'player', table({ ping: 2 }));
        expect(placeholders.resolve('{player:ping}', undefined)).toBe('2');
    });

    it("releases every namespace of an owner when its scripts stop, and keeps the others'", () => {
        const { placeholders } = registry();
        const disposed: string[] = [];
        const provider = (namespace: string, owner: PlaceholderOwner) =>
            placeholders.register(owner, namespace, {
                ...table({ value: namespace }),
                dispose: () => disposed.push(`${owner.name} ${namespace}`)
            });
        provider('a', pack);
        provider('server', other);
        provider('b', pack);

        placeholders.release(pack);

        expect(disposed).toEqual(['pack a', 'pack b']);
        expect(placeholders.namespaces()).toEqual([{ namespace: 'server', keys: ['value'] }]);
        expect(placeholders.resolve('{a:value} {server:value} {b:value}', undefined)).toBe(
            '{a:value} server {b:value}'
        );
    });

    it('lists the namespaces oldest first, as copies', () => {
        const { placeholders } = registry();
        const keys = ['one', 'two'];
        placeholders.register(pack, 'first', { keys, resolve: () => 1 });
        placeholders.register(other, 'second', table({ x: 1 }));

        const listed = placeholders.namespaces();
        expect(listed).toEqual([
            { namespace: 'first', keys: ['one', 'two'] },
            { namespace: 'second', keys: ['x'] }
        ]);
        expect(listed[0]?.keys).not.toBe(keys);
    });
});
