/**
 * Java's saddle rule for the skeleton horse, written into its entity file as it loads.
 *
 * Java's `AbstractHorse.getControllingPassenger` hands a horse's steering to its rider only while
 * it is saddled, and `canJump` its power jump, and the skeleton horse is no exception: it spawns
 * tamed and takes a saddle like the zombie horse. Bedrock's pack gives the skeleton horse
 * `minecraft:input_ground_controlled` and `minecraft:can_power_jump` in its base components and no
 * saddle slot, so a player steers one bareback. Who drives a mount is the server's to decide, so
 * Java's rule decides: the controls move into a saddled group, and the adult takes a saddle the way
 * the pack's zombie horse does.
 */
import { isRecord } from '../utils/isRecord';

import { entityFileIdentifier } from './definitionOverlay';

const SKELETON_HORSE = 'minecraft:skeleton_horse';

/** The components a saddle hands the rider, which the pack's horses put in `minecraft:horse_saddled`. */
const RIDER_CONTROLS = ['minecraft:input_ground_controlled', 'minecraft:can_power_jump'] as const;

const SADDLED_GROUP = 'minecraft:horse_saddled';
const SADDLED_EVENT = 'minecraft:horse_saddled';
const UNSADDLED_EVENT = 'minecraft:horse_unsaddled';

/** The group the pack gives a grown skeleton horse, which is the one that takes a saddle. */
const ADULT_GROUP = 'minecraft:skeleton_horse_adult';

/** The saddle slot, as the pack's zombie horse writes it. */
const SADDLE_SLOT = {
    slots: [
        {
            slot: 0,
            item: 'saddle',
            accepted_items: ['saddle'],
            on_equip: { event: SADDLED_EVENT },
            on_unequip: { event: UNSADDLED_EVENT }
        }
    ]
};

/**
 * The container the saddle slot lives in, one slot: Java's skeleton horse carries a saddle and
 * nothing else, as `AbstractHorse.getInventoryColumns` gives it no storage.
 */
const SADDLE_CONTAINER = { inventory_size: 1, container_type: 'horse' };

/** Putting a saddle on from the hand, as the pack's zombie horse writes it. */
const SADDLE_INTERACTION = {
    interactions: [
        {
            on_interact: {
                filters: {
                    all_of: [
                        { test: 'has_equipment', domain: 'inventory', operator: 'not', value: 'saddle' },
                        { test: 'has_equipment', subject: 'other', domain: 'hand', value: 'saddle' },
                        { test: 'is_sneak_held', subject: 'other', value: false }
                    ]
                },
                target: 'self'
            },
            equip_item_slot: '0',
            interact_text: 'action.interact.saddle'
        }
    ]
};

/**
 * Applies Java's saddle rule to the skeleton horse's entity file.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for any other file; otherwise a copy whose rider controls come with a saddle.
 */
export const withJavaSkeletonHorseSaddle = (data: unknown): unknown => {
    if (entityFileIdentifier(data) !== SKELETON_HORSE || !isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return data;
    const components = isRecord(entity['components']) ? entity['components'] : {};
    const groups = isRecord(entity['component_groups']) ? entity['component_groups'] : {};
    const events = isRecord(entity['events']) ? entity['events'] : {};
    const adult = isRecord(groups[ADULT_GROUP]) ? groups[ADULT_GROUP] : undefined;
    if (adult === undefined || !RIDER_CONTROLS.every((name) => name in components)) return data;

    const base = Object.fromEntries(
        Object.entries(components).filter(([name]) => !RIDER_CONTROLS.some((control) => control === name))
    );
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            components: base,
            component_groups: {
                ...groups,
                [ADULT_GROUP]: {
                    ...adult,
                    'minecraft:equippable': SADDLE_SLOT,
                    'minecraft:inventory': SADDLE_CONTAINER,
                    'minecraft:interact': SADDLE_INTERACTION
                },
                [SADDLED_GROUP]: {
                    'minecraft:is_saddled': {},
                    ...Object.fromEntries(RIDER_CONTROLS.map((name) => [name, components[name]]))
                }
            },
            events: {
                ...events,
                [SADDLED_EVENT]: { add: { component_groups: [SADDLED_GROUP] } },
                [UNSADDLED_EVENT]: { remove: { component_groups: [SADDLED_GROUP] } }
            }
        }
    };
};
