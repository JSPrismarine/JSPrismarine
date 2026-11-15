import {
    VirtualContainerCloseCause,
    VirtualContainerCloseKind,
    virtualContainerClosePacket
} from '../wire/definitions/added2259';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * One step of closing a virtual container: a request, the close, or its confirmation.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class VirtualContainerClosePacket extends FieldNetworkPacket {
    /** `Session Id` from the open packet. */
    public sessionId: bigint = 0n;

    /** `Kind`. */
    public kind: VirtualContainerCloseKind = VirtualContainerCloseKind.Request;

    /** `Cause`. */
    public cause: VirtualContainerCloseCause = VirtualContainerCloseCause.Unknown;

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(virtualContainerClosePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(virtualContainerClosePacket, this.codecProtocol).decode(this));
    }
}
