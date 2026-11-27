import BlockPickRequestPacket from '@jsprismarine/protocol/bedrock/packet/BlockPickRequestPacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import BlockPickRequestDecoder from './BlockPickRequestDecoder';

describe('BlockPickRequestDecoder', () => {
    it('decodes the picked position and the data flag', () => {
        const { view, logged } = decodeView();
        const packet = new BlockPickRequestPacket({ position: new BlockPos(1, 2, 3), withData: true, maxSlots: 4 });

        expect(new BlockPickRequestDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'pickBlock', position: { x: 1, y: 2, z: 3 }, withData: true }
        ]);
        expect(logged).toEqual([]);
    });
});
