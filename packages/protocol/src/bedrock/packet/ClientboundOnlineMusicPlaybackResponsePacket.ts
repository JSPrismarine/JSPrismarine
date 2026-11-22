import { MusicPlaybackState, clientboundOnlineMusicPlaybackResponsePacket } from '../wire/definitions/added2259';
import type { SignedAudioContent } from '../wire/definitions/added2225';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Answers a `ServerboundRequestOnlineMusicPlaybackPacket` with where the track plays from.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class ClientboundOnlineMusicPlaybackResponsePacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundOnlineMusicPlaybackResponsePacket';
    }

    /** `Request ID` of the request this answers. */
    public requestId: number = 0;

    /** `State`. */
    public state: MusicPlaybackState = MusicPlaybackState.Local;

    /** `Shared Metadata`. */
    public sharedMetadata: SignedAudioContent = { compactJwt: '' };

    /** `Playback Content`. */
    public playbackContent: SignedAudioContent = { compactJwt: '' };

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(clientboundOnlineMusicPlaybackResponsePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientboundOnlineMusicPlaybackResponsePacket, this.codecProtocol).decode(this));
    }
}
