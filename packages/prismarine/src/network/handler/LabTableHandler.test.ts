import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import LabTablePacket, { LabTableType } from '../packet/LabTablePacket';
import LabTableHandler from './LabTableHandler';

describe('LabTableHandler', () => {
    it('logs the action by name and the table position', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new LabTablePacket(), {
            type: LabTableType.StartCombine,
            position: new BlockPosition(4, 65, -2)
        });

        new LabTableHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve ran StartCombine on the lab table at 4, 65, -2. Chemistry is not simulated']);
    });
});
