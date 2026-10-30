import { Generator } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { bedrockDimensionOverlay, javaDimensionTypeOf } from './dimensionMapping';
import { dimensionsTable } from './tables';

describe('bedrockDimensionOverlay', () => {
    it('carries the three vanilla rows of the height agreement table', () => {
        expect(bedrockDimensionOverlay('minecraft:overworld')).toEqual({
            dimensionId: 0,
            bedrockName: 'minecraft:overworld',
            generatorType: Generator.OVERWORLD
        });
        expect(bedrockDimensionOverlay('minecraft:the_nether')).toEqual({
            dimensionId: 1,
            bedrockName: 'minecraft:nether',
            minY: 0,
            height: 128,
            generatorType: Generator.NETHER
        });
        expect(bedrockDimensionOverlay('minecraft:the_end')).toEqual({
            dimensionId: 2,
            bedrockName: 'minecraft:the_end',
            generatorType: Generator.END
        });
    });

    it('clamps the Nether to the height the client renders', () => {
        expect(bedrockDimensionOverlay('minecraft:the_nether')?.height).toBe(128);
    });

    it('leaves the Overworld and End heights to the Java type', () => {
        expect(bedrockDimensionOverlay('minecraft:overworld')).not.toHaveProperty('height');
        expect(bedrockDimensionOverlay('minecraft:the_end')).not.toHaveProperty('height');
    });

    it('answers undefined for a type the client has no built-in dimension for', () => {
        expect(bedrockDimensionOverlay('minecraft:overworld_caves')).toBeUndefined();
        expect(bedrockDimensionOverlay('mypack:sky')).toBeUndefined();
        expect(bedrockDimensionOverlay('minecraft:nether')).toBeUndefined();
    });
});

describe('javaDimensionTypeOf', () => {
    it('round-trips every row through its Bedrock name', () => {
        for (const [javaId, row] of Object.entries(dimensionsTable.dimensions)) {
            expect(javaDimensionTypeOf(row.bedrockName)).toBe(javaId);
        }
    });

    it('answers the Java spelling for the one name the editions disagree on', () => {
        expect(javaDimensionTypeOf('minecraft:nether')).toBe('minecraft:the_nether');
    });

    it('matches Bedrock spellings only', () => {
        expect(javaDimensionTypeOf('minecraft:the_nether')).toBeUndefined();
        expect(javaDimensionTypeOf('mypack:sky')).toBeUndefined();
    });
});

describe('dimensions.json', () => {
    const rows = Object.entries(dimensionsTable.dimensions);
    const generatorValues = new Set(Object.values(Generator).filter((value) => typeof value === 'number'));

    it('holds exactly the three vanilla dimensions the client has ids for', () => {
        expect(rows.map(([javaId]) => javaId).sort()).toEqual([
            'minecraft:overworld',
            'minecraft:the_end',
            'minecraft:the_nether'
        ]);
        expect(rows.map(([, row]) => row.dimensionId).sort()).toEqual([0, 1, 2]);
    });

    it('fits the shape the table cast asserts', () => {
        for (const [javaId, row] of rows) {
            expect(javaId).toMatch(/^minecraft:[a-z_]+$/);
            expect(Number.isInteger(row.dimensionId), javaId).toBe(true);
            expect(row.bedrockName, javaId).toMatch(/^minecraft:[a-z_]+$/);
            expect(generatorValues.has(row.generatorType), javaId).toBe(true);
            if (row.minY !== undefined) expect(Number.isInteger(row.minY), javaId).toBe(true);
            if (row.height !== undefined) {
                expect(Number.isInteger(row.height), javaId).toBe(true);
                expect(row.height % 16, javaId).toBe(0);
            }
            expect(Object.keys(row).sort()).toEqual(
                ['bedrockName', 'dimensionId', 'generatorType', 'height', 'minY'].filter((key) => key in row).sort()
            );
        }
    });

    it('names each Bedrock dimension once', () => {
        const names = rows.map(([, row]) => row.bedrockName);
        expect(new Set(names).size).toBe(names.length);
    });
});
