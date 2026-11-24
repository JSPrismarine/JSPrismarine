import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseJavaClass } from './classFile.mts';
import { JavaSourceError } from './fingerprint.mts';
import { formatJavaSourceGolden, goldenProblems, resolveJavaSource, scanJavaSources } from './sources.mts';
import type { JavaClassIndex } from './sources.mts';

const sponge = parseJavaClass(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'v1', 'Sponge.class')));

const index: JavaClassIndex = {
    names: ['net/example/Sponge', 'net/example/Water', 'net/other/Water'],
    load: (name) => (name === 'net/example/Sponge' ? sponge : undefined)
};

describe('scanJavaSources', () => {
    it('reads each tag and its verification kind, and counts citations in untagged comments', () => {
        const scan = scanJavaSources(
            'a.ts',
            [
                '/**',
                " * Java's `Sponge.absorb`, copied.",
                ' * @javaSource Sponge.absorb',
                ' * @javaVerified vectors',
                ' */',
                'const a = 1;',
                "/** Java's `Sponge.describe` and Java's `Sponge.unrelated`. */",
                'const b = 2;',
                "// Java's `Sponge.overload` in a line comment does not count.",
                '/** @javaSource Sponge.overload(I)I */'
            ].join('\n')
        );

        expect(scan.tags).toEqual([
            { file: 'a.ts', line: 3, spelling: 'Sponge.absorb', verified: 'vectors' },
            { file: 'a.ts', line: 10, spelling: 'Sponge.overload(I)I', verified: undefined }
        ]);
        expect(scan.untaggedCitations).toBe(2);
        expect(scan.problems).toEqual([]);
    });

    it('reports a malformed tag and an unknown verification kind', () => {
        const scan = scanJavaSources('a.ts', '/**\n * @javaSource absorb\n * @javaVerified guessed\n */');

        expect(scan.problems.map((problem) => problem.line)).toEqual([2, 3]);
    });
});

describe('goldenProblems', () => {
    it('reports a tag with no fingerprint, a name no tag uses and a fingerprint no name points at', () => {
        const problems = goldenProblems([{ file: 'a.ts', line: 1, spelling: 'Sponge.absorb', verified: undefined }], {
            names: { 'Sponge.describe': 'net/example/Sponge.describe(I)Ljava/lang/String;' },
            sources: {
                'net/example/Sponge.describe(I)Ljava/lang/String;': { '26.3': 'sha256:0' },
                'net/example/Sponge.gone()V': { '26.3': 'sha256:1' }
            }
        });

        expect(problems).toHaveLength(3);
        expect(problems.join('\n')).toMatch(/Sponge\.absorb has no fingerprint/);
        expect(problems.join('\n')).toMatch(/names Sponge\.describe, which no tag uses/);
        expect(problems.join('\n')).toMatch(/fingerprints net\/example\/Sponge\.gone\(\)V/);
    });

    it('writes the golden with sorted keys', () => {
        const text = formatJavaSourceGolden({
            names: { b: 'k', a: 'k' },
            sources: { k: { '26.4': 'y', '26.3': 'x' } }
        });

        expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
        expect(text.indexOf('"26.3"')).toBeLessThan(text.indexOf('"26.4"'));
    });
});

describe('resolveJavaSource', () => {
    it('resolves a simple class name, a method and a field', () => {
        expect(resolveJavaSource('Sponge.absorb', index)).toEqual({
            owner: 'net/example/Sponge',
            name: 'absorb',
            descriptor: '([I)I'
        });
        expect(resolveJavaSource('net/example/Sponge.MAX_DEPTH', index)).toEqual({
            owner: 'net/example/Sponge',
            name: 'MAX_DEPTH'
        });
    });

    it('needs a descriptor for an overloaded method, and a binary name for an ambiguous class', () => {
        expect(() => resolveJavaSource('Sponge.overload', index)).toThrow(/overloaded/);
        expect(resolveJavaSource('Sponge.overload(J)I', index).descriptor).toBe('(J)I');
        expect(() => resolveJavaSource('Water.flow', index)).toThrow(/ambiguous/);
        expect(() => resolveJavaSource('Sponge.missing', index)).toThrow(JavaSourceError);
    });
});
