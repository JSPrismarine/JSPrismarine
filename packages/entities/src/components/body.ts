/** Components describing an entity's body: attributes, size, physics, inventory, equipment and riding. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { EntityHooks } from '../hooks';
import type { RideableParams } from '../riding';
import type { ComponentRecord } from './schemas';
import { asList, attributeComponent, booleanAt, isRecord, numberAt, numberComponent, stringAt } from './schemas';

/** The component default used when an entity has no underwater movement component. */
export const DEFAULT_UNDERWATER_MOVEMENT = 0.02;

/** The attribute components, each one number the server reads off the entity. */
export const attributeComponents: readonly ComponentFactory<
    EntityHooks,
    { readonly value: number; readonly max: number }
>[] = [
    attributeComponent('minecraft:health', 'health', 20),
    attributeComponent('minecraft:movement', 'movement', 0.25),
    attributeComponent('minecraft:underwater_movement', 'underwater_movement', DEFAULT_UNDERWATER_MOVEMENT),
    attributeComponent('minecraft:lava_movement', 'lava_movement', 0.02),
    attributeComponent('minecraft:flying_speed', 'flying_speed', 0.02),
    attributeComponent('minecraft:follow_range', 'follow_range', 16),
    attributeComponent('minecraft:knockback_resistance', 'knockback_resistance', 0),
    attributeComponent('minecraft:attack_damage', 'attack_damage', 1),
    attributeComponent('minecraft:horse.jump_strength', 'jump_strength', 0.7)
];

/** Reads a non-negative safe integer from a component body. */
const nonNegativeIntegerAt = (body: ComponentRecord, key: string, fallback: number): number | undefined => {
    const value = body[key];
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

/** What `minecraft:collision_box` declares, in blocks. */
export interface CollisionBoxParams {
    readonly width: number;
    readonly height: number;
}

/** `minecraft:collision_box`, the entity's hitbox. */
export const collisionBox: ComponentFactory<EntityHooks, CollisionBoxParams> = {
    name: 'minecraft:collision_box',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ width: numberAt(value, 'width', 1), height: numberAt(value, 'height', 1) })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:type_family` declares. */
export interface TypeFamilyParams {
    /** The families `is_family` matches against. */
    readonly family: readonly string[];
}

/** `minecraft:type_family`, the families the most used filter test reads. */
export const typeFamily: ComponentFactory<EntityHooks, TypeFamilyParams> = {
    name: 'minecraft:type_family',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const family = asList(value.family).filter((name): name is string => typeof name === 'string');
        return accepted({ family });
    },
    create: () => ({})
};

/** What `minecraft:loot` declares. */
export interface LootParams {
    /** The pack-relative path of the loot table, such as `loot_tables/entities/zombie.json`. */
    readonly table?: string;
}

/** `minecraft:loot`, the table a later agent rolls on death. */
export const loot: ComponentFactory<EntityHooks, LootParams> = {
    name: 'minecraft:loot',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ table: stringAt(value, 'table') }) : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:experience_reward` declares; both fields are Molang expressions. */
export interface ExperienceRewardParams {
    readonly onDeath?: string;
    readonly onBred?: string;
}

/** `minecraft:experience_reward`, the experience an entity drops. */
export const experienceReward: ComponentFactory<EntityHooks, ExperienceRewardParams> = {
    name: 'minecraft:experience_reward',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ onDeath: stringAt(value, 'on_death'), onBred: stringAt(value, 'on_bred') })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:physics` declares. */
export interface PhysicsParams {
    readonly hasGravity: boolean;
    readonly hasCollision: boolean;
    readonly pushTowardsClosestSpace: boolean;
}

/** `minecraft:physics`, carried by 126 of the 129 vanilla entities. */
export const physics: ComponentFactory<EntityHooks, PhysicsParams> = {
    name: 'minecraft:physics',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  hasGravity: booleanAt(value, 'has_gravity', true),
                  hasCollision: booleanAt(value, 'has_collision', true),
                  pushTowardsClosestSpace: booleanAt(value, 'push_towards_closest_space', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:pushable` declares. */
export interface PushableParams {
    readonly isPushable: boolean;
    readonly isPushableByPiston: boolean;
}

/** `minecraft:pushable`, which the 1.26.50 component schema omits but 27 entities use. */
export const pushable: ComponentFactory<EntityHooks, PushableParams> = {
    name: 'minecraft:pushable',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  isPushable: booleanAt(value, 'is_pushable', true),
                  isPushableByPiston: booleanAt(value, 'is_pushable_by_piston', true)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:inventory` declares. */
export interface InventoryParams {
    readonly containerType: string;
    readonly inventorySize: number;
    readonly isPrivate: boolean;
    readonly restrictToOwner: boolean;
    readonly additionalSlotsPerStrength: number;
    readonly canBeSiphonedFrom: boolean;
}

/** `minecraft:inventory`, the container a mob carries. */
export const inventory: ComponentFactory<EntityHooks, InventoryParams> = {
    name: 'minecraft:inventory',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  containerType: stringAt(value, 'container_type') ?? 'inventory',
                  inventorySize: numberAt(value, 'inventory_size', 5),
                  isPrivate: booleanAt(value, 'private', false),
                  restrictToOwner: booleanAt(value, 'restrict_to_owner', false),
                  additionalSlotsPerStrength: numberAt(value, 'additional_slots_per_strength', 0),
                  canBeSiphonedFrom: booleanAt(value, 'can_be_siphoned_from', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:strength` declares. */
export interface StrengthParams {
    /** The current strength value, which increases an entity's inventory capacity. */
    readonly value: number;
    /** The maximum strength value this entity can reach. */
    readonly max: number;
}

/** `minecraft:strength`, which contributes slots to an entity's inventory. */
export const strength: ComponentFactory<EntityHooks, StrengthParams> = {
    name: 'minecraft:strength',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const current = nonNegativeIntegerAt(value, 'value', 1);
        const max = nonNegativeIntegerAt(value, 'max', 5);
        if (current === undefined || max === undefined)
            return rejected('strength values must be non-negative integers');
        return accepted({ value: current, max });
    },
    create: () => ({})
};

/** Whether a value has the normalized shape produced by `minecraft:strength`. */
export const isStrengthParams = (value: unknown): value is StrengthParams =>
    isRecord(value) &&
    typeof value.value === 'number' &&
    Number.isSafeInteger(value.value) &&
    value.value >= 0 &&
    typeof value.max === 'number' &&
    Number.isSafeInteger(value.max) &&
    value.max >= 0;

/** One entry of `minecraft:equipment.slot_drop_chance`. */
export interface SlotDropChance {
    readonly slot: string;
    readonly dropChance: number;
}

/** What `minecraft:equipment` declares. */
export interface EquipmentParams {
    /** The loot table the entity equips from. */
    readonly table?: string;
    readonly slotDropChance: readonly SlotDropChance[];
}

/** `minecraft:equipment`, the loot table a mob wears. */
export const equipment: ComponentFactory<EntityHooks, EquipmentParams> = {
    name: 'minecraft:equipment',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const slotDropChance = asList(value.slot_drop_chance)
            .filter(isRecord)
            .map((entry) => ({
                slot: stringAt(entry, 'slot') ?? '',
                dropChance: numberAt(entry, 'drop_chance', 0)
            }));
        return accepted({ table: stringAt(value, 'table'), slotDropChance });
    },
    create: () => ({})
};

/**
 * `minecraft:rideable`, carried by 36 vanilla entities.
 *
 * The seats themselves are state the vehicle holds, so mounting goes through
 * {@link EntityInstance.mount} and the component's part is the seat count, the
 * families allowed in and the two events. Taking the component off empties the
 * seats, which is what a group swap that removes a saddle does.
 */
export const rideable: ComponentFactory<EntityHooks, RideableParams> = {
    name: 'minecraft:rideable',
    hooks: ['onRemove'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const seats = asList(value.seats)
            .filter(isRecord)
            .map((seat) => {
                const position = Array.isArray(seat.position)
                    ? seat.position.filter((part): part is number => typeof part === 'number')
                    : [];
                const minRiderCount = numberAt(seat, 'min_rider_count', 0);
                const rotate = seat.rotate_rider_by;
                return {
                    position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const,
                    minRiderCount,
                    maxRiderCount: numberAt(seat, 'max_rider_count', minRiderCount),
                    lockRiderRotation: numberAt(seat, 'lock_rider_rotation', 181),
                    rotateRiderBy: typeof rotate === 'number' || typeof rotate === 'string' ? rotate : undefined
                };
            });
        return accepted({
            seatCount: numberAt(value, 'seat_count', 1),
            seats,
            familyTypes: asList(value.family_types).filter((name): name is string => typeof name === 'string'),
            interactText: stringAt(value, 'interact_text'),
            crouchingSkipInteract: booleanAt(value, 'crouching_skip_interact', true),
            pullInEntities: booleanAt(value, 'pull_in_entities', false),
            onRiderEnterEvent: stringAt(value, 'on_rider_enter_event'),
            onRiderExitEvent: stringAt(value, 'on_rider_exit_event')
        });
    },
    create: () => ({
        onRemove: (entity) => entity.ejectRiders()
    })
};

/** The integer state components filters and the wire both read. */
export const integerStateComponents: readonly ComponentFactory<EntityHooks, number>[] = [
    numberComponent('minecraft:variant', 'value', 0),
    numberComponent('minecraft:mark_variant', 'value', 0),
    numberComponent('minecraft:skin_id', 'value', 0),
    numberComponent('minecraft:scale', 'value', 1),
    numberComponent('minecraft:color', 'value', 0),
    numberComponent('minecraft:color2', 'value', 0)
];

/** `minecraft:air_drag_modifier`, the multiplier on air resistance. */
export const airDragModifier = numberComponent('minecraft:air_drag_modifier', 'value', 1);

/** `minecraft:friction_modifier`, the multiplier on ground friction. */
export const frictionModifier = numberComponent('minecraft:friction_modifier', 'value', 1);

/** `minecraft:bounciness`, the fraction of impact velocity restored on a collision. */
export const bounciness = numberComponent('minecraft:bounciness', 'value', 0);
