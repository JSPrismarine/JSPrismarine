import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from '../packet/StructureTemplateDataRequestPacket';
import StructureTemplateDataRequestHandler from './StructureTemplateDataRequestHandler';

describe('StructureTemplateDataRequestHandler', () => {
    it('logs the structure name and the operation by name', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new StructureTemplateDataRequestPacket(), {
            structureName: 'house',
            requestedOperation: StructureTemplateRequestOperation.QuerySavedStructure
        });

        new StructureTemplateDataRequestHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve requested structure house with operation QuerySavedStructure. The server stores no structure templates'
        ]);
    });
});
