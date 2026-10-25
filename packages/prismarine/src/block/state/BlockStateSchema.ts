import { BlockState } from './BlockState';
import type { BlockStatePropertyType, BlockStateValue } from './BlockState';
// The catalog is generated and lives with the rest of the vanilla facts. It used to sit
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
 * else's blocks. The vanilla catalog below is just the schemas that ship by default.
 */
export class BlockStateSchema {
    public readonly name: string;
    public readonly properties: Readonly<Record<string, BlockStateProperty>>;

    /**
     * The default state, built once.
     *
     * A schema is immutable, so the state its defaults describe never changes, and a
     * {@link BlockState} is frozen, so handing the same instance to every caller is the same
     * answer they built for themselves before. Built lazily rather than in the constructor
     * because the vanilla catalog is ~1300 schemas and most of them are never placed.
     */
    private defaultState: BlockState | null = null;

    /** Built once for the same reason {@link defaultState} is: the schema cannot change. */
    private propertyTypes: Record<string, BlockStatePropertyType> | null = null;

    public constructor(name: string, properties: Record<string, BlockStateProperty> = {}) {
        this.name = name;
        this.properties = Object.freeze({ ...properties });
    }

    /**
     * The NBT type of every property, in the shape {@link BlockState.toNBT} wants.
     *
     * The same object every time. Reading and writing a sub chunk asks once per palette entry,
     * and rebuilding the record meant two intermediate arrays and an object per ask.
     */
    public getPropertyTypes(): Record<string, BlockStatePropertyType> {
        this.propertyTypes ??= Object.freeze(
            Object.fromEntries(Object.entries(this.properties).map(([key, property]) => [key, property.type]))
        );

        return this.propertyTypes;
    }

    /**
     * The state a freshly placed block starts in.
     *
     * The same frozen instance every time. Reading a position no sub chunk covers answers with
     * air's default state, so an idle world's random tick pass called this tens of thousands of
     * times a tick and spent most of the tick in the constructor.
     */
    public getDefaultState(): BlockState {
        this.defaultState ??= new BlockState(
            this.name,
            Object.fromEntries(Object.entries(this.properties).map(([key, property]) => [key, property.default]))
        );

        return this.defaultState;
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

            const normalized = property.type === 'byte' && typeof value === 'boolean' ? Number(value) : value;
            if (!property.values.includes(normalized)) {
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
 * The 1477 schemas JSPrismarine ships with, built once at import.
 *
 * Bootstrapped from the vanilla state dump by
 * `packages/bedrock-data/utils/generate-block-schemas.js` and owned here from that point
 * on: it is committed, diffable and editable, and the generator only runs again when
 * somebody deliberately runs it.
 *
 * Constant rather than loaded on the first read behind a `loaded` flag. The generated
 * catalog cannot change, so the flag only bought a branch on every lookup and a way for
 * {@link BlockStateSchemas.reset} to throw away 1477 schema objects and the default states
 * memoized on them.
 */
const SHIPPED: ReadonlyMap<string, BlockStateSchema> = new Map(
    Object.entries(vanillaSchemas.blocks).map(([name, data]) => [name, new BlockStateSchema(name, data.properties)])
);

/**
 * Every block schema this process knows: the shipped catalog, plus whatever was registered
 * over it.
 *
 * Reading a block is not per-server state and is deliberately not owned by one. A runtime
 * id is the FNV-1a hash of a block's own name and state, so the id a chunk holds names one
 * state and one state only, whichever server wrote it. A second server in the process can
 * add names, and that cannot change what the first one's blocks mean.
 *
 * {@link BlockStateSchemas.register} replacing a shipped name is the exception, and the
 * only reason {@link BlockStateSchemas.reset} still exists. Packs are where overriding a
 * vanilla block belongs, and the override path goes when `content-packs` stops being
 * optional; see section 10 of [the plan](../../../../../docs/plans/data-driven-vanilla.md).
 */
export class BlockStateSchemas {
    /** Schemas registered over {@link SHIPPED}, which are the only ones anybody can change. */
    private static readonly registered = new Map<string, BlockStateSchema>();

    /**
     * Bumped whenever a registration changes the catalog. Lets caches keyed on it - the
     * reverse index in `BlockRuntimeIds` - notice a plugin registration without this module
     * having to know they exist.
     */
    private static revisionCounter = 0;

    /** The number to key a derived index on, so it rebuilds when the catalog changes. */
    public static getRevision(): number {
        return this.revisionCounter;
    }

    public static get(name: string): BlockStateSchema | null {
        return this.registered.get(name) ?? SHIPPED.get(name) ?? null;
    }

    /**
     * Registers or replaces a schema, which is how a plugin contributes a block.
     * Overriding a vanilla name is allowed on purpose: it is the intended way to change
     * what a vanilla block accepts.
     */
    public static register(schema: BlockStateSchema): void {
        this.registered.set(schema.name, schema);
        this.revisionCounter++;
    }

    /** Blocks outside the `minecraft:` namespace, which have to be declared to the client. */
    public static getCustomSchemas(): BlockStateSchema[] {
        return [...this.registered.values()].filter((schema) => !schema.name.startsWith('minecraft:'));
    }

    /**
     * Every block name this process knows.
     *
     * The dedupe is skipped when nothing has registered, which is every server that has no
     * plugin blocks: building a 1477-entry `Set` costs four times what listing the keys
     * does, and `BlockManager` asks for this list on every `getBlocks()`.
     */
    public static names(): string[] {
        if (this.registered.size === 0) return [...SHIPPED.keys()];

        return [...new Set([...SHIPPED.keys(), ...this.registered.keys()])];
    }

    /** Drops every registration, leaving the shipped catalog. Used by tests. */
    public static reset(): void {
        this.registered.clear();
        this.revisionCounter++;
    }
}

export default BlockStateSchema;
