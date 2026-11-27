import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { spellCitation, tagCitations } from './citations.mts';
import type { JavaClass } from './classFile.mts';
import { parseJavaClass } from './classFile.mts';
import type { JavaClassIndex } from './sources.mts';

const sponge = parseJavaClass(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'v1', 'Sponge.class')));

/** A subclass that declares nothing, so every member it is cited with is inherited. */
const wet: JavaClass = { ...sponge, name: 'net/example/Wet', superName: sponge.name, methods: [], fields: [] };
/** A nested class with Sponge's methods, as a goal or behavior nested in a mob class is. */
const drip: JavaClass = { ...sponge, name: `${sponge.name}$Drip` };

const classes = new Map([sponge, wet, drip].map((parsed) => [parsed.name, parsed]));
const index: JavaClassIndex = { names: [...classes.keys()], load: (name) => classes.get(name) };

const spelling = (path: string, cited?: string): string => {
    const resolved = spellCitation(path, cited, index);
    return resolved.kind === 'resolved' ? resolved.spelling : `unresolved: ${resolved.reason}`;
};

describe('spellCitation', () => {
    it('spells a method and a field by their simple class name', () => {
        expect(spelling('Sponge.absorb')).toBe('Sponge.absorb');
        expect(spelling('Sponge.MAX_DEPTH')).toBe('Sponge.MAX_DEPTH');
    });

    it('picks an overload by the cited argument types, and reports one it cannot pick', () => {
        expect(spelling('Sponge.overload', '(long)')).toBe('Sponge.overload(J)I');
        expect(spelling('Sponge.overload', '(a)')).toMatch(/^unresolved: .*overloaded/);
        expect(spelling('Sponge.overload')).toMatch(/^unresolved: .*overloaded/);
    });

    it('names the class that declares an inherited member, and a nested class with $', () => {
        expect(spelling('Wet.absorb')).toBe('Sponge.absorb');
        expect(spelling('Sponge.Drip.describe')).toBe('Sponge$Drip.describe');
        expect(spelling('Drip.describe')).toBe('Sponge$Drip.describe');
    });

    it('reports a member or a class the jar does not have', () => {
        expect(spelling('Sponge.soak')).toMatch(/^unresolved: .*declare no soak/);
        expect(spelling('HashMap.hash')).toMatch(/^unresolved: no single class HashMap/);
    });
});

describe('tagCitations', () => {
    it('tags the code a comment documents, widening a one-line comment', () => {
        const { text, added, untagged } = tagCitations(
            [
                "/** Java's `Sponge.absorb`. */",
                'export const absorb = () => 0;',
                '',
                '/**',
                " * Java's `Sponge.overload(long)` and Java's `Wet.absorb`.",
                ' */',
                'const both = 1;'
            ].join('\n'),
            index
        );

        expect(text).toBe(
            [
                '/**',
                " * Java's `Sponge.absorb`.",
                ' *',
                ' * @javaSource Sponge.absorb',
                ' */',
                'export const absorb = () => 0;',
                '',
                '/**',
                " * Java's `Sponge.overload(long)` and Java's `Wet.absorb`.",
                ' *',
                ' * @javaSource Sponge.overload(J)I',
                ' * @javaSource Sponge.absorb',
                ' */',
                'const both = 1;'
            ].join('\n')
        );
        expect(added.map((tag) => tag.spelling)).toEqual(['Sponge.absorb', 'Sponge.overload(J)I', 'Sponge.absorb']);
        expect(untagged).toEqual([]);
    });

    it('marks a citation on a type, an interface member or an overview as @javaSee', () => {
        const { text } = tagCitations(
            [
                "/** Mirrors Java's `Sponge.describe`. */",
                'export interface Host {',
                "    /** Java's `Sponge.unrelated`. */",
                '    unrelated?(): number;',
                '}',
                '',
                "/** The overview, citing Java's `Sponge.locked`. */",
                '',
                'const x = 1;'
            ].join('\n'),
            index
        );

        expect(text).toContain(' * @javaSee Sponge.describe\n */\nexport interface Host');
        expect(text).toContain('     * @javaSee Sponge.unrelated\n     */\n    unrelated?(): number;');
        expect(text).toContain(' * @javaSee Sponge.locked\n */\n\nconst x');
    });

    it('tags each method of a cited nested class, without lambdas and private helpers', () => {
        const { added } = tagCitations("/** Java's `Sponge.Drip`. */\nfunction drip() {}", index);

        expect(added.map((tag) => tag.spelling)).toEqual([
            'Sponge$Drip.absorb',
            'Sponge$Drip.describe',
            'Sponge$Drip.unrelated',
            'Sponge$Drip.locked',
            'Sponge$Drip.overload(I)I',
            'Sponge$Drip.overload(J)I'
        ]);
    });

    it('leaves a comment whole when one of its citations does not resolve, and one already tagged', () => {
        const source = [
            "/** Java's `Sponge.absorb` and Java's `Sponge.soak`. */",
            'const a = 1;',
            "/** Java's `Sponge.absorb`.\n * @javaSee Sponge.describe */",
            'const b = 2;'
        ].join('\n');
        const { text, added, untagged } = tagCitations(source, index);

        expect(text).toBe(source);
        expect(added).toEqual([]);
        expect(untagged).toEqual([
            { line: 1, citation: "Java's `Sponge.soak`", reason: 'Sponge and its supertypes declare no soak' }
        ]);
    });
});
