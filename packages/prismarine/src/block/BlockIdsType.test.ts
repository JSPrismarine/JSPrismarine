import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { BlockIdsType } from './BlockIdsType';
import BlockManager from './BlockManager';
import type { BlockManagerServer } from './BlockManager';

describe('block', () => {
    describe('BlockIdsType', () => {
        // Enable this test to figure out which blocks have yet to be added
        it.skip('every block is implemented', async () => {
            const server: BlockManagerServer = {
                getLogger: () => new Logger(),
                emit: async () => {}
            };
            const blockManager = new BlockManager(server);
            await blockManager.enable();

            for (const blockId in BlockIdsType) {
                if (Number.isNaN(Number(blockId))) {
                    return;
                }

                expect(blockManager.getBlockById(Number(blockId)).getId()).toEqual(Number(blockId));
            }
        });
    });
});
