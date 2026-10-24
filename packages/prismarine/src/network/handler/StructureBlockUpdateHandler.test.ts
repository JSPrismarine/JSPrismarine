import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import StructureBlockUpdatePacket from '../packet/StructureBlockUpdatePacket';
import StructureBlockUpdateHandler from './StructureBlockUpdateHandler';

const packetAt = (position: BlockPosition) => {
    const packet = new StructureBlockUpdatePacket();
    packet.blockPosition = position;
    packet.structureData.structureName.unredacted = 'house';
    return packet;
};

describe('StructureBlockUpdateHandler', () => {
    it('logs the structure name and position of a structure block in reach', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:structure_block' });

        new StructureBlockUpdateHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([
            'Steve set the structure block at 4, 1, 2 to structure "house". Structure blocks are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no structure block', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:stone' });

        new StructureBlockUpdateHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure block update from Steve at 4, 1, 2: the block there is minecraft:stone'
        ]);
    });

    it('drops a position out of reach without reading the world', () => {
        const { logged, server, session } = sessionNearBlocks({});

        new StructureBlockUpdateHandler().handle(packetAt(new BlockPosition(5_000_000, 64, 0)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure block update from Steve at 5000000, 64, 0: it is 5000000.0 blocks away'
        ]);
    });
});
