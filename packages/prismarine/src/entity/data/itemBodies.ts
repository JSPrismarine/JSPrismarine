/**
 * The body a client is sent for each dropped stack of the store, until replication reads the
 * change log (slice 7 of the entity and tick re-architecture).
 *
 * Tracking, chunk membership, saves, selectors, explosions and portals still work on the legacy
 * `Entity` objects the world holds, so a store stack needs one to reach any of them. This is that
 * object, and it holds no state of its own: everything it reports, it reads from the store entity
 * behind it, and every effect on it goes back to the store. The data-driven mobs reach clients
 * through the mirror in `liveBodies.ts`, which slice 4 deletes; this path is kept apart from it so
 * the two can be replaced together by whatever encodes store entities for the legacy tracker.
 */
import { Vector3 } from '@jsprismarine/math';

import ContainerEntry from '../../inventory/ContainerEntry';
import type { StoredItemStack } from '../../inventory/persistence';
import { restoredItem } from '../../inventory/persistence';
import type PlayerSession from '../../network/PlayerSession';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import type { DamageSource } from '../DamageSource';
import { Entity } from '../Entity';
import type { DataEntity } from './DataEntity';
import type { DroppedItems, ItemView } from './droppedItems';
import { ITEM_ENTITY, itemTuningOf, itemViewOf } from './droppedItems';

/** How far an item has to move before the movement is worth putting on the wire, in blocks. */
const MOVEMENT_EPSILON = 1e-4;

/** What a dropped stack's actor record holds beside the fields every actor has. */
export interface SavedItem {
    readonly stack: StoredItemStack;
    readonly age: number;
    readonly pickupDelay: number;
    readonly motion: Vector3;
}

/**
 * The client's view of one dropped stack of the store.
 *
 * It shares the store entity's runtime id, so the stack has one id on the wire and in the store.
 */
export class ItemActorBody extends Entity {
    public static override MOB_ID = ITEM_ENTITY;

    /**
     * @param driver - The store entity this body shows.
     * @param items - The system a blow is handed to.
     * @param world - The world the body stands in.
     */
    public constructor(
        private readonly driver: DataEntity,
        private readonly items: DroppedItems,
        world: World
    ) {
        const at = driver.position;
        super({ position: new Position(at.x, at.y, at.z, world), runtimeId: BigInt(driver.id) });
    }

    /** The store entity behind this body. */
    public getDriver(): DataEntity {
        return this.driver;
    }

    /** The stack's state, read from the store, or what it last held once the stack has left it. */
    private view(): ItemView | undefined {
        return itemViewOf(this.driver);
    }

    /** The stack a player picks up, as the item actor packet carries it. */
    public getItem(): ContainerEntry | undefined {
        const view = this.view();
        const item = view === undefined ? null : restoredItem(view.stack, this.server.getContent());
        return item === null ? undefined : new ContainerEntry({ item, count: item.getAmount() });
    }

    /** The speed it is moving at, in blocks per tick, which the client is told when it appears. */
    public getMotion(): Vector3 {
        return Vector3.fromObject(this.driver.body.velocity);
    }

    /** @inheritdoc */
    public override getVelocity(): Vector3 {
        return this.getMotion();
    }

    /** What the item's actor record holds beside the fields every actor has. */
    public savedItem(): SavedItem | undefined {
        const view = this.view();
        if (view === undefined) return undefined;
        return { stack: view.stack, age: view.age, pickupDelay: view.pickupDelay, motion: this.getMotion() };
    }

    /** Where the item lies, below the position it reports. */
    public override getFeetY(): number {
        return this.getPosition().getY() - itemTuningOf(this.driver).positionOffset;
    }

    /**
     * Dropped stacks are followed less far than anything else, as in vanilla: they are the most
     * numerous entity in any world and the least worth seeing at a distance.
     * @returns {number} The tracking radius in chunks.
     */
    public override getTrackingRange(): number {
        return 6;
    }

    /**
     * An item moves for about a second after it drops and then lies still.
     * @returns {number} The interval in ticks.
     */
    public override getTrackingInterval(): number {
        return 20;
    }

    /** A dropped stack goes on the wire as an item actor, not as a generic one. */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddItemActor(this);
    }

    /** A blow goes to the store, which takes the stack's health with no grace period. */
    public override async damage(amount: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<boolean> {
        if (this.driver.removed !== undefined) return false;
        return this.items.hurt(this.driver, amount, typeof source === 'string' ? source : source.cause);
    }

    /** A stack killed outright, as `/kill` does, leaves the store and the world. */
    protected override async onDeath(): Promise<void> {
        if (this.driver.removed === undefined) this.items.remove(this.driver.id, 'death');
    }

    /** Moves the body to where the store put the stack, when that is anywhere new. */
    public follow(): Promise<void> | undefined {
        const at = this.driver.position;
        const here = this.getPosition();
        if (
            Math.abs(here.getX() - at.x) < MOVEMENT_EPSILON &&
            Math.abs(here.getY() - at.y) < MOVEMENT_EPSILON &&
            Math.abs(here.getZ() - at.z) < MOVEMENT_EPSILON
        )
            return undefined;
        return this.setPosition({ position: new Vector3(at.x, at.y, at.z) });
    }
}

/** What {@link ItemBodies} is built over. */
export interface ItemBodiesOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the bodies met and could not carry out. */
    report(message: string): void;
}

/** One client body per dropped stack of the store, kept in step with it. */
export class ItemBodies {
    private readonly bodies = new Map<number, ItemActorBody>();

    public constructor(private readonly options: ItemBodiesOptions) {}

    /** The body of one dropped stack, or undefined when it has none. */
    public bodyOf(id: number): ItemActorBody | undefined {
        return this.bodies.get(id);
    }

    /** The store entity id for a body this index holds, or undefined for any other entity. */
    public entityIdOf(body: Entity): number | undefined {
        const id = Number(body.getRuntimeId());
        return this.bodies.get(id) === body ? id : undefined;
    }

    /** How many dropped stacks have a body, which is how many lie in the world. */
    public get size(): number {
        return this.bodies.size;
    }

    /** Puts a body in the world for a dropped stack the store just took in. */
    public add(entity: DataEntity, items: DroppedItems): void {
        const world = this.options.world();
        if (world === undefined) return;
        const body = new ItemActorBody(entity, items, world);
        this.bodies.set(entity.id, body);
        void world.addEntity(body).catch((error: unknown) => this.failed('add', error));
    }

    /** Takes the body of a stack the store removed back out of the world. */
    public drop(entity: DataEntity): void {
        const body = this.bodies.get(entity.id);
        this.bodies.delete(entity.id);
        if (body === undefined) return;
        void body
            .getWorld()
            .removeEntity(body)
            .catch((error: unknown) => this.failed('remove', error));
    }

    /** Forgets a body the world is removing itself, before its store entity leaves. */
    public detach(body: Entity): number | undefined {
        const id = this.entityIdOf(body);
        if (id !== undefined) this.bodies.delete(id);
        return id;
    }

    /**
     * Moves every body to where the store put its stack, after a tick of the runtime.
     * @returns The movement broadcasts, which the caller awaits with the rest of its tick.
     */
    public sync(): readonly Promise<void>[] {
        const moves: Promise<void>[] = [];
        for (const body of this.bodies.values()) {
            const move = body.follow();
            if (move !== undefined) moves.push(move);
        }
        return moves;
    }

    /** Forgets every body, for a world that is closing. */
    public clear(): void {
        this.bodies.clear();
    }

    private failed(what: string, error: unknown): void {
        this.options.report(`could not ${what} the body of a dropped item: ${String(error)}`);
    }
}
