import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findJavaWorldgenSources } from './generators/datadriven/javaWorldgenData';
import { VANILLA_DIMENSION_TYPES, VANILLA_DIMENSION_TYPE_JSON } from './vanillaDimensionTypes';

const sources = findJavaWorldgenSources();

describe.skipIf(!sources)('the embedded vanilla dimension types', { tags: ['real-data'] }, () => {
    if (!sources) return;

    it.each(Object.entries(VANILLA_DIMENSION_TYPE_JSON))(
        'matches the cached 26.3 datapack for %s',
        (javaId, embedded) => {
            const [, name] = javaId.split(':');
            const path = join(sources.datapack, 'data', 'minecraft', 'dimension_type', `${name}.json`);
            // Extracted game data is parsed as JSON and nothing more.
            const cached: unknown = JSON.parse(readFileSync(path, 'utf8'));
            expect(embedded).toEqual(cached);
        }
    );
});

describe('VANILLA_DIMENSION_TYPES', () => {
    it('parses the three documents with the heights Java gives them', () => {
        expect(VANILLA_DIMENSION_TYPES['minecraft:overworld']).toMatchObject({ minY: -64, height: 384 });
        expect(VANILLA_DIMENSION_TYPES['minecraft:the_nether']).toMatchObject({
            minY: 0,
            height: 256,
            logicalHeight: 128
        });
        expect(VANILLA_DIMENSION_TYPES['minecraft:the_end']).toMatchObject({ minY: 0, height: 256 });
    });
});
