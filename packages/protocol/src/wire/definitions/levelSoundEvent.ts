/**
 * Sound playback packets for named audio, world sound events, and stopping active sounds.
 * `PlaySoundPacket` names an audio resource and position, `LevelSoundEventPacket` describes an
 * event such as a block break or mob step, and `StopSoundPacket` cancels playback by name.
 * Field names and order follow each packet's docs page.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/play-sound-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-sound-event-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/stop-sound-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { Vec3Like } from '../fieldTypes';

/** `PlaySoundPacket` position: signed coordinates measured in eighths of a block on the wire. */
const soundPosition = t.custom<Vec3Like>(
    'BlockPos in eighths',
    (stream, position) => {
        stream.writeVarInt(Math.floor(position.x * 8));
        stream.writeVarInt(Math.floor(position.y * 8));
        stream.writeVarInt(Math.floor(position.z * 8));
    },
    (stream) => ({
        x: Math.floor(stream.readVarInt() / 8),
        y: Math.floor(stream.readVarInt() / 8),
        z: Math.floor(stream.readVarInt() / 8)
    })
);

/**
 * The `PlaySoundPacket` field list.
 *
 * The position is a block coordinate triple multiplied by eight before writing. This lets the
 * packet place sound at eighth-block precision, but decoding floors the values back to blocks.
 */
export const playSoundPacket = definePacket('PlaySoundPacket', {
    /** `Name`: the sound definition the client plays. */
    name: t.string,
    /** `Position`: block coordinates encoded in eighths. */
    position: soundPosition,
    /** `Volume`: playback volume as a little-endian float. */
    volume: t.lf32,
    /** `Pitch`: playback pitch as a little-endian float. */
    pitch: t.lf32,
    /** `Loop Count`: -1 plays once; other values control looping. */
    loopCount: t.varint32,
    /** `Bypass Listener Range Check`: whether listeners outside normal range hear the sound. */
    bypassListenerRangeCheck: t.bool,
    /** `Server Sound Handle`: optional little-endian uint64 for a later stop request. */
    soundHandle: t.optional(t.lu64),
    /** `Playback Position Seconds`: optional starting point inside the sound. */
    playbackPositionSeconds: t.optional(t.lf32)
});

/** Plays a named sound at a position with volume, pitch, and optional playback controls. */
export type PlaySoundPacketPayload = PayloadOf<typeof playSoundPacket>;

/**
 * The `LevelSoundEventPacket` field list.
 *
 * `Sound Event` is the tagged `SoundEventIdentifier` variant Mojang's 1.26.51 notes describe,
 * either a `LevelSoundEvent` member or a free sound name. The metadata types it as one string
 * and nothing precedes it: the enum member travels as its name (`step`, `break`), so a reader
 * cannot tell the two alternatives apart and does not need to.
 *
 * The docs page types `Fire At Position` as a plain `Vec3` at 2193 and records the optional
 * from 2207 on. Clients have read a presence byte there since 1.21.70, gophertunnel and
 * PocketMine both write one, and the 2207 entry is the metadata catching up. A bare `Vec3`
 * here would hand the client eleven bytes it does not expect.
 */
export const levelSoundEventPacket = definePacket('LevelSoundEventPacket', {
    /** `Sound Event` as its name on the wire. */
    soundName: t.string,
    /** `Position`: where the sound plays. */
    position: t.vec3,
    /** `Data`: whatever the sound needs, such as a block's runtime id for a break. */
    extraData: t.varint32,
    /** `Actor Identifier`: the entity type making the sound, empty for the world's own. */
    entityType: t.string,
    /** `Is Baby`: whether the mob making it is a baby, which raises its pitch. */
    isBabyMob: t.bool,
    /** `Is Global`: play it at full volume wherever the listener is. */
    disableRelativeVolume: t.bool,
    /** `Actor Unique Id`: a little-endian int64, not a varint. -1 for the world's own. */
    entityUniqueId: t.li64,
    /** `Fire At Position`: where a projectile sound was fired from, behind a presence byte. */
    fireAtPosition: t.optional(t.vec3)
});

/**
 * The `StopSoundPacket` field list: stops a sound that is still playing, such as a music disc.
 *
 * A client that is not playing the named sound ignores the packet. With `Stop All Sounds?`
 * set the name may be empty.
 */
export const stopSoundPacket = definePacket('StopSoundPacket', {
    /** `Sound Name`: which sound to stop. */
    soundName: t.string,
    /** `Stop All Sounds?`: stops everything the client is playing, whatever the name says. */
    stopAllSounds: t.bool,
    /** `Stop Music (Legacy)`: the older music-only stop, kept for clients that still read it. */
    stopMusicLegacy: t.bool
});

/** Stops a named sound, all sounds, or legacy music playback on the client. */
export type StopSoundPayload = PayloadOf<typeof stopSoundPacket>;
