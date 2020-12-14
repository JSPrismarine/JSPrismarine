import Chunk from './Chunk';

describe('world', () => {
    describe('chunk', () => {
        describe('Chunk', () => {
            it('setBlockId() should be able to set 0,0,0 to "Stone"', () => {
                const chunk = new Chunk(0, 0);
                chunk.setBlockId(0, 0, 0, 1);

                expect(chunk.hasChanged()).toBeTruthy();
                expect(chunk.getBlockId(0, 0, 0)).toEqual(1);
            });

            it('setBlockId() should throw when y is less than 0', () => {
                const chunk = new Chunk(0, 0);
                expect(() => chunk.setBlockId(0, -1, 0, 1)).toThrow(
                    `y can't be less than 0`
                );
            });

            it('setBlock() should throw when y is less than 0', () => {
                const chunk = new Chunk(0, 0);
                expect(() => chunk.setBlock(0, -1, 0, null)).toThrowError(
                    `y can't be less than 0`
                );
            });

            it('setBlock() should throw when block is null or undefined', () => {
                const chunk = new Chunk(0, 0);
                expect(() => chunk.setBlock(0, 0, 0, null)).toThrowError(
                    `block can't be undefined or null`
                );
                expect(() => chunk.setBlock(0, 0, 0, undefined)).toThrowError(
                    `block can't be undefined or null`
                );
            });
        });
    });
});
