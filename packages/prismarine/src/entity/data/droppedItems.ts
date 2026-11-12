/**
 * Dropped item stacks as entities of the store.
 *
 * A `minecraft:item` is a data entity like any mob: a resolved type, which the entity overlay's
 * built-in definition supplies, and an `EntityInstance` whose `jsprismarine:item` component state
 * holds the stack, its age, its pickup delay and who may take it. Its position and its speed are
 * the body's logged fields. Every change goes through a logged setter, so an update that throws is
 * undone like any other entity's ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)),
 * and the stack is a plain record that is replaced, never an object changed in place.
 *
 * {@link DroppedItems} is the system the runtime's entity pass runs for each one, in ascending
 * runtime id order: age and despawn, the pickup delay, the move against loaded chunks only,
 * hazards and the void, merging with a neighboring stack and pickup by a player. A stack merged or
 * taken earlier in the tick has left the store and the index, so nothing later in the tick finds it
 * (ADR 0007).
 *
 * How an item moves is what a Bedrock Dedicated Server 1.26.52 sent for dropped and thrown items,
 * tick by tick: gravity, then the move, then drag, sideways and on the ground stronger than in the
 * air. A fall from rest covers 0.04, 0.0792, 0.1176 blocks. The numbers are the definition's.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import type { ComponentStateRecord } from '@jsprismarine/entities/componentState';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { StoredItemStack } from '../../inventory/persistence';
import { isStoredItemStack } from '../../inventory/persistence';
import { DamageCause, damageCauseOf } from '../DamageCause';
import { HAZARD_DAMAGE, HAZARD_INTERVAL, VOID_DEPTH } from '../Environment';
import { hazardOf } from '../ai/BlockView';
import type { DataEntity } from './DataEntity';
import { blockPositionOf } from './position';
import type { SpawnOptions } from './scene';

/** The type of every dropped stack. */
export const ITEM_ENTITY = 'minecraft:item';

/** The host component that makes a data entity a dropped stack, and holds its tuning. */
export const ITEM_COMPONENT = 'jsprismarine:item';

/**
 * How tall a player's body is, which the pickup reach is measured against.
 *
 * Measured to the body rather than to a point: a stack lying at someone's feet is further from
 * their eyes than the reach itself, so no amount of standing on an item ever picked it up.
 */
const PLAYER_BODY_HEIGHT = 1.8;

/** How far beyond its box an item looks for a hazard it rests against, such as a cactus's side. */
const HAZARD_CONTACT = 0.001;

/** The Java damage type tag each cause belongs to, which `minecraft:damage_resistant` names. */
const RESISTED_TAGS: Readonly<Record<string, string>> = {
    [DamageCause.Fire]: 'minecraft:is_fire',
    [DamageCause.Lava]: 'minecraft:is_fire',
    [DamageCause.Explosion]: 'minecraft:is_explosion'
};

/** A stack as component state holds it: a stored stack, as a plain record. */
export const isStackState = (value: unknown): value is ComponentStateRecord => isStoredItemStack(value);

/**
 * One dropped stack's state.
 */
export const itemState = defineComponentState(ITEM_COMPONENT, {
    stack: isStackState,
    age: stateField.number,
    pickupDelay: stateField.number
});

/** The logged field a dropped stack's state is written as, which holds its stack. */
export const ITEM_STATE_FIELD = `component:${itemState.component}`;

/**
 * The stack a dropped stack's logged state holds, for a reader of the change log.
 * @param state - The value of {@link ITEM_STATE_FIELD}.
 * @returns The stack, or undefined when the state holds none.
 */
export const itemStackOfState = (state: unknown): StoredItemStack | undefined =>
    itemState.is(state) && isStoredItemStack(state.stack) ? state.stack : undefined;

/** What a dropped stack starts with or comes back from a save with. */
export interface ItemStart {
    /** The stack. */
    readonly stack: StoredItemStack;
    /** Ticks it has already lain in the world. */
    readonly age?: number;
    /**
     * Ticks before a player may take it; the definition's `thrown_pickup_delay` for a thrown
     * stack and its `pickup_delay` for any other when absent.
     */
    readonly pickupDelay?: number;
    /** Whether a player threw it. */
    readonly thrown?: boolean;
    /** Its speed in blocks per tick; still when absent. */
    readonly motion?: EntityPosition;
    /**
     * Whether the position given is the one the item reports, as a saved record holds it, rather
     * than where it lies.
     */
    readonly reported?: boolean;
}

/** One dropped stack's state, read back. */
export interface ItemView {
    readonly stack: StoredItemStack;
    readonly age: number;
    readonly pickupDelay: number;
}

/** The numbers of `jsprismarine:item`. */
export interface ItemTuning {
    readonly gravity: number;
    readonly airDrag: number;
    readonly groundDrag: number;
    /** Sideways speed below which an item has stopped sliding. */
    readonly slideStop: number;
    /** How far above where an item lies the position it reports is, as BDS reports it. */
    readonly positionOffset: number;
    /** How far below its feet an item looks to decide it has landed. */
    readonly groundProbe: number;
    /** Ticks a block or world drop waits before a player can take it. */
    readonly pickupDelay: number;
    /** Ticks a stack a player threw waits. */
    readonly thrownPickupDelay: number;
    /** Ticks after which a stack leaves the world. */
    readonly despawnAge: number;
    /** How near a player's body has to be, in blocks. */
    readonly pickupRange: number;
    /** How near two stacks of the same thing have to be to become one, in blocks. */
    readonly mergeRange: number;
}

const TUNING_FIELDS = {
    gravity: 'gravity',
    airDrag: 'air_drag',
    groundDrag: 'ground_drag',
    slideStop: 'slide_stop',
    positionOffset: 'position_offset',
    groundProbe: 'ground_probe',
    pickupDelay: 'pickup_delay',
    thrownPickupDelay: 'thrown_pickup_delay',
    despawnAge: 'despawn_age',
    pickupRange: 'pickup_range',
    mergeRange: 'merge_range'
} as const satisfies Record<keyof ItemTuning, string>;

const tunings = new WeakMap<object, ItemTuning>();

/**
 * The tuning a dropped stack's definition declares.
 * @throws {TypeError} When the component leaves a number out, which fails the update that asked.
 */
export const itemTuningOf = (entity: DataEntity): ItemTuning => {
    const params = entity.instance.componentParams(ITEM_COMPONENT);
    if (!isRecord(params)) throw new TypeError(`${entity.identifier} has no ${ITEM_COMPONENT} component`);
    const cached = tunings.get(params);
    if (cached !== undefined) return cached;

    const tuning: Record<string, number> = {};
    for (const [field, key] of Object.entries(TUNING_FIELDS)) {
        const value = params[key];
        if (typeof value !== 'number') throw new TypeError(`${ITEM_COMPONENT} needs a number for ${key}`);
        tuning[field] = value;
    }
    const read: ItemTuning = {
        gravity: tuning['gravity']!,
        airDrag: tuning['airDrag']!,
        groundDrag: tuning['groundDrag']!,
        slideStop: tuning['slideStop']!,
        positionOffset: tuning['positionOffset']!,
        groundProbe: tuning['groundProbe']!,
        pickupDelay: tuning['pickupDelay']!,
        thrownPickupDelay: tuning['thrownPickupDelay']!,
        despawnAge: tuning['despawnAge']!,
        pickupRange: tuning['pickupRange']!,
        mergeRange: tuning['mergeRange']!
    };
    tunings.set(params, read);
    return read;
};

/** Whether a data entity is a dropped stack this system runs. */
export const isDroppedItem = (entity: DataEntity): boolean => entity.instance.hasComponent(ITEM_COMPONENT);

/** A stored stack as a component state record. */
export const stackRecord = (stack: StoredItemStack): ComponentStateRecord => ({
    name: stack.name,
    count: stack.count,
    ...(stack.meta === undefined ? {} : { meta: stack.meta }),
    ...(stack.damage === undefined ? {} : { damage: stack.damage }),
    ...(stack.customName === undefined ? {} : { customName: stack.customName }),
    ...(stack.lore === undefined ? {} : { lore: [...stack.lore] }),
    ...(stack.enchantments === undefined ? {} : { enchantments: { ...stack.enchantments } }),
    ...(stack.contents === undefined
        ? {}
        : { contents: stack.contents.map((slot) => (slot === null ? null : stackRecord(slot))) })
});

/** A state record for a stack and the rest of an item's state. */
const stateRecord = (view: ItemView): Parameters<typeof writeState>[1] => ({
    stack: stackRecord(view.stack),
    age: view.age,
    pickupDelay: view.pickupDelay
});

const writeState = (entity: DataEntity, state: NonNullable<ReturnType<typeof readState>>): void =>
    entity.instance.componentState.set(itemState, state);

const readState = (entity: DataEntity) => entity.instance.componentState.get(itemState);

/**
 * A dropped stack's state, or undefined when the entity holds none, which is a stack nothing can
 * be made of.
 */
export const itemViewOf = (entity: DataEntity): ItemView | undefined => {
    const state = readState(entity);
    if (state === undefined || !isStoredItemStack(state.stack)) return undefined;
    return {
        stack: state.stack,
        age: state.age,
        pickupDelay: state.pickupDelay
    };
};

/** Replaces part of a dropped stack's state, through the one logged write. */
const updateView = (entity: DataEntity, view: ItemView, change: Partial<ItemView>): ItemView => {
    const next: ItemView = { ...view, ...change };
    writeState(entity, stateRecord(next));
    return next;
};

/**
 * Writes a new item's state, which {@link DroppedItems.spawn} does before the entity enters the
 * log, so the state is part of the form it enters with.
 */
export const startItem = (entity: DataEntity, start: ItemStart): void => {
    const tuning = itemTuningOf(entity);
    writeState(
        entity,
        stateRecord({
            stack: start.stack,
            age: start.age ?? 0,
            pickupDelay: start.pickupDelay ?? (start.thrown === true ? tuning.thrownPickupDelay : tuning.pickupDelay)
        })
    );
    if (start.motion !== undefined) entity.body.velocity = start.motion;
    // Spawned where the stack lies, and reported above it, as BDS reports every item.
    if (start.reported === true) return;
    const at = entity.position;
    entity.position = { x: at.x, y: at.y + tuning.positionOffset, z: at.z };
};

/** A player as the pickup reads one: where its feet are, who it is, and whether it only watches. */
export interface ItemTaker {
    readonly id: number;
    readonly position: EntityPosition;
    /** A spectator takes nothing, so a stack stays for the next player in reach. */
    readonly spectator?: boolean;
}

/** What {@link DroppedItems} needs from the runtime and the server behind it. */
export interface DroppedItemsHost {
    /** Creates one entity of the store, as `EntityRuntime.spawn` does. */
    spawn(identifier: string, at: EntityPosition, options: SpawnOptions): DataEntity | undefined;
    /** Every member of the store, by runtime id. */
    byId(id: number): DataEntity | undefined;
    /** Dropped stacks within a horizontal radius, in ascending runtime id order. */
    itemsWithin(x: number, z: number, radius: number): readonly DataEntity[];
    /** Whether the block at a position is solid, or undefined when its chunk is not loaded. */
    solidAt(position: EntityPosition): boolean | undefined;
    /** The block at a position, or undefined when its chunk is not loaded. */
    blockAt(position: EntityPosition): string | undefined;
    /** The players of the dimension this tick, in the order the world holds them. */
    players(): readonly ItemTaker[];
    /** The lowest block y of the dimension. */
    minY(): number;
    /** One past the highest block y of the dimension. */
    maxY(): number;
    /** The level clock, which the hazard cadence counts. */
    gameTime(): number;
    /**
     * Whether an item survives a kind of damage on the ground, by Java damage type tag: netherite
     * survives `minecraft:is_fire` and a nether star `minecraft:is_explosion`.
     */
    resists(name: string, tag: string): boolean;
    /** The most of one item a stack holds. */
    maxCount(name: string): number;
    /** Takes an entity out of the store. */
    remove(id: number, reason: string): void;
    /**
     * Runs a blow on a stack through the store's damage pipeline, which removes it when it dies.
     * @returns Whether it took health off the stack.
     */
    damage(id: number, amount: number, cause: string): boolean;
    /**
     * Gives a stack to a player, with the take animation and the advancement.
     * @returns How many of the stack's items did not fit.
     */
    give(playerId: number, itemId: number, stack: StoredItemStack): number;
    /** Tells clients a stack's count changed, the one way a client hears that a merge happened. */
    stackChanged(itemId: number, count: number): void;
}

/** The dropped stacks of one runtime, and the system that runs each of them once a tick. */
export class DroppedItems {
    public constructor(private readonly host: DroppedItemsHost) {}

    /**
     * Puts a stack on the ground.
     * @param lying - Where the stack lies; the entity reports itself the definition's
     *   `position_offset` above it.
     * @returns The entity, or undefined when the content declares no dropped item or the stack is
     *   empty.
     */
    public spawn(lying: EntityPosition, start: ItemStart): DataEntity | undefined {
        if (start.stack.count <= 0) return undefined;
        const entity = this.host.spawn(ITEM_ENTITY, lying, {
            prepare: (prepared) => {
                if (isDroppedItem(prepared)) startItem(prepared, start);
            }
        });
        // A pack's own `minecraft:item` without the host component holds no stack to drop.
        if (entity !== undefined && !isDroppedItem(entity)) {
            this.host.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }
        return entity;
    }

    /** Takes a stack out of the store, which a kill does. */
    public remove(id: number, reason: string): void {
        this.host.remove(id, reason);
    }

    /** Whether an entity is either no dropped stack or one with a stack, so it may enter the world. */
    public isValid(entity: DataEntity): boolean {
        return !isDroppedItem(entity) || itemViewOf(entity) !== undefined;
    }

    /**
     * One dropped stack's tick, in the order the legacy item ran it: age and despawn, the pickup
     * delay, the move, then hazards, a merge and a pickup.
     */
    public update(entity: DataEntity): void {
        const tuning = itemTuningOf(entity);
        let view = itemViewOf(entity);
        if (view === undefined) {
            this.host.remove(entity.id, 'invalid_spawn_data');
            return;
        }

        view = updateView(entity, view, {
            age: view.age + 1,
            pickupDelay: view.age + 1 >= tuning.despawnAge ? view.pickupDelay : Math.max(0, view.pickupDelay - 1)
        });
        if (view.age >= tuning.despawnAge) {
            this.host.remove(entity.id, 'despawn');
            return;
        }

        this.move(entity, tuning);
        if (entity.position.y < this.host.minY() - VOID_DEPTH) {
            this.host.remove(entity.id, 'fell_out_of_world');
            return;
        }
        if (this.burn(entity, view, tuning)) return;
        this.merge(entity, view, tuning);
        if (entity.removed !== undefined) return;
        this.pickUp(entity, tuning);
    }

    /**
     * Hurts a dropped stack through the store's damage pipeline, which takes health off it with
     * no grace period, as Java's `ItemEntity.hurt`, and removes it when it dies.
     * @returns Whether the blow landed.
     */
    public hurt(entity: DataEntity, amount: number, cause: string): boolean {
        if (itemViewOf(entity) === undefined || amount <= 0) return false;
        return this.host.damage(entity.id, amount, cause);
    }

    /**
     * Whether a stack survives a kind of damage, because its item's `minecraft:damage_resistant`
     * names the damage: netherite survives fire and a nether star a blast. The store's damage
     * pipeline asks this as a guard, so a blast the runtime deals is turned aside too.
     * @param cause - The cause, by the server's name or Bedrock's.
     */
    public resistsDamage(entity: DataEntity, cause: string): boolean {
        const view = itemViewOf(entity);
        const tag = RESISTED_TAGS[damageCauseOf(cause)];
        return view !== undefined && tag !== undefined && this.host.resists(view.stack.name, tag);
    }

    /**
     * Takes up to `count` items out of a stack, which is what a mob picking it up does.
     * @returns The stack that was taken, or undefined when nothing of that id lies there.
     */
    public take(id: number, count?: number): StoredItemStack | undefined {
        const entity = this.host.byId(id);
        if (entity === undefined || entity.removed !== undefined || !isDroppedItem(entity)) return undefined;
        const view = itemViewOf(entity);
        if (view === undefined) return undefined;

        const available = view.stack.count;
        const taken = Math.min(available, count === undefined ? available : Math.max(0, Math.floor(count)));
        if (taken <= 0) return undefined;

        const remaining = available - taken;
        if (remaining === 0) this.host.remove(id, 'picked_up');
        else {
            updateView(entity, view, { stack: { ...view.stack, count: remaining } });
            this.host.stackChanged(id, remaining);
        }
        return { ...view.stack, count: taken };
    }

    /**
     * Moves the item one tick, in the order BDS does: gravity, then the move, then drag.
     *
     * It stops against a block sideways and comes to rest on top of the first solid block below.
     * An item that would read a block of a chunk that is not loaded waits where it is, with the
     * speed it has, and writes nothing, so the probe never loads a chunk. An item at rest does no
     * work and writes nothing either.
     */
    private move(entity: DataEntity, tuning: ItemTuning): void {
        const position = entity.position;
        const motion = entity.body.velocity;
        const feet = position.y - tuning.positionOffset;
        const still = motion.x === 0 && motion.y === 0 && motion.z === 0;
        if (still) {
            const below = this.solidAt(position.x, feet - tuning.groundProbe, position.z);
            if (below !== false) return;
        }

        let motionX = motion.x;
        let motionY = motion.y - tuning.gravity;
        let motionZ = motion.z;

        let x = position.x + motionX;
        const blockedX = this.solidAt(x, feet, position.z);
        if (blockedX === undefined) return;
        if (blockedX) {
            x = position.x;
            motionX = 0;
        }
        let z = position.z + motionZ;
        const blockedZ = this.solidAt(x, feet, z);
        if (blockedZ === undefined) return;
        if (blockedZ) {
            z = position.z;
            motionZ = 0;
        }

        let nextFeet = feet + motionY;
        const landed = this.solidAt(x, nextFeet, z);
        if (landed === undefined) return;
        if (landed) {
            // The step would end inside a block, so it comes to rest on top of that one instead.
            nextFeet = Math.floor(nextFeet) + 1;
            motionY = 0;
        }

        const sideways = landed ? tuning.groundDrag : tuning.airDrag;
        motionX *= sideways;
        motionZ *= sideways;
        if (Math.abs(motionX) < tuning.slideStop) motionX = 0;
        if (Math.abs(motionZ) < tuning.slideStop) motionZ = 0;
        entity.body.velocity = { x: motionX, y: motionY * tuning.airDrag, z: motionZ };

        const next = { x, y: nextFeet + tuning.positionOffset, z };
        if (next.x === position.x && next.y === position.y && next.z === position.z) return;
        entity.position = next;
    }

    /**
     * Whether the block a point is in stops an item, or undefined when its chunk is not loaded.
     * Above and below the dimension's blocks is open, so a stack falls into the void.
     */
    private solidAt(x: number, y: number, z: number): boolean | undefined {
        const block = blockPositionOf({ x, y, z });
        if (block.y < this.host.minY() || block.y >= this.host.maxY()) return false;
        return this.host.solidAt(block);
    }

    /**
     * Burns or pricks a stack lying in fire, lava or against a cactus, at the cadence and the
     * damage a player standing in the same block takes.
     * @returns Whether the stack burned away.
     */
    private burn(entity: DataEntity, view: ItemView, tuning: ItemTuning): boolean {
        if (this.host.gameTime() % HAZARD_INTERVAL !== 0) return false;
        const cause = this.hazardAt(entity, tuning);
        if (cause === undefined) return false;
        const damage = HAZARD_DAMAGE[cause];
        if (damage === undefined || view.stack.count <= 0) return false;
        this.hurt(entity, damage, cause);
        return entity.removed !== undefined;
    }

    /** The harm of the first hazard block the stack's box touches, from the feet up. */
    private hazardAt(entity: DataEntity, tuning: ItemTuning): string | undefined {
        const { x, z } = entity.position;
        const feet = entity.position.y - tuning.positionOffset;
        const half = entity.facts.box.width / 2 + HAZARD_CONTACT;
        const top = feet + entity.facts.box.height;
        for (let y = Math.floor(feet - HAZARD_CONTACT); y <= Math.floor(top); y += 1)
            for (let bx = Math.floor(x - half); bx <= Math.floor(x + half); bx += 1)
                for (let bz = Math.floor(z - half); bz <= Math.floor(z + half); bz += 1) {
                    const block = this.host.blockAt({ x: bx, y, z: bz });
                    const harm = block === undefined ? undefined : hazardOf(block);
                    if (harm !== undefined) return harm;
                }
        return undefined;
    }

    /**
     * Draws a neighboring stack of the same thing into this one.
     *
     * Only the older of a pair absorbs, decided by runtime id, so two stacks meeting cannot each
     * swallow the other. All of it or none of it, as vanilla does: two stacks that will not both
     * fit are left as two. Read from the live index in runtime id order, so a stack another merge
     * took this tick has already left it and one that slid over this tick is found where it slid to.
     */
    private merge(entity: DataEntity, start: ItemView, tuning: ItemTuning): void {
        let view = start;
        if (view.stack.count >= this.maxCountOf(view.stack)) return;
        const max = this.maxCountOf(view.stack);
        const { x, y, z } = entity.position;

        for (const other of this.host.itemsWithin(x, z, tuning.mergeRange)) {
            if (other === entity || other.removed !== undefined || other.id < entity.id) continue;
            const theirs = itemViewOf(other);
            if (theirs === undefined) continue;
            if (theirs.stack.name !== view.stack.name || (theirs.stack.meta ?? 0) !== (view.stack.meta ?? 0)) continue;
            const at = other.position;
            if (Math.hypot(at.x - x, at.y - y, at.z - z) > tuning.mergeRange) continue;
            if (view.stack.count + theirs.stack.count > max) continue;

            view = updateView(entity, view, { stack: { ...view.stack, count: view.stack.count + theirs.stack.count } });
            this.host.remove(other.id, 'merged');
            this.host.stackChanged(entity.id, view.stack.count);
        }
    }

    /**
     * Gives the stack to the first player standing close enough who is not a spectator, and takes
     * it out of the world.
     *
     * A full inventory leaves it where it is. A partial fit leaves what did not fit on the ground.
     */
    private pickUp(entity: DataEntity, tuning: ItemTuning): void {
        const view = itemViewOf(entity);
        if (view === undefined || view.pickupDelay > 0) return;

        const taker = this.host
            .players()
            .find((player) => player.spectator !== true && this.reaches(entity, player, tuning));
        if (taker === undefined) return;

        const left = this.host.give(taker.id, entity.id, view.stack);
        if (left >= view.stack.count) return;
        if (left <= 0) {
            this.host.remove(entity.id, 'picked_up');
            return;
        }
        updateView(entity, view, { stack: { ...view.stack, count: left } });
        this.host.stackChanged(entity.id, left);
    }

    /**
     * Whether a player is close enough to take this stack, measured to their body: zero while the
     * stack lies beside the body, and only what lies beyond it counts.
     */
    private reaches(entity: DataEntity, player: ItemTaker, tuning: ItemTuning): boolean {
        const { x, z } = entity.position;
        const lying = entity.position.y - tuning.positionOffset;
        const feet = player.position.y;
        const head = feet + PLAYER_BODY_HEIGHT;
        const dy = lying < feet ? feet - lying : Math.max(0, lying - head);
        return Math.hypot(x - player.position.x, dy, z - player.position.z) <= tuning.pickupRange;
    }

    private maxCountOf(stack: StoredItemStack): number {
        return this.host.maxCount(stack.name);
    }
}
