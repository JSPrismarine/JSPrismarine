/**
 * What a player in creative gets from breaking a container that holds something, against Java
 * 26.3, through the server's own break over the real content stack.
 *
 * Java takes none of the block's own yield in creative, but removing any block entity that is a
 * `Container` spills it (`BlockEntity.preRemoveSideEffects`), whatever mode the player is in. A
 * shulker box overrides that to keep its items, and instead leaves as itself holding them when a
 * creative player breaks it with anything inside (`ShulkerBoxBlock.playerWillDestroy`). Both
 * answers are read out of the jar for each block, so a block whose Java class changes either
 * rule changes its row.
 */
import type { BlockEntityData, ContentItemDrop, ContentPosition } from '@jsprismarine/prismarine/content/world/adapter';
import type { EntityHostFacts, EntityWorldFacts } from '@jsprismarine/prismarine/entity/data/host';
import { TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';
import { itemOfDrop } from '@jsprismarine/prismarine/inventory/persistence';
import { Item } from '@jsprismarine/prismarine/item/Item';
import { breakBlockWithContent, collectBreakDrops } from '@jsprismarine/prismarine/world/blockBreak';
import type { BreakWorld, Breaker } from '@jsprismarine/prismarine/world/blockBreak';
import { behaviorFor } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { Gametype } from '@jsprismarine/minecraft';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaBlockClassOf } from '../javaBlockClasses.ts';
import { pinnedJavaClassFile } from '../javaClassFile.ts';
import { javaIsA, javaResolveMethod } from '../javaEntityClasses.ts';
import type { RealStack } from '../serverStack.ts';
import { buildRealStack } from '../serverStack.ts';
import { javaBlockRows } from './properties.ts';

const BLOCK_ENTITY = 'net/minecraft/world/level/block/entity/BlockEntity';
const CONTAINER = 'net/minecraft/world/Container';

/** One Java container block, the Bedrock block the server holds it as, and what Java does with it. */
export interface ContainerSubject {
    readonly javaId: string;
    readonly bedrock: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
    /** Whether removing it spills what it holds, as its block entity's `preRemoveSideEffects` does. */
    readonly spills: boolean;
    /** Whether a creative break of it holding anything drops the block itself with its contents. */
    readonly leavesAsItself: boolean;
}

/** The block entity class a Java block's `newBlockEntity` constructs, or undefined for none. */
const blockEntityClassOf = (blockClass: string): string | undefined => {
    const created = javaResolveMethod(blockClass, 'newBlockEntity')?.method.instructions ?? [];
    for (const instruction of created) {
        const member = instruction.member;
        if (member === undefined || !member.endsWith('.<init>')) continue;
        const owner = member.slice(0, member.lastIndexOf('.'));
        if (pinnedJavaClassFile(owner) !== undefined && javaIsA(owner, BLOCK_ENTITY)) return owner;
    }
    return undefined;
};

/**
 * Whether removing a block entity of this class spills its contents: whether the
 * `preRemoveSideEffects` it runs reaches `Containers.dropContents`, itself or through the
 * superclass call a furnace's makes before it pays out its experience.
 */
const spillsOnRemoval = (className: string): boolean => {
    const resolved = javaResolveMethod(className, 'preRemoveSideEffects');
    if (resolved === undefined) return false;
    const { calls } = resolved.method;
    if (calls.includes('Containers.dropContents')) return true;
    const parent = pinnedJavaClassFile(resolved.owner)?.superName;
    return (
        parent !== undefined && calls.some((call) => call.endsWith('.preRemoveSideEffects')) && spillsOnRemoval(parent)
    );
};

/**
 * Every Java block whose block entity is a `Container`, with the two rules read from its classes.
 *
 * @javaSee BlockEntity.preRemoveSideEffects
 * @javaSee ShulkerBoxBlock.playerWillDestroy
 */
const containerSubjects = (): readonly ContainerSubject[] =>
    Object.keys(javaBlockRows()).flatMap((javaId): ContainerSubject[] => {
        const blockClass = javaBlockClassOf(javaId);
        if (blockClass === undefined) return [];
        const entityClass = blockEntityClassOf(blockClass);
        if (entityClass === undefined || !javaIsA(entityClass, CONTAINER)) return [];
        const mapping = javaBlockStateToBedrock(javaId);
        if (mapping.kind !== 'mapped') return [];

        const destroy = javaResolveMethod(blockClass, 'playerWillDestroy')?.method.calls ?? [];
        return [
            {
                javaId,
                bedrock: mapping.bedrock.name,
                states: mapping.bedrock.states,
                spills: spillsOnRemoval(entityClass),
                leavesAsItself:
                    destroy.includes('Player.preventsBlockDrops') && destroy.includes('BlockEntity.collectComponents')
            }
        ];
    });

/**
 * A test world that keeps block entity records, and whose drops a running break may claim first,
 * as `World.dropFromBlock` lets it.
 */
class BreakingWorld extends TestEntityWorld {
    /** Offers a drop to the break in progress; true when it took the drop. */
    public claim: ((position: ContentPosition, item: ContentItemDrop) => boolean) | undefined;

    /** The block entity records, by position. */
    private readonly records = new Map<string, BlockEntityData>();

    /** Forgets every block entity record, as a scenario does once it is done. */
    public clearRecords(): void {
        this.records.clear();
    }

    public override get world(): EntityWorldFacts {
        const world = super.world;
        const key = (at: ContentPosition): string => `${at.x},${at.y},${at.z}`;
        return {
            ...world,
            blocks: {
                ...world.blocks,
                data: (at) => this.records.get(key(at)),
                setData: (at, data) => void this.records.set(key(at), data)
            }
        };
    }

    public override get host(): EntityHostFacts {
        const host = super.host;
        return {
            ...host,
            drop: (position, item) => {
                if (this.claim?.(position, item) !== true) host.drop(position, item);
            }
        };
    }
}

let containerStack: { readonly real: RealStack; readonly world: BreakingWorld } | undefined;

/** A stack of its own, so the containers placed here sit in nobody else's world. */
const stack = (): { readonly real: RealStack; readonly world: BreakingWorld } => {
    if (containerStack !== undefined) return containerStack;
    const world = new BreakingWorld();
    containerStack = { real: buildRealStack(world), world };
    return containerStack;
};

/** Where each container goes: above the test world's floor, apart from every other scenario's blocks. */
const AT: ContentPosition = { x: 70_000, y: 64, z: 70_000 };

/** What the container is filled with before it breaks. */
const HELD = { identifier: 'minecraft:stick', count: 3 } as const;

/** A creative player standing beside the block, holding nothing. */
const CREATIVE: Breaker = {
    gamemode: Gametype.CREATIVE,
    getInventory: () => ({ equipment: () => null }),
    getPosition: () => ({ getX: () => AT.x + 1, getY: () => AT.y, getZ: () => AT.z })
};

/** The server families whose break drops only the block, so a container in one spills in no mode. */
const NON_SPILLING_FAMILIES: ReadonlySet<string> = new Set([
    'jsprismarine:redstone',
    'jsprismarine:copper',
    'jsprismarine:bamboo'
]);

/** One stack as a row describes it: `minecraft:stick x3`, with what a container item holds. */
const describe = (drop: { getName(): string }): string => {
    if (!(drop instanceof Item)) return `${drop.getName()} x1`;
    const held = drop.getContents().filter((slot) => slot !== null);
    const inside = held.length === 0 ? '' : ` holding ${held.map(describe).join(', ')}`;
    return `${drop.getName()} x${drop.getAmount()}${inside}`;
};

/** Breaks the subject in creative holding a stick stack, and answers what fell. */
const creativeBreak = (subject: ContainerSubject): string[] | undefined => {
    const { real, world } = stack();
    const content = real.content;
    const blocks = content.world.blockWorld.at('minecraft:overworld');
    const breakWorld: BreakWorld = {
        loadedBlockAt: (x, y, z) => {
            const block = world.world.blocks.get({ x, y, z });
            return block === undefined ? undefined : { name: block.identifier, states: block.states };
        },
        getDimension: () => ({ name: 'minecraft:overworld' }),
        getLevel: () => ({ name: 'world' }),
        getTicks: () => 0,
        getServer: () => ({
            getContent: () => content,
            getLogger: () => ({
                error: (error: unknown) => {
                    throw error;
                }
            })
        })
    };

    content.world.engineWorld.setBlock(AT, { name: subject.bedrock, states: subject.states }, false);
    blocks.setBlockData(AT, { ...blocks.getBlockData(AT), items: [HELD] });
    world.claim = (position, item) => {
        const stack = itemOfDrop(item, content);
        return stack !== null && collectBreakDrops(breakWorld, position, [stack]);
    };
    try {
        return breakBlockWithContent({ world: breakWorld, position: AT, player: CREATIVE })?.map(describe);
    } finally {
        world.claim = undefined;
        content.world.engineWorld.setBlock(AT, { name: 'minecraft:air', states: {} }, false);
        world.clearRecords();
    }
};

/** The scenarios that break a held container in creative, one row per Java container block. */
export const creativeBreakScenarios: readonly BehaviorScenario<ContainerSubject>[] = [
    {
        name: 'creative-break-spills-container',
        java: 'A creative player breaking a container that holds something gets none of the block, but what it held spills; a shulker box spills nothing and drops as itself, still holding it.',
        reference: 'Java BlockEntity.preRemoveSideEffects and ShulkerBoxBlock.playerWillDestroy',
        aspects: () => ['breaking'],
        subjects: containerSubjects,
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        classify: (subject) =>
            NON_SPILLING_FAMILIES.has(behaviorFor(subject.bedrock))
                ? {
                      kind: 'deferred',
                      reason: `${subject.bedrock}'s block family drops only the block on break, so what it held is lost in every game mode.`,
                      reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3825'
                  }
                : undefined,
        run: (subject) => {
            const fell = creativeBreak(subject);
            if (fell === undefined) return 'the content path declined the break, so nothing was asked of the block';
            const java = [
                ...(subject.spills ? [`${HELD.identifier} x${HELD.count}`] : []),
                ...(subject.leavesAsItself ? [`${subject.bedrock} x1 holding ${HELD.identifier} x${HELD.count}`] : [])
            ];
            const sorted = [...fell].sort();
            return JSON.stringify(sorted) === JSON.stringify([...java].sort())
                ? undefined
                : `it dropped [${sorted.join('; ')}], Java drops [${java.join('; ')}]`;
        }
    }
];
