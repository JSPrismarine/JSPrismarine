import { describe, expect, it } from 'vitest';
import CoordinateUtils from './CoordinateUtils';

describe('world', () => {
    describe('CoordinateUtils', () => {
        describe('fromBlockToChunk', () => {
            it('should convert block coordinate to chunk coordinate', () => {
                expect(CoordinateUtils.fromBlockToChunk(16)).toBe(1);
                expect(CoordinateUtils.fromBlockToChunk(32)).toBe(2);
                expect(CoordinateUtils.fromBlockToChunk(0)).toBe(0);
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
