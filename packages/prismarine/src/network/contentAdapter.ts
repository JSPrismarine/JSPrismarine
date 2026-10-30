/**
 * The `effects` group of `ServerWorldAdapter`, as the network subsystem owes
 * it.
 *
 * Two of its three members are packets and nothing else: a content package
 * names a sound or a particle, and the only thing the server does with that
 * name is put it on the connections of the players near enough to notice. The
 * third, `emitGameEvent`, has no Bedrock packet at all, so it goes to a
 * listener the host supplies; see {@link ContentEffectsOptions.onGameEvent}.
 *
 * It is a factory rather than a wired-in object because the composition root
 * assembles the four subsystems' groups into one adapter; this module only
 * knows how to build its own.
 */
import { Vector3 } from '@jsprismarine/math';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import { SOUND_RADIUS, WORLD_EVENT_RADIUS } from '../world/Proximity';
import type { ContentEffectSink, ContentPosition } from '../content/world/adapter';
import PlaySoundPacket from './packet/PlaySoundPacket';
import SpawnParticleEffectPacket from './packet/SpawnParticleEffectPacket';

/**
 * Who hears one dimension's effects.
 *
 * One method, because every effect this group plays is "send these bytes to
 * whoever is near here", and a port that narrow is what lets the three
 * members below be tested against a list.
 * {@link replicatorEffectAudience} builds one over the real replicator.
 */
export interface ContentEffectAudience {
    /** The dimension id `SpawnParticleEffectPacket` names. */
    readonly dimension: number;
    /**
     * Sends one packet to the players within `radius` blocks of a position.
     *
     * @param radius - A cap in blocks, tighter than a recipient's view distance.
     */
    near(position: ContentPosition, packet: NetworkPacket<unknown>, radius: number): void;
}

/** A game event one content package emitted, as {@link ContentEffectsOptions.onGameEvent} sees it. */
export interface ContentGameEvent {
    /** The Java game event identifier, such as `minecraft:block_open`. */
    readonly event: string;
    readonly at: ContentPosition;
    /** The runtime id of the entity that caused it, when one did. */
    readonly sourceId?: number;
}

/** What {@link createContentEffectsGroup} is built over. */
export interface ContentEffectsOptions {
    readonly audience: ContentEffectAudience;
    /**
     * Where a game event goes.
     *
     * Bedrock has no game event packet. The prismarine host hands events to its
     * server-side vibration listeners, so this group has nothing to send. A
     * caller that leaves this callback out drops the event.
     */
    readonly onGameEvent?: (event: ContentGameEvent) => void;
}

/** Where a sound or particle is placed: the middle of the block, not its corner. */
const centerOf = (at: ContentPosition): Vector3 => new Vector3(at.x + 0.5, at.y + 0.5, at.z + 0.5);

/**
 * Builds the `effects` group of one dimension.
 *
 * @returns The three members `ContentEffectSink` declares.
 */
export const createContentEffectsGroup = ({ audience, onGameEvent }: ContentEffectsOptions): ContentEffectSink => ({
    /**
     * Plays a sound by name.
     *
     * `PlaySoundPacket` rather than `LevelSoundEventPacket`, because a
     * content package names a sound the way a resource pack spells it and
     * the level sound event takes a number out of a fixed client enum. A
     * name the client has no definition for plays nothing.
     */
    playSound(at, sound) {
        const packet = new PlaySoundPacket();
        packet.name = sound;
        // The packet's position is whole blocks times eight, so the eighths
        // it writes already place the sound in the middle of the block.
        packet.position = centerOf(at);
        audience.near(at, packet, SOUND_RADIUS);
    },

    /**
     * Spawns a named particle effect.
     *
     * The effect stands on its own rather than hanging off an actor, so the
     * actor id stays -1 and the position is absolute.
     */
    spawnParticle(at, particle) {
        const packet = new SpawnParticleEffectPacket();
        packet.dimensionId = audience.dimension;
        packet.effectName = particle;
        packet.position = centerOf(at);
        audience.near(at, packet, WORLD_EVENT_RADIUS);
    },

    /** Hands a game event to the host; see {@link ContentEffectsOptions.onGameEvent}. */
    emitGameEvent(event, at, sourceId) {
        onGameEvent?.(sourceId === undefined ? { event, at } : { event, at, sourceId });
    }
});

/** What {@link replicatorEffectAudience} needs of `NetworkWorldReplicator`. */
export interface EffectReplicator {
    sendAround(position: Vector3, packet: NetworkPacket<unknown>, options?: { radius?: number }): void;
}

/**
 * Presents one world's replicator as a {@link ContentEffectAudience}.
 *
 * The replicator already owns the "who is near enough to care" question for
 * every other broadcast the server makes, so the content effects ask it the
 * same way rather than resolving an audience of their own.
 *
 * @param dimension - The dimension id of the world the replicator serves.
 */
export const replicatorEffectAudience = (replicator: EffectReplicator, dimension: number): ContentEffectAudience => ({
    dimension,
    near(position, packet, radius) {
        replicator.sendAround(new Vector3(position.x, position.y, position.z), packet, { radius });
    }
});
