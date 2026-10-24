import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PlayerToggleCrafterSlotRequestPacket from '../packet/PlayerToggleCrafterSlotRequestPacket';
import PlayerToggleCrafterSlotRequestHandler from './PlayerToggleCrafterSlotRequestHandler';

describe('PlayerToggleCrafterSlotRequestHandler', () => {
    it('logs the slot toggle and position', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new PlayerToggleCrafterSlotRequestPacket(), {
            posX: 1,
            posY: 64,
            posZ: -3,
            slotIndex: 4,
            isDisabled: true
        });

        new PlayerToggleCrafterSlotRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve disabled slot 4 of the crafter at 1, 64, -3. Crafters are not stored']);
    });
});
