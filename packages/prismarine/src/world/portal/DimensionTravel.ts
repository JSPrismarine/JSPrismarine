/**
 * Where a trip through a portal lands, and what it builds on arrival.
 *
 * This is the server half of the portal note's section 6. {@link DimensionTravel.touch} is
 * what the world calls for every entity standing in a portal block, and opens the contact
 * timer on the entity. Once the timer runs out, the entity's `StoreActor.update` calls
 * {@link DimensionTravel.depart}, which files the trip as a message and prepares the destination
 * outside every tick. {@link DimensionTravel.admit}, part of the input step, lands each trip once
 * its destination is ready: it names the world, the feet position and the facing the traveler
 * arrives with, creating the arrival portal or the End platform when the rules say so, and
 * {@link DimensionTravel.transfer} moves the entity there, players through the client's
 * dimension change sequence on their session.
 *
 * Every rule is data from {@link PORTALS} and {@link DIMENSION_TRAVEL}; the geometry is
 * chunk 5's in `@jsprismarine/block-behaviors`, reached through the content world adapter of
 * the destination dimension, which is the same seam the portal family writes through.
 */
import { PORTAL_CREATION_RADIUS, portalAxisOf, writeEndPlatform } from '@jsprismarine/block-behaviors';
import type { PortalAxis } from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound } from '@jsprismarine/nbt';

import { dataEntityRecordOf, writeDataEntityRecord } from '../../entity/data/persistence';
import type { DataEntityRecord } from '../../entity/data/persistence';
import { ItemActor } from '../../entity/data/itemActor';
import type { StoreActor } from '../../entity/data/storeActors';
import { InertActor } from '../../entity/data/storeActors';
import { PLAYER_IDENTIFIER } from '../../entity/playerOverlay';
import { PORTAL_COOLDOWN_TICKS } from '../../entity/PortalContact';
import EntityPortalEnterEvent from '../../events/entity/EntityPortalEnterEvent';
import PlayerChangeDimensionEvent from '../../events/player/PlayerChangeDimensionEvent';
import type PlayerSession from '../../network/PlayerSession';
import type { Arrival } from '../../network/PlayerSession';
import type Server from '../../Server';
import { Dimensions } from '../DimensionType';
import { requestedSpawnPosition } from '../SpawnPlacement';
import type { Level } from '../Level';
import { outsideTick } from '../TickContext';
import type { World } from '../World';
import { createNetherPortal } from './create';
import { portalRuleOf, travelRuleOf } from './rules';
import { scalePosition } from './scale';
import type { BlockLookup, PortalRectangle, RelativePortalPosition, TravelerSize } from './search';
import { exitPosition, exitYaw, findExitPortal, portalRectangleAround, relativePosition } from './search';

/** The portal block an entity is standing in. */
export interface PortalBlockRef {
    /** The world the portal block is in. */
    readonly world: World;
    /** The portal block's position. */
    readonly position: Vector3;
    /** The portal block's identifier, such as `minecraft:portal`. */
    readonly block: string;
}

/** Where a portal trip lands, which is an {@link Arrival} plus what the trip built. */
export interface PortalArrival extends Arrival {
    /** True when the trip wrote a new nether portal to arrive in. */
    readonly createdPortal: boolean;
}

/**
 * Java's `ServerLevel.END_SPAWN_POINT`, `new BlockPos(100, 50, 0)`: where an end portal drops
 * everything that goes into the End.
 */
export const END_SPAWN_POINT = { x: 100, y: 50, z: 0 } as const;

/**
 * Java's `Direction.WEST.toYRot()`: the yaw a traveler faces on arriving in the End. Bedrock
 * counts yaw the same way, 0 south and 90 west.
 */
export const END_ARRIVAL_YAW = 90;

/** How far past the 5 by 5 platform the chunks around the End spawn are loaded. */
const END_PLATFORM_HALF_SIDE = 2;

/** `BlockPos.containing(bottomCenter).below()`: the platform's air starts at y 49 and its obsidian at 48. */
const END_PLATFORM_CENTER = { ...END_SPAWN_POINT, y: END_SPAWN_POINT.y - 1 } as const;

/**
 * How many blocks past the creation radius a chunk may be written in: Java's frame extends
 * from -1 to 2 along the axis (`FRAME_BOX_START`, `FRAME_BOX_END`) and the forced platform
 * two blocks to each side across it.
 */
const CREATION_WRITE_MARGIN = 3;

/** What every trip carries from its source world, whatever the portal. */
interface RouteBase {
    /** The stem the trip goes to. */
    readonly to: string;
    /** Whether the traveler is a player, who builds a portal to arrive in and stands lower in the End. */
    readonly player: boolean;
    /** The traveler's facing as it stepped in. */
    readonly yaw: number;
    readonly pitch: number;
}

/** A trip through a nether portal, which keeps the traveler's place in the portal. */
interface NetherRoute extends RouteBase {
    readonly kind: 'nether';
    /** The traveler's feet scaled into the destination, where the search and a new portal center. */
    readonly target: Vector3;
    readonly relative: RelativePortalPosition;
    readonly size: TravelerSize;
    /** The axis of the portal the traveler left through. */
    readonly axis: PortalAxis;
    readonly searchRadius: number;
}

/** A trip through an end portal, into the End or out of it. */
interface EndRoute extends RouteBase {
    readonly kind: 'enter-end' | 'leave-end';
}

/** Where a trip goes, planned in the source world's tick. */
type TripRoute = NetherRoute | EndRoute;

/** A trip filed in a source world's tick and waiting for an input step to land it. */
interface PortalTrip {
    /** The world the traveler leaves. */
    readonly from: World;
    /** The traveler's runtime id in {@link PortalTrip.from}. */
    readonly entity: bigint;
    readonly route: TripRoute;
    /** The preparation of the destination running for this trip, if one is. */
    preparing: Promise<void> | undefined;
    /** Who holds the chunk ticket on the arrival chunks until the trip lands or is dropped. */
    readonly ticket: string;
    /**
     * Whether the trip landed or was dropped. A preparation still running then takes no ticket:
     * the trip that would release it is gone.
     */
    released: boolean;
    /**
     * The player whose respawn search a trip out of the End waits for, which holds a ticket in
     * the player's name until it answers.
     */
    respawnFor: PlayerSession | undefined;
}

/** What a ready trip's arrival says while the arrival still waits, such as for a respawn search. */
const WAITING = 'waiting';

/**
 * Where a player's move goes, which may need its world built or its spawn found before the input
 * step can carry the move out.
 */
export interface MoveTarget {
    /** The arrival once the move can land without waiting, or undefined while it cannot. */
    ready(): Arrival | undefined;
    /** Starts what {@link MoveTarget.ready} waits for, outside every tick. */
    prepare(): Promise<void>;
}

/** A move to a world that is already built, with nothing to prepare. */
export const arrivalTarget = (arrival: Arrival): MoveTarget => ({
    ready: () => arrival,
    prepare: async () => {}
});

/**
 * A move into a level's world of one stem, which is built outside every tick when nobody has
 * entered it yet.
 *
 * @param place - The feet position and facing in the world, once it is built.
 */
export const stemTarget = (level: Level, stemId: string, place: Omit<Arrival, 'world'>): MoveTarget => ({
    ready: () => {
        const world = level.readyWorld(stemId);
        return world === undefined ? undefined : { ...place, world };
    },
    prepare: async () => level.prepareWorld(stemId)
});

/**
 * A move to a world's spawn, where a joining player's feet go before the terrain is consulted
 * ({@link requestedSpawnPosition}). A world that has not found its spawn searches for it outside
 * every tick.
 */
export const spawnTarget = (world: World, facing: Pick<Arrival, 'yaw' | 'pitch'>): MoveTarget => ({
    ready: () => {
        const spawn = world.getKnownSpawnPosition();
        return spawn === null ? undefined : { ...facing, world, position: requestedSpawnPosition(spawn) };
    },
    prepare: async () => outsideTick(async () => void (await world.getSpawnPosition()))
});

/** A player's move to another world, filed by code that cannot wait for the change. */
interface WorldMove {
    readonly session: PlayerSession;
    readonly target: MoveTarget;
    /** What follows the change, in the same input step. */
    readonly then: () => void;
    /** The preparation of the target running for this move, if one is. */
    preparing: Promise<void> | undefined;
}

/** Every chunk within `radius` blocks of a position on x and z, as chunk coordinates. */
const chunksAround = (
    center: { readonly x: number; readonly z: number },
    radius: number
): { x: number; z: number }[] => {
    const chunks: { x: number; z: number }[] = [];
    for (let cx = Math.floor(center.x - radius) >> 4; cx <= Math.floor(center.x + radius) >> 4; cx += 1) {
        for (let cz = Math.floor(center.z - radius) >> 4; cz <= Math.floor(center.z + radius) >> 4; cz += 1)
            chunks.push({ x: cx, z: cz });
    }
    return chunks;
};

/**
 * The chunks a trip's arrival reads and writes: those a nether portal would be created in, which
 * also brings any portal already standing in them into the index, and those around the End
 * platform. A trip out of the End needs none of its own: the respawn search, or the search for
 * the world's spawn, waits for what it reads.
 */
const chunksOf = (route: TripRoute): { x: number; z: number }[] => {
    if (route.kind === 'nether')
        return chunksAround(
            { x: route.target.getX(), z: route.target.getZ() },
            PORTAL_CREATION_RADIUS + CREATION_WRITE_MARGIN
        );
    if (route.kind === 'enter-end') return chunksAround(END_PLATFORM_CENTER, END_PLATFORM_HALF_SIDE);
    return [];
};

/** A block position from a vector, for the geometry that reads integers. */
const blockOf = (at: Vector3): BlockPosition => ({
    x: Math.floor(at.getX()),
    y: Math.floor(at.getY()),
    z: Math.floor(at.getZ())
});

/** Where the traveler's body starts: a player's position is its eyes, everything else's its feet. */
const feetOf = (entity: StoreActor): Vector3 => {
    const at = entity.getPosition();
    return new Vector3(at.getX(), entity.getFeetY(), at.getZ());
};

/** The session of a player, found by its entity id in its world; undefined for anything else. */
const sessionOf = (entity: StoreActor): PlayerSession | undefined => entity.getWorld().viewerOf(entity.getRuntimeId());

/** Whether an entity is a player, by its type, so a store player is one too. */
const isPlayer = (entity: StoreActor): boolean => entity.getType() === PLAYER_IDENTIFIER;

/**
 * Whether an entity is a player whose client has not yet closed the loading screen of its
 * last world change.
 *
 * Such a player is still ticked, standing in the arrival portal, and must not start another
 * trip: `PlayerSession.changeWorld` would refuse it, after the contact had already run.
 */
export const isMidDimensionChange = (entity: StoreActor): boolean =>
    sessionOf(entity)?.pendingDimensionChange() !== undefined;

/** The portal and End travel service of one server. */
export class DimensionTravel {
    /** The trips filed and not landed yet, in the order they started. */
    private trips: PortalTrip[] = [];
    /** The moves filed and not carried out yet, in the order they were filed. */
    private moves: WorldMove[] = [];
    /** The preparations running outside the ticks. */
    private readonly preparing = new Set<Promise<void>>();
    /** Numbers each trip's chunk ticket. */
    private nextTicket = 0;

    public constructor(private readonly server: Server) {}

    /**
     * Records that an entity's body overlaps a portal block on this tick.
     *
     * The world calls this once per tick per entity standing in a portal. The first touch
     * raises a cancelable `EntityPortalEnterEvent` and opens the entity's contact timer unless a
     * listener canceled it before returning, as a guard does (ADR 0013); later touches
     * keep it counting. A touch for an entity on portal cooldown raises nothing and winds the
     * cooldown back to its full length, as Java's `Entity.setAsInsidePortal`, so the arrival
     * portal cannot send it back until it has left and stepped back in. Nothing happens for an
     * entity that rides or carries another, which Bedrock refuses to send through
     * (MCPE-47288), or for a player whose client is still on the loading screen of the last
     * change.
     */
    public touch(entity: StoreActor, portal: PortalBlockRef): void {
        if (isMidDimensionChange(entity) || this.isDeparting(entity) || this.isInRide(entity)) return;

        if (!entity.isOnPortalCooldown() && entity.portalContact() === undefined) {
            const event = new EntityPortalEnterEvent(entity, portal);
            this.server.getKernel().events.post('entityPortalEnter', event);
            if (event.isCanceled()) return;
        }

        entity.touchPortal(feetOf(entity), portal);
    }

    /**
     * Moves an entity to where a trip resolved to, and starts its portal cooldown so the
     * arrival portal does not send it straight back.
     *
     * A player raises a cancelable `PlayerChangeDimensionEvent` first, which a listener cancels
     * before it returns, and then goes through `PlayerSession.changeWorld`, which runs the
     * client's dimension change sequence and queues its packets; the
     * cooldown is the player's 10 ticks. A player leaving the End who has not seen the end
     * credits is held instead: `PlayerSession.startCredits` rolls them and keeps the arrival
     * until the client reports them finished. Anything else leaves its world with `removeEntity`,
     * is placed at the arrival and enters the destination with `addEntity`, with the 300 tick
     * cooldown Bedrock writes to `PortalCooldown`.
     *
     * A store entity's state lives in its dimension's store. It leaves that store with the
     * record a save would write, and the destination's store restores the same entity from it,
     * component groups and all, with the cooldown. A dropped stack leaves with its stack, its
     * age, its pickup delay and its motion, and an inert actor with its saved identifier and
     * actor record tags, as each would be saved.
     */
    public transfer(entity: StoreActor, arrival: Arrival): void {
        const from = entity.getWorld();
        const session = sessionOf(entity);

        if (session !== undefined) {
            const player = session.getPlayer();
            const event = new PlayerChangeDimensionEvent(session, from, arrival.world, arrival);
            this.server.getKernel().events.post('playerChangeDimension', event);
            if (event.isCanceled()) return;

            player.setPortalCooldown(PORTAL_COOLDOWN_TICKS.player);

            // Java's `EndPortalBlock.entityInside`: a first exit through the End's portal
            // rolls the credits and holds the change until the client reports them over. The
            // flag is set as the credits start, Java's `showEndCredits` rule, so a player who
            // disconnects mid-credits comes back in the End and their next exit transfers at
            // once instead of replaying them.
            if (from.getDimension().id === Dimensions.TheEnd.id && !player.hasSeenCredits()) {
                player.setSeenCredits(true);
                session.released(session.startCredits(arrival));
                return;
            }

            session.released(session.changeWorld(arrival, { whenPending: 'drop' }));
            return;
        }

        this.transferStoreEntity(entity, arrival);
    }

    /**
     * Moves a store entity into the store of the world it arrives in: the record a save would
     * write, facing the way it arrives, is restored there with the actor record tags it carried,
     * and the arrival takes the cooldown.
     */
    private transferStoreEntity(actor: StoreActor, arrival: Arrival): void {
        const from = actor.getWorld().dataEntities();
        const to = arrival.world.dataEntities();
        const { entity } = actor;
        const at = { x: arrival.position.getX(), y: arrival.position.getY(), z: arrival.position.getZ() };

        if (actor instanceof ItemActor) {
            from.runtime.remove(entity.id, 'body removed');
            to.adoptItem(actor, at, actor.getDefaultPortalCooldown());
            return;
        }
        if (actor instanceof InertActor) {
            from.runtime.remove(entity.id, 'body removed');
            const restored = to.restoreInert({
                identifier: actor.getType(),
                position: at,
                yaw: arrival.yaw,
                pitch: arrival.pitch,
                tags: actor.getTags(),
                statusEffects: actor.getStatusEffects(),
                portalCooldown: 0,
                persistentNbt: actor.persistentNbt ?? new NBTTagCompound('')
            });
            if (restored !== undefined) to.actors.actorOf(restored.id)?.setPortalCooldown();
            return;
        }

        const record: DataEntityRecord = {
            ...dataEntityRecordOf(
                entity,
                from.runtime.poolOf(entity.id),
                from.runtime.leashHolderIdentityOf(entity.id),
                from.runtime.merchantSnapshotOf(entity)
            ),
            yaw: arrival.yaw,
            pitch: arrival.pitch
        };
        const persistentNbt = actor.persistentNbt ?? new NBTTagCompound('');
        writeDataEntityRecord(persistentNbt, record);

        // Restored before the source is removed, so a destination that cannot take the entity
        // leaves it where it was rather than in neither world.
        const restored = to.restoreRecord(record, at, {
            persistentNbt,
            tags: actor.getTags(),
            statusEffects: actor.getStatusEffects()
        });
        if (restored === undefined) {
            from.runtime.report(
                `${entity.identifier} ${entity.id} could not enter ${arrival.world.getName()}, so it stays`
            );
            return;
        }
        from.runtime.remove(entity.id, 'body removed');
        to.actors.actorOf(restored.id)?.setPortalCooldown();
    }

    /** Whether the entity rides or is ridden, as far as the data-driven runtime of its world knows. */
    private isInRide(entity: StoreActor): boolean {
        return entity.getWorld().dataEntities().isInRide(Number(entity.getRuntimeId()));
    }

    /**
     * Starts a trip through the portal block an entity's contact ran out in. The entity's update
     * calls this inside its world's tick, and it never waits.
     *
     * The trip is planned from the source world alone: where the traveler stands in the portal,
     * the scaled target and the facing. It is filed for the input step, and the destination is
     * prepared outside every tick: its world is built if nobody has entered it, and the chunks the
     * arrival reads are loaded. Nothing in the destination changes here, and the traveler stays
     * where it is until {@link DimensionTravel.admit} lands it
     * ([ADR 0011](../../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
     *
     * @returns Whether a trip was filed: false when the block is no portal, the level has no
     *   world for the other side, or the other side takes no nether portal.
     */
    public depart(entity: StoreActor, portal: PortalBlockRef): boolean {
        const route = this.routeOf(entity, portal);
        if (route === undefined) return false;

        const trip: PortalTrip = {
            from: portal.world,
            entity: entity.getRuntimeId(),
            route,
            preparing: undefined,
            ticket: `travel:${this.nextTicket++}`,
            released: false,
            respawnFor: undefined
        };
        this.trips.push(trip);
        this.prepare(trip);
        return true;
    }

    /** Whether an entity has a trip filed that has not landed yet. */
    public isDeparting(entity: StoreActor): boolean {
        const world = entity.getWorld();
        const id = entity.getRuntimeId();
        return this.trips.some((trip) => trip.from === world && trip.entity === id);
    }

    /**
     * Moves a player to another world at the next input step, for code that runs where the change
     * cannot be waited for, such as an input-lane handler or a command. The change runs through
     * `PlayerSession.changeWorld`, then `then`. A player who disconnected first is not moved.
     *
     * @param arrival - Where the player lands, in a world that is already built.
     * @param then - What follows the change, such as the respawn exchange after the credits.
     */
    public move(session: PlayerSession, arrival: Arrival, then: () => void = () => {}): void {
        this.moveTo(session, arrivalTarget(arrival), then);
    }

    /**
     * {@link DimensionTravel.move} to a target that may not be ready yet, such as a world nobody
     * has entered. The target is prepared outside every tick, and the move waits for the input
     * step at which it is ready. A player's later moves wait behind an earlier one, so they land
     * in the order they were filed.
     */
    public moveTo(session: PlayerSession, target: MoveTarget, then: () => void = () => {}): void {
        const move: WorldMove = { session, target, then, preparing: undefined };
        this.moves.push(move);
        this.prepareMove(move);
    }

    /** How many trips and moves wait for an input step to land them. */
    public get pending(): number {
        return this.moves.length + this.trips.length;
    }

    /**
     * The input step's share: carries out the moves filed since the last step, then lands every
     * trip whose destination is ready, in the order the trips started, and keeps the rest for a
     * later step.
     *
     * A destination is ready once its world is built and the chunks the arrival reads are loaded,
     * which the input step decides from loaded chunks alone, so a replay that admits the same
     * chunks at the same ticks lands each trip at the same tick. The traveler then leaves its
     * world and enters the other through {@link DimensionTravel.transfer}, so both changes land
     * in the tick this step opens. A trip whose traveler left its world in the meantime is
     * dropped. A trip out of the End also waits for the respawn search, or the world's spawn,
     * which it asks again at each step. Nothing here waits: what a trip lacks it asks for, and a
     * later step lands it.
     *
     * @returns How many moves and trips landed.
     */
    public admit(): number {
        let landed = this.admitMoves();

        const due = this.trips;
        this.trips = [];
        for (const trip of due) {
            const traveler = trip.from.getActor(trip.entity);
            if (traveler === null) {
                this.release(trip);
                continue;
            }

            const to = this.readyDestination(trip);
            if (to === undefined) {
                this.trips.push(trip);
                this.prepare(trip);
                continue;
            }

            try {
                const arrival = this.arrivalOf(trip, traveler, to);
                if (arrival === WAITING) {
                    this.trips.push(trip);
                    continue;
                }
                this.release(trip);
                if (arrival === undefined) continue;
                this.transfer(traveler, arrival);
                landed += 1;
            } catch (error: unknown) {
                this.release(trip);
                this.server.getLogger().error(`A trip from ${trip.from.getName()} to ${trip.route.to} failed`);
                this.server.getLogger().error(error);
            }
        }
        return landed;
    }

    /**
     * Gives up the tickets a trip that landed or was dropped holds: its own on the arrival chunks,
     * and the respawn search's for a trip out of the End.
     */
    private release(trip: PortalTrip): void {
        // While the destination is still being built there is no ticket to give up here, so the
        // flag stops the preparation from taking one once the build finishes.
        trip.released = true;
        trip.from.getLevel().readyWorld(trip.route.to)?.chunkTickets().release(trip.ticket);
        // The search gives up its ticket when it answers, which a dropped trip never asks again for.
        trip.respawnFor?.abandonRespawnPoint();
    }

    /**
     * Carries out the moves filed before this step whose targets are ready, in order, and keeps
     * the rest, with every later move of the same player, for a later step.
     */
    private admitMoves(): number {
        const due = this.moves;
        this.moves = [];
        const waiting = new Set<PlayerSession>();
        let moved = 0;
        for (const move of due) {
            const { session, target, then } = move;
            if (!session.isConnected()) continue;

            const arrival = waiting.has(session) ? undefined : target.ready();
            if (arrival === undefined) {
                waiting.add(session);
                this.moves.push(move);
                this.prepareMove(move);
                continue;
            }

            try {
                session.released(session.changeWorld(arrival));
                then();
                moved += 1;
            } catch (error: unknown) {
                this.server.getLogger().error(`Moving ${session.identity.name} to ${arrival.world.getName()} failed`);
                this.server.getLogger().error(error);
            }
        }
        return moved;
    }

    /** Prepares a move's target outside every tick, one preparation per move at a time. */
    private prepareMove(move: WorldMove): void {
        if (move.preparing !== undefined || move.target.ready() !== undefined) return;

        const preparing: Promise<void> = outsideTick(async () => move.target.prepare())
            .catch((error: unknown) => {
                this.server.getLogger().error(`Failed to prepare the move of ${move.session.identity.name}`);
                this.server.getLogger().error(error);
            })
            .finally(() => {
                move.preparing = undefined;
                this.preparing.delete(preparing);
            });
        move.preparing = preparing;
        this.preparing.add(preparing);
    }

    /** Settles once the destination of every filed trip and move has been prepared as far as it can be. */
    public async prepared(): Promise<void> {
        await Promise.all(this.preparing);
    }

    /**
     * Where a trip from a portal block goes, read from the source world alone.
     *
     * A nether portal links to the other dimension by the scaled position and keeps the traveler's
     * place in the portal. An end portal goes into the End, or out of it from the End.
     */
    private routeOf(entity: StoreActor, portal: PortalBlockRef): TripRoute | undefined {
        const rule = portalRuleOf(portal.block);
        if (rule === undefined) return undefined;

        const from = portal.world;
        const level = from.getLevel();
        const to = rule.links[from.getDimension().id];
        if (to === undefined || !level.getStems().has(to)) return undefined;

        const facing = { to, player: isPlayer(entity), yaw: entity.yaw, pitch: entity.pitch };
        if (rule.kind === 'end')
            return { ...facing, kind: from.getDimension().id === Dimensions.TheEnd.id ? 'leave-end' : 'enter-end' };

        const target = level.dimensionTypeOf(to);
        const travel = travelRuleOf(target);
        if (travel === undefined || !travel.allowsNetherPortal) return undefined;

        const feet = feetOf(entity);
        const { width, height } = entity.getBox();
        const size = { width, height };
        const source = this.sourceRectangle(from, portal);
        return {
            ...facing,
            kind: 'nether',
            target: scalePosition(from.getDimension(), target, feet),
            relative: relativePosition(source, feet, size),
            size,
            axis: source.axis,
            searchRadius: travel.portalSearchRadius
        };
    }

    /** The destination of a trip once it can land without waiting, or undefined. */
    private readyDestination(trip: PortalTrip): World | undefined {
        const { route } = trip;
        const to = trip.from.getLevel().readyWorld(route.to);
        if (to === undefined) return undefined;
        if (route.kind === 'nether' && this.exitPortalIn(to, route) !== undefined) return to;
        return chunksOf(route).every(({ x, z }) => to.getLoadedChunk(x, z) !== null) ? to : undefined;
    }

    /**
     * Prepares a trip's destination outside every tick: builds its world, then takes a chunk
     * ticket on the chunks the arrival reads, which loads them, so they enter that world at an
     * input step, and keeps them from unloading until the trip lands. A nether trip that already
     * has a portal to arrive in loads nothing. One preparation runs per trip at a time.
     */
    private prepare(trip: PortalTrip): void {
        if (trip.preparing !== undefined) return;

        const { route } = trip;
        const level = trip.from.getLevel();
        const preparing: Promise<void> = outsideTick(async () => {
            await level.prepareWorld(route.to);
            const to = level.readyWorld(route.to);
            if (to === undefined || trip.released) return;
            if (route.kind === 'nether' && this.exitPortalIn(to, route) !== undefined) return;
            to.chunkTickets().request(trip.ticket, chunksOf(route));
        })
            .catch((error: unknown) => {
                this.server.getLogger().error(`Failed to prepare ${route.to} for a trip from ${trip.from.getName()}`);
                this.server.getLogger().error(error);
            })
            .finally(() => {
                trip.preparing = undefined;
                this.preparing.delete(preparing);
            });
        trip.preparing = preparing;
        this.preparing.add(preparing);
    }

    /** The portal a nether trip arrives in among the destination's loaded chunks, if one stands there. */
    private exitPortalIn(to: World, route: NetherRoute): PortalRectangle | undefined {
        const lookup: BlockLookup = (at) => to.loadedBlockAt(at.x, at.y, at.z);
        return findExitPortal(to.getPortalIndex(), lookup, route.target, route.searchRadius);
    }

    /**
     * Where a ready trip lands, creating a portal or the End platform when the rules say so.
     *
     * A nether trip lands in the nearest portal within the search radius with the traveler's
     * place in the source portal kept, and otherwise creates one for a player and refuses
     * everything else. A trip into the End writes the platform and lands at
     * {@link END_SPAWN_POINT} facing west; one out of the End lands a player at their resolved
     * respawn point and anything else at the Overworld spawn.
     *
     * @returns The arrival, undefined when there is no portal to arrive in and the traveler is
     *   not a player, or {@link WAITING} while a trip out of the End waits for its spawn.
     */
    private arrivalOf(trip: PortalTrip, traveler: StoreActor, to: World): PortalArrival | undefined | typeof WAITING {
        const { route } = trip;
        if (route.kind === 'nether') return this.throughNetherPortal(route, to);
        if (route.kind === 'enter-end') return this.enterEnd(route, to);
        return this.leaveEnd(trip, traveler, to);
    }

    /** `NetherPortalBlock.getPortalDestination` and `getExitPortal`, with Bedrock's player-only creation. */
    private throughNetherPortal(route: NetherRoute, to: World): PortalArrival | undefined {
        let destination = this.exitPortalIn(to, route);
        let createdPortal = false;
        if (destination === undefined) {
            // Only a player builds a portal on Bedrock; an item or a mob with nowhere to arrive stays.
            if (!route.player) return undefined;
            const actions = this.server.getContent().world.blockWorld.at(to.getDimension().name);
            destination = createNetherPortal(actions, blockOf(route.target), route.axis, to.getDimension()).rectangle;
            createdPortal = true;
        }

        return {
            world: to,
            position: exitPosition(destination, route.relative, route.size),
            yaw: exitYaw(route.yaw, route.axis, destination.axis),
            pitch: route.pitch,
            createdPortal
        };
    }

    /**
     * The portal the traveler stands in, or the one block it touched when no rectangle can be
     * read around it, which happens when the block changed under the traveler this tick.
     */
    private sourceRectangle(from: World, portal: PortalBlockRef): PortalRectangle {
        const at = blockOf(portal.position);
        const read = portalRectangleAround((position) => from.loadedBlockAt(position.x, position.y, position.z), at);
        if (read !== undefined) return read;

        const block = from.loadedBlockAt(at.x, at.y, at.z);
        const axis: PortalAxis = (block && portalAxisOf(block)) ?? 'x';
        return { minCorner: new Vector3(at.x, at.y, at.z), axis, width: 1, height: 1 };
    }

    /** `EndPortalBlock.getPortalDestination` into the End, with `EndPlatformFeature.createEndPlatform`. */
    private enterEnd(route: TripRoute, end: World): PortalArrival {
        writeEndPlatform(this.server.getContent().world.blockWorld.at(end.getDimension().name), END_PLATFORM_CENTER);

        // A `ServerPlayer` has `(0, 1, 0)` subtracted, so players stand on the platform at 49
        // and everything else arrives at 50.
        const y = route.player ? END_SPAWN_POINT.y - 1 : END_SPAWN_POINT.y;
        return {
            world: end,
            position: new Vector3(END_SPAWN_POINT.x + 0.5, y, END_SPAWN_POINT.z + 0.5),
            yaw: END_ARRIVAL_YAW,
            pitch: 0,
            createdPortal: false
        };
    }

    /**
     * `EndPortalBlock.getPortalDestination` out of the End: a player's
     * `findRespawnPositionAndUseSpawnBlock(false, ...)`, which spends no anchor charge, and
     * `adjustSpawnLocation` at the Overworld spawn for anything else.
     *
     * Neither waits. The player's respawn search reads loaded chunks and takes a ticket for what
     * it lacks, and a world that has not found its spawn searches outside the tick; the trip
     * asks again at the next input step.
     */
    private leaveEnd(trip: PortalTrip, traveler: StoreActor, to: World): PortalArrival | typeof WAITING {
        const { route } = trip;
        const session = sessionOf(traveler);
        if (session !== undefined) {
            const respawn = session.attemptRespawnPoint();
            // Kept while the search waits, so a trip dropped then can give up the search's
            // ticket: by that time the session can no longer be found from the source world.
            // An answer has given it up already, and releasing it again would take the ticket
            // of another request of the same player that still waits.
            trip.respawnFor = respawn === undefined ? session : undefined;
            if (respawn === undefined) return WAITING;
            return {
                world: respawn.world,
                position: respawn.block,
                yaw: route.yaw,
                pitch: route.pitch,
                createdPortal: false
            };
        }

        // Where a joining player's feet go before the terrain is consulted.
        const spawn = to.getKnownSpawnPosition();
        if (spawn === null) {
            outsideTick(
                () => void to.getSpawnPosition().catch((error: unknown) => this.server.getLogger().error(error))
            );
            return WAITING;
        }
        return {
            world: to,
            position: requestedSpawnPosition(spawn),
            yaw: route.yaw,
            pitch: route.pitch,
            createdPortal: false
        };
    }
}
