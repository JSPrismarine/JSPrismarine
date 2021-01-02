import LoggerBuilder from '../utils/Logger';
import { BlockIdsType } from './BlockIdsType';
import BlockManager from './BlockManager';

describe('block', () => {
    describe('BlockIdsType', () => {
        // Enable this test to figure out which blocks have yet to be added
        it.skip('every block is implemented', async (done) => {
            jest.setTimeout(35000);

            const blockManager = new BlockManager({
                getLogger: () => new LoggerBuilder()
            } as any);
            await blockManager.onEnable();

            for (const blockId in BlockIdsType) {
                if (Number.isNaN(Number(blockId))) {
                    return;
                }

                expect(
                    blockManager.getBlockById(Number(blockId))?.getId()
                ).toEqual(Number(blockId));
            }
            done();
        });
    });
});
