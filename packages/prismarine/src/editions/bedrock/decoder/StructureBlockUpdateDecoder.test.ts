import { describe, expect, it } from 'vitest';
import { sessionSeeingBlocks } from '../handler/blockTargetSession.test.helper';
import BlockPosition from '../../../world/BlockPosition';
import StructureBlockUpdatePacket, {
    StructureBlockType,
    StructureRedstoneSaveMode
} from '@jsprismarine/protocol/bedrock/packet/StructureBlockUpdatePacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { defaultStructureSettings } from '@jsprismarine/protocol/bedrock/structure/StructureSettings';
import EditStructureBlockHandler from '../../../input/handlers/EditStructureBlockHandler';
import type { SessionContext } from '../../../player/context/HandlerContext';
import { viewOf } from './DecodeView';
import StructureBlockUpdateDecoder from './StructureBlockUpdateDecoder';

/** A packet decoded and its intents run, as the dispatcher wraps a decoder. */
const run = (packet: StructureBlockUpdatePacket, context: SessionContext): void => {
    for (const intent of new StructureBlockUpdateDecoder().decode(packet, viewOf(context.session, context.log)))
        new EditStructureBlockHandler().handle(intent, context);
};

const packetAt = (position: BlockPosition) => {
    return new StructureBlockUpdatePacket({
        blockPosition: new BlockPos(position.getX(), position.getY(), position.getZ()),
        structureData: {
            structureName: { unredacted: 'house', redacted: null },
            dataField: '',
            shouldIncludePlayers: false,
            shouldShowBoundingBox: false,
            structureBlockType: StructureBlockType.Data,
            structureSettings: defaultStructureSettings(),
            redstoneSaveMode: StructureRedstoneSaveMode.SavesToMemory
        },
        trigger: false,
        isWaterlogged: false,
        keepStructureVoid: false
    });
};

describe('StructureBlockUpdateDecoder', () => {
    it('logs the structure name and position of a structure block in reach', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:structure_block' });

        run(packetAt(new BlockPosition(4, 1, 2)), context);

        expect(logged.debug).toEqual([
            'Steve set the structure block at 4, 1, 2 to structure "house". Structure blocks are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no structure block', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:stone' });

        run(packetAt(new BlockPosition(4, 1, 2)), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure block update from Steve at 4, 1, 2: the block there is minecraft:stone'
        ]);
    });

    it('drops a position out of reach without reading the world', () => {
        const { logged, context } = sessionSeeingBlocks({});

        run(packetAt(new BlockPosition(5_000_000, 64, 0)), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure block update from Steve at 5000000, 64, 0: it is 5000000.0 blocks away'
        ]);
    });
});
