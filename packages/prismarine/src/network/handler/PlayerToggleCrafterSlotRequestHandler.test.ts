import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/packet/PlayerToggleCrafterSlotRequestPacket';
import PlayerToggleCrafterSlotRequestHandler from './PlayerToggleCrafterSlotRequestHandler';

const toggle = (slotIndex: number, posZ = 3) =>
    Object.assign(new PlayerToggleCrafterSlotRequestPacket(), { posX: 1, posY: 2, posZ, slotIndex, isDisabled: true });

describe('PlayerToggleCrafterSlotRequestHandler', () => {
    it('logs the slot toggle and position of a crafter in reach', () => {
        const { logged, server, session } = sessionNearBlocks({ '1,2,3': 'minecraft:crafter' });

        new PlayerToggleCrafterSlotRequestHandler().handle(toggle(4), server, session);

        expect(logged.debug).toEqual(['Steve disabled slot 4 of the crafter at 1, 2, 3. Crafters are not stored']);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a slot a crafter does not have', () => {
        const { logged, server, session } = sessionNearBlocks({ '1,2,3': 'minecraft:crafter' });

        new PlayerToggleCrafterSlotRequestHandler().handle(toggle(9), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a crafter slot toggle from Steve at 1, 2, 3: a crafter has no slot 9'
        ]);
    });

    it('drops a position that holds no crafter', () => {
        const { logged, server, session } = sessionNearBlocks({ '1,2,3': 'minecraft:dropper' });

        new PlayerToggleCrafterSlotRequestHandler().handle(toggle(4), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a crafter slot toggle from Steve at 1, 2, 3: the block there is minecraft:dropper'
        ]);
    });
});
