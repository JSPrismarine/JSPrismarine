import { describe, expect, it } from 'vitest';

import { FIRST_CUSTOM_DIMENSION_ID, dimensionByName, dimensionTypeOf } from './DimensionType';
import { Dimensions, maxSubChunk, maxY, minSubChunk, subChunkCount } from './Dimension';
import { VANILLA_DIMENSION_TYPES } from './vanillaDimensionTypes';

describe('Dimensions', () => {
    it('keeps the bounds the three vanilla dimensions had before they carried a Java type', () => {
        expect(Dimensions.Overworld).toMatchObject({
            id: 'minecraft:overworld',
            bedrockId: 0,
            bedrockName: 'minecraft:overworld',
            name: 'minecraft:overworld',
            minY: -64,
            height: 384,
            custom: false
        });
        expect(Dimensions.Nether).toMatchObject({
            id: 'minecraft:the_nether',
            bedrockId: 1,
            bedrockName: 'minecraft:nether',
            name: 'minecraft:nether',
            minY: 0,
            height: 128,
            custom: false
        });
        expect(Dimensions.TheEnd).toMatchObject({
            id: 'minecraft:the_end',
            bedrockId: 2,
            bedrockName: 'minecraft:the_end',
            name: 'minecraft:the_end',
            minY: 0,
            height: 256,
            custom: false
        });
    });

    it('derives the sub chunk range from the Bedrock-effective bounds', () => {
        expect([minSubChunk(Dimensions.Overworld), maxSubChunk(Dimensions.Overworld)]).toEqual([-4, 19]);
        expect(subChunkCount(Dimensions.Overworld)).toBe(24);
        expect(maxY(Dimensions.Overworld)).toBe(319);
        expect([minSubChunk(Dimensions.Nether), maxSubChunk(Dimensions.Nether)]).toEqual([0, 7]);
        expect(maxY(Dimensions.Nether)).toBe(127);
        expect([minSubChunk(Dimensions.TheEnd), maxSubChunk(Dimensions.TheEnd)]).toEqual([0, 15]);
    });

    it('carries the Java definition where the overlay clamps the client view', () => {
        expect(Dimensions.Nether.java).toBe(VANILLA_DIMENSION_TYPES['minecraft:the_nether']);
        expect(Dimensions.Nether.java.height).toBe(256);
        expect(Dimensions.Nether.java.logicalHeight).toBe(128);
        expect(Dimensions.Nether.java.coordinateScale).toBe(8);
        expect(Dimensions.Nether.java.hasSkylight).toBe(false);
        expect(Dimensions.Overworld.java.hasSkylight).toBe(true);
        expect(Dimensions.TheEnd.java.hasEnderDragonFight).toBe(true);
    });
});

describe('dimensionTypeOf', () => {
    const sky = { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: -1024, height: 2048 };

    it('marks a type without an overlay as custom and gives it the id it was handed', () => {
        const custom = dimensionTypeOf(sky, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID + 2);
        expect(custom).toMatchObject({
            id: 'mypack:sky',
            bedrockId: 1002,
            bedrockName: 'mypack:sky',
            name: 'mypack:sky',
            custom: true
        });
        expect(custom.java).toBe(sky);
    });

    it('clamps a custom type to the vertical range the client accepts', () => {
        const custom = dimensionTypeOf(sky, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
        expect(custom.minY).toBe(-512);
        expect(custom.height).toBe(1024);
        expect(maxY(custom)).toBe(511);

        const inside = dimensionTypeOf({ ...sky, minY: -64, height: 384 }, 'mypack:low', FIRST_CUSTOM_DIMENSION_ID);
        expect(inside).toMatchObject({ minY: -64, height: 384 });
    });

    it('refuses a custom type without an id in the custom range', () => {
        expect(() => dimensionTypeOf(sky, 'mypack:sky')).toThrow(
            'mypack:sky has no Bedrock dimension overlay and needs a custom id of 1000 or more, got undefined'
        );
        expect(() => dimensionTypeOf(sky, 'mypack:sky', 3)).toThrow(RangeError);
    });

    it('ignores a custom id for a type the overlay lists', () => {
        const nether = dimensionTypeOf(VANILLA_DIMENSION_TYPES['minecraft:the_nether'], 'minecraft:the_nether', 1234);
        expect(nether.bedrockId).toBe(1);
        expect(nether.custom).toBe(false);
    });
});

describe('dimensionByName', () => {
    it('accepts the Java and the Bedrock spelling of the Nether', () => {
        expect(dimensionByName('minecraft:the_nether')).toBe(Dimensions.Nether);
        expect(dimensionByName('minecraft:nether')).toBe(Dimensions.Nether);
        expect(dimensionByName('minecraft:overworld')).toBe(Dimensions.Overworld);
        expect(dimensionByName('minecraft:the_end')).toBe(Dimensions.TheEnd);
    });

    it('reads a bare name as a minecraft one', () => {
        expect(dimensionByName('nether')).toBe(Dimensions.Nether);
        expect(dimensionByName('the_end')).toBe(Dimensions.TheEnd);
    });

    it('answers undefined for a name no vanilla dimension has', () => {
        expect(dimensionByName('mypack:sky')).toBeUndefined();
        expect(dimensionByName('minecraft:end')).toBeUndefined();
    });
});
