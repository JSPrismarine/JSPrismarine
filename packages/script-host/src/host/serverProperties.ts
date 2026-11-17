/**
 * The `@minecraft/server` dynamic property members of `World`, `Entity` and `ItemStack`.
 *
 * A property belongs to the pack that set it. The world and an entity keep them by the pack's
 * header UUID, and an item stack by its script module UUID, which is what BDS writes to disk.
 * The world's and an entity's properties live in the world and are written through its setters
 * ({@link ScriptWorld.setDynamicProperties}); an item stack's live in the stack's state, as the
 * rest of a stack does.
 *
 * Every check and error follows the pinned BDS, as the `persistence` scenario recorded: a value
 * BDS cannot convert throws `Native variant type conversion failed.`, a string over 32767 UTF-8
 * bytes throws `ArgumentOutOfBoundsError`, and a vector keeps 32-bit floats, an infinite one
 * included, which then throws when it is read.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import { isRecord } from '../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import type { EntityKey } from './serverObjects';
import { COMMON, entityKeyOf, invalidEntity, itemOf, itemState, SERVER } from './serverObjects';
import type { ScriptProperties, ScriptPropertyOwner, ScriptPropertyValue, ScriptVector3 } from './world';

/** The most UTF-8 bytes a string property may hold. */
export const PROPERTY_STRING_LIMIT = 32767;

const utf8Length = (text: string): number => Buffer.byteLength(text, 'utf8');

/**
 * The bytes BDS counts for one property in `getDynamicPropertyTotalByteCount`: the id's UTF-8
 * bytes and one more, and the value's size, which is 8 for a number, 1 for a boolean, 12 for a
 * vector and a string's UTF-8 bytes and one more.
 */
export const propertyByteCount = (id: string, value: ScriptPropertyValue): number => {
    const size =
        typeof value === 'number'
            ? 8
            : typeof value === 'boolean'
              ? 1
              : typeof value === 'string'
                ? utf8Length(value) + 1
                : 12;
    return utf8Length(id) + 1 + size;
};

/** The sum of {@link propertyByteCount} over a pack's properties. */
export const propertiesByteCount = (properties: ScriptProperties | undefined): number => {
    let total = 0;
    for (const [id, value] of properties ?? []) total += propertyByteCount(id, value);
    return total;
};

/** BDS's error for a value no property can hold, which names no argument. */
const conversionFailed = (): TypeError => new ScriptHostErrors.VariantConversionFailed();

/**
 * Converts a value a script passed to the value BDS stores: undefined and null delete, a number
 * must be finite, and an object must have numeric `x`, `y` and `z`, which become 32-bit floats.
 * @throws {TypeError} BDS's conversion error for anything else, an array, a bigint and NaN included.
 * @throws {ScriptApiError} `ArgumentOutOfBoundsError` for a string longer than BDS allows.
 */
export const propertyValueOf = (call: ScriptCall, id: string, value: ScriptValue): ScriptPropertyValue | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw conversionFailed();
        return value;
    }
    if (typeof value === 'string') {
        const bytes = utf8Length(value);
        if (bytes > PROPERTY_STRING_LIMIT) {
            throw new ScriptApiError(
                COMMON,
                'ArgumentOutOfBoundsError',
                `Unsupported or out of bounds value passed to function argument [0]: String length for dynamic property '${id}', Value: ${bytes}, Argument max: ${PROPERTY_STRING_LIMIT}`,
                { index: 0, value: bytes, maxValue: PROPERTY_STRING_LIMIT }
            );
        }
        return value;
    }
    // An object, an array, a function, a bigint or a symbol. JSON keeps only the first as a
    // record, and the engine writes it, so a getter runs in the script, not in the host.
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    if (!isRecord(parsed) || Array.isArray(parsed)) throw conversionFailed();
    const { x, y, z } = parsed;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') throw conversionFailed();
    return { x: Math.fround(x), y: Math.fround(y), z: Math.fround(z) };
};

/** A stored value as a script reads it: a vector becomes a new object in the engine. */
const scriptValueOf = (call: ScriptCall, value: ScriptPropertyValue | undefined): ScriptValue => {
    if (value === undefined || typeof value !== 'object') return value;
    // BDS stores a part a float cannot hold as infinity and refuses to read it back.
    if (![value.x, value.y, value.z].every(Number.isFinite)) throw new ScriptHostErrors.InfinityNotSupported();
    return vectorObject(call, value);
};

const vectorObject = (call: ScriptCall, { x, y, z }: ScriptVector3): ScriptHandle => {
    const object = call.engine.evaluate('({})');
    if (!(object instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
    call.engine.set(object, 'x', x);
    call.engine.set(object, 'y', y);
    call.engine.set(object, 'z', z);
    return call.engine.release(object);
};

/** A list of ids as a script reads it, which the binding parses. */
const idList = (properties: ScriptProperties | undefined): string => JSON.stringify([...(properties?.keys() ?? [])]);

/**
 * Reads the entries of a `setDynamicProperties` record, each value as {@link propertyValueOf}
 * converts it, before anything is written, so one bad value writes none, as on BDS.
 */
const recordArgument = (call: ScriptCall): Map<string, ScriptPropertyValue | undefined> => {
    const [record] = call.args;
    if (!(record instanceof ScriptHandle)) throw conversionFailed();
    const { engine } = call;
    const keys = engine.get(engine.global(), 'Object');
    if (!(keys instanceof ScriptHandle)) throw new ScriptHostErrors.EngineGlobalMissing({ name: 'The global Object' });
    const keysOf = engine.get(keys, 'keys');
    engine.free(keys);
    if (!(keysOf instanceof ScriptHandle)) throw new ScriptHostErrors.EngineGlobalMissing({ name: 'Object.keys' });
    const listed = engine.call(keysOf, undefined, record);
    engine.free(keysOf);
    const json = call.stringify(listed);
    if (listed instanceof ScriptHandle) engine.free(listed);
    // The engine wrote the string with JSON.stringify.
    const ids: unknown = json === undefined ? [] : JSON.parse(json);
    const values = new Map<string, ScriptPropertyValue | undefined>();
    for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id !== 'string') continue;
        const value = engine.get(record, id);
        try {
            values.set(id, propertyValueOf(call, id, value));
        } finally {
            if (value instanceof ScriptHandle) engine.free(value);
        }
    }
    return values;
};

/** Which arguments the property setters convert themselves, with BDS's own errors. */
const CONVERTS_VALUE = { converts: ['value'] } as const;
const CONVERTS_VALUES = { converts: ['values'] } as const;

/** BDS's error for a dynamic property set on a stack of an item type that stacks. */
const stackableItem = (): ScriptApiError =>
    new ScriptApiError(
        COMMON,
        'UnsupportedFunctionalityError',
        'Unsupported functionality: Cannot set dynamic properties on stackable items.'
    );

/**
 * Registers the dynamic property members of `World`, `Entity` and `ItemStack`.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementDynamicProperties = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const textOf = (call: ScriptCall): string => String(call.args[0]);

    /** The properties of the world or of a live entity, which BDS keys by the pack's header UUID. */
    const owned = (owner: ScriptPropertyOwner, member: string, entity?: EntityKey): ScriptProperties => {
        const found = world.dynamicProperties(owner, host.packUuid);
        if (found === undefined) throw invalidEntity('call', member, entity);
        return found;
    };
    /** An entity object's owner, once the entity is known to be there, as BDS checks before anything else. */
    const ownerOf = (call: ScriptCall, member: string): ScriptPropertyOwner => {
        const key = entityKeyOf(call.state);
        owned({ entity: key.id }, member, key);
        return { entity: key.id };
    };

    for (const owner of ['World', 'Entity'] as const) {
        const ownerFor = (call: ScriptCall, member: string): ScriptPropertyOwner =>
            owner === 'World' ? 'world' : ownerOf(call, member);
        implementations
            .implement(SERVER, owner, 'getDynamicProperty', (call) =>
                scriptValueOf(call, owned(ownerFor(call, 'getDynamicProperty'), 'getDynamicProperty').get(textOf(call)))
            )
            .implement(SERVER, owner, 'getDynamicPropertyIds', (call) =>
                idList(owned(ownerFor(call, 'getDynamicPropertyIds'), 'getDynamicPropertyIds'))
            )
            .implement(SERVER, owner, 'getDynamicPropertyTotalByteCount', (call) =>
                propertiesByteCount(
                    owned(ownerFor(call, 'getDynamicPropertyTotalByteCount'), 'getDynamicPropertyTotalByteCount')
                )
            )
            .implement(
                SERVER,
                owner,
                'setDynamicProperty',
                (call) => {
                    const target = ownerFor(call, 'setDynamicProperty');
                    const id = textOf(call);
                    world.setDynamicProperties(
                        target,
                        host.packUuid,
                        new Map([[id, propertyValueOf(call, id, call.args[1])]])
                    );
                    return undefined;
                },
                CONVERTS_VALUE
            )
            .implement(
                SERVER,
                owner,
                'setDynamicProperties',
                (call) => {
                    const target = ownerFor(call, 'setDynamicProperties');
                    world.setDynamicProperties(target, host.packUuid, recordArgument(call));
                    return undefined;
                },
                CONVERTS_VALUES
            )
            .implement(SERVER, owner, 'clearDynamicProperties', (call) => {
                world.clearDynamicProperties(ownerFor(call, 'clearDynamicProperties'), host.packUuid);
                return undefined;
            });
    }

    /** An item stack's properties, which BDS keys by the pack's script module UUID. */
    const itemProperties = (call: ScriptCall): ScriptProperties | undefined =>
        itemOf(call.state).dynamicProperties?.get(host.moduleUuid);
    /** Writes some of the pack's properties on a stack, which must be of a type that does not stack. */
    const writeItem = (call: ScriptCall, values: ReadonlyMap<string, ScriptPropertyValue | undefined>): void => {
        const item = itemOf(call.state);
        if ((world.itemType(item.typeId)?.maxStackSize ?? 1) > 1) throw stackableItem();
        const mine = new Map(item.dynamicProperties?.get(host.moduleUuid));
        for (const [id, value] of values) {
            if (value === undefined) mine.delete(id);
            else mine.set(id, value);
        }
        const all = new Map(item.dynamicProperties);
        if (mine.size === 0) all.delete(host.moduleUuid);
        else all.set(host.moduleUuid, mine);
        const { dynamicProperties: _previous, ...rest } = item;
        call.setState(itemState(all.size === 0 ? rest : { ...rest, dynamicProperties: all }));
    };

    implementations
        .implement(SERVER, 'ItemStack', 'getDynamicProperty', (call) =>
            scriptValueOf(call, itemProperties(call)?.get(textOf(call)))
        )
        .implement(SERVER, 'ItemStack', 'getDynamicPropertyIds', (call) => idList(itemProperties(call)))
        .implement(SERVER, 'ItemStack', 'getDynamicPropertyTotalByteCount', (call) =>
            propertiesByteCount(itemProperties(call))
        )
        .implement(
            SERVER,
            'ItemStack',
            'setDynamicProperty',
            (call) => {
                const id = textOf(call);
                writeItem(call, new Map([[id, propertyValueOf(call, id, call.args[1])]]));
                return undefined;
            },
            CONVERTS_VALUE
        )
        .implement(
            SERVER,
            'ItemStack',
            'setDynamicProperties',
            (call) => {
                writeItem(call, recordArgument(call));
                return undefined;
            },
            CONVERTS_VALUES
        )
        .implement(SERVER, 'ItemStack', 'clearDynamicProperties', (call) => {
            const ids = [...(itemProperties(call)?.keys() ?? [])];
            if (ids.length > 0) writeItem(call, new Map(ids.map((id) => [id, undefined])));
            return undefined;
        });
};
