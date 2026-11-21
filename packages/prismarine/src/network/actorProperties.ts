/**
 * The Bedrock actor-property definitions and values carried beside actor data.
 *
 * Definitions tell a client which client-synced properties exist for each actor type. Values
 * then travel with actor spawns and metadata updates, indexed in that same definition order.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { PropertyDefinition, PropertyType, PropertyValues } from '@jsprismarine/entities';

import PlayerUpdateEntityOverridesPacket, {
    EntityOverrideUpdateType
} from '@jsprismarine/protocol/bedrock/packet/PlayerUpdateEntityOverridesPacket';
import type { EntityOverrideUpdate } from '@jsprismarine/protocol/bedrock/packet/PlayerUpdateEntityOverridesPacket';
import SyncActorPropertyPacket from '@jsprismarine/protocol/bedrock/packet/SyncActorPropertyPacket';
import { SyncedProperties } from '@jsprismarine/protocol/bedrock/wire/structures/SyncedProperties';

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
 * @param properties - The entity's live property store, or the same values read from the change
 *   log over its type's definitions.
 */
export const syncedPropertiesOf = (
    properties: Pick<PropertyValues, 'names' | 'definition' | 'get'>
): SyncedProperties => {
    const synced = new SyncedProperties();

    for (const { name, definition, index } of syncedDefinitionsOf(properties)) {
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
    }

    return synced;
};

/**
 * An entity's client-synced properties with the index each travels under, in the order its
 * synced definition packet declares them. Every packet that names a property by index reads it here.
 */
const syncedDefinitionsOf = (
    properties: Pick<PropertyValues, 'names' | 'definition'>
): { readonly name: string; readonly definition: PropertyDefinition; readonly index: number }[] =>
    properties
        .names()
        .flatMap((name) => {
            const definition = properties.definition(name);
            return definition === undefined || !definition.clientSync ? [] : [{ name, definition }];
        })
        .map((each, index) => ({ ...each, index }));

/** What a player's client overrides of one entity's properties: one property's value, its removal, or all of them. */
export type PropertyOverride =
    | { readonly action: 'set'; readonly name: string; readonly value: number | boolean | string }
    | { readonly action: 'remove'; readonly name: string }
    | { readonly action: 'clear' };

/**
 * The packet that changes a client's override of an entity's properties, as BDS 1.26.60.6 sends
 * it for `Player.setPropertyOverrideForEntity` and its siblings: a bool or an enum travels as an
 * int override, and a clear names the property at index 0.
 *
 * @param target - The entity's unique id.
 * @param properties - The entity's property store, which gives each synced property its index.
 * @returns Undefined when the property is not one the client is synced, or the value does not fit it.
 */
export const propertyOverridePacket = (
    target: bigint,
    properties: Pick<PropertyValues, 'names' | 'definition'>,
    override: PropertyOverride
): PlayerUpdateEntityOverridesPacket | undefined => {
    if (override.action === 'clear') {
        return new PlayerUpdateEntityOverridesPacket({
            targetId: target,
            propertyIndex: 0,
            update: { type: EntityOverrideUpdateType.ClearOverrides }
        });
    }
    const found = syncedDefinitionsOf(properties).find((each) => each.name === override.name);
    if (found === undefined) return undefined;
    const update: EntityOverrideUpdate | undefined =
        override.action === 'remove'
            ? { type: EntityOverrideUpdateType.RemoveOverride }
            : updateOf(found.definition, override.value);
    return update === undefined
        ? undefined
        : new PlayerUpdateEntityOverridesPacket({ targetId: target, propertyIndex: found.index, update });
};

const updateOf = (
    definition: PropertyDefinition,
    value: number | boolean | string
): EntityOverrideUpdate | undefined => {
    switch (definition.type) {
        case 'float':
            return typeof value === 'number' ? { type: EntityOverrideUpdateType.SetFloatOverride, value } : undefined;
        case 'int':
            return typeof value === 'number' ? { type: EntityOverrideUpdateType.SetIntOverride, value } : undefined;
        case 'bool':
            return typeof value === 'boolean'
                ? { type: EntityOverrideUpdateType.SetIntOverride, value: value ? 1 : 0 }
                : undefined;
        case 'enum': {
            const at = definition.values?.indexOf(String(value)) ?? -1;
            return at < 0 ? undefined : { type: EntityOverrideUpdateType.SetIntOverride, value: at };
        }
    }
};

/** Whether two wire snapshots contain the same property indexes and values. */
export const sameSyncedProperties = (left: SyncedProperties, right: SyncedProperties): boolean =>
    sameEntries(left.intProps, right.intProps) && sameEntries(left.floatProps, right.floatProps);

const sameEntries = (left: SyncedProperties['intProps'], right: SyncedProperties['intProps']): boolean =>
    left.length === right.length &&
    left.every((entry, index) => entry.index === right[index]?.index && entry.value === right[index]?.value);
