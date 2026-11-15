import { clientboundMusicPlaybackFailurePacket } from '../wire/definitions/added2259';
import type { ClientboundMusicPlaybackFailurePayload } from '../wire/definitions/added2259';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * Tells the client which music discs could not be played, one entry per disc.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class ClientboundMusicPlaybackFailurePacket extends FieldNetworkPacket {
    /** `Failures`. */
    public failures: ClientboundMusicPlaybackFailurePayload['failures'] = [];

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(clientboundMusicPlaybackFailurePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientboundMusicPlaybackFailurePacket, this.codecProtocol).decode(this));
    }
}
