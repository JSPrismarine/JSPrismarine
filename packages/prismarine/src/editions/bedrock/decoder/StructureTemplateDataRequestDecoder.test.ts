import { describe, expect, it } from 'vitest';
import { sessionSeeingBlocks } from '../handler/blockTargetSession.test.helper';
import BlockPosition from '../../../world/BlockPosition';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from '@jsprismarine/protocol/bedrock/packet/StructureTemplateDataRequestPacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { defaultStructureSettings } from '@jsprismarine/protocol/bedrock/structure/StructureSettings';
import UseStructureBlockHandler from '../../../input/handlers/UseStructureBlockHandler';
import type { SessionContext } from '../../../player/context/HandlerContext';
import { viewOf } from './DecodeView';
import StructureTemplateDataRequestDecoder from './StructureTemplateDataRequestDecoder';

/** A packet decoded and its intents run, as the dispatcher wraps a decoder. */
const run = (packet: StructureTemplateDataRequestPacket, context: SessionContext): void => {
    for (const intent of new StructureTemplateDataRequestDecoder().decode(packet, viewOf(context.session, context.log)))
        new UseStructureBlockHandler().handle(intent, context);
};

const packetAt = (structurePosition: BlockPosition) =>
    new StructureTemplateDataRequestPacket({
        structureName: 'house',
        structurePosition: new BlockPos(structurePosition.getX(), structurePosition.getY(), structurePosition.getZ()),
        structureSettings: defaultStructureSettings(),
        requestedOperation: StructureTemplateRequestOperation.QuerySavedStructure
    });

describe('StructureTemplateDataRequestDecoder', () => {
    it('logs the structure name and the operation by name for a structure block in reach', () => {
        const { logged, context } = sessionSeeingBlocks({ '1,0,1': 'minecraft:structure_block' });

        run(packetAt(new BlockPosition(1, 0, 1)), context);

        expect(logged.debug).toEqual([
            'Steve requested structure house with operation QuerySavedStructure. The server stores no structure templates'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a request whose position holds no structure block', () => {
        const { logged, context } = sessionSeeingBlocks({});

        run(packetAt(new BlockPosition(1, 0, 1)), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure template request from Steve at 1, 0, 1: the block there is minecraft:air'
        ]);
    });
});
