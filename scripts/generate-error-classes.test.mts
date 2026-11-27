import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateCatalogModule, generatedOutputs } from './generate-error-classes.mts';

const catalog = (body: string, imports = "import { defineErrors } from './defineErrors';") => `${imports}\n\n${body}\n`;

describe('generateCatalogModule', () => {
    it('writes a class per entry and a frozen catalog of them', () => {
        const module = generateCatalogModule(
            'leveldb.ts',
            catalog(`/** The errors. */
export const LeveldbErrors = defineErrors('leveldb', {
    /** Nothing to fill in. */
    Plain: 'Nothing to fill in',
    Filled: { message: 'Corruption in {file}: {reason}', base: RangeError }
});`)
        );
        expect(module).toContain('/** Nothing to fill in. */\nclass Plain extends JSPrismarineError {');
        expect(module).toContain('public static get code(): "LEVELDB_PLAIN" {\nreturn "LEVELDB_PLAIN";\n}');
        expect(module).toContain('public constructor(options?: ErrorOptions) {');
        expect(module).toContain('class Filled extends JSPrismarineRangeError {');
        expect(module).toContain(
            'public constructor(params: { readonly file: unknown; readonly reason: unknown }, options?: ErrorOptions) {'
        );
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is generated code that holds a template literal.
        expect(module).toContain('super(`Corruption in ${String(params?.file)}: ${String(params?.reason)}`, options);');
        expect(module).toContain('/** The errors. */\nexport const LeveldbErrors = Object.freeze({ Plain, Filled });');
        expect(module).toContain(
            'import { JSPrismarineError, JSPrismarineRangeError } from "@jsprismarine/errors/JSPrismarineError";'
        );
        expect(module).not.toContain('defineErrors');
        expect(module).not.toContain('static get module');
    });

    it('gives a module of a split domain its module and its page', () => {
        const module = generateCatalogModule(
            'prismarine/world.ts',
            catalog("export const PrismarineWorldErrors = defineErrors('prismarine/world', { Plain: 'x' });")
        );
        expect(module).toContain('public static get code(): "PRISMARINE_PLAIN" {\nreturn "PRISMARINE_PLAIN";\n}');
        expect(module).toContain('public static get module(): "world" {\nreturn "world";\n}');
        expect(module).toContain('"https://jsprismarine.dev/errors/prismarine/world#prismarine-plain"');
    });

    it('copies categories and other code, and keeps only the imports they use', () => {
        const module = generateCatalogModule(
            'blocks.ts',
            catalog(
                `/** A category. */
export abstract class BlockError extends ContentError {
    public override name = 'BlockError';
}

export const BlocksErrors = defineErrors('blocks', { Broken: { message: 'Broken', base: BlockError } });

/** A helper. */
export const helper = () => new BlocksErrors.Broken();`,
                `import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { ContentError, FlattenError } from '@jsprismarine/errors/content';
import { defineErrors } from './defineErrors';`
            )
        );
        expect(module).toContain(
            "/** A category. */\nexport abstract class BlockError extends ContentError {\n    public override name = 'BlockError';\n}"
        );
        expect(module).toContain('class Broken extends BlockError {');
        expect(module).toContain('/** A helper. */\nexport const helper = () => new BlocksErrors.Broken();');
        expect(module).toContain('import { ContentError } from "@jsprismarine/errors/content";');
        expect(module).not.toContain('JSPrismarineError }');
        expect(module).not.toContain('FlattenError');
    });

    it('escapes what a template literal would read as code', () => {
        const module = generateCatalogModule(
            'test.ts',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: the catalog's template holds a literal `${`.
            catalog("export const TestErrors = defineErrors('test', { Odd: '${x} `b` \\\\ ${ c' });")
        );
        const expression = /super\((`.*`), options\);/.exec(module)?.[1];
        expect(expression).toBeDefined();
        const build = new Function('params', `return ${expression};`);
        expect(build({ x: 1 })).toBe('$1 `b` \\ ${ c');
    });

    it('rejects a catalog named for another file', () => {
        expect(() =>
            generateCatalogModule('test.ts', catalog("export const TestErrors = defineErrors('other', { A: 'a' });"))
        ).toThrow(/must name the catalog after its file/);
    });

    it('rejects a key that would shadow a global the class uses', () => {
        expect(() =>
            generateCatalogModule(
                'test.ts',
                catalog("export const TestErrors = defineErrors('test', { String: 'a' });")
            )
        ).toThrow(/would shadow String/);
    });

    it('rejects a key that is also a declaration of the catalog', () => {
        expect(() =>
            generateCatalogModule(
                'test.ts',
                catalog(`export abstract class A extends JSPrismarineError {}
export const TestErrors = defineErrors('test', { A: { message: 'a', base: A } });`)
            )
        ).toThrow(/also the name of a declaration/);
    });

    it('rejects a message that is not a string literal', () => {
        expect(() =>
            generateCatalogModule(
                'test.ts',
                catalog("const m = 'a';\nexport const TestErrors = defineErrors('test', { A: { message: m } });")
            )
        ).toThrow(/A\.message must be a string message/);
    });

    it('needs exactly one catalog per file', () => {
        expect(() => generateCatalogModule('test.ts', catalog('export const x = 1;'))).toThrow(/declares 0 catalogs/);
    });
    it('keeps a CRLF in a message the constructor fills', () => {
        const module = generateCatalogModule(
            'test.ts',
            catalog("export const TestErrors = defineErrors('test', { Lines: 'header\\r\\n{file}' });")
        );
        const expression = /super\((`.*`), options\);/s.exec(module)?.[1];
        expect(expression).toBeDefined();
        expect(expression).not.toContain('\r');
        const build = new Function('params', `return ${expression};`);
        expect(build({ file: 'a' })).toBe('header\r\na');
    });

    it('builds the message and the params when a JavaScript caller passes no params', () => {
        const module = generateCatalogModule(
            'test.ts',
            catalog("export const TestErrors = defineErrors('test', { Filled: 'Bad {kind}' });")
        );
        const expression = /super\((`.*`), options\);/.exec(module)?.[1];
        const build = new Function('params', `return ${expression};`);
        expect(build(undefined)).toBe('Bad undefined');
        expect(build(null)).toBe('Bad undefined');
        expect(module).toContain('this.#params = params ?? { kind: undefined };');
    });

    it('rejects a placeholder name the class cannot fill', () => {
        expect(() =>
            generateCatalogModule(
                'test.ts',
                catalog("export const TestErrors = defineErrors('test', { A: 'Missing {file-name}' });")
            )
        ).toThrow(/A has \{file-name\} in its message/);
    });

    it('matches imports by the name the catalog uses, keeping a type-only modifier', () => {
        const module = generateCatalogModule(
            'test.ts',
            catalog(
                `export const TestErrors = defineErrors('test', { A: 'a' });

export const helper = (error: CatalogedError) => error.code;`,
                `import { type CatalogedError, type Unused } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';`
            )
        );
        expect(module).toContain(
            'import { type CatalogedError, JSPrismarineError } from "@jsprismarine/errors/JSPrismarineError";'
        );
        expect(module).not.toContain('Unused');
    });

    it('keeps a category imported under the name of a built-in error', () => {
        const module = generateCatalogModule(
            'test.ts',
            catalog(
                "export const TestErrors = defineErrors('test', { A: { message: 'a', base: RangeError }, B: 'b' });",
                `import { ContentError as RangeError } from '@jsprismarine/errors/content';
import { defineErrors } from './defineErrors';`
            )
        );
        expect(module).toContain('class A extends RangeError {');
        expect(module).toContain('class B extends JSPrismarineError {');
        expect(module).toContain('import { ContentError as RangeError } from "@jsprismarine/errors/content";');
        expect(module).not.toContain('JSPrismarineRangeError');
    });

    it('rejects a key that is also a value or a type the catalog declares', () => {
        for (const declaration of ['const limit = 1;', 'function limit() {}', 'type limit = number;']) {
            expect(() =>
                generateCatalogModule(
                    'test.ts',
                    catalog(`${declaration}\nexport const TestErrors = defineErrors('test', { limit: 'a' });`)
                )
            ).toThrow(/key limit is also the name of a declaration/);
        }
        expect(() =>
            generateCatalogModule(
                'test.ts',
                catalog(`export const TestErrors = defineErrors('test', { later: 'a' });\nexport const later = 1;`)
            )
        ).toThrow(/key later is also the name of a declaration/);
    });
});

describe('generatedOutputs', () => {
    it('lists only the modules with the generated header, so a hand-written file is never deleted', () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'error-classes-'));
        try {
            mkdirSync(path.join(directory, 'prismarine'));
            writeFileSync(
                path.join(directory, 'prismarine', 'gone.ts'),
                '// Generated by scripts/generate-error-classes.mts from packages/errors/catalog/prismarine/gone.ts.\n'
            );
            writeFileSync(path.join(directory, 'helper.ts'), 'export const helper = 1;\n');
            writeFileSync(path.join(directory, 'helper.test.ts'), "import './helper';\n");
            expect(generatedOutputs(directory)).toEqual([path.join('prismarine', 'gone.ts')]);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
