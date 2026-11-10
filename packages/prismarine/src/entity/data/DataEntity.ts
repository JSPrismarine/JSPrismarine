/**
 * One live data-driven entity: a type reference plus component state.
 *
 * What used to be a subclass per species is a reference to a resolved
 * `EntityType` and an `EntityInstance` holding the components that are active
 * now. A zombie differs from a cow in what its definition says, not in what
 * class it is, so this file is the only entity "class" the data-driven path
 * has.
 *
 * The body is split out of the entity because the actuator the goals drive has
 * to exist before the `EntityInstance` does: a goal component builds its
 * `GoalSupport` while the instance is being constructed, and that reads the
 * actuator straight away. So a {@link MobBody} is made first, the actuator
 * wraps it, and the entity is the pair.
 */
import type { EntityInstance, EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { hypot3 } from '@jsprismarine/math';
import type { Brain, BrainMobDefinition } from '@jsprismarine/entity-brains';
import { randomUUID } from 'node:crypto';

import type { ContentItemDrop } from '../../content/world/adapter';
import { DamageLog } from './damageLog';
import type { StatusEffect } from '../StatusEffect';
import type { MobEquipmentSet, MobEquipmentSlot } from '../equipment';
import { MOB_EQUIPMENT_SLOTS, NO_EQUIPMENT, sameEquipment } from '../equipment';
import type { EntityFacts } from './facts';
import { liveFactsOf } from './facts';
import { moveOnAxis } from './collision';
import { ObservedMap, ObservedSet } from './observedCollections';
import { entityEyePosition } from './position';
import { walkStride } from './travel';

/** How close to its destination an entity has to be to have arrived, in blocks. */
const ARRIVAL_RADIUS = 0.25;

/** How many ticks of no progress make a walk stuck, which is what a brain reads. */
const STUCK_TICKS = 100;

/** Below this many blocks per tick an impulse has spent itself, so the body stops. */
const IMPULSE_FLOOR = 0.003;

/** The movement rules the world supplies when a body takes its step. */
interface MobBodyStepOptions {
    /** Whether this entity's active navigation may move freely on the vertical axis. */
    readonly allowVertical: boolean;
    /** Whether the active navigation component permits a jump. */
    readonly canJump: boolean;
    /** The height of one step the entity may jump, in blocks. */
    readonly stepHeight: number;
    /** Whether the entity's collision box fits at the proposed position. */
    readonly canOccupy: (position: EntityPosition) => boolean;
    /** The Java friction of the block under the entity, which a walk on land accelerates against. */
    readonly groundFriction: number;
    /**
     * Draws how many ticks the entity waits on the ground before its next hop, for a mob that
     * moves by hopping, as `minecraft:movement.jump` does. Absent for a mob that walks.
     */
    readonly nextHopDelay?: () => number;
}

/** Java's default jump power for an entity without a jump component or attribute. */
const DEFAULT_JUMP_POWER = 0.42;

/** Java's `LivingEntity.jumpInLiquid` upward impulse, in blocks per tick. */
const FLUID_JUMP_IMPULSE = 0.04;

/**
 * The body fields a save or a replay digest reads, each held once and written through one
 * setter that reports the change ({@link MobBody.onWrite}).
 */
export interface LoggedBodyState {
    position: EntityPosition;
    yaw: number;
    pitch: number;
    velocity: EntityPosition;
    nameTag: string | undefined;
    color: number | undefined;
    home: EntityPosition | undefined;
    ownerIdentity: string | undefined;
    curedBy: string | undefined;
    sitting: boolean;
    sleeping: boolean;
    loveTicks: number;
    breedCooldown: number;
    beamTarget: EntityPosition | undefined;
    showBottom: boolean | undefined;
    invulnerable: boolean;
    fuseTicks: number | undefined;
    fireTicks: number;
    projectileAge: number;
    projectileStuck: boolean;
    equipment: MobEquipmentSet;
    inventory: readonly string[];
    containerSlots: readonly (ContentItemDrop | undefined)[];
}

/** The name of one {@link LoggedBodyState} field, or of a collection the body reports. */
export type LoggedBodyField = keyof LoggedBodyState | 'tags' | 'statusEffects' | 'equipmentInventorySlots';

/** What {@link MobBody.onWrite} receives: one field, with its value before and after a change. */
export type BodyWriteObserver = (field: LoggedBodyField, before: unknown, after: unknown) => void;

/** Whether two values of a logged field are the same, comparing positions by coordinates. */
const sameValue = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (!isRecord(left) || !isRecord(right)) return false;
    return (
        typeof left['x'] === 'number' &&
        left['x'] === right['x'] &&
        left['y'] === right['y'] &&
        left['z'] === right['z'] &&
        Object.keys(left).length === 3 &&
        Object.keys(right).length === 3
    );
};

/**
 * Everything about a live entity that exists before its components do.
 *
 * The split is forced rather than chosen: a goal component builds its
 * `GoalSupport` while the `EntityInstance` is being constructed, and that
 * support reads the actuator and the goal world there and then. So everything
 * those two seams touch has to exist first, which is where it is - the
 * position, the walk, the attack target, the home and the carried item.
 *
 * Both AI systems drive this one object: `EntityActuator` for the goals and
 * `BrainNavigation` for the brains. The camel and the happy ghast run both,
 * and they have to agree about where the entity is.
 */
export class MobBody {
    /**
     * Told whenever the entity moves, so an index over positions can keep up.
     *
     * {@link EntityRuntime} sets it to refile the body in its spatial index.
     * An accessor rather than a field because the index is wrong the instant
     * it misses a move, and there are five places that write a position: the
     * walk, the impulse, a knockback, a teleport and being carried.
     */
    public onMove: (() => void) | undefined;

    /**
     * Told about every change to a field a save or a digest reads, with the value before and
     * after it.
     *
     * {@link EntityRuntime} sets it to append the change to the world's change log. A write
     * that leaves a field as it was is not reported, and a position is compared by its
     * coordinates.
     */
    public onWrite: BodyWriteObserver | undefined;

    /**
     * Takes the impulses aimed at a body whose client owns its movement, such as a player's.
     *
     * Set by {@link EntityRuntime} for those bodies only. The server cannot move such a body, so
     * {@link MobBody.push} hands the impulse here, where it becomes an occurrence replication
     * sends to the client, and the body's velocity stays as it was.
     */
    public onImpulse: ((impulse: EntityPosition) => void) | undefined;

    /** Whether the next client movement update must snap to this body's position. */
    public teleportPending = false;

    /** The boolean facts a brain reads off the body, such as `on_ground` or `aggressive`. */
    public readonly conditions = new Set<string>();

    /** The entity's dynamic string tags, shared with `/tag` and `has_tag` filters. */
    public readonly tags = new ObservedSet<string>();

    /** The status effects mirrored by the client-facing entity body. */
    public readonly statusEffects = new ObservedMap<string, StatusEffect>();

    /** Who the entity is fighting, by runtime id, or undefined when it is fighting nobody. */
    public target: number | undefined;

    /** The fields a save reads, each behind an accessor below that reports its changes. */
    private readonly logged: LoggedBodyState;

    /** Set while {@link MobBody.restore} writes, which keeps the side effects of a setter from running. */
    private restoring = false;

    /** Where the entity faces, in degrees. */
    public get yaw(): number {
        return this.logged.yaw;
    }

    public set yaw(yaw: number) {
        this.write('yaw', yaw);
    }

    /** The entity's head pitch, in degrees. */
    public get pitch(): number {
        return this.logged.pitch;
    }

    public set pitch(pitch: number) {
        this.write('pitch', pitch);
    }

    /** The custom name set by an accepted name tag. */
    public get nameTag(): string | undefined {
        return this.logged.nameTag;
    }

    public set nameTag(nameTag: string | undefined) {
        this.write('nameTag', nameTag);
    }

    /** The palette color set by an accepted dye, overriding `minecraft:color` from the definition. */
    public get color(): number | undefined {
        return this.logged.color;
    }

    public set color(color: number | undefined) {
        this.write('color', color);
    }

    /** Ticks remaining on an active `minecraft:explode` fuse, if this component is lit. */
    public get fuseTicks(): number | undefined {
        return this.logged.fuseTicks;
    }

    public set fuseTicks(fuseTicks: number | undefined) {
        this.write('fuseTicks', fuseTicks);
    }

    /**
     * The block an end crystal's beam points at, or undefined for no beam.
     *
     * Sent to the client as the `BLOCK_TARGET` actor data. The client treats the zero
     * position the same as an absent key, so clearing a beam it has already seen means
     * writing `{ x: 0, y: 0, z: 0 }` rather than undefined.
     */
    public get beamTarget(): EntityPosition | undefined {
        return this.logged.beamTarget;
    }

    public set beamTarget(beamTarget: EntityPosition | undefined) {
        this.write('beamTarget', beamTarget);
    }

    /**
     * Whether an end crystal draws its bedrock base plate.
     *
     * Undefined keeps the client's default, which is to draw it; the end crystal item
     * spawns with false, as Java's `EndCrystalItem.useOn` does.
     */
    public get showBottom(): boolean | undefined {
        return this.logged.showBottom;
    }

    public set showBottom(showBottom: boolean | undefined) {
        this.write('showBottom', showBottom);
    }

    /** Whether the entity refuses all damage, as the respawn sequence's crystals do. */
    public get invulnerable(): boolean {
        return this.logged.invulnerable;
    }

    public set invulnerable(invulnerable: boolean) {
        this.write('invulnerable', invulnerable);
    }

    /** Ticks an ignited entity remains visibly on fire after leaving sunlight. */
    public get fireTicks(): number {
        return this.logged.fireTicks;
    }

    public set fireTicks(fireTicks: number) {
        this.write('fireTicks', fireTicks);
    }

    /** The entity's home position, from `minecraft:home` or a `set_home_position` event. */
    public get home(): EntityPosition | undefined {
        return this.logged.home;
    }

    public set home(home: EntityPosition | undefined) {
        this.write('home', home);
    }

    /**
     * What the entity is holding and wearing, rolled from `minecraft:equipment` at spawn.
     *
     * The main hand of this is what {@link MobBody.carried} reads and writes, so the goals'
     * one-identifier view of a held item and the body's full set are the same state rather
     * than two that can disagree. See `entity/equipment.ts`. Written through
     * {@link MobBody.setEquipment}.
     */
    public get equipment(): MobEquipmentSet {
        return this.logged.equipment;
    }

    /**
     * How many times {@link MobBody.equipment} has been written.
     *
     * Read by `liveBodies`, which mirrors equipment onto the client-visible body: comparing a
     * counter is what keeps a tick that changed nothing from encoding five items per mob just
     * to find that out. Equipment changes a handful of times in a mob's life, so the steady
     * state is this number not moving.
     */
    public equipmentRevision = 0;

    /** Called after default equipment changes, once the entity's component state is active. */
    public onEquipmentChanged: ((previous: MobEquipmentSet, next: MobEquipmentSet) => void) | undefined;

    /**
     * What the entity holds in its main hand, as an item identifier.
     *
     * The goals' view of {@link MobBody.equipment}: a villager's trade offer, an enderman's
     * carried block and whatever `pickup_items` picked up are all written through here. An
     * accessor rather than a field so that a goal setting a held item and a spawn roll putting
     * a bow in the same hand are one piece of state, which is what makes the single write
     * funnel possible.
     */
    public get carried(): string | undefined {
        return this.equipment.mainhand?.identifier;
    }

    public set carried(identifier: string | undefined) {
        if (identifier === this.carried) return;

        this.setEquipment(
            identifier === undefined
                ? { ...this.equipment, mainhand: undefined }
                : { ...this.equipment, mainhand: { identifier, count: 1 } }
        );
    }

    /**
     * Replaces everything the entity is holding and wearing.
     *
     * Drops a write that changes nothing, which is the same guard
     * `blockentity/blockEntityWrite.ts` applies to a block entity and for the same reason: a
     * write nobody could see is a packet nobody needs. A restored entity is the case that hits
     * it, because a save holds what the spawn roll already produced.
     *
     * @param equipment - The new set, replacing the old one whole.
     * @returns Whether anything changed.
     */
    public setEquipment(equipment: MobEquipmentSet): boolean {
        if (sameEquipment(this.equipment, equipment)) return false;

        const previous = this.equipment;

        for (const slot of MOB_EQUIPMENT_SLOTS) {
            if (!sameEquipment({ [slot]: this.equipment[slot] }, { [slot]: equipment[slot] }))
                this.equipmentInventorySlots.delete(slot);
        }

        this.write('equipment', equipment);
        this.equipmentRevision += 1;
        this.onEquipmentChanged?.(previous, equipment);

        return true;
    }

    /** What the entity carries that is not in its hand, as item identifiers. */
    public get inventory(): readonly string[] {
        return this.logged.inventory;
    }

    /** Replaces what the entity carries outside its hand. */
    public setInventory(inventory: readonly string[]): void {
        if (
            inventory.length === this.inventory.length &&
            inventory.every((item, index) => item === this.inventory[index])
        )
            return;
        this.write('inventory', [...inventory]);
    }

    /** Item stacks in the entity container declared by `minecraft:inventory`. */
    public get containerSlots(): readonly (ContentItemDrop | undefined)[] {
        return this.logged.containerSlots;
    }

    /**
     * Puts a stack in one container slot, or empties it.
     *
     * @param index - The slot. A slot past the end grows the container with empty slots.
     * @param item - The stack, or undefined to empty the slot.
     */
    public setContainerSlot(index: number, item: ContentItemDrop | undefined): void {
        if (this.containerSlots[index] === item && index < this.containerSlots.length) return;
        const slots = [...this.containerSlots];
        slots[index] = item;
        this.write('containerSlots', slots);
    }

    /** Replaces every container slot. */
    public setContainerSlots(slots: readonly (ContentItemDrop | undefined)[]): void {
        this.write('containerSlots', [...slots]);
    }

    /** Capacity of the active `minecraft:inventory` component, for filters and slot validation. */
    public containerCapacity = 0;

    /** Inventory indices projected into wearable equipment slots by an interaction. */
    public readonly equipmentInventorySlots = new ObservedMap<MobEquipmentSlot, number>();

    /** Who has hurt the entity, with the running total each has dealt. */
    public readonly damage = new DamageLog();

    /** Who last knocked the entity about, which `target_when_pushed` reads. */
    public lastPusher: number | undefined;

    /** The online owner's runtime id, or undefined while its owner is offline or absent. */
    public owner: number | undefined;

    /** Stable player identity behind {@link MobBody.owner}, retained across server restarts. */
    public get ownerIdentity(): string | undefined {
        return this.logged.ownerIdentity;
    }

    public set ownerIdentity(ownerIdentity: string | undefined) {
        this.write('ownerIdentity', ownerIdentity);
    }

    /**
     * The identity of the player who cured this villager. A zombie villager holds the player who
     * fed it the golden apple here, and the villager it becomes inherits it.
     */
    public get curedBy(): string | undefined {
        return this.logged.curedBy;
    }

    public set curedBy(curedBy: string | undefined) {
        this.write('curedBy', curedBy);
    }

    /** The player with the entity's trade screen open, by runtime id. */
    public tradingPlayer: number | undefined;

    /** Whether the entity is sat down, which the sit goals hold while they run. */
    public get sitting(): boolean {
        return this.logged.sitting;
    }

    public set sitting(sitting: boolean) {
        this.write('sitting', sitting);
    }

    /** Whether the entity is asleep, which the sleep and nap goals hold while they run. */
    public get sleeping(): boolean {
        return this.logged.sleeping;
    }

    public set sleeping(sleeping: boolean) {
        this.write('sleeping', sleeping);
    }

    /**
     * How many ticks the entity stays in love, which is what feeding it a
     * breeding item sets and what `minecraft:behavior.breed` spends.
     */
    public get loveTicks(): number {
        return this.logged.loveTicks;
    }

    public set loveTicks(loveTicks: number) {
        this.write('loveTicks', loveTicks);
    }

    /** How many ticks before the entity may breed again, from Java's `Animal.ageUp`. */
    public get breedCooldown(): number {
        return this.logged.breedCooldown;
    }

    public set breedCooldown(breedCooldown: number) {
        this.write('breedCooldown', breedCooldown);
    }

    /** Movement velocity in blocks per tick, including projectile flight. */
    public get velocity(): EntityPosition {
        return this.logged.velocity;
    }

    public set velocity(velocity: EntityPosition) {
        this.write('velocity', velocity);
    }

    /** Ticks spent in flight by `minecraft:projectile`, retained across a world restart. */
    public get projectileAge(): number {
        return this.logged.projectileAge;
    }

    public set projectileAge(projectileAge: number) {
        this.write('projectileAge', projectileAge);
    }

    /** Whether the projectile has stuck to a block and should remain there until expiry. */
    public get projectileStuck(): boolean {
        return this.logged.projectileStuck;
    }

    public set projectileStuck(projectileStuck: boolean) {
        this.write('projectileStuck', projectileStuck);
    }

    private instance: EntityInstance | undefined;
    private destination: EntityPosition | undefined;
    private speedMultiplier = 1;
    /** Blocks per tick a walk on land carries into the next tick, along the heading. */
    private walkMomentum = 0;
    /** Ticks a hopping mob still waits on the ground before its next hop. */
    private hopWait = 0;
    /** Draws a hopping mob's next wait, from the last step that walked it on land. */
    private hopDelay: (() => number) | undefined;
    /** Whether the body jumped this tick, which Java still travels as a tick on the ground. */
    private takingOff = false;
    /** Ticks since the destination was set without the entity getting any closer. */
    private idleTicks = 0;
    private lastDistance = Number.POSITIVE_INFINITY;
    private live: EntityFacts;

    public constructor(
        /** The runtime id, unique for the length of the session. */
        public readonly id: number,
        position: EntityPosition,
        /** What the type's base components declare, which {@link MobBody.facts} falls back to. */
        public readonly typeFacts: EntityFacts
    ) {
        this.logged = {
            position,
            yaw: 0,
            pitch: 0,
            velocity: { x: 0, y: 0, z: 0 },
            nameTag: undefined,
            color: undefined,
            home: undefined,
            ownerIdentity: undefined,
            curedBy: undefined,
            sitting: false,
            sleeping: false,
            loveTicks: 0,
            breedCooldown: 0,
            beamTarget: undefined,
            showBottom: undefined,
            invulnerable: false,
            fuseTicks: undefined,
            fireTicks: 0,
            projectileAge: 0,
            projectileStuck: false,
            equipment: NO_EQUIPMENT,
            inventory: [],
            containerSlots: []
        };
        this.live = typeFacts;
        this.tags.observer = (before) => this.report('tags', before, [...this.tags]);
        this.statusEffects.observer = (before) =>
            this.report(
                'statusEffects',
                before.map(([, effect]) => effect),
                [...this.statusEffects.values()]
            );
        this.equipmentInventorySlots.observer = (before) =>
            this.report('equipmentInventorySlots', before, [...this.equipmentInventorySlots]);
    }

    /**
     * Writes a saved value back into one field without running the setter's side effects: no
     * {@link MobBody.onWrite} report, no equipment hook, and no change to the inventory slots
     * that a new equipment set would clear. A position still refiles the body in its index,
     * because the index is derived from the position. This is how the entity store undoes a
     * change.
     */
    public restore<K extends keyof LoggedBodyState>(field: K, value: LoggedBodyState[K]): void {
        this.restoring = true;
        try {
            this.logged[field] = value;
            if (field === 'equipment') this.equipmentRevision += 1;
            if (field === 'position') this.onMove?.();
        } finally {
            this.restoring = false;
        }
    }

    /**
     * The one write path of the logged fields. An equal value is still stored, because caches
     * keyed by a position's identity read the new object as a move, and it is not reported.
     */
    private write<K extends keyof LoggedBodyState>(field: K, value: LoggedBodyState[K]): void {
        const before = this.logged[field];
        this.logged[field] = value;
        if (!sameValue(before, value)) this.report(field, before, value);
    }

    private report(field: LoggedBodyField, before: unknown, after: unknown): void {
        if (!this.restoring) this.onWrite?.(field, before, after);
    }

    /**
     * The entity's facts as its components make them now.
     *
     * Everything that reads a stat off a body reads it here, and `minecraft:movement`
     * is why: fifteen vanilla types, the zombie and the slime among them, declare it
     * only in a component group their spawn event adds, so the type's figure is zero
     * and a body that trusted it never moved a block.
     *
     * The type's own facts until {@link MobBody.watch} runs, because a body exists
     * before the component state does - a goal component reads the actuator while
     * the `EntityInstance` is still being built.
     */
    public get facts(): EntityFacts {
        return this.live;
    }

    /**
     * Points the body's facts at the component state, which is what makes them live.
     *
     * Called by {@link DataEntity}'s constructor, the first moment both halves of an
     * entity exist, so no caller has to remember to.
     */
    public watch(instance: EntityInstance): void {
        this.instance = instance;
        this.live = liveFactsOf(this.typeFacts, instance);
    }

    /** Where the entity is now. */
    public get position(): EntityPosition {
        return this.logged.position;
    }

    public set position(position: EntityPosition) {
        this.write('position', position);
        this.onMove?.();
    }

    /** The namespaced identifier, such as `minecraft:zombie`. */
    public get identifier(): string {
        return this.facts.identifier;
    }

    /** Whether a walk is under way. */
    public get walking(): boolean {
        return this.destination !== undefined;
    }

    /** Whether the entity has stopped making progress towards its destination. */
    public get stuck(): boolean {
        return this.destination !== undefined && this.idleTicks >= STUCK_TICKS;
    }

    /** Whether an impulse is still carrying the entity, which suspends its walk. */
    public get airborne(): boolean {
        const { x, y, z } = this.velocity;
        return Math.abs(x) > IMPULSE_FLOOR || Math.abs(y) > IMPULSE_FLOOR || Math.abs(z) > IMPULSE_FLOOR;
    }

    /** Adds to the entity's own velocity, which is what a leap or a charge is. */
    public push(velocity: EntityPosition): void {
        if (this.onImpulse !== undefined) {
            this.onImpulse(velocity);
            return;
        }
        this.velocity = {
            x: this.velocity.x + velocity.x,
            y: this.velocity.y + velocity.y,
            z: this.velocity.z + velocity.z
        };
    }

    /** Drops the impulse, which is what landing does. */
    public land(): void {
        this.velocity = { x: 0, y: 0, z: 0 };
        this.conditions.delete('jumping');
        this.conditions.add('on_ground');
    }

    /** Jumps from the ground or applies Java's upward fluid impulse while swimming. */
    public jump(): void {
        const instance = this.instance;
        if (instance === undefined) return;

        if (this.conditions.has('in_water') || this.conditions.has('in_lava')) {
            this.push({ x: 0, y: FLUID_JUMP_IMPULSE, z: 0 });
            return;
        }

        if (!this.conditions.has('on_ground') || this.airborne) return;

        const navigation = instance.activeComponents().find((name) => name.startsWith('minecraft:navigation.'));
        if (navigation !== undefined) {
            const params = instance.componentParams(navigation);
            if (isRecord(params) && params.canJump === false) return;
        }

        // A hopper's move control owns its cadence, as Java's `SlimeMoveControl` does: a jump
        // a goal asks for during the wait is refused, and every hop starts the next wait.
        if (this.hopDelay !== undefined) {
            if (this.hopWait > 0) return;
            this.hopWait = this.hopDelay();
        }

        const params = instance.componentParams('minecraft:jump.static');
        const jumpPower =
            isRecord(params) && typeof params.jumpPower === 'number' ? params.jumpPower : DEFAULT_JUMP_POWER;
        this.push({ x: 0, y: jumpPower, z: 0 });
        this.conditions.delete('on_ground');
        this.conditions.add('jumping');
        this.takingOff = true;
        if (jumpPower > 0) instance.trigger('minecraft:on_start_takeoff');
    }

    /** Starts walking towards a position at a multiple of the entity's own speed. */
    public moveTo(position: EntityPosition, speedMultiplier: number): void {
        this.destination = position;
        this.speedMultiplier = speedMultiplier;
        this.idleTicks = 0;
        this.lastDistance = Number.POSITIVE_INFINITY;
    }

    /** Abandons the current walk. */
    public stopMoving(): void {
        this.destination = undefined;
    }

    /**
     * Drops the walk's momentum, for a tick the body takes no step. A goal that stops and
     * starts again within one tick, as a re-aimed path does, keeps it, as Java's velocity would.
     */
    public rest(): void {
        this.walkMomentum = 0;
        this.takingOff = false;
    }

    /** Moves instantly, clears the current impulse, and marks the client update as a teleport. */
    public teleportTo(position: EntityPosition): void {
        this.velocity = { x: 0, y: 0, z: 0 };
        this.conditions.delete('jumping');
        this.stopMoving();
        this.rest();
        this.position = position;
        this.teleportPending = true;
    }

    /** Points the entity's head at a position. */
    public lookAt(position: EntityPosition): void {
        const eye = entityEyePosition(this.position, this.facts.box.height);
        const dx = position.x - eye.x;
        const dz = position.z - eye.z;
        const dy = position.y - eye.y;
        this.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
        this.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    }

    /**
     * Advances the walk by one tick.
     *
     * The step uses the entity's `minecraft:movement` on land and
     * `minecraft:underwater_movement` in water, scaled by whatever the goal
     * asked for, so a goal's `speed_multiplier` means the same thing here as it
     * does in the behavior pack.
     */
    public step(options?: MobBodyStepOptions): void {
        const destination = this.destination;
        if (destination === undefined) return;

        if (
            options !== undefined &&
            !options.allowVertical &&
            options.canJump &&
            destination.y > this.position.y + ARRIVAL_RADIUS &&
            destination.y <= this.position.y + options.stepHeight + ARRIVAL_RADIUS &&
            !this.airborne
        )
            this.jump();

        // Vertical knockback carries a grounded walker until it lands. Horizontal entity
        // pushes and knockback still combine with the navigation input, as they do in Java.
        if (
            Math.abs(this.velocity.y) > IMPULSE_FLOOR &&
            !this.conditions.has('jumping') &&
            options?.allowVertical !== true
        )
            return;

        const target = options?.allowVertical === false ? { ...destination, y: this.position.y } : destination;
        const remaining =
            options?.allowVertical === false
                ? horizontalDistance(this.position, target)
                : distance(this.position, target);
        if (remaining <= ARRIVAL_RADIUS) {
            this.destination = undefined;
            return;
        }

        if (remaining < this.lastDistance - 1e-6) {
            this.lastDistance = remaining;
            this.idleTicks = 0;
        } else {
            this.idleTicks += 1;
        }

        const inWater = this.conditions.has('in_water');
        const movement = inWater ? this.facts.underwaterMovement : this.facts.movement;
        const speed = movement * this.speedMultiplier;
        if (speed <= 0) return;

        // A walk on land follows Java's travel, where the speed is an acceleration that friction
        // balances, not a distance per tick. Flying, swimming and climbing keep the plain speed.
        let stride = speed;
        if (options !== undefined && !options.allowVertical && !inWater) {
            this.hopDelay = options.nextHopDelay;
            const tookOff = this.takingOff;
            this.takingOff = false;
            // A body no physics marks on the ground stands on it while no impulse carries it.
            const grounded = tookOff || this.conditions.has('on_ground') || !this.airborne;
            if (this.hopDelay !== undefined && grounded && !tookOff) {
                // Java's `SlimeMoveControl`: on the ground a hopper waits out its delay standing
                // still, then hops, and covers ground only on the way up and down.
                if (this.hopWait > 0) {
                    this.hopWait -= 1;
                    this.rest();
                    this.lookAt(destination);
                    return;
                }
                // This tick is the take-off, and it already travels as a tick on the ground.
                this.jump();
                this.takingOff = false;
            }
            const next = walkStride(this.walkMomentum, speed, grounded, options.groundFriction);
            this.walkMomentum = next.momentum;
            stride = next.stride;
        }

        const scale = Math.min(stride, remaining) / remaining;
        const proposed = {
            x: this.position.x + (destination.x - this.position.x) * scale,
            y: this.position.y + (target.y - this.position.y) * scale,
            z: this.position.z + (destination.z - this.position.z) * scale
        };

        if (options === undefined) {
            this.position = proposed;
        } else {
            let resolved = this.position;
            if (options.allowVertical) {
                resolved = moveOnAxis(resolved, proposed.y, 'y', options.canOccupy);
            }

            resolved = moveOnAxis(resolved, proposed.x, 'x', options.canOccupy);
            resolved = moveOnAxis(resolved, proposed.z, 'z', options.canOccupy);

            this.position = resolved;
        }
        this.lookAt(destination);
    }
}

/** What a caller says about an entity it creates. */
export interface DataEntityOptions {
    readonly body: MobBody;
    readonly instance: EntityInstance;
    /** Stable identity used to restore relationships that survive a server session. */
    readonly persistentIdentity?: string;
    /** Entity-specific fields supplied by the source that spawned it. */
    readonly spawnData?: Readonly<Record<string, unknown>>;
    /** The brain definition for one of the twenty Java brain mobs, when the type is one. */
    readonly brainMob?: BrainMobDefinition;
    /** The brain itself, built from {@link DataEntityOptions.brainMob}. */
    readonly brain?: Brain;
}

/** One live entity in the data-driven runtime. */
export class DataEntity {
    /** Where the entity is, where it is going, and what it is after. */
    public readonly body: MobBody;

    /** Stable identity used by persistent relationships such as spawned leash holders. */
    public readonly persistentIdentity: string;

    /** The component state machine, which owns the events, properties and goals. */
    public readonly instance: EntityInstance;

    /** Entity-specific fields supplied by the source that spawned it. */
    public readonly spawnData: Readonly<Record<string, unknown>> | undefined;

    /** The brain definition, for one of the twenty mobs Bedrock's JSON cannot express. */
    public readonly brainMob: BrainMobDefinition | undefined;

    /** The live brain, or undefined for a goal-only entity. */
    public readonly brain: Brain | undefined;

    /** Why the entity was taken out of the world, or undefined while it is still in it. */
    public removed: string | undefined;

    public constructor(options: DataEntityOptions) {
        this.body = options.body;
        this.persistentIdentity = options.persistentIdentity ?? randomUUID();
        this.instance = options.instance;
        this.spawnData = options.spawnData;
        this.brainMob = options.brainMob;
        this.brain = options.brain;
        this.body.watch(this.instance);
    }

    /** The runtime id, unique for the length of the session. */
    public get id(): number {
        return this.body.id;
    }

    /** The entity's facts as its active components make them now: its box, its stats and its families. */
    public get facts(): EntityFacts {
        return this.body.facts;
    }

    /** The namespaced identifier, such as `minecraft:zombie`. */
    public get identifier(): string {
        return this.body.identifier;
    }

    /** The boolean facts a brain reads off the body, such as `on_ground` or `aggressive`. */
    public get conditions(): Set<string> {
        return this.body.conditions;
    }

    /** Who the entity is fighting, by runtime id, or undefined when it is fighting nobody. */
    public get target(): number | undefined {
        return this.body.target;
    }

    public set target(id: number | undefined) {
        this.body.target = id;
    }

    /** What the entity holds in its main hand. */
    public get carried(): string | undefined {
        return this.body.carried;
    }

    public set carried(identifier: string | undefined) {
        this.body.carried = identifier;
    }

    /** Everything the entity is holding and wearing. */
    public get equipment(): MobEquipmentSet {
        return this.body.equipment;
    }

    /** Where the entity is now. */
    public get position(): EntityPosition {
        return this.body.position;
    }

    public set position(position: EntityPosition) {
        this.body.position = position;
    }

    /**
     * Whether the entity runs the goal scheduler.
     *
     * Every entity that is not a brain mob does, and so do the two that run
     * both systems: `Camel` and `HappyGhast` carry `registerGoals` as well as
     * `brainProvider` in Java, which is what `alsoRunsGoals` records.
     */
    public get runsGoals(): boolean {
        return this.brainMob === undefined || this.brainMob.alsoRunsGoals;
    }

    /** Advances the walk by one tick. */
    public step(options?: MobBodyStepOptions): void {
        this.body.step(options);
    }
}

/** The straight-line distance between two positions. */
export const distance = (from: EntityPosition, to: EntityPosition): number =>
    hypot3(to.x - from.x, to.y - from.y, to.z - from.z);

/** The horizontal distance between two positions, ignoring height. */
const horizontalDistance = (from: EntityPosition, to: EntityPosition): number =>
    Math.hypot(to.x - from.x, to.z - from.z);

/**
 * The square of the straight-line distance between two positions.
 *
 * Squaring orders positions the same way the distance does and costs three
 * multiplications instead of a `Math.hypot`, so a scan that only compares,
 * either against a radius or against another candidate, uses this. Use
 * {@link distance} wherever the number itself is the answer, because a squared
 * distance is not one.
 */
export const squaredDistance = (from: EntityPosition, to: EntityPosition): number => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return dx * dx + dy * dy + dz * dz;
};
