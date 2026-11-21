import type EmotePacket from '@jsprismarine/protocol/bedrock/packet/EmotePacket';

import type { Intent } from '../../input/Intent';
import { isUuid } from '../../utils/isUuid';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A client asking to play an emote.
 *
 * A client only emotes as itself, so a packet naming another runtime id is dropped, as is one
 * whose emote id is not a uuid string. The XUID the packet carries is ignored: it names the
 * account the emote belongs to, and it arrived from the one client that has every reason to put
 * somebody else's in it, so the handler takes the server's record of the sender instead.
 */
export default class EmoteDecoder implements PacketDecoder<EmotePacket, 'emote'> {
    public static readonly PacketName = 'EmotePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['emote'] as const;

    /** Decodes an emote the sender plays on itself. */
    public decode(packet: EmotePacket, view: DecodeView): readonly Intent<'emote'>[] {
        if (packet.actorRuntimeId !== view.runtimeId) {
            view.log.debug(`${view.name} sent an Emote for runtime id ${packet.actorRuntimeId}, dropped`);
            return [];
        }

        if (!isUuid(packet.emoteId)) {
            view.log.debug(
                `${view.name} sent an Emote whose id ${JSON.stringify(packet.emoteId)} is not a uuid, dropped`
            );
            return [];
        }

        return [
            {
                kind: 'emote',
                emote: packet.emoteId,
                lengthTicks: packet.emoteLengthTicks,
                platformId: packet.platformId,
                flags: packet.flags
            }
        ];
    }
}
