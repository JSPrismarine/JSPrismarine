import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MOLANG_EXAMPLES } from './examples';
import { Molang } from './Molang';

const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

/** The sources of every ```molang fence in a document, in order. */
const fences = (text: string): string[] =>
    [...text.matchAll(/```molang\n([\s\S]*?)\n```/g)].map((match) => match[1]!.trim());

describe('the Molang examples', () => {
    it.each(MOLANG_EXAMPLES.map((example) => [example.title, example] as const))(
        '%s compiles cleanly and evaluates to what it documents',
        (_title, example) => {
            const molang = new Molang();
            const compiled = molang.compile(
                example.source,
                example.minEngineVersion === undefined ? undefined : { minEngineVersion: [...example.minEngineVersion] }
            );

            expect(compiled.diagnostics).toEqual([]);
            for (const { label, scope, expected } of example.cases) {
                expect(compiled.evaluate(scope), label).toBe(expected);
            }
        }
    );

    it('has distinct titles and sources', () => {
        expect(new Set(MOLANG_EXAMPLES.map((example) => example.title)).size).toBe(MOLANG_EXAMPLES.length);
        expect(new Set(MOLANG_EXAMPLES.map((example) => example.source)).size).toBe(MOLANG_EXAMPLES.length);
    });

    it('is the set the README shows, source for source and in order', () => {
        // The README renders these through the docs site's Molang grammar, so a fence that is not
        // an example here could be nonsense, and an example missing from it is undiscoverable.
        expect(fences(readme)).toEqual(MOLANG_EXAMPLES.map((example) => example.source));
    });
});
