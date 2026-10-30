import { AudioContentPlaybackType, layoutAt, clientboundPlayAudioContentPacket } from '@jsprismarine/protocol';
import type { PlaySoundPayload, SignedAudioContent } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Plays a piece of registered audio content, carrying a whole `PlaySound` payload with it.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ClientboundPlayAudioContentPacket extends FieldNetworkPacket {
    /** `sharedMetadata`. */
    public sharedMetadata: SignedAudioContent = { compactJwt: '' };

    /** `playbackContent`. */
    public playbackContent: SignedAudioContent = { compactJwt: '' };

    /** `playbackType`. */
    public playbackType: number = AudioContentPlaybackType.Sound;

    /** `playSound`. */
    public playSound: PlaySoundPayload = {
        name: '',
        position: { x: 0, y: 0, z: 0 },
        volume: 1,
        pitch: 1,
        loopCount: 0,
        bypassListenerRangeCheck: false,
        serverSoundHandle: null,
        playbackPositionSeconds: null
    };
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(clientboundPlayAudioContentPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientboundPlayAudioContentPacket, this.codecProtocol).decode(this));
    }
}
