import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import AnvilDamagePacket from '@jsprismarine/protocol/packet/AnvilDamagePacket';
import AnvilDamageHandler from './AnvilDamageHandler';

const packetAt = (blockPosition: BlockPosition) =>
    new AnvilDamagePacket({
        blockPosition: new BlockPos(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ())
    });

describe('AnvilDamageHandler', () => {
    it('logs the position of an anvil in reach, whatever its wear', () => {
        const { logged, server, session } = sessionNearBlocks({
            '3,2,2': 'minecraft:anvil',
            '1,2,2': 'minecraft:damaged_anvil'
        });
        const handler = new AnvilDamageHandler();

        handler.handle(packetAt(new BlockPosition(3, 2, 2)), server, session);
        handler.handle(packetAt(new BlockPosition(1, 2, 2)), server, session);

        expect(logged.debug).toEqual([
            'Steve asked to damage the anvil at 3, 2, 2. Anvils are not modeled',
            'Steve asked to damage the anvil at 1, 2, 2. Anvils are not modeled'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no anvil', () => {
        const { logged, server, session } = sessionNearBlocks({ '1,2,2': 'minecraft:iron_block' });

        new AnvilDamageHandler().handle(packetAt(new BlockPosition(1, 2, 2)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped an anvil damage request from Steve at 1, 2, 2: the block there is minecraft:iron_block'
        ]);
    });
});
