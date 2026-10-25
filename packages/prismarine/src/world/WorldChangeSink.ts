import type { Vector3 } from '@jsprismarine/math';
import type { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { Attribute } from '../entity/Attribute';
import type { Entity } from '../entity/Entity';
// TODO: `ActorEvent` belongs beside `LevelEvent` and `LevelSoundEvent` in
// `@jsprismarine/minecraft`. It is the same kind of thing - a protocol constant - and is only
// declared next to the packet that carries it, which is why the world has to reach into the
// network layer for a type it otherwise has no business knowing.
import type { ActorEvent } from '../network/packet/ActorEventPacket';

/**
 * Where a world reports what just happened in it.
 *
 * The world's one outward-facing seam. It exists because half of what has to reach a client
 * is not state at all: a sound, a burst of particles, a block cracking are transient facts
 * that are gone by the end of the tick, so nothing downstream could recover them by looking
 * at the world afterwards. The world has to say them out loud.
 *
 * What it must not do is say them in packets. Every method here is a fact about the world -
 * a block is now this, a sound happened there - and turning that into bytes, deciding who is
 * near enough to receive it and putting it on a connection is the network layer's business.
 * That is what `NetworkWorldReplicator` is.
 *
 * The one-off facts are synchronous: they are notifications, not requests, and a world that
 * has just changed a block is not waiting to hear whether the news went out. The tick-phase
 * methods at the bottom are awaited, because the order the tick runs them in is a correctness
 * guarantee - an entity that came into range has to be spawned before the first packet that
 * says it moved.
 */
export interface WorldChangeSink {
    /**
     * A block is now something other than what it was.
     *
     * Recorded rather than sent, and put on the wire once by
     * {@link WorldChangeSink.flushBlockChanges} - the same treatment {@link entityMoved} gets, and
     * for the same reason. A flood or a collapse changes thousands of blocks in one tick, and a
     * packet each is a compression pass each.
     * @param {Vector3} position - Where the block is.
     * @param {number} blockRuntimeId - What it is now.
     */
    blockChanged(position: Vector3, blockRuntimeId: number): void;

    /**
     * A block entity's data is not what it was: a sign's text, a chest's contents, a
     * lectern's page, a flower pot's plant.
     *
     * A chunk carries its block entities in its own payload, so this covers the changes made
     * after a client already has the chunk - which, before it existed, reached nobody at all.
     *
     * Recorded rather than sent, and put on the wire by
     * {@link WorldChangeSink.flushBlockEntities}, which runs after
     * {@link WorldChangeSink.flushBlockChanges}. The order is a correctness guarantee rather
     * than an economy: a client drops a block entity update for a position it has no block
     * entity at, so the block has to be announced first.
     * @param {Vector3} position - The block the block entity sits in.
     * @param {NBTTagCompound} tags - Its complete data, as the chunk would serialize it.
     */
    blockEntityChanged(position: Vector3, tags: NBTTagCompound): void;

    /**
     * A block made a noise - it was placed, or broken.
     * @param {Vector3} position - Where it happened, at the center of the block.
     * @param {LevelSoundEvent} sound - Which noise.
     * @param {number} blockRuntimeId - The block that made it.
     */
    blockSound(position: Vector3, sound: LevelSoundEvent, blockRuntimeId: number): void;

    /**
     * A named sound played at a position.
     *
     * Separate from {@link blockSound} because the name is a string rather than a number. The
     * `LevelSoundEvent` enum covers a few dozen sounds; the engine systems and the block
     * behaviors name several hundred, `open.door` and `random.chestopen` among them, and
     * those travel as text.
     * @param {Vector3} position - Where the sound comes from, already centered in its block.
     * @param {string} name - The client sound definition's name.
     */
    namedSound(position: Vector3, name: string): void;

    /**
     * A named particle effect appeared at a position.
     *
     * The counterpart of {@link namedSound} for particles, and separate from
     * {@link worldEffect} for the same reason: the hardcoded effects are numbered, the ones a
     * behavior pack can name are not.
     * @param {Vector3} position - Where the effect appears, already centered in its block.
     * @param {string} name - The effect's identifier, such as `minecraft:crop_growth_emitter`.
     */
    namedParticle(position: Vector3, name: string): void;

    /**
     * Something cosmetic happened: particles, a splash, a break animation.
     * @param {Vector3 | null} position - Where, or null for the world as a whole.
     * @param {LevelEvent} effect - Which effect.
     * @param {number} data - Extra detail, for the effects that carry any.
     */
    worldEffect(position: Vector3 | null, effect: LevelEvent, data: number): void;

    /**
     * Something happened to one entity: it was hurt, it died, it swung an arm.
     * @param {Entity} entity - Who it happened to.
     * @param {ActorEvent} effect - What happened.
     * @param {number} data - Extra detail, for the effects that carry any.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    actorEffect(entity: Entity, effect: ActorEvent, data: number): Promise<void>;

    /**
     * An entity made a noise: it was hit, it died, it swung at something.
     *
     * Separate from {@link blockSound} because the wire format differs in a way that matters -
     * a mob's sound carries which mob is making it, so a client can pick the zombie's grunt over
     * the skeleton's rattle, where a block's carries the block's runtime id instead. Sent to
     * whoever is near enough rather than to whoever is tracking, because a sound is audible from
     * further than a mob is worth drawing.
     * @param {Entity} entity - Who made it.
     * @param {LevelSoundEvent} sound - Which noise.
     */
    actorSound(entity: Entity, sound: LevelSoundEvent): void;

    /**
     * An entity's attributes are not what they were - which in practice means it lost health.
     *
     * Attributes used to reach a client exactly once, inside the packet that spawned the entity,
     * because the only code that sent them had the local player's runtime id written into it. So
     * a mob's health could fall all the way to zero on the server with nothing said about it, and
     * the bar over a hurt zombie never moved until it abruptly died.
     * @param {Entity} entity - Whose attributes changed.
     * @param {Attribute[]} attributes - Only the ones that changed.
     * @returns {Promise<void>} Resolves once they are on their way.
     */
    entityAttributesChanged(entity: Entity, attributes: Attribute[]): Promise<void>;

    /**
     * An entity now looks different: alight, swelling, sneaking.
     *
     * The other half of {@link entityAttributesChanged}, and missing for the same reason. Sent
     * whole rather than as a diff, because the packet carries the entity's whole metadata anyway.
     * @param {Entity} entity - Who changed.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    entityMetadataChanged(entity: Entity): Promise<void>;

    /**
     * An entity is holding or wearing something other than what it was.
     *
     * Only for an entity a client already has: `AddActorPacket` has no room for equipment, so
     * the spawn path sends it itself and this covers everything afterwards. Before it existed,
     * nothing did - a mob's equipment was written once, at the spawn, and a villager's trade
     * offer and an enderman's carried block reached no client at all.
     *
     * Sent rather than recorded, which is the opposite of {@link blockEntityChanged} and right
     * for the opposite reason. A batched flush earns its keep where many changes share a tick,
     * and equipment changes a handful of times in a mob's life: the guard that matters is the
     * one in `entity/data/liveBodies.ts`, which drops a write whose bytes match what the body
     * already carries, so an unchanged mob produces nothing to batch in the first place.
     * @param {Entity} entity - Whose equipment changed.
     * @returns {Promise<void>} Resolves once it is on its way.
     */
    entityEquipmentChanged(entity: Entity): Promise<void>;

    /**
     * An entity is now in this world.
     * @param {Entity} entity - The arrival. Already in the world's maps when this is called.
     * @returns {Promise<void>} Resolves once everyone who should see it has been told.
     */
    entityAdded(entity: Entity): Promise<void>;

    /**
     * An entity is no longer in this world.
     * @param {Entity} entity - The departure. Already out of the world's maps when this is
     * called, so that a leaving player is not among the clients told about its own departure.
     * @returns {Promise<void>} Resolves once everyone has been told.
     */
    entityRemoved(entity: Entity): Promise<void>;

    /**
     * An entity has moved.
     *
     * The hottest path in the server: every entity, every tick it moves. Recorded rather than
     * sent, and put on the wire once by {@link WorldChangeSink.flushMovement}.
     * @param {Entity} entity - The entity that moved.
     */
    entityMoved(entity: Entity): void;

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
     * @param {Entity[]} entities - Everything currently in the world.
     * @returns {Promise<void>} Resolves once the pass is done.
     */
    reconcile(entities: Entity[]): Promise<void>;

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
     * entity - see {@link WorldChangeSink.blockEntityChanged}.
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
    blockChanged: () => {},
    blockEntityChanged: () => {},
    blockSound: () => {},
    namedSound: () => {},
    namedParticle: () => {},
    worldEffect: () => {},
    actorEffect: async () => {},
    actorSound: () => {},
    entityAttributesChanged: async () => {},
    entityMetadataChanged: async () => {},
    entityEquipmentChanged: async () => {},
    entityAdded: async () => {},
    entityRemoved: async () => {},
    entityMoved: () => {},
    timeChanged: async () => {},
    gameRuleChanged: async () => {},
    reconcile: async () => {},
    flushBlockChanges: async () => {},
    flushBlockEntities: async () => {},
    flushMovement: async () => {}
};
