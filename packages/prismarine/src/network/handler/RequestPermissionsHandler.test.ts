import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import RequestPermissionsPacket from '../packet/RequestPermissionsPacket';
import RequestPermissionsHandler from './RequestPermissionsHandler';

describe('RequestPermissionsHandler', () => {
    it('logs the target and level without changing anything', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new RequestPermissionsPacket(), {
            targetPlayerUniqueId: 7n,
            playerPermissionLevel: PlayerPermissionLevel.OPERATOR,
            customPermissionFlags: 0xff
        });

        new RequestPermissionsHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve asked to set player 7 to permission level OPERATOR (custom flags 0xff). Permission levels are not modeled, so nothing changed'
        ]);
    });
});
