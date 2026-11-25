import type ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A client that closed a container.
 *
 * The packet goes both ways and carries the same three fields each way: `Container Id`,
 * `Container Type` and `Server Initiated Close`. The client sends it once its own container
 * manager is gone. The last field is ignored: the player closed this one, whatever the client
 * wrote.
 */
export default class ContainerCloseDecoder implements PacketDecoder<ContainerClosePacket, 'closeContainer'> {
    public static readonly PacketName = 'ContainerClosePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['closeContainer'] as const;

    /** Decodes the window id and the container type the reply echoes. */
    public decode(packet: ContainerClosePacket, _view: DecodeView): readonly Intent<'closeContainer'>[] {
        return [{ kind: 'closeContainer', window: packet.containerId, containerType: packet.containerType }];
    }
}
