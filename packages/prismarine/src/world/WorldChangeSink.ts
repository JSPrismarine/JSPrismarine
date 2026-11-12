import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import type { SealedTick } from './changelog/ChangeLog';
import type { ShownActor, ShownEntity } from './ShownActor';

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

    /**
     * An entity's active effect was added, refreshed, or removed.
     * @param {ShownActor} entity - The affected actor.
     * @param {StatusEffect} effect - The effect state that changed.
     * @param {StatusEffectChange} change - What happened to the effect.
     * @returns {Promise<void>} Resolves once the change is on its way.
     */
    statusEffectChanged?(entity: ShownActor, effect: StatusEffect, change: StatusEffectChange): Promise<void>;

    /**
     * A player's session moved its player, as a client's move or a teleport the server made.
     *
     * Recorded rather than sent, and put on the wire once by {@link WorldChangeSink.flushMovement}.
     * Every other move of an entity is read from the change log.
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
     * Tick phase: send what the sealed ticks did to the world's entities - which entered, and
     * the equipment, metadata and health of those whose fields they wrote - and queue their moves
     * for {@link WorldChangeSink.flushMovement} and their departures for
     * {@link WorldChangeSink.flushDepartures}. Runs after the seal, first of the sends, so an
     * entity that entered is shown before anything about it changes or happens to it.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    flushEntities(): Promise<void>;

    /**
     * Tick phase: take the entities that left off every client. Runs after
     * {@link WorldChangeSink.flushOccurrences}, so what happened to an entity in the tick it
     * left, such as the hurt flash of a killing blow, reaches the clients tracking it first.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    flushDepartures(): Promise<void>;

    /**
     * Tick phase: bring everyone's idea of what is visible in line with where things now are.
     *
     * Runs after {@link WorldChangeSink.flushEntities} and before the movement goes out, so that
     * an entity that came into range this tick is spawned before the first packet that says it
     * moved.
     * @returns {Promise<void>} Resolves once the pass is done.
     */
    reconcile(): Promise<void>;

    /**
     * Every entity of the world as tracking reads it, which a player's own pass shows from.
     * @returns The entities.
     */
    shownEntities(): readonly ShownEntity[];

    /**
     * Tick phase: send the occurrences of the ticks read since the last flush, such as sounds,
     * particles and actor events, in the order the log holds them.
     *
     * Runs after {@link WorldChangeSink.flushEntities} and ahead of the block changes, so a
     * block's break particles still reach a client ahead of the block change, as they did when
     * they were sent the moment they happened, and an event about an entity that entered reaches
     * a client that was just shown it.
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
    statusEffectChanged: async () => {},
    entityMoved: () => {},
    timeChanged: async () => {},
    gameRuleChanged: async () => {},
    flushEntities: async () => {},
    flushDepartures: async () => {},
    reconcile: async () => {},
    flushOccurrences: async () => {},
    flushOwnerViews: async () => {},
    shownEntities: () => [],
    flushBlockChanges: async () => {},
    flushBlockEntities: async () => {},
    flushMovement: async () => {}
};
