import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import LabTablePacket, { LabTableReactionType, LabTableType } from '@jsprismarine/protocol/packet/LabTablePacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import LabTableHandler from './LabTableHandler';

const packetAt = (position: BlockPosition) =>
    new LabTablePacket({
        type: LabTableType.StartCombine,
        position: new BlockPos(position.getX(), position.getY(), position.getZ()),
        reaction: LabTableReactionType.None
    });

describe('LabTableHandler', () => {
    it('logs the action by name and the position of a lab table in reach', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:lab_table' });

        new LabTableHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([
            'Steve ran StartCombine on the lab table at 4, 1, 2. Chemistry is not simulated'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no lab table', () => {
        const { logged, server, session } = sessionNearBlocks({ '4,1,2': 'minecraft:crafting_table' });

        new LabTableHandler().handle(packetAt(new BlockPosition(4, 1, 2)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a lab table action from Steve at 4, 1, 2: the block there is minecraft:crafting_table'
        ]);
    });
});
