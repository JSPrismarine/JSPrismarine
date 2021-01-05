import Chunk from './Chunk';

describe('world', () => {
    describe('chunk', () => {
        describe('Chunk', () => {
            it('getIdIndex() should return correct value', () => {
                expect(Chunk.getIdIndex(0, 0, 0)).toBe(0);
                expect(Chunk.getIdIndex(0, 1, 0)).toBe(1);
                expect(Chunk.getIdIndex(0, 0, 1)).toBe(256);
                expect(Chunk.getIdIndex(0, 1, 1)).toBe(257);
                expect(Chunk.getIdIndex(1, 0, 0)).toBe(4096);
                expect(Chunk.getIdIndex(1, 1, 1)).toBe(4353);
                expect(Chunk.getIdIndex(15, 15, 15)).toBe(65295);
            });

            it('setBlockId() should be able to set 0,0,0 to "Stone"', () => {
                const chunk = new Chunk(0, 0);
                chunk.setBlockId(0, 0, 0, 1);

                expect(chunk.hasChanged()).toBeTruthy();
                expect(chunk.getBlockId(0, 0, 0)).toBe(1);
            });

            it('getX() & getZ() should return correct values', () => {
                let chunk = new Chunk(0, 0);
                expect(chunk.getX()).toBe(0);
                expect(chunk.getZ()).toBe(0);

                chunk = new Chunk(15, 32);
                expect(chunk.getX()).toBe(15);
                expect(chunk.getZ()).toBe(32);

                chunk = new Chunk(-32, -15);
                expect(chunk.getX()).toBe(-32);
                expect(chunk.getZ()).toBe(-15);
            });

            it('Chunk should throw with invalid heightMap', () => {
                expect(
                    () => new Chunk(0, 0, new Map(), [], [], [], [1])
                ).toThrow(`Wrong HeightMap value count, expected 256, got 1`);
            });

            it('Chunk should throw with invalid heightMap', () => {
                expect(
                    () => new Chunk(0, 0, new Map(), [], [], [1], [])
                ).toThrow(`Wrong Biomes value count, expected 256, got 1`);
            });

            it('setBlockId() should throw when y is less than 0', () => {
                const chunk = new Chunk(0, 0);
                expect(() => {
                    chunk.setBlockId(0, -1, 0, 1);
                }).toThrow(`y can't be less than 0`);
            });

            it('setBlock() should throw when y is less than 0', () => {
                const chunk = new Chunk(0, 0);
                expect(() => {
                    chunk.setBlock(0, -1, 0, null);
                }).toThrowError(`y can't be less than 0`);
            });

            it('setBlock() should throw when block is null or undefined', () => {
                const chunk = new Chunk(0, 0);
                expect(() => {
                    chunk.setBlock(0, 0, 0, null as any);
                }).toThrowError(`block can't be undefined or null`);
                expect(() => {
                    chunk.setBlock(0, 0, 0, undefined as any);
                }).toThrowError(`block can't be undefined or null`);
            });
        });
    });
});
