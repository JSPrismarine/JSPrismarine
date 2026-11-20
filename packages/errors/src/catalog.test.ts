import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../.test/reportProgress';
import { codeAnchor, constantCase, DOCS_URL, JSPrismarineError } from './JSPrismarineError';

/** What `defineErrors` puts on each class it makes. */
interface DefinedClass {
    readonly code: string;
    readonly domain: string;
    readonly template: string;
    readonly docs: string;
    new (...args: unknown[]): Error;
}

const isDefinedClass = (value: unknown): value is DefinedClass =>
    typeof value === 'function' && 'code' in value && 'domain' in value && 'template' in value;

/** Every catalog module under `src/`, by its path relative to it, such as `./prismarine/world.ts`. */
const modules: Record<string, Record<string, unknown>> = {};
for (const file of readdirSync(import.meta.dirname, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.ts') || file.includes('.test.') || file === 'JSPrismarineError.ts') continue;
    modules[`./${file.split(path.sep).join('/')}`] = await import(path.join(import.meta.dirname, file));
}

/** Every catalog error, with the module it is defined in and its key there. */
const entries = Object.entries(modules).flatMap(([file, exports]) =>
    Object.entries(exports).flatMap(([exported, value]) =>
        typeof value === 'object' && value !== null
            ? Object.entries(value)
                  .filter((entry): entry is [string, DefinedClass] => isDefinedClass(entry[1]))
                  .map(([key, error]) => ({ file, exported, key, error }))
            : []
    )
);

/** A value for every placeholder, named after it so the message shows where each one went. */
const sampleParams = (template: string) =>
    Object.fromEntries([...template.matchAll(/\{(\w+)\}/g)].map(([, name]) => [name, `<${name}>`]));

describe('the error catalog', () => {
    it('defines errors', () => {
        expect(entries.length).toBeGreaterThan(0);
        reportProgress(`${entries.length} errors are defined in ${Object.keys(modules).length} catalog modules.`);
    });

    it('gives every error its own code', () => {
        const codes = entries.map(({ error }) => error.code);
        expect(codes.filter((code, index) => codes.indexOf(code) !== index)).toEqual([]);
    });

    it('keeps each catalog to the domain its module is named for', () => {
        for (const { file, error } of entries) {
            const domain = file.replace(/^\.\//, '').split('/')[0]!.replace(/\.ts$/, '');
            expect(error.domain, file).toBe(domain);
            expect(error.code.startsWith(`${constantCase(domain)}_`), error.code).toBe(true);
        }
    });

    it('names each catalog after its module', () => {
        for (const { file, exported } of entries) {
            const words = file.replace(/^\.\//, '').replace(/\.ts$/, '').split(/[/-]/);
            const expected = `${words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('')}Errors`;
            expect(exported, file).toBe(expected);
        }
    });

    it('links into the site the root manifest says the docs are published at', () => {
        const manifest: unknown = JSON.parse(
            readFileSync(path.join(import.meta.dirname, '../../../package.json'), 'utf8')
        );
        expect(manifest).toMatchObject({ homepage: DOCS_URL });
    });

    it('links every error to its entry in the reference', () => {
        for (const { error } of entries) {
            expect(error.docs).toBe(`${DOCS_URL}errors/${error.domain}#${codeAnchor(error.code)}`);
        }
    });

    it('builds every error from its template, with a code, a link and the catalog root', () => {
        for (const { error } of entries) {
            const params = sampleParams(error.template);
            const built = Object.keys(params).length > 0 ? new error(params) : new error();
            expect(built).toBeInstanceOf(JSPrismarineError);
            expect(built.message).not.toMatch(/\{\w+\}/);
            expect(built).toMatchObject({ code: error.code, docs: error.docs });
        }
    });

    it('uses braces in a template only for placeholders', () => {
        for (const { error } of entries) {
            expect(error.template.replace(/\{\w+\}/g, ''), error.code).not.toMatch(/[{}]/);
        }
    });
});
