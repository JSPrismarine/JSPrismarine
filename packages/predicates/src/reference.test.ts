import { describe, expect, it } from 'vitest';

import { DiagnosticCollector } from './diagnostics';
import { asString, member } from './json';
import { ParseContext } from './parse';
import { parseComposed, parseComposedOne, resolveMembers } from './reference';
import type { ReferenceResolver } from './reference';

const elements: Record<string, unknown> = {
    'minecraft:a': { name: 'a' },
    'minecraft:b': { name: 'b' },
    'minecraft:loop': { ref: 'minecraft:loop' }
};

const tags: Record<string, readonly string[]> = {
    'minecraft:letters': ['minecraft:a', 'minecraft:b'],
    'minecraft:nested': ['#minecraft:letters'],
    'minecraft:cycle': ['#minecraft:cycle']
};

const resolver: ReferenceResolver = {
    element: (_registry, id) => elements[id],
    tag: (_registry, id) => tags[id]
};

const parseNamed = (inline: unknown, inner: ParseContext): string | undefined => {
    const reference = member(inline, 'ref');
    if (reference !== undefined) {
        return parseComposed(reference, 'predicate', inner.at('ref'), parseNamed)[0];
    }

    const name = asString(member(inline, 'name'));
    if (name === undefined) inner.error('not a named element');
    return name;
};

const names = (value: unknown, options: { resolver?: ReferenceResolver } = { resolver }) => {
    const diagnostics = new DiagnosticCollector();
    const context = new ParseContext('root', diagnostics, options.resolver);
    return { parsed: parseComposed(value, 'predicate', context, parseNamed), diagnostics: diagnostics.entries };
};

describe('the 26.3 composition rule', () => {
    it('accepts an inline value', () => {
        expect(names({ name: 'inline' })).toEqual({ parsed: ['inline'], diagnostics: [] });
    });

    it('accepts a namespaced id resolved through the injected resolver', () => {
        expect(names('minecraft:a')).toEqual({ parsed: ['a'], diagnostics: [] });
    });

    it('accepts a list mixing inline values and ids', () => {
        expect(names([{ name: 'inline' }, 'minecraft:b'])).toEqual({ parsed: ['inline', 'b'], diagnostics: [] });
    });

    it('accepts a hash-prefixed tag id', () => {
        expect(names('#minecraft:letters')).toEqual({ parsed: ['a', 'b'], diagnostics: [] });
    });

    it('expands a tag that names another tag', () => {
        expect(names('#minecraft:nested').parsed).toEqual(['a', 'b']);
    });

    it('reads an unprefixed id as the minecraft namespace', () => {
        expect(names('a').parsed).toEqual(['a']);
    });

    it('reports an unknown id instead of throwing', () => {
        expect(names('minecraft:missing')).toEqual({
            parsed: [],
            diagnostics: [{ severity: 'error', path: 'root', message: 'unknown predicate minecraft:missing' }]
        });
    });

    it('reports a reference with no resolver to reach it', () => {
        expect(names('minecraft:a', {})).toEqual({
            parsed: [],
            diagnostics: [
                {
                    severity: 'error',
                    path: 'root',
                    message: 'cannot resolve minecraft:a: the parse options carry no element resolver'
                }
            ]
        });
    });

    it('reports a self-referencing element instead of recursing forever', () => {
        const { parsed, diagnostics } = names('minecraft:loop');

        expect(parsed).toEqual([]);
        expect(diagnostics.some((entry) => entry.message.includes('cyclic'))).toBe(true);
    });

    it('reports a self-referencing tag instead of recursing forever', () => {
        expect(names('#minecraft:cycle').diagnostics.some((entry) => entry.message.includes('cyclic'))).toBe(true);
    });
});

describe('parseComposedOne', () => {
    it('reports when a single-element field resolves to several', () => {
        const diagnostics = new DiagnosticCollector();
        const context = new ParseContext('term', diagnostics, resolver);
        const parsed = parseComposedOne(['minecraft:a', 'minecraft:b'], 'predicate', context, (inline) =>
            asString(member(inline, 'name'))
        );

        expect(parsed).toBe('a');
        expect(diagnostics.errors).toEqual([
            { severity: 'error', path: 'term', message: 'expected one predicate but the composition resolved to 2' }
        ]);
    });
});

describe('resolveMembers', () => {
    it('expands the member form into ids and keeps the tag names', () => {
        const context = new ParseContext('items', new DiagnosticCollector(), resolver);
        const { ids, tags: names } = resolveMembers(['minecraft:c', '#minecraft:letters'], 'item', context);

        expect([...ids]).toEqual(['minecraft:c', 'minecraft:a', 'minecraft:b']);
        expect(names).toEqual(['minecraft:letters']);
    });

    it('keeps a tag name without reporting when no resolver can expand it', () => {
        const diagnostics = new DiagnosticCollector();
        const context = new ParseContext('items', diagnostics, undefined);
        const { ids, tags: names } = resolveMembers('#minecraft:planks', 'item', context);

        expect([...ids]).toEqual([]);
        expect(names).toEqual(['minecraft:planks']);
        expect(diagnostics.entries).toEqual([]);
    });
});
