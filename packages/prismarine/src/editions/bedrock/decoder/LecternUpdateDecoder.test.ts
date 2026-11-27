import LecternUpdatePacket from '@jsprismarine/protocol/bedrock/packet/LecternUpdatePacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import LecternUpdateDecoder from './LecternUpdateDecoder';

describe('LecternUpdateDecoder', () => {
    it("decodes the lectern's position and the page it was turned to", () => {
        const { view } = decodeView();
        const packet = new LecternUpdatePacket({ newPage: 1, totalPages: 3, position: new BlockPos(4, 1, 2) });

        expect(new LecternUpdateDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'turnLecternPage', position: { x: 4, y: 1, z: 2 }, page: 1, totalPages: 3 }
        ]);
    });
});
