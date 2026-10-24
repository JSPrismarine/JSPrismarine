import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import StructureBlockUpdatePacket from '../packet/StructureBlockUpdatePacket';
import StructureBlockUpdateHandler from './StructureBlockUpdateHandler';

describe('StructureBlockUpdateHandler', () => {
    it('logs the structure name and position', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

        const packet = new StructureBlockUpdatePacket();
        packet.blockPosition = new BlockPosition(4, 65, -2);
        packet.structureData.structureName.unredacted = 'house';

        new StructureBlockUpdateHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve set the structure block at 4, 65, -2 to structure "house". Structure blocks are not stored'
        ]);
    });
});
