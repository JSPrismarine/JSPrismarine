import type ScriptMessagePacket from '@jsprismarine/protocol/bedrock/packet/ScriptMessagePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import PlayerScriptMessageEvent from '../../events/player/PlayerScriptMessageEvent';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * A message from a client's scripts to the server's. It raises `playerScriptMessage`, which the
 * level's scripts hear as `world.afterEvents.messageReceive`, on the input lane so it reaches
 * them in the tick it arrived in.
 */
export default class ScriptMessageHandler implements InputLaneHandler<ScriptMessagePacket> {
    public static PacketName = 'ScriptMessagePacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Raises the message as the server's `playerScriptMessage` event. */
    public handle(packet: ScriptMessagePacket, { session, services }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.ScriptMessageNotDecoded();
        services.events.post(
            'playerScriptMessage',
            new PlayerScriptMessageEvent(session, data.messageId, data.messageValue)
        );
    }
}
