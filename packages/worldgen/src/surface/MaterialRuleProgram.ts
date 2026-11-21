import { compileOreVeinRule, ORE_VEIN_SEED } from '../chunk/oreVein';
import type { OreVeinPlacer, OreVeinRule } from '../chunk/oreVein';
import { map } from '../math';
import type { PositionalRandomFactory } from '../random/RandomSource';
import type { MaterialConditionNode, MaterialRuleNode } from './MaterialRule';
import type { MaterialRuleContext } from './MaterialRuleContext';

/** Continue when the condition holds, else jump to the op's target. */
const OP_TEST = 0;
/** Continue when the condition fails, else jump to the op's target: a `not` condition. */
const OP_TEST_NOT = 1;
/** Return the op's block state. */
const OP_BLOCK = 2;
/** Return the badlands terracotta band at the position. */
const OP_BANDLANDS = 3;
/** Return what the op's ore vein places, or jump to the op's target when it places nothing. */
const OP_ORE_VEIN = 4;
/** Return nothing: no rule matched. */
const OP_END = 5;

/** How many words one op takes: the opcode, its argument and its jump target. */
const OP_WORDS = 3;

/**
 * A material rule tree flattened into one array of ops, with no closures in it.
 *
 * Each `sequence` and `condition` becomes a run of tests whose targets say where to go when a
 * branch places nothing, so a block's rule is one walk forward through the array. The program
 * holds no seed or chunk state, which a {@link MaterialRuleInterpreter} binds, so one program
 * serves every chunk of a dimension.
 */
export interface MaterialRuleProgram {
    /** {@link OP_WORDS} words per op: the opcode, its argument and its jump target. */
    readonly ops: Int32Array;
    /** The conditions the tests name, each one once and none of them `not`. */
    readonly conditions: readonly LeafCondition[];
    /** The block states the `block` ops return. */
    readonly states: readonly string[];
    /** The ore veins the `ore_vein` ops run. */
    readonly oreVeins: readonly OreVeinRule[];
}

/** A material condition other than `not`, which the program spells as a test that jumps the other way. */
type LeafCondition = Exclude<MaterialConditionNode, { readonly type: 'not' }>;

const programs = new WeakMap<MaterialRuleNode, MaterialRuleProgram>();

/**
 * Flattens a material rule tree into a {@link MaterialRuleProgram}, once per tree.
 *
 * A node that the data names from two places compiles to two runs of ops; a condition or an
 * ore vein named twice is still one entry, so its cached answer is shared.
 */
export const compileMaterialRuleProgram = (rule: MaterialRuleNode): MaterialRuleProgram => {
    const cached = programs.get(rule);
    if (cached !== undefined) return cached;

    const words: number[] = [];
    const conditions: LeafCondition[] = [];
    const conditionIndices = new Map<LeafCondition, number>();
    const states: string[] = [];
    const stateIndices = new Map<string, number>();
    const oreVeins: OreVeinRule[] = [];
    const oreVeinIndices = new Map<OreVeinRule, number>();

    const indexOf = <T>(value: T, list: T[], indices: Map<T, number>): number => {
        let index = indices.get(value);
        if (index === undefined) {
            index = list.push(value) - 1;
            indices.set(value, index);
        }
        return index;
    };
    const emit = (opcode: number, argument: number): number => {
        words.push(opcode, argument, -1);
        return words.length / OP_WORDS - 1;
    };

    /** Emits a rule's ops and returns the ops whose target is wherever the rule gives up. */
    const compile = (node: MaterialRuleNode): number[] => {
        switch (node.type) {
            case 'block':
                emit(OP_BLOCK, indexOf(node.resultState, states, stateIndices));
                return [];
            case 'bandlands':
                emit(OP_BANDLANDS, 0);
                return [];
            case 'sequence': {
                let givesUp: number[] = [];
                for (const child of node.sequence) {
                    // A child that places nothing falls through to the next one.
                    for (const op of givesUp) words[op * OP_WORDS + 2] = words.length / OP_WORDS;
                    givesUp = compile(child);
                }
                return givesUp;
            }
            case 'condition': {
                let condition = node.ifTrue;
                let negated = false;
                while (condition.type === 'not') {
                    negated = !negated;
                    condition = condition.invert;
                }
                const test = emit(negated ? OP_TEST_NOT : OP_TEST, indexOf(condition, conditions, conditionIndices));
                return [test, ...compile(node.thenRun)];
            }
            case 'ore_vein':
                return [emit(OP_ORE_VEIN, indexOf(node.rule, oreVeins, oreVeinIndices))];
        }
    };

    const givesUp = compile(rule);
    const end = emit(OP_END, 0);
    for (const op of givesUp) words[op * OP_WORDS + 2] = end;

    const program: MaterialRuleProgram = { ops: Int32Array.from(words), conditions, states, oreVeins };
    programs.set(rule, program);
    return program;
};

/**
 * The one answer a `biome` condition has wherever only these biomes occur: false when it names
 * none of them, true when it names all of them, and undefined when the answer varies.
 */
const foldBiomes = (named: ReadonlySet<string>, occurring: Iterable<string> | undefined): boolean | undefined => {
    if (occurring === undefined) return undefined;
    let any = false;
    let all = true;
    for (const biome of occurring) {
        if (named.has(biome)) any = true;
        else all = false;
    }
    return !any ? false : all ? true : undefined;
};

/** What a condition's answer depends on, which decides the counter its cache is keyed by. */
const PER_BLOCK = 0;
const PER_COLUMN = 1;

/** A fold's three outcomes, as a byte. */
const FOLD_FALSE = 0;
const FOLD_TRUE = 1;
const FOLD_VARIES = 2;

const foldByte = (fold: boolean | undefined): number =>
    fold === undefined ? FOLD_VARIES : fold ? FOLD_TRUE : FOLD_FALSE;

type ConditionOf<T extends LeafCondition['type']> = Extract<LeafCondition, { readonly type: T }>;

/** One condition with its seed- and dimension-bound inputs, resolved once per interpreter. */
type BoundCondition =
    | (ConditionOf<'biome'> & {
          /** The biomes it names. */
          readonly named: ReadonlySet<string>;
          /** Its answer over every biome the chunk can hold, as a fold byte. */
          readonly possible: number;
          /** Its answer inside the local box, as a fold byte. */
          readonly inBox: number;
      })
    | (ConditionOf<'vertical_gradient'> & {
          readonly trueAtAndBelowY: number;
          readonly falseAtAndAboveY: number;
          readonly random: PositionalRandomFactory;
      })
    | (ConditionOf<'y_above'> & { readonly anchorY: number })
    | Exclude<LeafCondition, { readonly type: 'biome' | 'vertical_gradient' | 'y_above' }>;

/**
 * Runs a {@link MaterialRuleProgram} against one {@link MaterialRuleContext}.
 *
 * Every condition's answer is cached against the context's block counter, or its column counter
 * when it reads only the column, the way Java's lazy conditions are. Every condition is a pure
 * function of the context's position and counters, so caching changes how often one is asked and
 * never what it answers.
 */
export class MaterialRuleInterpreter {
    private readonly ops: Int32Array;
    private readonly states: readonly string[];
    private readonly conditions: readonly BoundCondition[];
    private readonly oreVeins: readonly OreVeinPlacer[];
    /** Per condition: {@link PER_BLOCK} or {@link PER_COLUMN}. */
    private readonly cacheKinds: Uint8Array;
    /** Per condition: the counter value its cached answer was computed at, or -1. */
    private readonly cachedAt: Float64Array;
    private readonly cachedAnswers: Uint8Array;
    /** Per condition: the context's candidate count its candidate fold was made at, or -1. */
    private readonly foldedAt: Float64Array;
    /** Per condition: a `biome` condition's answer over the current candidate cells, as a fold byte. */
    private readonly candidateFolds: Uint8Array;

    public constructor(
        program: MaterialRuleProgram,
        private readonly context: MaterialRuleContext
    ) {
        this.ops = program.ops;
        this.states = program.states;
        this.conditions = program.conditions.map((node) => this.bind(node));
        this.oreVeins = program.oreVeins.map((rule) =>
            compileOreVeinRule(
                rule,
                (child) => context.densitySampler(child),
                context.randomFactory(ORE_VEIN_SEED),
                context.densityCellBound(rule.density)
            )
        );
        this.cacheKinds = Uint8Array.from(program.conditions, (node) =>
            node.type === 'steep' || node.type === 'hole' || (node.type === 'noise_threshold' && !node.is3d)
                ? PER_COLUMN
                : PER_BLOCK
        );
        this.cachedAt = new Float64Array(program.conditions.length).fill(-1);
        this.cachedAnswers = new Uint8Array(program.conditions.length);
        this.foldedAt = new Float64Array(program.conditions.length).fill(-1);
        this.candidateFolds = new Uint8Array(program.conditions.length);
    }

    /** The block the rule places at the context's position, or undefined to leave it alone. */
    public run(x: number, y: number, z: number): string | undefined {
        const ops = this.ops;
        let op = 0;
        for (;;) {
            const at = op * OP_WORDS;
            switch (ops[at]) {
                case OP_TEST:
                    op = this.test(ops[at + 1]!) ? op + 1 : ops[at + 2]!;
                    break;
                case OP_TEST_NOT:
                    op = this.test(ops[at + 1]!) ? ops[at + 2]! : op + 1;
                    break;
                case OP_BLOCK:
                    return this.states[ops[at + 1]!];
                case OP_BANDLANDS:
                    return this.context.getBand(x, y, z);
                case OP_ORE_VEIN: {
                    const state = this.oreVeins[ops[at + 1]!]!(this.context.sampleContext, x, y, z);
                    if (state !== undefined) return state;
                    op = ops[at + 2]!;
                    break;
                }
                default:
                    return undefined;
            }
        }
    }

    /** Whether one condition holds at the context's position, from its cache when it can. */
    private test(index: number): boolean {
        const context = this.context;
        const counter = this.cacheKinds[index] === PER_COLUMN ? context.updateCountXZ : context.updateCountY;
        if (this.cachedAt[index] !== counter) {
            this.cachedAt[index] = counter;
            this.cachedAnswers[index] = this.evaluate(index) ? 1 : 0;
        }
        return this.cachedAnswers[index] === 1;
    }

    private bind(node: LeafCondition): BoundCondition {
        const context = this.context;
        switch (node.type) {
            case 'biome': {
                const named = new Set(node.biomes);
                const local = context.localBiomes;
                return {
                    ...node,
                    named,
                    possible: foldByte(foldBiomes(named, context.possibleBiomes)),
                    inBox: local === undefined ? FOLD_VARIES : foldByte(foldBiomes(named, local.biomes))
                };
            }
            case 'vertical_gradient':
                return {
                    ...node,
                    trueAtAndBelowY: context.resolveAnchorY(node.trueAtAndBelow),
                    falseAtAndAboveY: context.resolveAnchorY(node.falseAtAndAbove),
                    random: context.randomFactory(node.randomName)
                };
            case 'y_above':
                return { ...node, anchorY: context.resolveAnchorY(node.anchor) };
            default:
                return node;
        }
    }

    private evaluate(index: number): boolean {
        const context = this.context;
        const node = this.conditions[index]!;
        switch (node.type) {
            case 'biome': {
                if (node.possible !== FOLD_VARIES) return node.possible === FOLD_TRUE;
                const local = context.localBiomes;
                // Inside the box the answer is known; the lookup is left for the blocks outside it.
                if (
                    local !== undefined &&
                    node.inBox !== FOLD_VARIES &&
                    context.blockX >= local.minX &&
                    context.blockX <= local.maxX &&
                    context.blockZ >= local.minZ &&
                    context.blockZ <= local.maxZ &&
                    context.blockY >= local.minY &&
                    context.blockY <= local.maxY
                ) {
                    return node.inBox === FOLD_TRUE;
                }
                // Where all eight cells the lookup can pick agree, so does the block.
                const candidates = context.getCandidateBiomes();
                if (candidates !== undefined) {
                    if (this.foldedAt[index] !== context.candidateCount) {
                        this.foldedAt[index] = context.candidateCount;
                        this.candidateFolds[index] = foldByte(foldBiomes(node.named, candidates));
                    }
                    const fold = this.candidateFolds[index];
                    if (fold !== FOLD_VARIES) return fold === FOLD_TRUE;
                }
                return node.named.has(context.getBiome());
            }
            case 'noise_threshold': {
                const value = context.sampleNoise(node.noise, node.is3d);
                return value >= node.minThreshold && value <= node.maxThreshold;
            }
            case 'vertical_gradient': {
                const blockY = context.blockY;
                if (blockY <= node.trueAtAndBelowY) return true;
                if (blockY >= node.falseAtAndAboveY) return false;
                const probability = map(blockY, node.trueAtAndBelowY, node.falseAtAndAboveY, 1, 0);
                return node.random.at(context.blockX, blockY, context.blockZ).nextFloat() < probability;
            }
            case 'y_above':
                return (
                    context.blockY + (node.addStoneDepth ? context.stoneDepthAbove : 0) >=
                    node.anchorY + context.surfaceDepth * node.surfaceDepthMultiplier
                );
            case 'water':
                return (
                    context.waterHeight === Number.NEGATIVE_INFINITY ||
                    context.blockY + (node.addStoneDepth ? context.stoneDepthAbove : 0) >=
                        context.waterHeight + node.offset + context.surfaceDepth * node.surfaceDepthMultiplier
                );
            case 'temperature':
                return context.isColdEnoughToSnow();
            case 'steep':
                return context.surfaceGradientX <= -4 || context.surfaceGradientZ >= 4;
            case 'hole':
                return context.surfaceDepth <= 0;
            case 'above_preliminary_surface':
                return context.blockY >= context.getMinSurfaceLevel();
            case 'stone_depth': {
                const stoneDepth = node.surfaceType === 'ceiling' ? context.stoneDepthBelow : context.stoneDepthAbove;
                const surfaceDepth = node.addSurfaceDepth ? context.surfaceDepth : 0;
                const secondary =
                    node.secondaryDepthRange === 0
                        ? 0
                        : Math.trunc(map(context.getSurfaceSecondary(), -1, 1, 0, node.secondaryDepthRange));
                return stoneDepth <= 1 + node.offset + surfaceDepth + secondary;
            }
        }
    }
}
