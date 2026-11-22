import { virtualContainerOpenPacket } from '../wire/definitions/added2259';
import type { VirtualContainerOpenPayload } from '../wire/definitions/added2259';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Opens a container screen with no block or entity behind it, holding the slots it carries.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class VirtualContainerOpenPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'VirtualContainerOpenPacket';
    }

    /** `Container Id`. */
    public containerId: number = 0;

    /** `Session Id`, which the close handshake names. */
    public sessionId: bigint = 0n;

    /** `Title`. */
    public title: string = '';

    /** `Slots`. */
    public slots: VirtualContainerOpenPayload['slots'] = [];

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(virtualContainerOpenPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(virtualContainerOpenPacket, this.codecProtocol).decode(this));
    }
}
