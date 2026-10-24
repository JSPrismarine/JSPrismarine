import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Which change a sound update carries. The value is the alternative index on the wire: the
 * position in the schema's `oneOf` of `Stop`, `SetVolume`, `SetPitch`, `Fade`, `SeekTo`,
 * `Pause` and `Resume`.
 */
export enum SoundDataUpdateType {
    Stop = 0,
    SetVolume = 1,
    SetPitch = 2,
    Fade = 3,
    SeekTo = 4,
    Pause = 5,
    Resume = 6
}

/** `Stop`, `Pause` or `Resume`: an update with no fields after the alternative index. */
export interface SoundDataSignal {
    type: SoundDataUpdateType.Stop | SoundDataUpdateType.Pause | SoundDataUpdateType.Resume;
}

/** `SetVolume`. */
export interface SoundDataSetVolume {
    type: SoundDataUpdateType.SetVolume;
    /** `Volume`. */
    volume: number;
}

/** `SetPitch`. */
export interface SoundDataSetPitch {
    type: SoundDataUpdateType.SetPitch;
    /** `Pitch`. */
    pitch: number;
}

/** `Fade`: move the volume to a target over a duration. */
export interface SoundDataFade {
    type: SoundDataUpdateType.Fade;
    /** `Duration` of the fade in seconds. */
    duration: number;
    /** `Target Volume` the fade ends at. */
    targetVolume: number;
}

/** `SeekTo`: jump to a playback position. */
export interface SoundDataSeekTo {
    type: SoundDataUpdateType.SeekTo;
    /** `Seconds` from the start of the sound. */
    seconds: number;
}

/** One alternative of the `oneOf<Stop, SetVolume, SetPitch, Fade, SeekTo, Pause, Resume>` every slot carries. */
export type SoundDataUpdate =
    SoundDataSignal | SoundDataSetVolume | SoundDataSetPitch | SoundDataFade | SoundDataSeekTo;

/** The fields of a `ClientboundUpdateSoundDataPacket`, in wire order. */
export interface ClientboundUpdateSoundData {
    /** `Server Sound Handle`: the `ServerSoundHandle` a `PlaySoundPacket` or `RecordStartedPacket` gave the sound. */
    serverSoundHandle: bigint;
    /** `Stop`, the first update slot. */
    stop: SoundDataUpdate;
    /** `SetVolume`, the second update slot. */
    setVolume: SoundDataUpdate;
    /** `SetPitch`, the third update slot. */
    setPitch: SoundDataUpdate;
    /** `Fade`, the fourth update slot. */
    fade: SoundDataUpdate;
    /** `SeekTo`, the fifth update slot. */
    seekTo: SoundDataUpdate;
    /** `Pause`, the sixth update slot. */
    pause: SoundDataUpdate;
    /** `Resume`, the seventh and last update slot. */
    resume: SoundDataUpdate;
}

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
 * only the last one. Protocol 2211 (1.26.60 preview 25) collapses the seven into a single
 * `Event` field and adds a `Type` byte to every alternative; neither is on the 2193 wire.
 */
export default class ClientboundUpdateSoundDataPacket extends NetworkPacket<ClientboundUpdateSoundData> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_UPDATE_SOUND_DATA;
    }

    private static writeUpdate(stream: NetworkBinaryStream, update: SoundDataUpdate): void {
        stream.writeUnsignedVarInt(update.type);
        switch (update.type) {
            case SoundDataUpdateType.SetVolume:
                stream.writeFloatLE(update.volume);
                break;
            case SoundDataUpdateType.SetPitch:
                stream.writeFloatLE(update.pitch);
                break;
            case SoundDataUpdateType.Fade:
                stream.writeFloatLE(update.duration);
                stream.writeFloatLE(update.targetVolume);
                break;
            case SoundDataUpdateType.SeekTo:
                stream.writeFloatLE(update.seconds);
                break;
            case SoundDataUpdateType.Stop:
            case SoundDataUpdateType.Pause:
            case SoundDataUpdateType.Resume:
                break;
        }
    }

    /**
     * Reads one update slot.
     * @throws when the alternative index names none of the seven alternatives.
     */
    private static readUpdate(stream: NetworkBinaryStream): SoundDataUpdate {
        const type: SoundDataUpdateType = stream.readUnsignedVarInt();
        switch (type) {
            case SoundDataUpdateType.Stop:
            case SoundDataUpdateType.Pause:
            case SoundDataUpdateType.Resume:
                return { type };
            case SoundDataUpdateType.SetVolume:
                return { type, volume: stream.readFloatLE() };
            case SoundDataUpdateType.SetPitch:
                return { type, pitch: stream.readFloatLE() };
            case SoundDataUpdateType.Fade:
                return { type, duration: stream.readFloatLE(), targetVolume: stream.readFloatLE() };
            case SoundDataUpdateType.SeekTo:
                return { type, seconds: stream.readFloatLE() };
            default:
                throw new Error(`Unknown sound data update alternative ${type}`);
        }
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundUpdateSoundData): void {
        stream.writeUnsignedLongLE(data.serverSoundHandle);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.stop);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.setVolume);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.setPitch);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.fade);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.seekTo);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.pause);
        ClientboundUpdateSoundDataPacket.writeUpdate(stream, data.resume);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundUpdateSoundData {
        return {
            serverSoundHandle: stream.readUnsignedLongLE(),
            stop: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            setVolume: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            setPitch: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            fade: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            seekTo: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            pause: ClientboundUpdateSoundDataPacket.readUpdate(stream),
            resume: ClientboundUpdateSoundDataPacket.readUpdate(stream)
        };
    }
}
