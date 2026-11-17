/**
 * `ClientboundUpdateSoundDataPacket`: changes a sound the client is already playing.
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
 * Protocol 2225 (1.26.60) collapses the seven slots into a single `Event` field and adds a
 * `Type` byte (`SoundDataEventType`, a uint8) to every alternative, ahead of the alternative's
 * own fields. The page does not print the `oneOf` selector, so `Event` keeps the varuint32
 * selector of 2193 and the `Type` byte follows it; the two carry the same value, as the
 * selector and the type do in `PlayerLocationPacket`. No capture of this packet exists, so the
 * selector's presence at 2225 is not backed by bytes.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-update-sound-data-packet/
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type BinaryStream from '@jsprismarine/binaryutils';
import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

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

/** Changes the playback volume of the sound identified by its server handle. */
export interface SoundDataSetVolume {
    type: SoundDataUpdateType.SetVolume;
    /** `Volume`. */
    volume: number;
}

/** Changes the playback pitch of the sound identified by its server handle. */
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

/** A stop, volume, pitch, fade, seek, pause, or resume operation for a playing sound. */
export type SoundDataUpdate =
    SoundDataSignal | SoundDataSetVolume | SoundDataSetPitch | SoundDataFade | SoundDataSeekTo;

/**
 * Writes one update: the varuint32 alternative index, the `Type` byte when `withTypeByte` is
 * set, then the alternative's little-endian float32 fields.
 */
const writeUpdate = (stream: BinaryStream, update: SoundDataUpdate, withTypeByte: boolean): void => {
    stream.writeUnsignedVarInt(update.type);
    if (withTypeByte) stream.writeByte(update.type);
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
};

/**
 * Reads one update written by {@link writeUpdate}. Throws when the index names none of the seven
 * alternatives, or when the `Type` byte disagrees with the index.
 */
const readUpdate = (stream: BinaryStream, withTypeByte: boolean): SoundDataUpdate => {
    const type: SoundDataUpdateType = stream.readUnsignedVarInt();
    if (withTypeByte) {
        const tag = stream.readByte();
        if (tag !== type) throw new ProtocolWireErrors.SoundDataTypeMismatch({ type, tag });
    }
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
            throw new ProtocolWireErrors.UnknownSoundDataUpdateAlternative({ type });
    }
};

/**
 * One update slot at protocol 2193: a varuint32 alternative index, then that alternative's
 * little-endian float32 fields. It depends on the index, which the vocabulary cannot express,
 * so it is custom.
 */
const soundDataSlot = t.custom<SoundDataUpdate>(
    'SoundDataUpdate',
    (stream, update) => writeUpdate(stream, update, false),
    (stream) => readUpdate(stream, false)
);

/**
 * `Event` at protocol 2225: the alternative index, the `Type` byte, then the alternative's
 * little-endian float32 fields.
 */
const soundDataEvent = t.custom<SoundDataUpdate>(
    'SoundDataEvent',
    (stream, update) => writeUpdate(stream, update, true),
    (stream) => readUpdate(stream, true)
);

/** What a slot holds at protocol 2225, where the seven slots are not on the wire. */
const NO_SLOT: SoundDataUpdate = { type: SoundDataUpdateType.Stop };

/** The sound handle and the update that changes active playback. */
export const clientboundUpdateSoundDataPacket = definePacket('ClientboundUpdateSoundDataPacket', {
    /** `Server Sound Handle`: the `ServerSoundHandle` a `PlaySoundPacket` or `RecordStartedPacket` gave the sound. */
    serverSoundHandle: t.lu64,
    /** `Stop`, the first update slot. On the wire up to protocol 2193. */
    stop: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `SetVolume`, the second update slot. On the wire up to protocol 2193. */
    setVolume: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `SetPitch`, the third update slot. On the wire up to protocol 2193. */
    setPitch: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `Fade`, the fourth update slot. On the wire up to protocol 2193. */
    fade: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `SeekTo`, the fifth update slot. On the wire up to protocol 2193. */
    seekTo: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `Pause`, the sixth update slot. On the wire up to protocol 2193. */
    pause: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `Resume`, the seventh and last update slot. On the wire up to protocol 2193. */
    resume: gated(UNTIL_2225, soundDataSlot, NO_SLOT),
    /** `Event`: the update to apply, replacing the seven slots from protocol 2225. */
    event: gated(SINCE_2225, soundDataEvent, NO_SLOT)
});

/** Payload carried by `ClientboundUpdateSoundDataPacket`. */
export type ClientboundUpdateSoundDataPayload = PayloadOf<typeof clientboundUpdateSoundDataPacket>;
