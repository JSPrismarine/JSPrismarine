import { createVoxelWorld } from '@jsprismarine/block-behaviors';
import { destroyProgress } from '@jsprismarine/item-behaviors';
import { planPush } from '@jsprismarine/block-behaviors/rules/piston';
import { blockProperties } from '@jsprismarine/blocks/components';
import { explosionResistanceOf } from '@jsprismarine/engine-systems';
import { itemTypesTable } from '@jsprismarine/items/tables';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blockFromContent } from '@jsprismarine/prismarine/block/Block';
import { isJavaLiquidContainer } from '@jsprismarine/prismarine/content/world/fluidReplacement';
import { flammabilityOf } from '@jsprismarine/prismarine/content/world/views';
import { Item } from '@jsprismarine/prismarine/item/Item';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import type { JavaBlockPropertyRow } from '../goldens.ts';
import { loadJavaBlockProperties } from '../goldens.ts';
import { javaBlockBehaviors, javaBlockHasBlockEntity, javaBlockIsA } from '../javaBlockClasses.ts';
import { pinnedJavaClassFile } from '../javaClassFile.ts';
import { serverContent } from '../serverStack.ts';

/**
 * Block scenarios that compare what the server does with a block's Java properties (how long it
 * takes to mine, what a blast does to it, the light it gives, fire's odds on it and how a piston
 * moves it) with what Java does with the same block, one Java state at a time.
 */

/** One Java block state, the Bedrock state the server holds it as, and Java's properties for it. */
export interface BlockStateSubject {
    readonly javaId: string;
    /** Java's state key, such as `lit=true`, empty for the default state. */
    readonly stateKey: string;
    readonly bedrock: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
    /** The Java properties of this state: the block's shared values with this state's overrides. */
    readonly java: Readonly<Record<string, string | number | boolean>>;
}

let javaRows: Record<string, JavaBlockPropertyRow> | undefined;

/** The Java block property dump, read once. */
export const javaBlockRows = (): Record<string, JavaBlockPropertyRow> => {
    javaRows ??= loadJavaBlockProperties();
    return javaRows;
};

const parseStateKey = (key: string): Record<string, string> =>
    Object.fromEntries(
        key === ''
            ? []
            : key.split(',').map((pair) => {
                  const [name = '', value = ''] = pair.split('=');
                  return [name, value];
              })
    );

const stateSubject = (javaId: string, row: JavaBlockPropertyRow, stateKey: string): BlockStateSubject | undefined => {
    const mapping = javaBlockStateToBedrock(javaId, stateKey === '' ? undefined : parseStateKey(stateKey));
    if (mapping.kind !== 'mapped') return undefined;
    return {
        javaId,
        stateKey,
        bedrock: mapping.bedrock.name,
        states: mapping.bedrock.states,
        java: { ...row.base, ...(stateKey === '' ? {} : row.stateOverrides?.[stateKey]) }
    };
};

/**
 * Every Java block's default state, plus each state whose Java value for one of `fields` differs
 * from the block's shared value, so a lit furnace or a waterlogged log is compared in the state
 * where Java changes it.
 */
const subjectsVarying = (fields: readonly string[], include: (row: JavaBlockPropertyRow, javaId: string) => boolean) =>
    Object.entries(javaBlockRows()).flatMap(([javaId, row]) => {
        if (!include(row, javaId)) return [];
        const keys = [
            '',
            ...Object.entries(row.stateOverrides ?? {})
                .filter(([, override]) => fields.some((field) => field in override))
                .map(([key]) => key)
        ];
        return keys.flatMap((key) => stateSubject(javaId, row, key) ?? []);
    });

/** The Java value of a numeric property, across the block's shared values and its overrides. */
const anyState = (row: JavaBlockPropertyRow, field: string, test: (value: number) => boolean): boolean =>
    [row.base, ...Object.values(row.stateOverrides ?? {})].some((values) => {
        const value = values[field];
        return typeof value === 'number' && test(value);
    });

/** Blocks a player cannot target, whose mining and blasting the server never decides: air and the fluids. */
const untargetable = (javaId: string): boolean =>
    javaBlockIsA(javaId, 'AirBlock') || javaBlockIsA(javaId, 'LiquidBlock');

const numberOf = (values: Readonly<Record<string, unknown>>, field: string): number => {
    const value = values[field];
    return typeof value === 'number' ? value : 0;
};

const titleOf = (subject: BlockStateSubject): string =>
    subject.stateKey === '' ? subject.javaId : `${subject.javaId}[${subject.stateKey}]`;

/** A Java tool: its Bedrock identity and its Java `minecraft:tool` component. */
interface JavaTool {
    readonly javaId: string;
    readonly bedrock: string;
    readonly rules: readonly {
        readonly blocks: unknown;
        readonly speed?: number;
        readonly correct_for_drops?: boolean;
    }[];
    readonly defaultSpeed: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

let tools: readonly JavaTool[] | undefined;

/** Every Java item with a `minecraft:tool` component, read from the item table's Java components. */
const javaTools = (): readonly JavaTool[] => {
    tools ??= Object.entries(itemTypesTable.items).flatMap(([bedrock, row]) => {
        const tool = row.components['minecraft:tool'];
        if (!isRecord(tool) || !Array.isArray(tool.rules)) return [];
        const rules = tool.rules.filter(isRecord).map((rule) => ({
            blocks: rule.blocks,
            ...(typeof rule.speed === 'number' ? { speed: rule.speed } : {}),
            ...(typeof rule.correct_for_drops === 'boolean' ? { correct_for_drops: rule.correct_for_drops } : {})
        }));
        const defaultSpeed = typeof tool.default_mining_speed === 'number' ? tool.default_mining_speed : 1;
        return [{ javaId: row.java, bedrock, rules, defaultSpeed }];
    });
    return tools;
};

/** Whether a Java holder set (`#tag`, an id, or a list of ids) names a Java block. */
const javaHolderSetHas = (set: unknown, javaId: string): boolean => {
    if (Array.isArray(set)) return set.some((entry) => javaHolderSetHas(entry, javaId));
    if (typeof set !== 'string') return false;
    return set.startsWith('#') ? serverContent().tags.includes('block', set.slice(1), javaId) : set === javaId;
};

/** Java's `Tool.getMiningSpeed`: the first rule naming the block with a speed, or the default. */
const javaToolSpeed = (tool: JavaTool | undefined, javaId: string): number => {
    if (tool === undefined) return 1;
    const rule = tool.rules.find(
        (candidate) => candidate.speed !== undefined && javaHolderSetHas(candidate.blocks, javaId)
    );
    return rule?.speed ?? tool.defaultSpeed;
};

/** Java's `Player.hasCorrectToolForDrops`, through the tool's first rule naming the block with a verdict. */
const javaCorrectTool = (tool: JavaTool | undefined, javaId: string, requiresTool: boolean): boolean => {
    if (!requiresTool) return true;
    const rule = tool?.rules.find(
        (candidate) => candidate.correct_for_drops !== undefined && javaHolderSetHas(candidate.blocks, javaId)
    );
    return rule?.correct_for_drops ?? false;
};

/**
 * How many ticks Java takes to break a block, or `Infinity` when it never does.
 *
 * `BlockBehaviour.getDestroyProgress` ({@link destroyProgress}) is the share of the block a tick
 * breaks, and a block whose progress reaches 1 breaks on the first tick it is hit. Otherwise
 * `MultiPlayerGameMode.continueDestroyBlock` adds the progress to a float once a tick until it
 * reaches 1.
 */
const javaBreakTicks = (hardness: number, speed: number, correct: boolean): number => {
    const progress = destroyProgress(speed, hardness, correct);
    if (progress >= 1) return 0;
    if (progress <= 0) return Number.POSITIVE_INFINITY;
    let total = 0;
    let ticks = 0;
    while (total < 1) {
        total = Math.fround(total + progress);
        ticks += 1;
    }
    return ticks;
};

/**
 * Whether the server's tick count is Java's.
 *
 * Java's float sum lands a tick either side of the exact quotient, depending on how the progress
 * rounds, and a Bedrock client times its own break: the server's count only paces the cracking
 * other players see and bounds its break check. So a count one tick off agrees, and whether the
 * block breaks at once or never must match exactly, since a player notices those.
 */
const sameBreakTicks = (server: number, java: number): boolean => {
    if (java === 0 || server === 0 || !Number.isFinite(java) || !Number.isFinite(server)) return server === java;
    return Math.abs(server - java) <= 1;
};

/**
 * The server's break time in ticks, as `PlayerActionHandler` and `World` turn
 * `Block.getBreakTime` into the cracking rate and the break check.
 */
const serverBreakTicks = (subject: BlockStateSubject, tool: JavaTool | undefined): number => {
    const content = serverContent();
    const block = blockFromContent(subject.bedrock, content, subject.states);
    if (block === null) throw new Error(`the server has no block ${subject.bedrock}`);
    const item = tool === undefined ? null : new Item({ name: tool.bedrock, content });
    return Math.ceil(block.getBreakTime(item) * 20);
};

/** A blast's Java resistance check reads floats, so both sides are compared as Java holds them. */
const sameFloat = (left: number, right: number): boolean => Math.fround(left) === Math.fround(right);

let immovableByName: ReadonlySet<string> | undefined;

/**
 * The blocks `PistonBaseBlock.isPushable` refuses by name before it reads a push reaction
 * (obsidian and the others), read from the `Blocks` fields the method's code loads.
 */
const javaPistonRefusesByName = (): ReadonlySet<string> => {
    if (immovableByName !== undefined) return immovableByName;
    const method = pinnedJavaClassFile('net/minecraft/world/level/block/piston/PistonBaseBlock')?.methods.find(
        (candidate) => candidate.name === 'isPushable'
    );
    immovableByName = new Set(
        (method?.instructions ?? []).flatMap((instruction) => {
            const member = instruction.member;
            if (member?.startsWith('net/minecraft/world/level/block/Blocks.') !== true) return [];
            const field = member.slice(member.lastIndexOf('.') + 1).toLowerCase();
            return field === 'piston' || field === 'sticky_piston' ? [] : [`minecraft:${field}`];
        })
    );
    return immovableByName;
};

/** What a piston extending into a block does to it. */
type PistonOutcome = 'moved' | 'destroyed' | 'blocked';

/**
 * Java's `PistonBaseBlock.isPushable` for a block in front of a piston pushing away from it,
 * where the push direction and the piston's facing are the same, so `PUSH_ONLY` moves.
 */
const javaPistonOutcome = (subject: BlockStateSubject): PistonOutcome => {
    if (javaPistonRefusesByName().has(subject.javaId)) return 'blocked';
    if (subject.javaId === 'minecraft:piston' || subject.javaId === 'minecraft:sticky_piston') {
        return javaBlockHasBlockEntity(subject.javaId) ? 'blocked' : 'moved';
    }
    if (numberOf(subject.java, 'hardness') === -1) return 'blocked';
    // The dump spells Java's `PushReaction` the way the server's block properties do:
    // `immoveable` is `BLOCK`, `popped` is `DESTROY` and `push` is `PUSH_ONLY`.
    switch (subject.java.pushReaction) {
        case 'immoveable':
            return 'blocked';
        case 'popped':
            return 'destroyed';
        default:
            return javaBlockHasBlockEntity(subject.javaId) ? 'blocked' : 'moved';
    }
};

const PISTON = { x: 0, y: 5, z: 0 } as const;
const FRONT = { x: 1, y: 5, z: 0 } as const;

/** What the server's piston rule does to the block, with its shipped properties. */
const serverPistonOutcome = (subject: BlockStateSubject): PistonOutcome => {
    const world = createVoxelWorld().overworld;
    const properties = serverContent()
        .blocks.types.get(subject.bedrock)
        ?.state(subject.states)
        .content.params(blockProperties);
    if (properties !== undefined) world.defineProperties(subject.bedrock, properties);
    world.set(FRONT, subject.bedrock, subject.states);
    const plan = planPush(world, PISTON, 'east');
    if (plan.blocked) return 'blocked';
    const at = (position: { readonly x: number; readonly y: number; readonly z: number }) =>
        position.x === FRONT.x && position.y === FRONT.y && position.z === FRONT.z;
    if (plan.destroyedBlocks.some(at)) return 'destroyed';
    return plan.moved.some(at) ? 'moved' : 'destroyed';
};

/** The scenarios over a block's Java properties. */
export const blockPropertyScenarios: readonly BehaviorScenario<BlockStateSubject>[] = [
    {
        name: 'holds-water',
        java: 'A block whose Java class is a SimpleWaterloggedBlock or a LiquidBlockContainer holds water, so flowing water stops at it rather than washing it away.',
        reference: 'Java SimpleWaterloggedBlock, LiquidBlockContainer and FlowingFluid.canHoldFluid',
        aspects: () => ['waterlogging'],
        subjects: () =>
            subjectsVarying([], (_, javaId) =>
                javaBlockBehaviors(javaId).some(({ kind }) => kind.aspect === 'waterlogging')
            ),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) =>
            // The server's Java fluid rule, which decides whether water holds in a block or washes it away.
            isJavaLiquidContainer({ identifier: subject.bedrock, states: subject.states })
                ? undefined
                : "the server's fluid rule does not let it hold water"
    },
    {
        name: 'mining-time',
        java: "A block takes as many ticks to break as Java's destroy progress needs to reach 1, with a bare hand and with each Java tool.",
        reference: "Java's getDestroyProgress, Player.getDestroySpeed and Tool.getMiningSpeed",
        aspects: () => ['mining'],
        subjects: () => subjectsVarying(['hardness', 'requiresCorrectTool'], (_, javaId) => !untargetable(javaId)),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            const hardness = numberOf(subject.java, 'hardness');
            const requiresTool = subject.java.requiresCorrectTool === true;
            const differences: string[] = [];
            for (const tool of [undefined, ...javaTools()]) {
                const java = javaBreakTicks(
                    hardness,
                    javaToolSpeed(tool, subject.javaId),
                    javaCorrectTool(tool, subject.javaId, requiresTool)
                );
                const server = serverBreakTicks(subject, tool);
                if (!sameBreakTicks(server, java))
                    differences.push(`${tool?.javaId ?? 'a bare hand'} takes ${server} ticks, Java ${java}`);
            }
            return differences.length === 0
                ? undefined
                : `${differences.slice(0, 3).join('; ')}${differences.length > 3 ? ` and ${differences.length - 3} more tools differ` : ''}`;
        }
    },
    {
        name: 'blast-resistance',
        java: "A blast ray loses (resistance + 0.3) * 0.3 crossing a block, with the block's Java explosion resistance.",
        reference:
            'Java ExplosionDamageCalculator.getBlockExplosionResistance and ServerExplosion.calculateExplodedPositions',
        aspects: () => ['explosion'],
        subjects: () => subjectsVarying(['blastResistance'], (_, javaId) => !untargetable(javaId)),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            // The ray march is a transcription of Java's (engine-systems tests it on its own), so
            // whether a blast takes this block turns on the resistance the ray reads for its state.
            const java = numberOf(subject.java, 'blastResistance');
            const server = explosionResistanceOf({ name: subject.bedrock, states: subject.states }) ?? 0;
            return sameFloat(server, java) ? undefined : `a blast ray reads resistance ${server}, Java ${java}`;
        }
    },
    {
        name: 'light-emission',
        java: 'A light-emitting block lights its own position at its Java light level, in each state.',
        reference: "Java's block light level property and LightEngine",
        aspects: () => ['light'],
        subjects: () =>
            subjectsVarying(['lightEmission'], (row) => anyState(row, 'lightEmission', (value) => value > 0)),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const runtimeId = content.blocks.types.get(subject.bedrock)?.state(subject.states).runtimeId;
            if (runtimeId === undefined) return `the server has no state for ${subject.bedrock}`;
            // The light engine's block view reads this column of the flattened table.
            const server = content.blocks.table.lightEmission[runtimeId];
            const java = numberOf(subject.java, 'lightEmission');
            return server === java ? undefined : `the light engine emits ${String(server)}, Java ${java}`;
        }
    },
    {
        name: 'fire-odds',
        java: "Fire catches on a block and burns it away with the block's Java ignite and burn odds, which are 0 while it holds water.",
        reference: 'Java FireBlock.getIgniteOdds and getBurnOdds',
        aspects: () => ['flammability'],
        subjects: () =>
            subjectsVarying(
                ['igniteOdds', 'burnOdds'],
                (row) =>
                    anyState(row, 'igniteOdds', (value) => value > 0) || anyState(row, 'burnOdds', (value) => value > 0)
            ),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            // The fire rule reads the server's odds through this view.
            const server = flammabilityOf(serverContent(), {
                identifier: subject.bedrock,
                states: subject.states,
                position: { x: 0, y: 0, z: 0 },
                dimension: 'minecraft:overworld'
            }) ?? { igniteOdds: 0, burnOdds: 0 };
            const ignite = numberOf(subject.java, 'igniteOdds');
            const burn = numberOf(subject.java, 'burnOdds');
            return server.igniteOdds === ignite && server.burnOdds === burn
                ? undefined
                : `fire reads ignite ${server.igniteOdds} and burn ${server.burnOdds}, Java ${ignite} and ${burn}`;
        }
    },
    {
        name: 'piston-reaction',
        java: 'A piston pushing into a block moves it, destroys it or is blocked by it as Java decides from its push reaction, hardness and block entity.',
        reference: 'Java PistonBaseBlock.isPushable and PistonStructureResolver',
        aspects: () => ['piston'],
        // Bedrock's piston moves a block with its block entity, and the server keeps that on
        // purpose; any other difference from Java's piston is a defect.
        classify: (subject, difference) =>
            javaBlockHasBlockEntity(subject.javaId) && difference.endsWith('moved, Java blocked')
                ? {
                      kind: 'intentional',
                      reason: "A piston moves a block together with its block entity, as Bedrock's does; Java's piston refuses any block with a block entity."
                  }
                : undefined,
        subjects: () => subjectsVarying([], (_, javaId) => !javaBlockIsA(javaId, 'AirBlock')),
        idOf: titleOf,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            const java = javaPistonOutcome(subject);
            const server = serverPistonOutcome(subject);
            return java === server ? undefined : `a piston leaves it ${server}, Java ${java}`;
        }
    }
];
