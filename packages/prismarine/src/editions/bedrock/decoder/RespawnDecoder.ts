import { PlayerRespawnState } from '@jsprismarine/minecraft';
import type RespawnPacket from '@jsprismarine/protocol/bedrock/packet/RespawnPacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The client's half of the respawn exchange.
 *
 * `Player Runtime Id` names the player respawning, and a client only respawns itself, so a packet
 * naming anyone else is dropped. Of the three states, `ClientReadyToSpawn` is the only one a
 * client sends; the other two are the server's own, and a client echoing one back is not asking
 * for anything.
 */
export default class RespawnDecoder implements PacketDecoder<RespawnPacket, 'respawn'> {
    public static readonly PacketName = 'RespawnPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['respawn'] as const;

    /** Decodes a ready-to-spawn about the sender. */
    public decode(packet: RespawnPacket, view: DecodeView): readonly Intent<'respawn'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.RespawnNotDecoded();

        if (data.runtimeEntityId !== view.runtimeId) {
            view.log.debug(`${view.name} sent a Respawn for runtime id ${data.runtimeEntityId}, dropped`);
            return [];
        }

        if (data.state !== PlayerRespawnState.CLIENT_READY_TO_SPAWN) return [];
        return [{ kind: 'respawn' }];
    }
}
