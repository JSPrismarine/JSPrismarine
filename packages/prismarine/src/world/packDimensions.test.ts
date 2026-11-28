import { describe, expect, it } from 'vitest';

import { CLOUD_HEIGHT_ATTRIBUTE } from './DimensionType';
import { packDimensionOf } from './packDimensions';

/** A `dimensions/*.json` document with the given components, as a 1.26.50 pack writes it. */
const documentOf = (identifier: string, components: Record<string, unknown>) => ({
    format_version: '1.26.50',
    'minecraft:dimension': { description: { identifier }, components }
});

/** The one generator a pack dimension may have. */
const VOID = { 'minecraft:generation': { generator_type: 'void' } };

describe('packDimensionOf', () => {
    it('reads the bounds, the cloud height and the default biome of a void dimension', () => {
        const dimension = packDimensionOf(
            'the_sift:dimension',
            documentOf('the_sift:dimension', {
                'minecraft:generation': { generator_type: 'void' },
                'minecraft:dimension_height': { min_y: -32, height_range: 256 },
                'minecraft:default_biome': { biome: 'the_sift:singer_meadow' },
                'minecraft:clouds': { height: 100 }
            })
        );

        if (!('definition' in dimension)) throw new Error(dimension.problem);
        expect(dimension.typeId).toBe('the_sift:dimension');
        expect(dimension.definition).toMatchObject({ minY: -32, height: 256, logicalHeight: 256 });
        expect(dimension.definition.attributes.get(CLOUD_HEIGHT_ATTRIBUTE)).toBe(100);
        expect(dimension.biome).toBe('the_sift:singer_meadow');
    });

    it('takes the schema’s defaults for the components a document leaves out', () => {
        const dimension = packDimensionOf(
            'jsp:empty',
            documentOf('jsp:empty', { 'minecraft:generation': { generator_type: 'void' } })
        );

        if (!('definition' in dimension)) throw new Error(dimension.problem);
        expect(dimension.definition).toMatchObject({ minY: -64, height: 384 });
        // BDS sends `Render Clouds` false for a document without `minecraft:clouds`.
        expect(dimension.definition.attributes.has(CLOUD_HEIGHT_ATTRIBUTE)).toBe(false);
        expect(dimension.biome).toBe('minecraft:ocean');
    });

    it('refuses a vanilla id, a missing or non-void generator and bounds the client cannot take', () => {
        const problems = [
            packDimensionOf('jsp:bare', documentOf('jsp:bare', {})),
            packDimensionOf('minecraft:overworld', documentOf('minecraft:overworld', {})),
            packDimensionOf(
                'jsp:noise',
                documentOf('jsp:noise', { 'minecraft:generation': { generator_type: 'noise' } })
            ),
            packDimensionOf('jsp:odd', documentOf('jsp:odd', { 'minecraft:dimension_height': { min_y: -60 } })),
            packDimensionOf(
                'jsp:tall',
                documentOf('jsp:tall', { 'minecraft:dimension_height': { height_range: 2048 } })
            )
        ];

        expect(problems.map((dimension) => 'problem' in dimension)).toEqual([true, true, true, true, true]);
    });
});
