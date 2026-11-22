import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundUpdateSoundDataPacket, SoundDataUpdateType } from '../wire/definitions/clientboundUpdateSoundData';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ClientboundUpdateSoundDataPayload } from '../wire/definitions/clientboundUpdateSoundData';

export { SoundDataUpdateType };
export type {
    SoundDataFade,
    SoundDataSeekTo,
    SoundDataSetPitch,
    SoundDataSetVolume,
    SoundDataSignal,
    SoundDataUpdate
} from '../wire/definitions/clientboundUpdateSoundData';

/** The sound handle and the update to apply: seven slots up to protocol 2193, one `event` from 2225. */
export type ClientboundUpdateSoundData = ClientboundUpdateSoundDataPayload;

/**
 * Changes a sound the client is already playing, found by the handle the server gave it.
 *
 * Protocol 2193 layout, in wire order: `Server Sound Handle` as a little-endian uint64, then
 * seven update slots the schema names `Stop`, `SetVolume`, `SetPitch`, `Fade`, `SeekTo`,
 * `Pause` and `Resume`. Every slot is the same `oneOf`: a varuint32 alternative index
 * ({@link SoundDataUpdateType}) followed by the alternative's fields, each a little-endian
 * float32. `Stop`, `Pause` and `Resume` have none; `SetVolume` has `Volume`; `SetPitch` has
 * `Pitch`; `Fade` has `Duration` then `Target Volume`; `SeekTo` has `Seconds`.
 *
 * A slot's name does not constrain what it holds: any slot may carry any alternative.
 * gophertunnel at protocol 2193 writes the same seven slots and reports that the client applies
 * only the last one.
 *
 * Protocol 2225 (1.26.60) replaces the seven slots with one `Event` field and adds a `Type`
 * byte to every alternative. A payload carries the seven slots or `event`, whichever the
 * session's protocol puts on the wire; the other fields are ignored on write and filled with
 * `Stop` on read.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-update-sound-data-packet/
 */
export default class ClientboundUpdateSoundDataPacket extends NetworkPacket<ClientboundUpdateSoundData> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundUpdateSoundDataPacket';
    }

    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_UPDATE_SOUND_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundUpdateSoundData): void {
        layoutAt(clientboundUpdateSoundDataPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundUpdateSoundData {
        return layoutAt(clientboundUpdateSoundDataPacket, this.codecProtocol).decode(stream);
    }
}
