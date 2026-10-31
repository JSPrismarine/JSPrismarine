/**
 * Where a trip through a portal lands, and what it builds on arrival.
 *
 * This is the server half of the portal note's section 6. {@link DimensionTravel.touch} is
 * what the world calls for every entity standing in a portal block, and opens the contact
 * timer on the entity. {@link DimensionTravel.resolve} names the world, the feet position and
 * the facing a traveler arrives with, creating the arrival portal or the End platform when the
 * rules say so. {@link DimensionTravel.transfer} moves the entity there, players through the
 * client's dimension change sequence on their session. `Entity.update` calls the last two once
 * the timer runs out.
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
import type { Entity } from '../../entity/Entity';
import EntityPortalEnterEvent from '../../events/entity/EntityPortalEnterEvent';
import PlayerChangeDimensionEvent from '../../events/player/PlayerChangeDimensionEvent';
import type { Arrival } from '../../network/PlayerSession';
import Player from '../../Player';
import type Server from '../../Server';
import { Dimensions } from '../Dimension';
import type { Level } from '../Level';
import { Position } from '../Position';
import type { World } from '../World';
import { createNetherPortal } from './create';
import { portalRuleOf, travelRuleOf } from './rules';
import { scalePosition } from './scale';
import type { BlockLookup, PortalRectangle } from './search';
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

/**
 * How many blocks past the creation radius a chunk may be written in: Java's frame extends
 * from -1 to 2 along the axis (`FRAME_BOX_START`, `FRAME_BOX_END`) and the forced platform
 * two blocks to each side across it.
 */
const CREATION_WRITE_MARGIN = 3;

/** A block position from a vector, for the geometry that reads integers. */
const blockOf = (at: Vector3): BlockPosition => ({
    x: Math.floor(at.getX()),
    y: Math.floor(at.getY()),
    z: Math.floor(at.getZ())
});

/** Where the traveler's body starts: a player's position is its eyes, everything else's its feet. */
const feetOf = (entity: Entity): Vector3 => {
    const at = entity.getPosition();
    return new Vector3(at.getX(), entity.getFeetY(), at.getZ());
};

/**
 * Whether an entity is a player whose client has not yet closed the loading screen of its
 * last world change.
 *
 * Such a player is still ticked, standing in the arrival portal, and must not start another
 * trip: `PlayerSession.changeWorld` would refuse it, after the contact had already run.
 */
export const isMidDimensionChange = (entity: Entity): boolean =>
    entity instanceof Player && entity.getNetworkSession().pendingDimensionChange() !== undefined;

/** The portal and End travel service of one server. */
export class DimensionTravel {
    public constructor(private readonly server: Server) {}

    /**
     * Records that an entity's body overlaps a portal block on this tick.
     *
     * The world calls this once per tick per entity standing in a portal. The first touch
     * raises a cancelable `EntityPortalEnterEvent`, waits for every listener, asynchronous
     * ones included, and opens the entity's contact timer unless one canceled; later touches
     * keep it counting. Nothing happens for an entity on portal cooldown, as in Java's
     * `handlePortal`, for one that rides or carries another, which Bedrock refuses to send
     * through (MCPE-47288), or for a player whose client is still on the loading screen of
     * the last change.
     */
    public async touch(entity: Entity, portal: PortalBlockRef): Promise<void> {
        if (entity.isOnPortalCooldown() || isMidDimensionChange(entity) || this.isInRide(entity)) return;

        if (entity.portalContact() === undefined) {
            const event = new EntityPortalEnterEvent(entity, portal);
            await this.server.emit('entityPortalEnter', event);
            if (event.isCanceled()) return;
        }

        entity.touchPortal(feetOf(entity), portal);
    }

    /**
     * Moves an entity to where a trip resolved to, and starts its portal cooldown so the
     * arrival portal does not send it straight back.
     *
     * A player raises a cancelable `PlayerChangeDimensionEvent` first and then goes through
     * `PlayerSession.changeWorld`, which runs the client's dimension change sequence; the
     * cooldown is the player's 10 ticks. Anything else leaves its world with `removeEntity`,
     * is placed at the arrival and enters the destination with `addEntity`, with the 300 tick
     * cooldown Bedrock writes to `PortalCooldown`.
     *
     * A data-driven mob's state lives in its dimension's runtime, which `removeEntity` drops
     * it from. Its record is written onto the body first, as a save would, so the destination
     * runtime restores the same entity, component groups and all, under its own new body;
     * that body then takes the cooldown.
     */
    public async transfer(entity: Entity, arrival: Arrival): Promise<void> {
        const from = entity.getWorld();

        if (entity instanceof Player) {
            const event = new PlayerChangeDimensionEvent(entity, from, arrival.world, arrival);
            await this.server.emit('playerChangeDimension', event);
            if (event.isCanceled()) return;

            entity.setPortalCooldown();
            await entity.getNetworkSession().changeWorld(arrival);
            return;
        }

        entity.setPortalCooldown();
        const record = this.writeDataRecord(from, entity, arrival);
        await from.removeEntity(entity);
        await entity.setPosition({
            position: Position.fromVector3(arrival.position, arrival.world),
            yaw: arrival.yaw,
            headYaw: arrival.yaw,
            pitch: arrival.pitch,
            teleport: true
        });
        await arrival.world.addEntity(entity);

        if (record !== undefined) {
            this.restoredBodyOf(arrival.world, record)?.setPortalCooldown(entity.getPortalCooldown());
        }
    }

    /**
     * Writes a data-driven mob's runtime record onto its body, facing the way it arrives.
     *
     * @returns The record, or undefined when the body is no data-driven mob of its world.
     */
    private writeDataRecord(from: World, body: Entity, arrival: Arrival): DataEntityRecord | undefined {
        const live = this.server.getEntityRuntime(from.getDimension().name);
        const id = live.bodies.entityIdOf(body);
        const entity = id === undefined ? undefined : live.runtime.byId(id);
        if (id === undefined || entity === undefined) return undefined;

        const record: DataEntityRecord = {
            ...dataEntityRecordOf(entity, live.runtime.poolOf(id), live.runtime.leashHolderIdentityOf(id)),
            yaw: arrival.yaw,
            pitch: arrival.pitch
        };
        body.persistentNbt ??= new NBTTagCompound('');
        writeDataEntityRecord(body.persistentNbt, record);
        return record;
    }

    /** The body the destination runtime gave a restored record, found by the entity's stable identity. */
    private restoredBodyOf(to: World, record: DataEntityRecord): Entity | undefined {
        const live = this.server.getEntityRuntime(to.getDimension().name);
        const restored = live.runtime.all().find((each) => each.persistentIdentity === record.persistentIdentity);
        return restored === undefined ? undefined : live.bodies.bodyOf(restored.id);
    }

    /** Whether the entity rides or is ridden, as far as the data-driven runtime of its world knows. */
    private isInRide(entity: Entity): boolean {
        return this.server.getEntityRuntime(entity.getWorld().getDimension().name).isInRide(entity);
    }

    /**
     * Resolves where a trip from a portal block lands, creating a portal or the End platform
     * when the rules say so.
     *
     * A nether portal links to the other dimension by the scaled position, lands in the
     * nearest portal within {@link import('./rules').PORTAL_SEARCH_RADIUS} with the traveler's
     * place in the source portal kept, and otherwise creates one for a player and refuses
     * everything else. An end portal into the End writes the platform and lands at
     * {@link END_SPAWN_POINT} facing west; one out of the End lands a player at their resolved
     * respawn point and anything else at the Overworld spawn.
     *
     * @returns The arrival, or undefined when the trip goes nowhere: the block is no portal,
     *   the level has no world for the other side, or there is no portal to arrive in and
     *   the traveler is not a player.
     */
    public async resolve(entity: Entity, portal: PortalBlockRef): Promise<PortalArrival | undefined> {
        const rule = portalRuleOf(portal.block);
        if (rule === undefined) return undefined;

        const from = portal.world;
        const targetId = rule.links[from.getDimension().id];
        if (targetId === undefined) return undefined;

        const level = from.getLevel();
        if (rule.kind === 'end') {
            if (from.getDimension().id === Dimensions.TheEnd.id) return this.leaveEnd(entity, level, targetId);
            const end = await this.worldOf(level, targetId);
            return end === undefined ? undefined : this.enterEnd(entity, end);
        }

        const to = await this.worldOf(level, targetId);
        return to === undefined ? undefined : this.throughNetherPortal(entity, portal, to);
    }

    /** The level's world of a dimension, built if the stem exists and undefined when it does not. */
    private async worldOf(level: Level, dimensionId: string): Promise<World | undefined> {
        return level.getStems().has(dimensionId) ? level.world(dimensionId) : undefined;
    }

    /** `NetherPortalBlock.getPortalDestination` and `getExitPortal`, with Bedrock's player-only creation. */
    private async throughNetherPortal(
        entity: Entity,
        portal: PortalBlockRef,
        to: World
    ): Promise<PortalArrival | undefined> {
        const from = portal.world;
        const travel = travelRuleOf(to.getDimension());
        if (travel === undefined || !travel.allowsNetherPortal) return undefined;

        const feet = feetOf(entity);
        const size = entity.getBox();
        const source = this.sourceRectangle(from, portal);
        const relative = relativePosition(source, feet, size);
        const target = scalePosition(from.getDimension(), to.getDimension(), feet);

        const lookup: BlockLookup = (x, y, z) => to.loadedBlockAt(x, y, z);
        let destination = findExitPortal(to.getPortalIndex(), lookup, target, travel.portalSearchRadius);
        if (destination === undefined) {
            // The chunks a portal would be created in, which also brings any portal already
            // standing in them into the index.
            await this.loadAround(to, target, PORTAL_CREATION_RADIUS + CREATION_WRITE_MARGIN);
            destination = findExitPortal(to.getPortalIndex(), lookup, target, travel.portalSearchRadius);
        }

        let createdPortal = false;
        if (destination === undefined) {
            // Only a player builds a portal on Bedrock; an item or a mob with nowhere to arrive stays.
            if (!(entity instanceof Player)) return undefined;
            const actions = this.server.getContent().world.blockWorld.at(to.getDimension().name);
            destination = createNetherPortal(actions, blockOf(target), source.axis, to.getDimension()).rectangle;
            createdPortal = true;
        }

        return {
            world: to,
            position: exitPosition(destination, relative, size),
            yaw: exitYaw(entity.yaw, source.axis, destination.axis),
            pitch: entity.pitch,
            createdPortal
        };
    }

    /**
     * The portal the traveler stands in, or the one block it touched when no rectangle can be
     * read around it, which happens when the block changed under the traveler this tick.
     */
    private sourceRectangle(from: World, portal: PortalBlockRef): PortalRectangle {
        const at = blockOf(portal.position);
        const read = portalRectangleAround((x, y, z) => from.loadedBlockAt(x, y, z), at);
        if (read !== undefined) return read;

        const block = from.loadedBlockAt(at.x, at.y, at.z);
        const axis: PortalAxis = (block && portalAxisOf(block)) ?? 'x';
        return { minCorner: new Vector3(at.x, at.y, at.z), axis, width: 1, height: 1 };
    }

    /** `EndPortalBlock.getPortalDestination` into the End, with `EndPlatformFeature.createEndPlatform`. */
    private async enterEnd(entity: Entity, end: World): Promise<PortalArrival> {
        // `BlockPos.containing(bottomCenter).below()`: the platform's air starts at y 49 and its obsidian at 48.
        const platformCenter = { ...END_SPAWN_POINT, y: END_SPAWN_POINT.y - 1 };
        await this.loadAround(end, Vector3.fromObject(platformCenter), END_PLATFORM_HALF_SIDE);
        writeEndPlatform(this.server.getContent().world.blockWorld.at(end.getDimension().name), platformCenter);

        // A `ServerPlayer` has `(0, 1, 0)` subtracted, so players stand on the platform at 49
        // and everything else arrives at 50.
        const y = entity instanceof Player ? END_SPAWN_POINT.y - 1 : END_SPAWN_POINT.y;
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
     */
    private async leaveEnd(entity: Entity, level: Level, targetId: string): Promise<PortalArrival | undefined> {
        if (entity instanceof Player) {
            const respawn = await entity.getRespawnPoint();
            return {
                world: respawn.world,
                position: respawn.block,
                yaw: entity.yaw,
                pitch: entity.pitch,
                createdPortal: false
            };
        }

        const to = await this.worldOf(level, targetId);
        if (to === undefined) return undefined;
        // One block above the stored spawn and centered, which is where a joining player's feet go too.
        const spawn = await to.getSpawnPosition();
        return {
            world: to,
            position: new Vector3(spawn.getX() + 0.5, spawn.getY() + 1, spawn.getZ() + 0.5),
            yaw: entity.yaw,
            pitch: entity.pitch,
            createdPortal: false
        };
    }

    /** Loads every chunk within `radius` blocks of a position on x and z. */
    private async loadAround(world: World, center: Vector3, radius: number): Promise<void> {
        const loads: Promise<unknown>[] = [];
        const minX = Math.floor(center.getX() - radius) >> 4;
        const maxX = Math.floor(center.getX() + radius) >> 4;
        const minZ = Math.floor(center.getZ() - radius) >> 4;
        const maxZ = Math.floor(center.getZ() + radius) >> 4;
        for (let cx = minX; cx <= maxX; cx += 1) {
            for (let cz = minZ; cz <= maxZ; cz += 1) loads.push(world.getChunk(cx, cz));
        }
        await Promise.all(loads);
    }
}
