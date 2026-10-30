import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import LecternUpdatePacket from '@jsprismarine/protocol/packet/LecternUpdatePacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import LecternUpdateHandler from './LecternUpdateHandler';

const packetAt = (position: BlockPosition) =>
    new LecternUpdatePacket({
        newPage: 1,
        totalPages: 3,
        position: new BlockPos(position.getX(), position.getY(), position.getZ())
    });

describe('LecternUpdateHandler', () => {
    it('logs the page and position of a lectern in reach', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:lectern' });

        new LecternUpdateHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([
            'Steve turned the lectern at 4, 1, 2 to page 1 of 3. Lectern pages are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no lectern', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:bookshelf' });

        new LecternUpdateHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a lectern update from Steve at 4, 1, 2: the block there is minecraft:bookshelf'
        ]);
    });
});
