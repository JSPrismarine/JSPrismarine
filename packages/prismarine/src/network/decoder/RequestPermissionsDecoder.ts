import type RequestPermissionsPacket from '@jsprismarine/protocol/bedrock/packet/RequestPermissionsPacket';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A request to change another player's permission level, as the player list's dropdown sends it. */
export default class RequestPermissionsDecoder implements PacketDecoder<
    RequestPermissionsPacket,
    'setPlayerPermission'
> {
    public static readonly PacketName = 'RequestPermissionsPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['setPlayerPermission'] as const;

    /** Decodes the target, the level and the custom flags; the handler checks who may ask. */
    public decode(packet: RequestPermissionsPacket, _view: DecodeView): readonly Intent<'setPlayerPermission'>[] {
        return [
            {
                kind: 'setPlayerPermission',
                target: packet.targetPlayerUniqueId,
                level: packet.playerPermissionLevel,
                customFlags: packet.customPermissionFlags
            }
        ];
    }
}
