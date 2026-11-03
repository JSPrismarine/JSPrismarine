import type {
    BehaviorRegistry,
    ComponentRegistry,
    Definition,
    Diagnostic,
    FlagSpec,
    Type
} from '@jsprismarine/content';
import { resolveTypes } from '@jsprismarine/content';
import { Molang } from '@jsprismarine/molang';

import { collisionBox, createBlockComponentRegistry, tags as blockTags, tick } from './components';
import type { BlockDefinitionDocument } from './definition';
import { parseBlockDefinition } from './definition';
import type { BlockHooks, BlockStateValue } from './hooks';
import type { PermutationMask } from './permutations';
import { componentsForPermutation, permutationsFor } from './permutations';
import type { BlockStateDefinition } from './state';
import { BlockPalette, BlockStateModel, vanillaBlockPalette } from './state';
import { TRAIT_STATES, traitStateDomains } from './traits';

/** The load-time flags a block type answers by name. */
export interface BlockFlags {
    /** Whether anything can stand on the block, read from `minecraft:collision_box`. */
    solid: boolean;
    /** Whether the block's components let it reach `onTick`. */
    ticking: boolean;
    /** Whether the block's components let it reach `onRandomTick`. */
    randomTicking: boolean;
}

/**
 * How each flag is computed, once per resolved state.
 *
 * `solid` reads `minecraft:collision_box` rather than a property table,
 * because no Mojang report and no part of `@jsprismarine/mapping` publishes a
 * per-block solidity column. A block with no collision box component is
 * solid, which is the engine's default.
 */
const BLOCK_FLAG_SPEC: FlagSpec<BlockHooks, BlockFlags> = {
    solid: (view) => {
        const box = view.params(collisionBox);
        if (box === undefined) return true;
        if (typeof box === 'boolean') return box;
        const boxes = Array.isArray(box) ? box : [box];
        return boxes.some((entry) => entry.size.some((side: number) => side !== 0));
    },
    ticking: (view) => view.hooks.has('onTick') || view.params(tick) !== undefined,
    randomTicking: (view) => view.hooks.has('onRandomTick')
};

/** One palette state of one block: the handle the server holds per placed block. */
export interface BlockState {
    readonly type: BlockType;
    /** The canonical index within the block, from its {@link BlockStateModel}. */
    readonly index: number;
    /** The dense id across the whole palette, which indexes a flattened column. */
    readonly runtimeId: number;
    readonly values: Readonly<Record<string, BlockStateValue>>;
    /** Which permutations matched this state, in declaration order. */
    readonly permutations: PermutationMask;
    /** The Bedrock tags attached to this state after its permutations resolve. */
    readonly tags: readonly string[];
    /** Whether this state carries one of its Bedrock `minecraft:tags`. */
    hasTag(tag: string): boolean;
    /** The Java datapack tags attached to this block type. */
    readonly javaTags: readonly string[];
    /** Whether a Java datapack tag includes this block type. */
    hasJavaTag(tag: string): boolean;
    /**
     * The resolved content type for this state: its bound components, its
     * behaviors and its hook table, with the matching permutations applied
     * over the base components.
     */
    readonly content: Type<BlockHooks, keyof BlockFlags>;
}

/** One block definition resolved once per identifier. */
export interface BlockType {
    readonly identifier: string;
    readonly definition: BlockDefinitionDocument;
    /** The Java datapack tags attached to this block type. */
    readonly javaTags: readonly string[];
    /** Whether a Java datapack tag includes this block type. */
    hasJavaTag(tag: string): boolean;
    /** The states the block carries, which the palette or the definition supplied. */
    readonly model: BlockStateModel;
    /** Every state of the block, in canonical index order. */
    readonly states: readonly BlockState[];
    /**
     * One state by its values; a state the caller left out takes its default.
     *
     * @throws {BlockError} When a name is not one of the block's states.
     */
    state(values?: Readonly<Record<string, BlockStateValue>>): BlockState;
}

class ResolvedBlockState implements BlockState {
    public constructor(
        public readonly type: BlockType,
        public readonly index: number,
        public readonly runtimeId: number,
        public readonly values: Readonly<Record<string, BlockStateValue>>,
        public readonly permutations: PermutationMask,
        public readonly content: Type<BlockHooks, keyof BlockFlags>,
        public readonly tags: readonly string[],
        public readonly javaTags: readonly string[]
    ) {}

    public hasTag(tag: string): boolean {
        return this.tags.includes(tag);
    }

    public hasJavaTag(tag: string): boolean {
        return this.javaTags.includes(tag);
    }
}

class ResolvedBlockType implements BlockType {
    public constructor(
        public readonly identifier: string,
        public readonly definition: BlockDefinitionDocument,
        public readonly javaTags: readonly string[],
        public readonly model: BlockStateModel,
        public readonly states: readonly BlockState[]
    ) {}

    public hasJavaTag(tag: string): boolean {
        return this.javaTags.includes(tag);
    }

    public state(values: Readonly<Record<string, BlockStateValue>> = {}): BlockState {
        return this.states[this.model.encode(values)]!;
    }
}

/** Shares one immutable copy for identical state tag lists. */
const internStringArray = (cache: Map<string, readonly string[]>, values: readonly string[]): readonly string[] => {
    let key = '';
    for (const value of values) key += `${value.length}:${value}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const shared = Object.freeze([...values]);
    cache.set(key, shared);
    return shared;
};

/** What {@link resolveBlocks} returns. */
export interface BlockResolveResult {
    /** The palette the dense runtime ids index, built from the resolved blocks. */
    readonly palette: BlockPalette;
    /** Identifier to type, in palette order. */
    readonly types: ReadonlyMap<string, BlockType>;
    /** Every state, indexed by its dense runtime id. */
    readonly states: readonly BlockState[];
    readonly diagnostics: readonly Diagnostic[];
}

/** Options for {@link resolveBlocks}. */
export interface BlockResolveOptions {
    /** The components to bind; a fresh registry of the vanilla set by default. */
    components?: ComponentRegistry<BlockHooks>;
    /** The behavior families to attach by identifier. */
    behaviors?: BehaviorRegistry<BlockHooks>;
    /** Java datapack tags for each resolved Bedrock block identifier and state. */
    javaTags?: (identifier: string, values: Readonly<Record<string, BlockStateValue>>) => readonly string[];
    /** The engine permutation conditions compile through; a fresh one by default. */
    molang?: Molang;
    /**
     * Where a block's states come from when its definition declares none, as
     * every vanilla file does. The captured Bedrock palette by default.
     */
    statePalette?: BlockPalette;
    /** Fail on any diagnostic instead of reporting and continuing. */
    strict?: boolean;
}

/** Error thrown by a strict resolve; `diagnostics` holds the full report. */
export class BlockLoadError extends Error {
    public override name = 'BlockLoadError';

    public constructor(public readonly diagnostics: readonly Diagnostic[]) {
        super(
            `the blocks did not resolve cleanly: ${diagnostics.length} diagnostic(s), first: ${diagnostics[0]?.message}`
        );
    }
}

/** The states a definition's traits add on top of the ones it declares. */
const statesFromTraits = (
    document: BlockDefinitionDocument,
    domains: ReadonlyMap<string, BlockStateDefinition>,
    report: (code: string, message: string) => void
): readonly BlockStateDefinition[] =>
    document.description.traits.flatMap((trait) => {
        const known = TRAIT_STATES[trait.name];
        if (known === undefined) {
            report(
                'block.trait-unknown',
                `${document.description.identifier} declares the unknown trait ${trait.name}`
            );
            return [];
        }

        return trait.enabledStates.flatMap((enabled) => {
            const expanded = known[enabled];
            if (expanded === undefined) {
                report(
                    'block.trait-state-unknown',
                    `${document.description.identifier} enables ${enabled}, which ${trait.name} does not have`
                );
                return [];
            }

            return expanded.flatMap((state) => {
                const domain = domains.get(state);
                if (domain === undefined) {
                    report(
                        'block.trait-state-domain',
                        `${document.description.identifier} enables ${state}, whose values no captured block declares`
                    );
                    return [];
                }

                if (trait.name === 'minecraft:multi_block' && state === 'minecraft:multi_block_part') {
                    const declaredParts = trait.parameters.parts;
                    const parts =
                        declaredParts === undefined
                            ? 2
                            : typeof declaredParts === 'number' &&
                                Number.isInteger(declaredParts) &&
                                declaredParts >= 2 &&
                                declaredParts <= 4
                              ? declaredParts
                              : undefined;

                    if (parts === undefined) {
                        report(
                            'block.trait-parameter-invalid',
                            `${document.description.identifier} declares ${trait.name} parts as ${String(declaredParts)}, expected an integer from 2 to 4`
                        );
                        return [domain];
                    }

                    return [{ ...domain, values: domain.values.slice(0, parts) }];
                }

                return [domain];
            });
        });
    });

/**
 * Resolves block definitions into types and per-state handles.
 *
 * Each definition parses under the schema its `format_version` selects, takes
 * its states from its own `description.states` and traits or, when it
 * declares none as every vanilla file does, from the captured palette. Then
 * every state is grouped by which permutations match it, and one content type
 * is resolved per group, so a block with no permutations costs one resolve
 * however many states it has.
 *
 * @param definitions - As `@jsprismarine/packs` produced them; `data` is the
 *   file's parsed JSON.
 * @throws {BlockLoadError} In strict mode, when any diagnostic is reported.
 */
export const resolveBlocks = (
    definitions: Iterable<Definition>,
    options: BlockResolveOptions = {}
): BlockResolveResult => {
    const components = options.components ?? createBlockComponentRegistry();
    const molang = options.molang ?? new Molang();
    const statePalette = options.statePalette ?? vanillaBlockPalette();
    const domains = traitStateDomains(statePalette);

    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    const add = (diagnostic: Diagnostic): void => {
        const key = `${diagnostic.pack}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        if (seen.has(key)) return;
        seen.add(key);
        diagnostics.push(diagnostic);
    };

    const parsed: { definition: Definition; document: BlockDefinitionDocument; model: BlockStateModel }[] = [];

    for (const definition of definitions) {
        const result = parseBlockDefinition(definition.data, { pack: definition.pack, path: definition.path });
        for (const diagnostic of result.diagnostics) add(diagnostic);
        if (!result.document) continue;

        const document = result.document;
        const report = (code: string, message: string): void =>
            add({ severity: 'warning', code, pack: definition.pack, path: definition.path, message });

        const declared = [...document.description.states, ...statesFromTraits(document, domains, report)];
        const model =
            declared.length > 0
                ? new BlockStateModel(declared)
                : (statePalette.entry(document.description.identifier)?.model ?? new BlockStateModel([]));

        parsed.push({ definition, document, model });
    }

    const palette = new BlockPalette(parsed.map((entry) => [entry.document.description.identifier, entry.model]));
    const types = new Map<string, BlockType>();
    const states: BlockState[] = new Array(palette.stateCount);
    const sharedTags = new Map<string, readonly string[]>();

    for (const { definition, document, model } of parsed) {
        const identifier = document.description.identifier;
        const firstRuntimeId = palette.entry(identifier)!.firstRuntimeId;
        const byMask = new Map<string, Type<BlockHooks, keyof BlockFlags>>();
        const masksByKey = new Map<string, PermutationMask>();
        const ownStates: BlockState[] = new Array(model.size);
        // A condition is independent of state; compile once per block instead of rebuilding its cache key per state.
        const compiledPermutations = document.permutations.map((permutation) => molang.compile(permutation.condition));
        const valuesByState = Array.from({ length: model.size }, (_, index) => model.decode(index));
        const javaTagsByState = valuesByState.map((values) =>
            internStringArray(sharedTags, [...new Set(options.javaTags?.(identifier, values) ?? [])])
        );
        const javaTags = internStringArray(sharedTags, [...new Set(javaTagsByState.flat())]);
        const type = new ResolvedBlockType(identifier, document, javaTags, model, ownStates);

        for (let index = 0; index < model.size; index += 1) {
            const values = valuesByState[index]!;
            const calculatedMask = permutationsFor(document, values, molang, compiledPermutations);
            const key = calculatedMask.join(',');
            // The same key groups states with the same permutation set; reuse its immutable mask.
            const mask = masksByKey.get(key) ?? Object.freeze([...calculatedMask]);
            masksByKey.set(key, mask);

            let content = byMask.get(key);
            if (content === undefined) {
                const entries = componentsForPermutation(document, mask);
                const resolved = resolveTypes<BlockHooks, BlockFlags>([definition], {
                    components,
                    behaviors: options.behaviors,
                    read: () => entries,
                    flags: BLOCK_FLAG_SPEC
                });
                for (const diagnostic of resolved.diagnostics) add(diagnostic);
                content = resolved.types.get(identifier)!;
                byMask.set(key, content);
            }

            const stateTags = internStringArray(sharedTags, content.params(blockTags) ?? []);
            const state = new ResolvedBlockState(
                type,
                index,
                firstRuntimeId + index,
                values,
                mask,
                content,
                stateTags,
                javaTagsByState[index]!
            );
            ownStates[index] = state;
            states[state.runtimeId] = state;
        }

        types.set(identifier, type);
    }

    if (options.strict && diagnostics.length > 0) throw new BlockLoadError(diagnostics);

    return { palette, types, states, diagnostics };
};
