import { describe, expect, it } from 'vitest';

import { isIntegrationFile } from './vitest-integration-files.ts';

/**
 * Vitest reads `@module-tag` lines anywhere in a test file, so this file spells the marker in two
 * pieces: written whole, the samples below would tag this file with every tag they name.
 */
const marker = ['@module', 'tag'].join('-');

describe('isIntegrationFile', () => {
    it('finds the tag as a line comment or a docblock line', () => {
        expect(isIntegrationFile(`// ${marker} integration\n\nimport x from "y";`)).toBe(true);
        expect(isIntegrationFile(`/**\n * ${marker} integration\n */`)).toBe(true);
    });

    it('ignores other tags and tags that only start with the name', () => {
        expect(isIntegrationFile(`// ${marker} real-data`)).toBe(false);
        expect(isIntegrationFile(`// ${marker} integration-ish`)).toBe(false);
        expect(isIntegrationFile("const tag = 'integration';")).toBe(false);
    });
});
