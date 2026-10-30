import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { serverboundRegisterAudioContentPacket } from '../wire/definitions/added2225';
import type { AudioContentRegistrationEntry } from '../wire/definitions/added2225';

/**
 * A client registering the audio content it may be asked to play.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ServerboundRegisterAudioContentPacket extends FieldNetworkPacket {
    /** `registrations`. */
    public registrations: AudioContentRegistrationEntry[] = [];
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(serverboundRegisterAudioContentPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(serverboundRegisterAudioContentPacket, this.codecProtocol).decode(this));
    }
}
