import { BlockState } from './BlockState';
import type { BlockStatePropertyType, BlockStateValue } from './BlockState';
// The catalogue is generated and lives with the rest of the vanilla facts. It used to sit
// beside this file, produced by a script in a third package writing across package lines.
import { blockSchemas as vanillaSchemas } from '@jsprismarine/minecraft';

/** One property: how it is written, what it accepts, and what it is when unspecified. */
export interface BlockStateProperty {
    type: BlockStatePropertyType;
    values: readonly BlockStateValue[];
    default: BlockStateValue;
}

export interface BlockStateSchemaData {
    properties: Record<string, BlockStateProperty>;
}

/**
 * Which properties a block has and which values each accepts.
 *
 * This is what makes blocks modular. A runtime id is a hash of a block's own name and
 * state, so a block is fully described by its schema alone - a plugin registering
 * `myplugin:cool_block` needs to agree with nobody, and cannot shift the ids of anyone
 * else's blocks. The vanilla catalogue below is just the schemas that ship by default.
 */
export class BlockStateSchema {
    public readonly name: string;
    public readonly properties: Readonly<Record<string, BlockStateProperty>>;

    public constructor(name: string, properties: Record<string, BlockStateProperty> = {}) {
        this.name = name;
        this.properties = Object.freeze({ ...properties });
    }

    /** The NBT type of every property, in the shape {@link BlockState.toNBT} wants. */
    public getPropertyTypes(): Record<string, BlockStatePropertyType> {
        return Object.fromEntries(Object.entries(this.properties).map(([key, property]) => [key, property.type]));
    }

    /** The state a freshly placed block starts in. */
    public getDefaultState(): BlockState {
        return new BlockState(
            this.name,
            Object.fromEntries(Object.entries(this.properties).map(([key, property]) => [key, property.default]))
        );
    }

    /**
     * Builds a state from partial properties, filling the rest with defaults.
     * @throws if a property is unknown to this block or its value is not accepted - a
     * silent fallback would surface much later as a block the client cannot resolve.
     */
    public createState(properties: Record<string, BlockStateValue> = {}): BlockState {
        for (const [key, value] of Object.entries(properties)) {
            const property = this.properties[key];
            if (!property) {
                throw new Error(
                    `Block ${this.name} has no property ${key} (has: ${Object.keys(this.properties).join(', ') || 'none'})`
                );
            }

            const normalised = property.type === 'byte' && typeof value === 'boolean' ? Number(value) : value;
            if (!property.values.includes(normalised)) {
                throw new Error(
                    `Property ${this.name}.${key} does not accept ${String(value)} (accepts: ${property.values.join(', ')})`
                );
            }
        }

        return new BlockState(this.name, { ...this.getDefaultState().properties, ...properties });
    }

    /** Every state this block can be in - the cartesian product of its properties. */
    public getAllStates(): BlockState[] {
        let states: Array<Record<string, BlockStateValue>> = [{}];
        for (const [key, property] of Object.entries(this.properties)) {
            states = states.flatMap((partial) => property.values.map((value) => ({ ...partial, [key]: value })));
        }

        return states.map((properties) => new BlockState(this.name, properties));
    }
}

/**
 * The block schemas JSPrismarine ships with.
 *
 * Bootstrapped once from the vanilla state dump by
 * `packages/bedrock-data/utils/generate-block-schemas.js` and owned here from that point
 * on: it is committed, diffable and editable, and the generator only runs again when
 * somebody deliberately runs it.
 */
export class BlockStateSchemas {
    private static readonly schemas = new Map<string, BlockStateSchema>();
    private static loaded = false;

    /**
     * Bumped whenever the catalogue changes. Lets caches keyed on it - the reverse index in
     * `BlockRuntimeIds` - notice a plugin registration without this module having to know
     * they exist.
     */
    private static revisionCounter = 0;

    public static get revision(): number {
        this.load();
        return this.revisionCounter;
    }

    private static load(): void {
        if (this.loaded) return;

        for (const [name, data] of Object.entries(vanillaSchemas.blocks as Record<string, BlockStateSchemaData>)) {
            this.schemas.set(name, new BlockStateSchema(name, data.properties));
        }
        this.loaded = true;
    }

    public static get(name: string): BlockStateSchema | null {
        this.load();
        return this.schemas.get(name) ?? null;
    }

    /**
     * Registers or replaces a schema, which is how a plugin contributes a block.
     * Overriding a vanilla name is allowed on purpose: it is the intended way to change
     * what a vanilla block accepts.
     */
    public static register(schema: BlockStateSchema): void {
        this.load();
        this.schemas.set(schema.name, schema);
        this.revisionCounter++;
    }

    /** Blocks outside the `minecraft:` namespace, which have to be declared to the client. */
    public static getCustomSchemas(): BlockStateSchema[] {
        this.load();
        return [...this.schemas.values()].filter((schema) => !schema.name.startsWith('minecraft:'));
    }

    public static names(): string[] {
        this.load();
        return [...this.schemas.keys()];
    }

    /** Drops plugin registrations and reloads the shipped catalogue. Used by tests. */
    public static reset(): void {
        this.schemas.clear();
        this.loaded = false;
        this.revisionCounter++;
    }
}

export default BlockStateSchema;
