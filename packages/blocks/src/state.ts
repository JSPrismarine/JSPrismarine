import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';

import { BlockError } from './errors';
import type { BlockStateValue } from './hooks';

/** How a block state's values are written: a bit, a number or a name. */
export type BlockStateType = 'bool' | 'int' | 'string';

/** One state a block carries, with the values the game accepts for it. */
export interface BlockStateDefinition {
    /** The state name, such as `facing_direction` or `minecraft:cardinal_direction`. */
    readonly name: string;
    readonly type: BlockStateType;
    /** Every accepted value, in the order the encoding counts them. */
    readonly values: readonly BlockStateValue[];
    /** The value a freshly placed block starts with; always one of `values`. */
    readonly defaultValue: BlockStateValue;
}

/** Normalizes a palette value: a bit is a boolean whichever way the capture wrote it. */
const normalize = (type: BlockStateType, value: BlockStateValue): BlockStateValue =>
    type === 'bool' ? value === true || value === 1 : value;

/**
 * The states one block carries and the dense index of each combination.
 *
 * The canonical order is the states sorted by name, which is the order the
 * block's NBT compound is written in before it is hashed into a runtime id, so
 * an index here and the wire agree on which state is which. Within that order
 * the first state is the most significant digit of a mixed-radix number, so
 * incrementing an index walks the last state's values first.
 */
export class BlockStateModel {
    /** The states in canonical order: sorted by name. */
    public readonly states: readonly BlockStateDefinition[];
    /** How many combinations the states produce; 1 for a block with no state. */
    public readonly size: number;
    /** The index of the combination made of every state's default value. */
    public readonly defaultIndex: number;

    private readonly strides: readonly number[];
    private readonly byName: ReadonlyMap<string, { definition: BlockStateDefinition; position: number }>;

    /**
     * @param states - The states in any order; the model sorts them by name.
     * @throws {BlockError} When two states share a name, or a state has no values.
     */
    public constructor(states: Iterable<BlockStateDefinition>) {
        const sorted = [...states]
            .map((state) => ({
                ...state,
                values: state.values.map((value) => normalize(state.type, value)),
                defaultValue: normalize(state.type, state.defaultValue)
            }))
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

        const byName = new Map<string, { definition: BlockStateDefinition; position: number }>();
        for (const [position, definition] of sorted.entries()) {
            if (byName.has(definition.name)) throw new BlockError(`the state ${definition.name} is declared twice`);
            if (definition.values.length === 0) throw new BlockError(`the state ${definition.name} has no values`);
            byName.set(definition.name, { definition, position });
        }

        const strides = new Array<number>(sorted.length);
        let stride = 1;
        for (let index = sorted.length - 1; index >= 0; index -= 1) {
            strides[index] = stride;
            stride *= sorted[index]!.values.length;
        }

        this.states = Object.freeze(sorted);
        this.strides = strides;
        this.byName = byName;
        this.size = stride;
        this.defaultIndex = this.encode(
            Object.fromEntries(sorted.map((state) => [state.name, state.defaultValue] as const))
        );
    }

    /**
     * The dense index of one combination.
     *
     * @param values - Every state's value; a missing state takes its default.
     * @throws {BlockError} When a name is not one of the block's states, or a
     *   value is outside the state's domain.
     */
    public encode(values: Readonly<Record<string, BlockStateValue>>): number {
        for (const name of Object.keys(values)) {
            if (!this.byName.has(name)) {
                throw new BlockError(
                    `${name} is not a state of this block (has: ${this.names().join(', ') || 'none'})`
                );
            }
        }

        let index = 0;
        for (const [position, state] of this.states.entries()) {
            const given = values[state.name];
            const value = given === undefined ? state.defaultValue : normalize(state.type, given);
            const offset = state.values.indexOf(value);
            if (offset < 0) {
                throw new BlockError(`${String(given)} is not a value of the state ${state.name}`);
            }
            index += offset * this.strides[position]!;
        }
        return index;
    }

    /**
     * The combination one dense index stands for.
     *
     * @throws {BlockError} When the index is not in `[0, size)`.
     */
    public decode(index: number): Readonly<Record<string, BlockStateValue>> {
        if (!Number.isInteger(index) || index < 0 || index >= this.size) {
            throw new BlockError(`the state index ${index} is outside 0 to ${this.size - 1}`);
        }

        const values: Record<string, BlockStateValue> = {};
        for (const [position, state] of this.states.entries()) {
            const offset = Math.floor(index / this.strides[position]!) % state.values.length;
            values[state.name] = state.values[offset]!;
        }
        return values;
    }

    /** The state names in canonical order. */
    public names(): readonly string[] {
        return this.states.map((state) => state.name);
    }

    /** One state by name, or undefined when the block does not carry it. */
    public state(name: string): BlockStateDefinition | undefined {
        return this.byName.get(name)?.definition;
    }
}

/** One block in a palette: its identifier, its states and where its dense ids start. */
export interface PaletteEntry {
    readonly identifier: string;
    readonly model: BlockStateModel;
    /** The dense runtime id of the block's state index 0. */
    readonly firstRuntimeId: number;
}

/**
 * Every block the server knows and a dense runtime id per state.
 *
 * Ids are positional, assigned by walking the blocks in identifier order and
 * each block's states in canonical index order, so the same palette input
 * reproduces every id. They are not the FNV-1a hashes the network carries;
 * those stay in the protocol layer. These are the array indices the flattened
 * tables and the chunk storage read.
 */
export class BlockPalette {
    /** The blocks in identifier order. */
    public readonly entries: readonly PaletteEntry[];
    /** How many states the palette holds, which is the length of a flattened column. */
    public readonly stateCount: number;

    private readonly byIdentifier: ReadonlyMap<string, PaletteEntry>;

    /** @param blocks - Identifier to state model, in any order; the palette sorts by identifier. */
    public constructor(blocks: Iterable<readonly [string, BlockStateModel]>) {
        const sorted = [...blocks].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        const entries: PaletteEntry[] = [];
        const byIdentifier = new Map<string, PaletteEntry>();

        let next = 0;
        for (const [identifier, model] of sorted) {
            if (byIdentifier.has(identifier)) throw new BlockError(`${identifier} appears twice in the palette`);
            const entry: PaletteEntry = { identifier, model, firstRuntimeId: next };
            entries.push(entry);
            byIdentifier.set(identifier, entry);
            next += model.size;
        }

        this.entries = Object.freeze(entries);
        this.byIdentifier = byIdentifier;
        this.stateCount = next;
    }

    /** One block's entry, or undefined when the palette has no such identifier. */
    public entry(identifier: string): PaletteEntry | undefined {
        return this.byIdentifier.get(identifier);
    }

    /**
     * The dense runtime id of one state.
     *
     * @throws {BlockError} When the palette has no such block, or the values
     *   do not name a state of it.
     */
    public runtimeId(identifier: string, values: Readonly<Record<string, BlockStateValue>> = {}): number {
        const entry = this.byIdentifier.get(identifier);
        if (!entry) throw new BlockError(`the palette has no block ${identifier}`);
        return entry.firstRuntimeId + entry.model.encode(values);
    }

    /**
     * Which block and state one dense runtime id stands for.
     *
     * @throws {BlockError} When the id is not in `[0, stateCount)`.
     */
    public stateOf(runtimeId: number): { entry: PaletteEntry; values: Readonly<Record<string, BlockStateValue>> } {
        if (!Number.isInteger(runtimeId) || runtimeId < 0 || runtimeId >= this.stateCount) {
            throw new BlockError(`the runtime id ${runtimeId} is outside 0 to ${this.stateCount - 1}`);
        }

        let low = 0;
        let high = this.entries.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (this.entries[middle]!.firstRuntimeId <= runtimeId) low = middle;
            else high = middle - 1;
        }

        const entry = this.entries[low]!;
        return { entry, values: entry.model.decode(runtimeId - entry.firstRuntimeId) };
    }
}

const typeOf = (type: 'byte' | 'int' | 'string'): BlockStateType =>
    type === 'byte' ? 'bool' : type === 'int' ? 'int' : 'string';

let vanilla: BlockPalette | undefined;

/**
 * The captured Bedrock palette as a {@link BlockPalette}: 1477 blocks over
 * 22079 states, from `@jsprismarine/minecraft`'s generated catalog, which a
 * Bedrock Dedicated Server was asked block by block rather than dumped from a
 * third party.
 *
 * Built once and reused, because nothing here is mutable.
 */
export const vanillaBlockPalette = (): BlockPalette => {
    vanilla ??= new BlockPalette(
        Object.entries(blockSchemas.blocks).map(([identifier, schema]) => {
            const states = Object.entries(schema.properties).map(([name, property]) => ({
                name,
                type: typeOf(property.type),
                values: property.values,
                defaultValue: property.default
            }));
            return [identifier, new BlockStateModel(states)] as const;
        })
    );
    return vanilla;
};
