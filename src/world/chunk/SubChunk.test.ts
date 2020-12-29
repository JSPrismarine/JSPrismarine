import SubChunk from './SubChunk';

describe('world', () => {
    describe('chunk', () => {
        describe('SubChunk', () => {
            it('setBlockId() should be able to set 0,0,0 to "Stone"', () => {
                const chunk = new SubChunk();
                chunk.setBlockId(0, 0, 0, 1);

                expect(chunk.getBlockId(0, 0, 0)).toEqual(1);
            });

            it('setBlockId() should throw when y is less than 0', () => {
                const chunk = new SubChunk();
                expect(chunk.setBlockId(0, -1, 0, 1)).toBeFalsy();
            });

            it('setBlock() should throw when y is less than 0', () => {
                const chunk = new SubChunk();
                expect(chunk.setBlockId(0, -1, 0, 1)).toBeFalsy();
            });

            it('setBlock() should throw when block is null or undefined', () => {
                const chunk = new SubChunk();
                expect(chunk.setBlock(0, 0, 0, null as any)).toBeFalsy();
                expect(chunk.setBlock(0, 0, 0, undefined as any)).toBeFalsy();
            });
        });
    });
});
