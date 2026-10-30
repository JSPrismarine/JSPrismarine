/**
 * The Bedrock actor-property definitions and values carried beside actor data.
 *
 * Definitions tell a client which client-synced properties exist for each actor type. Values
 * then travel with actor spawns and metadata updates, indexed in that same definition order.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { PropertyDefinition, PropertyType, PropertyValues } from '@jsprismarine/entities';

import SyncActorPropertyPacket from './packet/SyncActorPropertyPacket';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

/** The numeric property kinds used in Bedrock's actor-property definitions. */
const propertyTypeIds = {
    int: 0,
    float: 1,
    bool: 2,
    enum: 3
} satisfies Record<PropertyType, number>;

/**
 * Builds the schema packet for an actor type, or returns undefined when the type has no
 * client-synced properties.
 *
 * @param identifier - The actor's namespaced identifier.
 * @param definitions - Its parsed properties, in declaration order.
 */
export const syncActorPropertyPacket = (
    identifier: string,
    definitions: ReadonlyMap<string, PropertyDefinition>
): SyncActorPropertyPacket | undefined => {
    const synced = [...definitions.values()].filter((definition) => definition.clientSync);
    if (synced.length === 0) return undefined;

    const propertyData = new NBTTagCompound('');
    const properties = new Set<NBTTagCompound>();

    for (const definition of synced) {
        const property = new NBTTagCompound();
        if (definition.values !== undefined) {
            property.addValue('enum', new Set(definition.values.map((value) => new Types.StringVal(value))));
        }
        if (definition.range !== undefined) {
            const [min, max] = definition.range;
            const numericTag = definition.type === 'float' ? Types.FloatVal : Types.NumberVal;
            property.addValue('max', new numericTag(max));
            property.addValue('min', new numericTag(min));
        }
        property.addValue('name', new Types.StringVal(definition.name));
        property.addValue('type', new Types.NumberVal(propertyTypeIds[definition.type]));
        properties.add(property);
    }

    propertyData.addValue('properties', properties);
    propertyData.addValue('type', new Types.StringVal(identifier));

    const packet = new SyncActorPropertyPacket();
    packet.propertyData = propertyData;
    return packet;
};

/**
 * Builds the current values in the order the actor's synced definition packet declares them.
 *
 * @param properties - The entity's live property store.
 */
export const syncedPropertiesOf = (properties: PropertyValues): SyncedProperties => {
    const synced = new SyncedProperties();
    let index = 0;

    for (const name of properties.names()) {
        const definition = properties.definition(name);
        if (definition === undefined || !definition.clientSync) continue;

        const value = properties.get(name);
        switch (definition.type) {
            case 'int':
                if (typeof value === 'number') synced.intProps.push({ index, value });
                break;
            case 'float':
                if (typeof value === 'number') synced.floatProps.push({ index, value });
                break;
            case 'bool':
                if (typeof value === 'boolean') synced.intProps.push({ index, value: value ? 1 : 0 });
                break;
            case 'enum': {
                const enumIndex = definition.values?.indexOf(String(value)) ?? -1;
                if (enumIndex >= 0) synced.intProps.push({ index, value: enumIndex });
                break;
            }
        }

        index += 1;
    }

    return synced;
};

/** Whether two wire snapshots contain the same property indexes and values. */
export const sameSyncedProperties = (left: SyncedProperties, right: SyncedProperties): boolean =>
    sameEntries(left.intProps, right.intProps) && sameEntries(left.floatProps, right.floatProps);

const sameEntries = (left: SyncedProperties['intProps'], right: SyncedProperties['intProps']): boolean =>
    left.length === right.length &&
    left.every((entry, index) => entry.index === right[index]?.index && entry.value === right[index]?.value);
