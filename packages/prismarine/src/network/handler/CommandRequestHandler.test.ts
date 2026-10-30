import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { CommandManager } from '../../command/CommandManager';
import { stub } from '../../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type PlayerSession from '../PlayerSession';
import CommandOutputPacket, { CommandOutputType } from '../packet/CommandOutputPacket';
import CommandRequestPacket from '../packet/CommandRequestPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import CommandOriginData from '@jsprismarine/protocol/wire/structures/CommandOriginData';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import CommandRequestHandler from './CommandRequestHandler';

const origin = (type: CommandOriginType): CommandOriginData =>
    new CommandOriginData(type, UUID.fromString('00112233-4455-6677-8899-aabbccddeeff'), 'request-7', 42n);

/** Runs the handler against one request, with a command manager whose dispatch answers `ran`. */
const run = async (packet: CommandRequestPacket, ran: boolean) => {
    const dispatched: { sender: unknown; target: unknown; input: string }[] = [];
    const sent: NetworkPacket[] = [];
    const logged: string[] = [];
    const player = stub<Player>({ getName: () => 'Steve' });
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
        getCommandManager: () =>
            stub<CommandManager>({
                dispatchCommand: async (sender, target, input = '') => {
                    dispatched.push({ sender, target, input });
                    return ran;
                }
            })
    });
    const session = stub<PlayerSession>({
        getPlayer: () => player,
        send: async (packet) => void sent.push(packet)
    });

    await new CommandRequestHandler().handle(packet, server, session);

    return { dispatched, sent, logged, player };
};

describe('CommandRequestHandler', () => {
    it('dispatches the command as the player and answers with the request origin', async () => {
        const requestOrigin = origin(CommandOriginType.Player);
        const packet = Object.assign(new CommandRequestPacket(), {
            commandName: '/say hi',
            commandOriginData: requestOrigin
        });

        const { dispatched, sent, player } = await run(packet, true);

        expect(dispatched).toEqual([{ sender: player, target: player, input: '/say hi' }]);
        expect(sent).toHaveLength(1);
        const [reply] = sent;
        expect(reply).toBeInstanceOf(CommandOutputPacket);
        expect(reply).toMatchObject({
            originData: requestOrigin,
            outputType: CommandOutputType.AllOutput,
            successCount: 1,
            outputMessages: [],
            dataSet: null
        });
    });

    it('reports a command that did not run with a success count of zero', async () => {
        const packet = Object.assign(new CommandRequestPacket(), {
            commandName: '/nope',
            commandOriginData: origin(CommandOriginType.Player)
        });

        const { sent } = await run(packet, false);

        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ successCount: 0 });
    });

    it('drops a request whose origin is not the player', async () => {
        const packet = Object.assign(new CommandRequestPacket(), {
            commandName: '/op Steve',
            commandOriginData: origin(CommandOriginType.DevConsole)
        });

        const { dispatched, sent, logged } = await run(packet, true);

        expect(dispatched).toEqual([]);
        expect(sent).toEqual([]);
        expect(logged).toEqual([
            'Dropped a command request from Steve with origin DevConsole; a client may only send the Player origin'
        ]);
    });
});
