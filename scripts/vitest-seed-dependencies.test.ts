import { describe, expect, it } from 'vitest';

import type { GraphHost, GraphNode } from './vitest-seed-dependencies.ts';
import { buildGraph, readImports, seedRecords } from './vitest-seed-dependencies.ts';

describe('readImports', () => {
    it('follows value imports, side-effect imports, re-exports and literal dynamic imports', () => {
        const code = [
            "import { a } from './a';",
            "import './side-effect';",
            "export { b } from './b';",
            "export * from './c';",
            "const d = await import('./d');"
        ].join('\n');

        expect(readImports('test.ts', code)).toEqual({
            specifiers: ['./a', './side-effect', './b', './c', './d'],
            opaque: false
        });
    });

    it('skips imports and re-exports that TypeScript erases', () => {
        const code = [
            "import type { A } from './a';",
            "import { type B } from './b';",
            "export type { C } from './c';",
            "import { type D, e } from './d';"
        ].join('\n');

        expect(readImports('test.ts', code).specifiers).toEqual(['./d']);
    });

    it.each([
        ['a dynamic import of a computed name', "const m = await import('./' + name);"],
        ['a glob import', "const all = import.meta.glob('./*.ts');"],
        ['vi.importActual', "const real = await vi.importActual('./real');"],
        ['a syntax error', 'import {']
    ])('marks %s as a load the walk cannot follow', (_name, code) => {
        expect(readImports('test.ts', code).opaque).toBe(true);
    });

    it('reads no imports from a file that is not a script', () => {
        expect(readImports('data.json', '{"import": "./a"}')).toEqual({ specifiers: [], opaque: false });
    });
});

describe('buildGraph', () => {
    const host = (files: Record<string, string>): GraphHost & { reads: string[] } => {
        const reads: string[] = [];
        return {
            reads,
            read: async (file) => {
                reads.push(file);
                return files[file];
            },
            resolve: async (specifier) => (specifier.startsWith('/') ? `${specifier}.ts` : undefined)
        };
    };

    it('reaches every local module once, through cycles, and leaves packages out', async () => {
        const files = {
            '/test.ts': "import '/a'; import 'vitest';",
            '/a.ts': "import '/b';",
            '/b.ts': "import '/a';"
        };
        const reader = host(files);

        const graph = await buildGraph(['/test.ts'], reader);

        expect([...graph.keys()].sort()).toEqual(['/a.ts', '/b.ts', '/test.ts']);
        expect(graph.get('/test.ts')?.imports).toEqual(['/a.ts']);
        expect(reader.reads.sort()).toEqual(['/a.ts', '/b.ts', '/test.ts']);
    });

    it('marks a module it cannot read', async () => {
        const graph = await buildGraph(['/test.ts'], host({ '/test.ts': "import '/missing';" }));

        expect(graph.get('/missing.ts')?.opaque).toBe(true);
    });
});

describe('seedRecords', () => {
    const root = '/repo';
    const graph = new Map<string, GraphNode>([
        ['/repo/a.test.ts', { imports: ['/repo/a.ts'], opaque: false }],
        ['/repo/b.test.ts', { imports: ['/repo/b.ts'], opaque: false }],
        ['/repo/c.test.ts', { imports: ['/repo/c.ts'], opaque: false }],
        ['/repo/a.ts', { imports: ['/repo/shared.ts'], opaque: false }],
        ['/repo/b.ts', { imports: [], opaque: false }],
        ['/repo/c.ts', { imports: [], opaque: true }],
        ['/repo/shared.ts', { imports: [], opaque: false }],
        ['/repo/setup.ts', { imports: [], opaque: false }]
    ]);
    const input = {
        root,
        testFiles: ['/repo/a.test.ts', '/repo/b.test.ts', '/repo/c.test.ts'],
        setupFiles: ['/repo/setup.ts'],
        configFiles: ['/repo/vitest.config.ts'],
        graph,
        changed: new Set<string>(),
        at: 1000
    };
    const depsOf = (result: ReturnType<typeof seedRecords>, file: string): string[] =>
        (result.records.files[file]?.deps ?? []).map((index) => result.records.modules[index] ?? '').sort();

    it('records each test file with every module it reaches, its setup files included', () => {
        const result = seedRecords(input);

        expect(depsOf(result, 'a.test.ts')).toEqual(['a.test.ts', 'a.ts', 'setup.ts', 'shared.ts']);
        expect(result.records.files['a.test.ts']?.at).toBe(1000);
        expect(result.records.config).toEqual({ at: 1000, deps: [result.records.modules.indexOf('vitest.config.ts')] });
    });

    it('leaves out a test file that reaches a module the walk could not follow', () => {
        const result = seedRecords(input);

        expect(result.records.files['c.test.ts']).toBeUndefined();
        expect(result.unrecorded).toEqual(['/repo/c.test.ts']);
    });

    it('leaves out the test files that reach a changed file, and only those', () => {
        const result = seedRecords({ ...input, changed: new Set(['/repo/shared.ts']) });

        expect(Object.keys(result.records.files)).toEqual(['b.test.ts']);
        expect(result.unrecorded).toEqual(['/repo/a.test.ts', '/repo/c.test.ts']);
    });

    it('dates the config record before every file when a config file changed', () => {
        const result = seedRecords({ ...input, changed: new Set(['/repo/vitest.config.ts']) });

        expect(result.records.config.at).toBe(0);
    });
});
