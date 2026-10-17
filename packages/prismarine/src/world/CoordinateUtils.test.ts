import { describe, expect, it } from 'vitest';
import CoordinateUtils from './CoordinateUtils';

describe('world', () => {
    describe('CoordinateUtils', () => {
        describe('fromBlockToChunk', () => {
            it('should convert block coordinate to chunk coordinate', () => {
                expect(CoordinateUtils.fromBlockToChunk(16)).toBe(1);
                expect(CoordinateUtils.fromBlockToChunk(32)).toBe(2);
                expect(CoordinateUtils.fromBlockToChunk(0)).toBe(0);
                expect(CoordinateUtils.fromBlockToChunk(15)).toBe(0);
            });

            it('should floor negative whole coordinates', () => {
                expect(CoordinateUtils.fromBlockToChunk(-1)).toBe(-1);
                expect(CoordinateUtils.fromBlockToChunk(-16)).toBe(-1);
                expect(CoordinateUtils.fromBlockToChunk(-17)).toBe(-2);
            });

            it('should floor fractional coordinates rather than truncating them', () => {
                // Entity positions are floats, and a bare `>> 4` converts through `ToInt32`,
                // which truncates towards zero - so a player standing just west of the origin
                // was placed in chunk 0 instead of chunk -1.
                expect(CoordinateUtils.fromBlockToChunk(-0.5)).toBe(-1);
                expect(CoordinateUtils.fromBlockToChunk(-16.5)).toBe(-2);
                expect(CoordinateUtils.fromBlockToChunk(0.5)).toBe(0);
                expect(CoordinateUtils.fromBlockToChunk(15.9)).toBe(0);
                expect(CoordinateUtils.fromBlockToChunk(16.1)).toBe(1);
            });
        });

        describe('getChunkMin', () => {
            it('should return the minimum block coordinate of a chunk', () => {
                expect(CoordinateUtils.getChunkMin(1)).toBe(16);
                expect(CoordinateUtils.getChunkMin(2)).toBe(32);
                expect(CoordinateUtils.getChunkMin(0)).toBe(0);
            });
        });

        describe('getChunkMax', () => {
            it('should return the maximum block coordinate of a chunk', () => {
                expect(CoordinateUtils.getChunkMax(1)).toBe(31);
                expect(CoordinateUtils.getChunkMax(2)).toBe(47);
                expect(CoordinateUtils.getChunkMax(0)).toBe(15);
            });
        });
    });
});
