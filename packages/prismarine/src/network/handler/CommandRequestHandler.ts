import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import { CommandOutputPacket, CommandOutputType } from '@jsprismarine/protocol';
import type { CommandRequestPacket } from '@jsprismarine/protocol';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import type PacketHandler from './PacketHandler';

/**
 * A slash command a client typed.
 *
 * A client's own commands carry the `Player` origin. The other origins name a command block,
 * an automation client, or the server itself, and a request claiming one of those is logged
 * and dropped before it reaches the command manager, which would otherwise run it as the
 * player. The command manager checks the player's permission and sends the command's
 * messages as `TextPacket`s. The handler then answers with a `CommandOutputPacket` that
 * echoes the request's origin, UUID included, and reports whether the command ran as its
 * `Success Count`. The reply carries no messages of its own, since they have already gone out.
 */
export default class CommandRequestHandler implements PacketHandler<CommandRequestPacket> {
    public static PacketName = 'CommandRequestPacket';
    public readonly phases = ['play'] as const;

    /** Dispatches the command as the player who sent it and answers with its outcome. */
    public async handle(packet: CommandRequestPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const request = packet.getPacketData();
        if (request === null) throw new Error('CommandRequestPacket has no decoded payload');
        const origin = request.commandOriginData;

        if (origin.type !== CommandOriginType.Player) {
            server
                .getLogger()
                .debug(
                    `Dropped a command request from ${player.getName()} with origin ${CommandOriginType[origin.type] ?? origin.type}; a client may only send the Player origin`,
                    'CommandRequestHandler/handle'
                );
            return;
        }

        const ran = await server.getCommandManager().dispatchCommand(player, player, request.commandName);

        const output = new CommandOutputPacket({
            originData: origin,
            outputType: CommandOutputType.AllOutput,
            successCount: ran ? 1 : 0,
            outputMessages: [],
            dataSet: null
        });
        await session.send(output);
    }
}
