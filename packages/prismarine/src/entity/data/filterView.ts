/**
 * The facts an entity cannot answer about itself.
 *
 * `EntityInstance` answers everything that is in its components and its
 * properties, and leaves the rest to whatever the environment supplies. The
 * rest is all of the same kind: it is about where the entity is and who it is
 * with. Whether it is sitting, who it rides, who tamed it, how far away its
 * target is, and the light at its position. The runtime is the only thing that
 * knows any of that, so this is the runtime's half of `FilterEntityView`.
 *
 * It matters to the goals and not only to the filters. `GoalSupport.flag`
 * reads `is_sitting` and `is_tamed` through the same view, so a sit goal that
 * sets the flag and a goal that refuses to run while the entity is sitting
 * agree only because both go through here.
 */
import type {
    EntityFlag,
    EntityMeasure,
    EquipmentSlot,
    FilterContext,
    FilterEntityView,
    FilterItemView,
    SlotFill
} from '@jsprismarine/entities';

import { trustedBy } from '@jsprismarine/entities/components/trust';
import type { MobBody } from './DataEntity';
import { distance } from './DataEntity';
import { itemOfDrop } from '../../inventory/persistence';
import { blockPositionOf } from './position';
import type { EntityScene } from './scene';
import { MOB_EQUIPMENT_SLOTS } from '../equipment';
import type { MobEquipmentSlot } from '../equipment';

/** The armor containers a Bedrock entity filter can name. */
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet', 'body'] as const satisfies readonly MobEquipmentSlot[];

/** The equipment slots one filter domain names, in the order its indexed view reads them. */
const equipmentSlotsFor = (slot: EquipmentSlot): readonly MobEquipmentSlot[] | undefined => {
    switch (slot) {
        case 'hand':
            return ['mainhand', 'offhand'];
        case 'main_hand':
            return ['mainhand'];
        case 'off_hand':
            return ['offhand'];
        case 'armor':
            return ARMOR_SLOTS;
        case 'head':
            return ['head'];
        case 'torso':
            return ['body', 'chest'];
        case 'leg':
            return ['legs'];
        case 'feet':
            return ['feet'];
        case 'inventory':
        case 'any':
            return undefined;
    }
};

/** What an entity filter reads from one equipment or inventory slot. */
const itemViewOf = (drop: MobBody['containerSlots'][number], scene: EntityScene): FilterItemView | undefined => {
    if (drop === undefined) return undefined;
    const item = itemOfDrop(drop, scene.content());
    return {
        identifier: () => drop.identifier,
        data: () => item?.getMeta() ?? drop.meta ?? 0,
        ...(item === null
            ? {}
            : {
                  tags: () => item.getTags(),
                  enchantment: (name: string) => item.getEnchantmentLevel(name),
                  hasComponent: (name: string) => item.hasComponent(name)
              }),
        damaged: () =>
            item === null
                ? (drop.damage ?? 0) > 0
                : item.getMaxDurability() > 0 && item.getDurability() < item.getMaxDurability()
    };
};

/** The stack at one indexed filter slot, or undefined when it is empty or out of range. */
const dropAt = (body: MobBody, slot: EquipmentSlot, index: number): MobBody['containerSlots'][number] => {
    if (slot === 'inventory') return body.containerSlots[index];
    if (slot === 'any') {
        const equipment = MOB_EQUIPMENT_SLOTS[index];
        return equipment === undefined
            ? body.containerSlots[index - MOB_EQUIPMENT_SLOTS.length]
            : body.equipment[equipment];
    }
    const equipment = equipmentSlotsFor(slot)?.[index];
    return equipment === undefined ? undefined : body.equipment[equipment];
};

/** How many slots one filter domain exposes. */
const capacityOf = (body: MobBody, slot: EquipmentSlot): number => {
    if (slot === 'inventory') return body.containerCapacity;
    if (slot === 'any') return MOB_EQUIPMENT_SLOTS.length + body.containerCapacity;
    return equipmentSlotsFor(slot)?.length ?? 0;
};

/** How full one equipment or inventory domain is. */
const slotFillOf = (body: MobBody, slot: EquipmentSlot): SlotFill => {
    const capacity = capacityOf(body, slot);
    let filled = 0;
    for (let index = 0; index < capacity; index += 1) {
        if (dropAt(body, slot, index) !== undefined) filled += 1;
    }
    return { filled, capacity };
};

/** The whole filter context for one entity: its own facts and the world's. */
export const entityFilterContextOf = (body: MobBody, scene: EntityScene): FilterContext => ({
    self: entityFilterViewOf(body, scene),
    world: {
        timeOfDay: () => scene.world.level.dayTime(),
        difficulty: () => scene.world.level.difficulty(),
        dimension: () => scene.world.level.dimension,
        weather: () => scene.world.level.weather()
    }
});

/** One entity as a filter reads it, for the facts the runtime owns. */
export const entityFilterViewOf = (body: MobBody, scene: EntityScene): FilterEntityView => ({
    id: () => body.id,
    trusts: (other) => {
        const id = other.id?.();
        const identity = typeof id === 'number' ? scene.host.playerIdentityOf?.(id) : undefined;
        const instance = scene.byId(body.id)?.instance;
        return identity !== undefined && instance !== undefined && trustedBy(instance).includes(identity);
    },
    flag: (name) => flagOf(body, scene, name),
    measure: (name) => measureOf(body, scene, name),
    names: (name) => {
        if (name === 'has_tag') return [...body.tags];
        // The biome under the entity, which a spawn event's biome filters read to pick a wolf's,
        // fox's, frog's or villager's variant.
        if (name === 'has_biome_tag') return scene.world.blocks.biomeTags(blockPositionOf(body.position));
        if (name === 'is_biome') {
            const biome = scene.world.blocks.biome(blockPositionOf(body.position));
            return biome === undefined ? [] : [biome, biome.slice(biome.indexOf(':') + 1)];
        }
        // `in_block` names the block the entity's feet are in, such as a skeleton's powder snow.
        if (name === 'in_block') {
            const block = scene.world.blocks.get(blockPositionOf(body.position));
            return block === undefined ? [] : [block.identifier];
        }
        if (name === 'has_mob_effect') {
            const effects = [...body.statusEffects.keys()];
            return [...effects, ...effects.map((identifier) => identifier.slice(identifier.indexOf(':') + 1))];
        }
        return undefined;
    },
    equipment: (slot, index) => itemViewOf(dropAt(body, slot, index), scene),
    slotFill: (slot) => slotFillOf(body, slot),
    carries: (matches) =>
        [...MOB_EQUIPMENT_SLOTS.map((slot) => body.equipment[slot]), ...body.containerSlots].some((drop) => {
            const item = itemViewOf(drop, scene);
            return item !== undefined && matches(item);
        }),
    vehicle: () => viewOf(scene.vehicleOf(body)?.id, scene),
    owner: () => viewOf(body.owner, scene),
    attackTarget: () => viewOf(body.target, scene),
    leashHolder: () => scene.leashHolderOf(body)?.view()
});

/** One of the boolean facts the runtime owns, or undefined when it owns none of that name. */
const flagOf = (body: MobBody, scene: EntityScene, name: EntityFlag): boolean | undefined => {
    switch (name) {
        case 'is_sitting':
            return body.sitting;
        case 'is_sleeping':
            return body.sleeping;
        case 'is_tamed':
            return body.owner !== undefined;
        case 'is_riding':
            return scene.vehicleOf(body) !== undefined;
        case 'is_leashed':
            return scene.leashHolderOf(body) !== undefined;
        case 'has_nametag':
            return body.nameTag !== undefined;
        case 'has_target':
            return body.target !== undefined;
        case 'is_moving':
        case 'is_navigating':
            return body.walking;
        case 'on_ground':
            return body.conditions.has('on_ground');
        // The runtime works out these media for every body every tick, so their absence is an
        // answer: a fish out of water is not in water, and a sensor testing `in_water != true`
        // fires for it.
        case 'in_water':
        case 'in_lava':
        case 'in_contact_with_water':
        case 'is_underwater':
            return body.conditions.has(name);
        case 'is_visible':
            return !body.statusEffects.has('minecraft:invisibility') && !body.statusEffects.has('invisibility');
        case 'in_water_or_rain':
            return body.conditions.has('in_water') || scene.world.level.isRainingAt(blockPositionOf(body.position));
        default:
            // Everything else is either the entity's own (`is_baby`, `is_tamed`) or a fact
            // about the blocks the runtime does not track yet, and an unanswered flag makes
            // its test false rather than guessing.
            return body.conditions.has(name) ? true : undefined;
    }
};

/** One of the numeric facts the runtime owns. */
const measureOf = (body: MobBody, scene: EntityScene, name: EntityMeasure): number | undefined => {
    switch (name) {
        case 'rider_count':
            return scene.ridersOf(body).length;
        case 'home_distance':
            return body.home === undefined ? undefined : distance(body.position, body.home);
        case 'owner_distance':
            return awayFrom(body, scene, body.owner);
        case 'target_distance':
            return awayFrom(body, scene, body.target);
        case 'distance_to_nearest_player':
            return nearestPlayerDistance(body, scene);
        case 'is_brightness':
            return scene.world.blocks.light(blockPositionOf(body.position)) / 15;
        case 'light_level':
            return scene.world.blocks.light(blockPositionOf(body.position));
        case 'y_rotation':
            return body.yaw;
        default:
            return undefined;
    }
};

/** How far another entity is, or undefined when there is none or it has gone. */
const awayFrom = (body: MobBody, scene: EntityScene, other: number | undefined): number | undefined => {
    if (other === undefined) return undefined;
    const mob = scene.mobById(other);
    return mob === undefined ? undefined : distance(body.position, mob.position());
};

/** How far the nearest player is, or undefined when the dimension has none. */
const nearestPlayerDistance = (body: MobBody, scene: EntityScene): number | undefined => {
    let nearest: number | undefined;
    for (const player of scene.host.players()) {
        const away = distance(body.position, player.position);
        if (nearest === undefined || away < nearest) nearest = away;
    }
    return nearest;
};

/** Another entity's filter view, by runtime id. */
const viewOf = (id: string | number | undefined, scene: EntityScene): FilterEntityView | undefined =>
    typeof id === 'number' ? scene.mobById(id)?.view() : undefined;
