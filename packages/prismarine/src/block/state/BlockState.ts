import { NBTTagCompound, Types } from '@jsprismarine/nbt';

/**
 * A block state property value. Vanilla only ever uses these three NBT types, and which one
 * a property uses is part of the block's identity - see {@link BlockState.toNBT}.
 */
export type BlockStateValue = string | number | boolean;

/** How a property is written to NBT. `byte` is vanilla's boolean. */
export type BlockStatePropertyType = 'byte' | 'int' | 'string';

/**
 * A block, and the exact values of every property it carries.
 *
 * `minecraft:oak_log` is not one block but three: one per `pillar_axis`. Treating the name
 * alone as the identity is what made every oriented block render wrong, because all three
 * collapsed onto whichever was registered last.
 *
 * Instances are immutable: {@link with} returns a new state rather than mutating, so a state
 * held in a chunk palette or handed to a plugin cannot be changed underneath its owner.
 */
export class BlockState {
    public readonly name: string;
    public readonly properties: Readonly<Record<string, BlockStateValue>>;

    public constructor(name: string, properties: Record<string, BlockStateValue> = {}) {
        this.name = name;
        this.properties = Object.freeze({ ...properties });
        Object.freeze(this);
    }

    public get [Symbol.toStringTag](): string {
        return `BlockState(${this.toString()})`;
    }

    /** Derives a state with one property changed. */
    public with(property: string, value: BlockStateValue): BlockState {
        return new BlockState(this.name, { ...this.properties, [property]: value });
    }

    public get(property: string): BlockStateValue | undefined {
        return this.properties[property];
    }

    /**
     * A stable textual form, properties in alphabetical order: `minecraft:oak_log[pillar_axis=y]`.
     * Used as the cache key for runtime ids and in log messages.
     */
    public toString(): string {
        const keys = Object.keys(this.properties).sort();
        if (keys.length === 0) return this.name;

        return `${this.name}[${keys.map((key) => `${key}=${String(this.properties[key])}`).join(',')}]`;
    }

    public equals(other: BlockState): boolean {
        return this.toString() === other.toString();
    }

    /**
     * The `{name, states}` compound the runtime id is hashed from.
     *
     * Two things here are load bearing rather than stylistic:
     *
     * - **Properties are written in alphabetical order.** The hash covers the serialised
     *   bytes, so a different order is a different id for the same block.
     * - **Each property keeps its vanilla NBT type.** The tag type byte is part of those
     *   bytes, so writing `facing_direction` as a byte instead of an int yields an id the
     *   client cannot resolve.
     *
     * The `version` field the vanilla dump carries is deliberately absent: it is not part
     * of what gets hashed.
     * @see https://gist.github.com/Alemiz112/504d0f79feac7ef57eda174b668dd345
     */
    public toNBT(types: Readonly<Record<string, BlockStatePropertyType>>): NBTTagCompound {
        const root = new NBTTagCompound();
        root.addValue('name', new Types.StringVal(this.name));

        const states = new NBTTagCompound('states');
        for (const key of Object.keys(this.properties).sort()) {
            const value = this.properties[key]!;
            switch (types[key]) {
                case 'byte':
                    states.addValue(key, new Types.ByteVal(value === true ? 1 : value === false ? 0 : Number(value)));
                    break;
                case 'int':
                    states.addValue(key, new Types.NumberVal(Number(value)));
                    break;
                case 'string':
                    states.addValue(key, new Types.StringVal(String(value)));
                    break;
                default:
                    throw new Error(`Property ${this.name}.${key} has no declared type`);
            }
        }
        root.addChild(states);

        return root;
    }
}

export default BlockState;
