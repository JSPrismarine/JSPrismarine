import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import type { SealedTick } from './changelog/ChangeLog';
import type { ShownActor } from './ShownActor';

/**
 * How loud and how high a named sound plays, when the definition's own values are not wanted.
 *
 * Vanilla varies a few throws this way: the eye of ender leaves the hand at half volume and a
 * low random pitch, which is what tells it apart from a bow.
 */
export interface NamedSoundOptions {
    /** A multiplier on the definition's volume; one leaves it as written. */
    readonly volume?: number;
    /** A multiplier on the definition's pitch; one leaves it as written. */
    readonly pitch?: number;
}

/**
 * Where a world reports what just happened in it.
 *
 * The world's one outward-facing seam. Half of what has to reach a client is not state at all:
 * a sound, a burst of particles, a block cracking are transient facts that are gone by the end
 * of the tick, so nothing downstream could recover them by looking at the world afterwards. The
 * world logs them as occurrences in its change log, and the sink reads them from each sealed
 * tick with the block changes, so an occurrence made in a unit that throws is never sent.
 *
 * What it must not do is say them in packets. Every method here is a fact about the world -
 * a block is now this, an entity moved - and turning that into bytes, deciding who is near
 * enough to receive it and putting it on a connection is the network layer's business. That
 * is what `NetworkWorldReplicator` is.
 *
 * The one-off facts are synchronous: they are notifications, not requests, and a world that
 * has just changed a block is not waiting to hear whether the news went out. The tick-phase
 * methods at the bottom are awaited, because the order the tick runs them in is a correctness
 * guarantee - an entity that came into range has to be spawned before the first packet that
 * says it moved.
 */
export interface WorldChangeSink {
    /**
     * One tick of the world's change log, sealed
     * ([ADR 0016](../../../../docs/adr/0016-replication-reads-the-change-log.md)). Its block and
     * block entity entries are what the world's content became, and the only way blocks reach
     * clients. Its occurrences, such as sounds, particles and actor events, are the only way
     * those reach clients, and go out by {@link WorldChangeSink.flushOccurrences}.
     *
     * Read, not sent: the block changes go on the wire once, by
     * {@link WorldChangeSink.flushBlockChanges}, the same treatment {@link entityMoved} gets and
     * for the same reason. A flood or a collapse changes thousands of blocks in one tick, and a
     * packet each is a compression pass each. The block entity changes go out by
     * {@link WorldChangeSink.flushBlockEntities}, which runs after it. That order is a
     * correctness guarantee rather than an economy: a client drops a block entity update for a
     * position it has no block entity at, so the block has to be announced first.
     *
     * A tick whose flush never ran, because the tick threw or the world was not updated, is
     * sent with the next flush.
     * @param {SealedTick} sealed - The tick's entries.
     */
    tickSealed(sealed: SealedTick): void;

    /**
     * A chunk entered the world, with the block entities it arrived with. The log names a chunk
     * that enters and does not carry it, so a reader that keeps block entities takes them here,
     * and the log's entries change them from then on.
     * @param {number} x - The chunk's x, in chunks.
     * @param {number} z - The chunk's z, in chunks.
     * @param {Iterable<NBTTagCompound>} blockEntities - Its block entities as it serializes them,
     *   produced as they are iterated, and only valid during the call.
     */
    chunkEntered(x: number, z: number, blockEntities: Iterable<NBTTagCompound>): void;

    /**
     * A chunk left the world.
     * @param {number} x - The chunk's x, in chunks.
     * @param {number} z - The chunk's z, in chunks.
     */
    chunkLeft(x: number, z: number): void;

    /**
     * An entity's attributes are not what they were - which in practice means it lost health.
     *
     * Attributes used to reach a client exactly once, inside the packet that spawned the entity,
     * because the only code that sent them had the local player's runtime id written into it. So
     * a mob's health could fall all the way to zero on the server with nothing said about it, and
     * the bar over a hurt zombie never moved until it abruptly died.
     * @param {ShownActor} entity - Whose attributes changed.
     * @param {Attribute[]} attributes - Only the ones that changed.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    entityAttributesChanged(entity: ShownActor, attributes: Attribute[]): Promise<void>;

    /**
     * An entity's active effect was added, refreshed, or removed.
     * @param {ShownActor} entity - The affected actor.
     * @param {StatusEffect} effect - The effect state that changed.
     * @param {StatusEffectChange} change - What happened to the effect.
     * @returns {Promise<void>} Resolves once the change is on its way.
     */
    statusEffectChanged?(entity: ShownActor, effect: StatusEffect, change: StatusEffectChange): Promise<void>;

    /**
     * An entity now looks different: alight, swelling, sneaking.
     *
     * The other half of {@link entityAttributesChanged}, and missing for the same reason. Sent
     * whole rather than as a diff, because the packet carries the entity's whole metadata anyway.
     * @param {ShownActor} entity - Who changed.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    entityMetadataChanged(entity: ShownActor): Promise<void>;

    /**
     * An entity is holding or wearing something other than what it was.
     *
     * Only for an entity a client already has: `AddActorPacket` has no room for equipment, so
     * the spawn path sends it itself and this covers everything afterwards. Before it existed,
     * nothing did - a mob's equipment was written once, at the spawn, and a villager's trade
     * offer and an enderman's carried block reached no client at all.
     *
     * Sent rather than recorded, which is the opposite of a block entity change and right
     * for the opposite reason. A batched flush earns its keep where many changes share a tick,
     * and equipment changes a handful of times in a mob's life: the guard that matters is the
     * one in `entity/data/storeActors.ts`, which drops a write whose bytes match what the actor
     * last showed, so an unchanged mob produces nothing to batch in the first place.
     * @param {ShownActor} entity - Whose equipment changed.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    entityEquipmentChanged(entity: ShownActor): Promise<void>;

    /**
     * An entity is now in this world.
     * @param {ShownActor} entity - The arrival. Already in the world's maps when this is called.
     * @returns {Promise<void>} Resolves once everyone who should see it has been told.
     */
    entityAdded(entity: ShownActor): Promise<void>;

    /**
     * An entity is no longer in this world.
     * @param {ShownActor} entity - The departure. Already out of the world's maps when this is
     * called, so that a leaving player is not among the clients told about its own departure.
     * @returns {Promise<void>} Resolves once everyone has been told.
     */
    entityRemoved(entity: ShownActor): Promise<void>;

    /**
     * An entity has moved.
     *
     * The hottest path in the server: every entity, every tick it moves. Recorded rather than
     * sent, and put on the wire once by {@link WorldChangeSink.flushMovement}.
     * @param {ShownActor} entity - The entity that moved.
     */
    entityMoved(entity: ShownActor, teleport?: boolean): void;

    /**
     * The world's clock has been read for broadcasting.
     * @param {number} ticks - The world's time of day.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    timeChanged(ticks: number): Promise<void>;

    /**
     * A game rule now has a different value, or may now be changed by a player when it could
     * not be before.
     * @param {string} name - The rule's name, spelled as the client spells it.
     * @param {boolean | number} value - What it is now.
     * @param {boolean} editable - Whether a player may change it from the settings screen.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    gameRuleChanged(name: string, value: boolean | number, editable: boolean): Promise<void>;

    /**
     * Tick phase: bring everyone's idea of what is visible in line with where things now are.
     *
     * Runs after everything has moved and before the movement goes out, so that an entity that
     * came into range this tick is spawned before the first packet that says it moved.
     * @param {ShownActor[]} entities - Everything currently in the world.
     * @returns {Promise<void>} Resolves once the pass is done.
     */
    reconcile(entities: readonly ShownActor[]): Promise<void>;

    /**
     * Tick phase: send the occurrences of the ticks read since the last flush, such as sounds,
     * particles and actor events, in the order the log holds them.
     *
     * Runs first, so a block's break particles still reach a client ahead of the block change,
     * as they did when they were sent the moment they happened.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    flushOccurrences(): Promise<void>;

    /**
     * Tick phase: send each player's client what the ticks read since the last flush changed in
     * its own view and that nothing else sends it: the offers of a trader it trades with, after
     * a `merchant` entry, and each slot a `slot-shown` occurrence names.
     *
     * Runs after {@link WorldChangeSink.flushOccurrences}, as close to the input that made the
     * change as a send after the seal can be.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    flushOwnerViews(): Promise<void>;

    /**
     * Tick phase: send the block changes this tick produced, as one batch each.
     * @returns {Promise<void>} Resolves once the batches are framed.
     */
    flushBlockChanges(): Promise<void>;

    /**
     * Tick phase: send the block entity changes this tick produced, one packet per position.
     *
     * Runs after {@link WorldChangeSink.flushBlockChanges} so that a block entity placed and
     * filled in the same tick is announced as a block before it is announced as a block
     * entity - see {@link WorldChangeSink.tickSealed}.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    flushBlockEntities(): Promise<void>;

    /**
     * Tick phase: send the movement this tick produced, as one batch each.
     * @returns {Promise<void>} Resolves once the batches are framed.
     */
    flushMovement(): Promise<void>;
}

/**
 * A sink that drops everything, which is what a world with nobody connected to it needs.
 *
 * The default, so that a `World` is runnable - and testable - with no network layer anywhere
 * near it. A world built in a unit test does not have to be handed a replicator to be able
 * to place a block.
 */
export const NULL_WORLD_CHANGE_SINK: WorldChangeSink = {
    tickSealed: () => {},
    chunkEntered: () => {},
    chunkLeft: () => {},
    entityAttributesChanged: async () => {},
    statusEffectChanged: async () => {},
    entityMetadataChanged: async () => {},
    entityEquipmentChanged: async () => {},
    entityAdded: async () => {},
    entityRemoved: async () => {},
    entityMoved: () => {},
    timeChanged: async () => {},
    gameRuleChanged: async () => {},
    reconcile: async () => {},
    flushOccurrences: async () => {},
    flushOwnerViews: async () => {},
    flushBlockChanges: async () => {},
    flushBlockEntities: async () => {},
    flushMovement: async () => {}
};
