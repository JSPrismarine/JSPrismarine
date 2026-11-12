import { CommandOutputPacket, CommandOutputType } from '@jsprismarine/protocol';
import type { CommandRequestPacket } from '@jsprismarine/protocol';
import CommandOriginType from '@jsprismarine/protocol/wire/structures/CommandOriginType';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
export default class CommandRequestHandler implements InputLaneHandler<CommandRequestPacket> {
    public static PacketName = 'CommandRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Dispatches the command as the player who sent it and answers with its outcome. */
    public handle(packet: CommandRequestPacket, { session, log, services, step }: InputContext): undefined {
        const request = packet.getPacketData();
        if (request === null) throw new Error('CommandRequestPacket has no decoded payload');
        const origin = request.commandOriginData;

        if (origin.type !== CommandOriginType.Player) {
            log.debug(
                `Dropped a command request from ${session.identity.name} with origin ${CommandOriginType[origin.type] ?? origin.type}; a client may only send the Player origin`,
                'CommandRequestHandler/handle'
            );
            return;
        }

        // The command runs in this input's unit and queues what it says before the outcome goes
        // out; what it started and has not finished, such as a kick, is the step's to finish.
        const { ran, settled } = services.commands.runCommand(session, session, request.commandName);
        step.output(settled);

        const output = new CommandOutputPacket({
            originData: origin,
            outputType: CommandOutputType.AllOutput,
            successCount: ran ? 1 : 0,
            outputMessages: [],
            dataSet: null
        });
        step.output(session.send(output));
    }
}
