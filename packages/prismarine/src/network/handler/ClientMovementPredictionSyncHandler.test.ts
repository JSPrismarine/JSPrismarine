import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ClientMovementPredictionSyncPacket from '@jsprismarine/protocol/packet/ClientMovementPredictionSyncPacket';
import ClientMovementPredictionSyncHandler from './ClientMovementPredictionSyncHandler';

describe('ClientMovementPredictionSyncHandler', () => {
    it('summarizes the prediction inputs', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ClientMovementPredictionSyncPacket(), {
            actorUniqueId: 5n,
            movementSpeed: 0.1,
            jumpStrength: 0.42,
            boundingBoxWidth: 0.6,
            boundingBoxHeight: 1.8,
            actorFlags: 0x101n,
            actorFlyingState: true
        });

        new ClientMovementPredictionSyncHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve predicts actor 5 with speed 0.1, jump 0.42, box 0.6x1.8, flags 0x101, flying']);
    });
});
