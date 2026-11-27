/**
 * Java's lead rule for the camel husk, written into its entity file as it loads.
 *
 * Java's `CamelHusk.canBeLeashed` refuses a lead while a mob rides it (`isMobControlled`, the first
 * passenger being a `Mob`), however the rider got on. Bedrock's pack takes the lead, the saddle
 * slot and the temptation away only from a camel husk that spawned with its rider: one a husk or
 * a parched climbs onto later keeps them. Who may leash a mob is the server's to decide, so the
 * sensor drops the group that carries them as soon as a mob is in the first seat, and the pack's
 * own `minecraft:all_riders_dismounted` gives it back once the last rider is off.
 *
 * @javaSee CamelHusk.canBeLeashed
 */
import { isRecord } from '../utils/isRecord';

import { entityFileIdentifier } from './definitionOverlay';

const CAMEL_HUSK = 'minecraft:camel_husk';

/** The pack's group of what a camel husk with no mob on it has: the lead, the saddle and the tempt. */
const UNRIDDEN_GROUP = 'minecraft:camel_husk_with_no_hostile_rider';

const MOB_MOUNTED_EVENT = 'jsprismarine:mob_rider_mounted';

/** A mob in the first seat while the unridden group is still on, Java's `isMobControlled`. */
const MOB_MOUNTED_TRIGGER = {
    event: MOB_MOUNTED_EVENT,
    filters: {
        all_of: [
            { test: 'rider_count', subject: 'self', operator: '>', value: 0 },
            { test: 'is_controlling_passenger_family', subject: 'self', value: 'mob' },
            { test: 'has_component', subject: 'self', value: 'minecraft:leashable' }
        ]
    }
};

/**
 * Applies Java's lead rule to the camel husk's entity file.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for any other file; otherwise a copy whose sensor drops the lead under a mob.
 */
export const withJavaCamelHuskLead = (data: unknown): unknown => {
    if (entityFileIdentifier(data) !== CAMEL_HUSK || !isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity) || !isRecord(entity['components'])) return data;
    const components = entity['components'];
    const sensor = components['minecraft:environment_sensor'];
    const events = isRecord(entity['events']) ? entity['events'] : {};
    if (!isRecord(sensor)) return data;
    const triggers: readonly unknown[] = Array.isArray(sensor['triggers']) ? sensor['triggers'] : [sensor['triggers']];
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            components: {
                ...components,
                'minecraft:environment_sensor': { ...sensor, triggers: [...triggers, MOB_MOUNTED_TRIGGER] }
            },
            events: {
                ...events,
                [MOB_MOUNTED_EVENT]: {
                    remove: { component_groups: [UNRIDDEN_GROUP] },
                    set_property: { 'minecraft:has_rider_mounted': true }
                }
            }
        }
    };
};
