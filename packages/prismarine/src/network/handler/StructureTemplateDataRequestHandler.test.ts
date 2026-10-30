import { describe, expect, it } from 'vitest';
import { sessionNearBlocks } from '../../testing/blockTarget.test.helper';
import BlockPosition from '../../world/BlockPosition';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from '@jsprismarine/protocol/packet/StructureTemplateDataRequestPacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import { defaultStructureSettings } from '@jsprismarine/protocol/structure/StructureSettings';
import StructureTemplateDataRequestHandler from './StructureTemplateDataRequestHandler';

const packetAt = (structurePosition: BlockPosition) =>
    new StructureTemplateDataRequestPacket({
        structureName: 'house',
        structurePosition: new BlockPos(structurePosition.getX(), structurePosition.getY(), structurePosition.getZ()),
        structureSettings: defaultStructureSettings(),
        requestedOperation: StructureTemplateRequestOperation.QuerySavedStructure
    });

describe('StructureTemplateDataRequestHandler', () => {
    it('logs the structure name and the operation by name for a structure block in reach', () => {
        const { logged, server, session } = sessionNearBlocks({ '1,0,1': 'minecraft:structure_block' });

        new StructureTemplateDataRequestHandler().handle(packetAt(new BlockPosition(1, 0, 1)), server, session);

        expect(logged.debug).toEqual([
            'Steve requested structure house with operation QuerySavedStructure. The server stores no structure templates'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a request whose position holds no structure block', () => {
        const { logged, server, session } = sessionNearBlocks({});

        new StructureTemplateDataRequestHandler().handle(packetAt(new BlockPosition(1, 0, 1)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a structure template request from Steve at 1, 0, 1: the block there is minecraft:air'
        ]);
    });
});
