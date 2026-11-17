/**
 * Script dynamic properties as Bedrock Dedicated Server (BDS) keeps them, and the level's store of
 * its own.
 *
 * BDS writes a set of properties as one NBT compound with a child compound per pack, named by the
 * pack's UUID, holding each property by its id: a number as a `TAG_Double`, a boolean as a
 * `TAG_Byte`, a string as a `TAG_String` and a vector as a `TAG_List` of three `TAG_Float`. The
 * world's set is the LevelDB record `DynamicProperties`, an actor's is its record's
 * `DynamicProperties` tag, and an item's is its `tag.DynamicProperties`
 * ([research](../../../../docs/research/bedrock-script-api.md#8-dynamic-properties)).
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

/** A property's value: a double, a boolean, a string, or a vector of 32-bit floats. */
export type DynamicPropertyValue =
    number | boolean | string | { readonly x: number; readonly y: number; readonly z: number };

/** One pack's properties, by id, in the order they were first set. */
export type PackProperties = ReadonlyMap<string, DynamicPropertyValue>;

/** Every pack's properties of one owner, by pack UUID. */
export type DynamicProperties = ReadonlyMap<string, PackProperties>;

/** The tag BDS names an actor's or an item's properties by. */
export const DYNAMIC_PROPERTIES_TAG = 'DynamicProperties';

/** Names in the byte order BDS writes a compound's entries in. */
const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

/** One value as its NBT tag. */
const tagOf = (value: DynamicPropertyValue): unknown => {
    if (typeof value === 'number') return new Types.DoubleVal(value);
    if (typeof value === 'boolean') return new Types.ByteVal(value ? 1 : 0);
    if (typeof value === 'string') return new Types.StringVal(value);
    return new Set([new Types.FloatVal(value.x), new Types.FloatVal(value.y), new Types.FloatVal(value.z)]);
};

/** One tag as a value, or undefined for a tag no property is written as. */
const valueOf = (tag: unknown): DynamicPropertyValue | undefined => {
    if (tag instanceof Types.DoubleVal) return tag.getValue();
    if (tag instanceof Types.ByteVal) return tag.getValue() !== 0;
    if (tag instanceof Types.StringVal) return tag.getValue();
    if (tag instanceof Set) {
        const [x, y, z, ...rest] = [...tag];
        if (
            rest.length === 0 &&
            x instanceof Types.FloatVal &&
            y instanceof Types.FloatVal &&
            z instanceof Types.FloatVal
        ) {
            return { x: x.getValue(), y: y.getValue(), z: z.getValue() };
        }
    }
    return undefined;
};

/**
 * Writes properties as BDS writes them: a compound per pack, and every entry in byte order of its
 * name. A pack with no properties is left out.
 * @param name - The compound's own name: empty for the LevelDB record, the tag's name inside an actor or an item.
 */
export const dynamicPropertiesToNbt = (properties: DynamicProperties, name = ''): NBTTagCompound => {
    const root = new NBTTagCompound(name);
    for (const pack of [...properties.keys()].sort(byteOrder)) {
        const values = properties.get(pack);
        if (values === undefined || values.size === 0) continue;
        const compound = new NBTTagCompound(pack);
        for (const id of [...values.keys()].sort(byteOrder)) compound.addValue(id, tagOf(values.get(id)!));
        root.addChild(compound);
    }
    return root;
};

/** Reads properties BDS or this server wrote, skipping an entry of a type no property has. */
export const dynamicPropertiesFromNbt = (root: NBTTagCompound): Map<string, Map<string, DynamicPropertyValue>> => {
    const properties = new Map<string, Map<string, DynamicPropertyValue>>();
    for (const [pack, compound] of root.entries()) {
        if (!(compound instanceof NBTTagCompound)) continue;
        const values = new Map<string, DynamicPropertyValue>();
        for (const [id, tag] of compound.entries()) {
            const value = valueOf(tag);
            if (value !== undefined) values.set(id, value);
        }
        if (values.size > 0) properties.set(pack, values);
    }
    return properties;
};

/**
 * Applies writes to one pack's properties: each value replaces the property's and undefined
 * deletes it.
 * @returns The pack's properties after, or undefined when it has none left.
 */
export const withPropertyWrites = (
    current: PackProperties | undefined,
    writes: ReadonlyMap<string, DynamicPropertyValue | undefined>
): Map<string, DynamicPropertyValue> | undefined => {
    const next = new Map(current);
    for (const [id, value] of writes) {
        if (value === undefined) next.delete(id);
        else next.set(id, value);
    }
    return next.size === 0 ? undefined : next;
};

/**
 * The dynamic properties of a level, which BDS calls the world's: one set per pack, plain data,
 * written only through {@link LevelDynamicProperties.write} and {@link LevelDynamicProperties.clear}
 * and saved by the level's save pass under the LevelDB record `DynamicProperties`.
 */
export class LevelDynamicProperties {
    private readonly packs = new Map<string, Map<string, DynamicPropertyValue>>();

    /** One pack's properties; an empty set for a pack that has none. */
    public of(pack: string): PackProperties {
        return this.packs.get(pack) ?? new Map();
    }

    /** Every pack's properties, as a save writes them. */
    public all(): DynamicProperties {
        return this.packs;
    }

    /** Writes some of one pack's properties; see {@link withPropertyWrites}. */
    public write(pack: string, writes: ReadonlyMap<string, DynamicPropertyValue | undefined>): void {
        const next = withPropertyWrites(this.packs.get(pack), writes);
        if (next === undefined) this.packs.delete(pack);
        else this.packs.set(pack, next);
    }

    /** Deletes every property of one pack. */
    public clear(pack: string): void {
        this.packs.delete(pack);
    }

    /** Replaces every property with the ones a save held. */
    public restore(saved: DynamicProperties): void {
        this.packs.clear();
        for (const [pack, values] of saved) if (values.size > 0) this.packs.set(pack, new Map(values));
    }
}
