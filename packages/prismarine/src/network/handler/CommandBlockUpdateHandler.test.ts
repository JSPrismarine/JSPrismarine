import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import CommandBlockUpdatePacket, { CommandBlockMode } from '../packet/CommandBlockUpdatePacket';
import CommandBlockUpdateHandler from './CommandBlockUpdateHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

describe('CommandBlockUpdateHandler', () => {
    it('logs a block target with its mode and position', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new CommandBlockUpdatePacket(), {
            target: {
                isBlock: true,
                blockPosition: new BlockPosition(1, 2, 3),
                commandBlockMode: CommandBlockMode.Chain,
                redstoneMode: true,
                isConditional: false
            },
            command: 'say hi'
        });

        new CommandBlockUpdateHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve set the Chain command block at 1, 2, 3 to "say hi". Command blocks are not stored, so nothing changed'
        ]);
    });

    it('logs a minecart target by runtime id', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new CommandBlockUpdatePacket(), {
            target: { isBlock: false, targetRuntimeId: 9n },
            command: 'tp @p 0 64 0'
        });

        new CommandBlockUpdateHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve set command block minecart 9 to "tp @p 0 64 0". Command blocks are not stored, so nothing changed'
        ]);
    });
});
