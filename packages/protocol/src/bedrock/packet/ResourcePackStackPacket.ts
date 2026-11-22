import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { resourcePackStackPacket } from '../wire/definitions/resourcePacks';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PayloadOf } from '../../wire/define';
import type { Experiment } from '@jsprismarine/minecraft';

export type { Experiment };

/** One entry of the `Texture Pack List`, as the docs' `PackInstanceId`. */
export interface ResourcePackStackEntry {
    /** `Pack ID`, the pack's UUID. */
    uuid: string;
    /** `Version`, the pack's SemVer version. */
    version: string;
    /** `Sub Pack Name`, empty when the pack has no sub pack selected. */
    subPackName: string;
}

/** The fields of `ResourcePackStackPacket`, in wire order. Each field is documented in its definition. */
export type ResourcePackStack = PayloadOf<typeof resourcePackStackPacket>;

/**
 * The order the packs are applied in, sent once the client says it has them all.
 *
 * Protocol 2193 layout, in wire order: `Texture Pack Required` boolean, `Texture Pack List`
 * as a varuint count of `PackInstanceId` entries (`Pack ID`, `Version`, `Sub Pack Name`
 * strings), `Base Game Version` string, `Experiments` (`Toggles` as a uint32 little endian
 * count of `Name` string and `Enabled` boolean pairs, then `ExperimentsEverToggled` boolean),
 * and `Include Editor Packs` boolean. The experiments count is the one field in this packet
 * that is not a varint.
 *
 * One list, not two. 748 sent the behavior packs ahead of the texture packs, and a reader
 * that still expects them takes the texture pack count for the behavior pack count and every
 * field after it is read from the wrong place, which on an empty stack means running off the
 * end of an eleven byte packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/resource-pack-stack-packet/
 */
export default class ResourcePackStackPacket extends NetworkPacket<ResourcePackStack> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ResourcePackStackPacket';
    }

    public get id(): number {
        return PacketIdentifier.RESOURCE_PACK_STACK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePackStack): void {
        layoutAt(resourcePackStackPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ResourcePackStack {
        return layoutAt(resourcePackStackPacket, this.codecProtocol).decode(stream);
    }
}
