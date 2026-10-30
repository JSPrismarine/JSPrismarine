import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { stopSoundPacket } from '../wire/definitions/levelSoundEvent';

/**
 * Stops a sound that is still playing, such as a music disc.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `stopSoundPacket` definition:
 * `Sound Name` as a string, then `Stop All Sounds?` and `Stop Music (Legacy)` as one byte
 * each. A client that is not playing the named sound ignores the packet. With
 * `stopAllSounds` set the name may be empty.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/stop-sound-packet/
 */
export default class StopSoundPacket extends FieldNetworkPacket {
    public soundName = '';

    /** Stops everything the client is playing, whatever `soundName` says. */
    public stopAllSounds = false;

    /** The older music-only stop, kept for clients that still read it. */
    public stopMusicLegacy = false;

    /** Reads the sound name and the two stop flags. */
    public decodePayload(): void {
        const payload = layoutAt(stopSoundPacket, this.codecProtocol).decode(this);

        this.soundName = payload.soundName;
        this.stopAllSounds = payload.stopAllSounds;
        this.stopMusicLegacy = payload.stopMusicLegacy;
    }

    /** Writes the sound name and the two stop flags. */
    public encodePayload(): void {
        layoutAt(stopSoundPacket, this.codecProtocol).encode(this, {
            soundName: this.soundName,
            stopAllSounds: this.stopAllSounds,
            stopMusicLegacy: this.stopMusicLegacy
        });
    }
}
