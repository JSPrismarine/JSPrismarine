import { serverboundRequestOnlineMusicPlaybackPacket } from '../wire/definitions/added2259';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * The client asks to stream a music disc's track.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class ServerboundRequestOnlineMusicPlaybackPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ServerboundRequestOnlineMusicPlaybackPacket';
    }

    /** `Request ID`, echoed by the response. */
    public requestId: number = 0;

    /** `Sound Event Name`: the disc's sound event. */
    public soundEventName: string = '';

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(serverboundRequestOnlineMusicPlaybackPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(serverboundRequestOnlineMusicPlaybackPacket, this.codecProtocol).decode(this));
    }
}
