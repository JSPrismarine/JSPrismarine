/**
 * The data-driven commands: `/data`, `/item`, `/loot`, `/function`,
 * `/schedule`, `/scoreboard` and `/random`.
 *
 * These are the ones a Java datapack leans on and the ones Bedrock has the
 * least of. `/data` needs an NBT path, `/item` needs a loot modifier and
 * `/loot` needs a loot table, and Bedrock has a parameter type for none of
 * the three, so every one of them reaches a Bedrock client as a string and
 * the flattener says so.
 */
import type { RequiredArgumentBuilder } from '@jsprismarine/brigadier';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    blockPositionArgument,
    entityArgument,
    enumArgument,
    filePathArgument,
    floatArgument,
    integerArgument,
    integerRangeArgument,
    itemModifierArgument,
    lootTableArgument,
    nbtCompoundArgument,
    nbtPathArgument,
    nbtTagArgument,
    operationArgument,
    resourceArgument,
    scoreHolderArgument,
    softEnumArgument,
    stringArgument,
    timeArgument
} from '../argumentTypes';
import type {
    CommandSource,
    DataModifyOperation,
    DataModifySource,
    DataTarget,
    ItemSlot,
    LootSource,
    SlotTarget
} from '../host';
import type { CommandRegistry, ContentRegistryIds } from '../tree';
import type { Context } from './support';
import {
    arg,
    command,
    lit,
    refuse,
    report,
    resolvePosition,
    scoreHolderOne,
    scoreHolders,
    select,
    selectOne,
    source,
    value
} from './support';

const CHEATS = {
    permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
    requiresCheats: true
} as const;

/** The five `/data modify` operations. */
export const DATA_MODIFY_OPERATIONS: readonly DataModifyOperation[] = ['append', 'insert', 'merge', 'prepend', 'set'];

/** The four `/loot` destinations crossed with the four sources Java defines. */
export const LOOT_DESTINATIONS = ['give', 'insert', 'spawn', 'replace'] as const;

/** The three kinds of thing `/data` reads and writes. */
type DataKind = DataTarget['kind'];

/** The argument a target of each kind is read from. */
const TARGET_ARGUMENTS = { block: 'pos', entity: 'target', storage: 'storage' } as const;

/**
 * The argument the second target on a line is read from: the source of
 * `/data modify … from` and of `/function … with`, which Java names `source`
 * whatever its kind.
 */
const SOURCE_ARGUMENT = 'source';

const targetOf = (context: Context, kind: DataKind, name: string = TARGET_ARGUMENTS[kind]): DataTarget => {
    const current = source(context);
    if (kind === 'block') {
        return { kind, dimension: current.dimension, position: resolvePosition(value(context, name), current) };
    }
    if (kind === 'entity') return { kind, entity: selectOne(current, value(context, name)) };
    return { kind, id: value(context, name) };
};

/** Java's `/data` feedback after a write: `Modified storage <id>`, `Modified block data of <x, y, z>`. */
const modifiedMessage = (target: DataTarget): string => {
    if (target.kind === 'storage') return `Modified storage ${target.id}`;
    if (target.kind === 'entity') return `Modified entity data of ${target.entity.name}`;
    const { x, y, z } = target.position;
    return `Modified block data of ${x}, ${y}, ${z}`;
};

/** Java's `/data get` feedback for a tag it prints whole. */
const queryMessage = (target: DataTarget, snbt: string): string => {
    if (target.kind === 'storage') return `Storage ${target.id} has the following contents: ${snbt}`;
    if (target.kind === 'entity') return `${target.entity.name} has the following entity data: ${snbt}`;
    const { x, y, z } = target.position;
    return `${x}, ${y}, ${z} has the following block data: ${snbt}`;
};

/** Java's `/data get … <scale>` feedback, with the scale to two places as Java's `%.2f` prints it. */
const scaledMessage = (target: DataTarget, path: string, scale: number, result: number): string => {
    const factor = scale.toFixed(2);
    if (target.kind === 'storage')
        return `${path} in storage ${target.id} after scale factor of ${factor} is ${result}`;
    if (target.kind === 'entity')
        return `${path} on ${target.entity.name} after scale factor of ${factor} is ${result}`;
    const { x, y, z } = target.position;
    return `${path} on block ${x}, ${y}, ${z} after scale factor of ${factor} is ${result}`;
};

/** Java's refusal when a `/data` write left the data as it was. */
const UNCHANGED = 'Nothing changed. The specified properties already have these values';

/** Java's refusal when a path matched nothing. */
const nothingFound = (path: string): string => `Found no elements matching ${path}`;

/** Adds `block <pos>`, `entity <target>` and `storage <id>` under one node. */
const withTargets = (node: ReturnType<typeof lit>, build: (kind: DataKind) => ReturnType<typeof arg>) =>
    node
        .then(lit('block').then(build('block')))
        .then(lit('entity').then(build('entity')))
        .then(lit('storage').then(build('storage')));

/** Registers the seven data-driven commands. */
export const registerDataCommands = (registry: CommandRegistry<CommandSource>): void => {
    const content = registry.getContent();

    registry.register(buildData(), { description: 'Reads and writes NBT.', ...CHEATS });
    registry.register(buildItem(content), { description: 'Changes items in a slot.', ...CHEATS });
    registry.register(buildLoot(), { description: 'Runs a loot table.', ...CHEATS });

    registry.register(
        lit('function').then(
            arg('name', filePathArgument())
                .executes(
                    command((context) => {
                        const current = source(context);
                        const outcome = current.host.data.runFunction(value(context, 'name'), current);
                        return report(current, outcome.result, `Ran the function`);
                    })
                )
                .then(
                    arg('arguments', nbtCompoundArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const outcome = current.host.data.runFunction(
                                value(context, 'name'),
                                current,
                                value(context, 'arguments')
                            );
                            return report(current, outcome.result, `Ran the function`);
                        })
                    )
                )
                .then(
                    withTargets(lit('with'), (kind) =>
                        targetArgument(kind, SOURCE_ARGUMENT)
                            .executes(command((context) => runFunctionWith(context, kind, undefined)))
                            .then(
                                arg('path', nbtPathArgument()).executes(
                                    command((context) => runFunctionWith(context, kind, value(context, 'path')))
                                )
                            )
                    )
                )
        ),
        { description: 'Runs an mcfunction or a function tag.', ...CHEATS }
    );

    registry.register(buildReturn(registry), {
        description: 'Ends the running function and sets what it returns.',
        ...CHEATS
    });

    registry.register(
        lit('schedule')
            .then(
                lit('function').then(
                    arg('name', filePathArgument()).then(
                        arg('delay', timeArgument({ min: 0 }))
                            .executes(command((context) => schedule(context, 'replace')))
                            .then(
                                arg('mode', enumArgument('ScheduleMode', ['append', 'replace'] as const)).executes(
                                    command((context) => schedule(context, value(context, 'mode')))
                                )
                            )
                    )
                )
            )
            .then(
                lit('clear').then(
                    arg('name', filePathArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const cleared = current.host.data.clearSchedule(value(context, 'name'));
                            return report(current, cleared, `Cleared ${cleared} scheduled functions`);
                        })
                    )
                )
            ),
        { description: 'Queues a function for later.', ...CHEATS }
    );

    registry.register(buildScoreboard(), { description: 'Tracks and displays scores.', ...CHEATS });

    registry.register(
        lit('random')
            .then(
                lit('value').then(
                    arg('range', integerRangeArgument())
                        .executes(command((context) => random(context, undefined)))
                        .then(
                            arg('sequence', stringArgument()).executes(
                                command((context) => random(context, value<string>(context, 'sequence')))
                            )
                        )
                )
            )
            .then(
                lit('roll').then(
                    arg('range', integerRangeArgument())
                        .executes(command((context) => random(context, undefined)))
                        .then(
                            arg('sequence', stringArgument()).executes(
                                command((context) => random(context, value<string>(context, 'sequence')))
                            )
                        )
                )
            )
            .then(
                lit('reset').then(
                    arg('sequence', stringArgument())
                        .executes(
                            command((context) => {
                                const current = source(context);
                                const reset = current.host.data.resetRandomSequence(value(context, 'sequence'));
                                return report(current, reset ? 1 : 0, 'Reset the sequence');
                            })
                        )
                        .then(
                            arg('seed', integerArgument()).executes(
                                command((context) => {
                                    const current = source(context);
                                    const reset = current.host.data.resetRandomSequence(
                                        value(context, 'sequence'),
                                        value(context, 'seed')
                                    );
                                    return report(current, reset ? 1 : 0, 'Reset the sequence');
                                })
                            )
                        )
                )
            ),
        {
            // The 1.20.2 changelog: `random value|roll <range>` without a
            // sequence id is available to a non-operator.
            description: 'Draws from a reproducible random sequence.',
            permissionLevel: CommandPermissionLevel.ANY
        }
    );
};

/**
 * `/return`, Java's three forms.
 *
 * `run` is a redirect to the dispatcher root, the same shape
 * `execute store` uses: the command after it runs as a command of its own,
 * and a sink on the derived source reads what it produced. The sink fires
 * once per executed context, so a forked body would call it several times
 * and only the first is taken, which is Java's rule that a function returns
 * one value.
 */
const buildReturn = (registry: CommandRegistry<CommandSource>) =>
    lit('return')
        .then(
            arg('value', integerArgument()).executes(
                command((context) => source(context).host.data.returnFromFunction(value(context, 'value')))
            )
        )
        .then(lit('fail').executes(command((context) => source(context).host.data.returnFromFunction(undefined))))
        .then(
            lit('run').redirect(registry.getRoot(), {
                apply: (context) => {
                    const current = source(context);
                    let taken = false;
                    return current.withStore((outcome) => {
                        if (taken) return;
                        taken = true;
                        // A command that failed produced no value, and Java
                        // ends the function without one rather than with 0.
                        current.host.data.returnFromFunction(outcome.success ? outcome.value : undefined);
                    });
                }
            })
        );

const buildData = () => {
    const node = lit('data');

    node.then(
        withTargets(lit('get'), (kind) =>
            targetArgument(kind)
                .executes(
                    command((context) => {
                        const current = source(context);
                        const target = targetOf(context, kind);
                        const found = current.host.data.getData(target);
                        if (found === undefined) return report(current, 0, 'There is no data there');
                        current.sendFeedback(queryMessage(target, found.snbt));
                        return found.result;
                    })
                )
                .then(
                    arg('path', nbtPathArgument())
                        .executes(command((context) => getData(context, kind, undefined)))
                        .then(
                            arg('scale', floatArgument()).executes(
                                command((context) => getData(context, kind, value(context, 'scale')))
                            )
                        )
                )
        )
    );

    node.then(
        withTargets(lit('merge'), (kind) =>
            targetArgument(kind).then(
                arg('nbt', nbtCompoundArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const target = targetOf(context, kind);
                        const merged = current.host.data.mergeData(target, value(context, 'nbt'));
                        // Java throws when nothing changed, so the line fails for `execute store success`.
                        if (!merged) refuse(UNCHANGED);
                        return report(current, 1, modifiedMessage(target));
                    })
                )
            )
        )
    );

    node.then(
        withTargets(lit('remove'), (kind) =>
            targetArgument(kind).then(
                arg('path', nbtPathArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const target = targetOf(context, kind);
                        const removed = current.host.data.removeData(target, value(context, 'path'));
                        if (removed === 0) refuse(UNCHANGED);
                        return report(current, removed, modifiedMessage(target));
                    })
                )
            )
        )
    );

    const modify = lit('modify');
    withTargets(modify, (kind) => {
        const target = targetArgument(kind);
        const path = arg('path', nbtPathArgument());
        for (const operation of DATA_MODIFY_OPERATIONS) {
            const valueNode = lit('value').then(
                arg('nbt', nbtTagArgument()).executes(
                    command((context) =>
                        modifyData(context, kind, operation, { kind: 'value', snbt: value(context, 'nbt') })
                    )
                )
            );
            const fromNode = withTargets(lit('from'), (sourceKind) =>
                targetArgument(sourceKind, SOURCE_ARGUMENT)
                    .executes(
                        command((context) =>
                            modifyData(context, kind, operation, {
                                kind: 'from',
                                target: targetOf(context, sourceKind, SOURCE_ARGUMENT)
                            })
                        )
                    )
                    .then(
                        arg('sourcePath', nbtPathArgument()).executes(
                            command((context) =>
                                modifyData(context, kind, operation, {
                                    kind: 'from',
                                    target: targetOf(context, sourceKind, SOURCE_ARGUMENT),
                                    path: value(context, 'sourcePath')
                                })
                            )
                        )
                    )
            );
            const operationNode = lit(operation);
            if (operation === 'insert') {
                operationNode.then(arg('index', integerArgument()).then(valueNode).then(fromNode));
            } else {
                operationNode.then(valueNode).then(fromNode);
            }
            path.then(operationNode);
        }
        return target.then(path);
    });
    node.then(modify);

    return node;
};

const targetArgument = (kind: DataKind, name: string = TARGET_ARGUMENTS[kind]) => {
    if (kind === 'block') return arg<unknown>(name, blockPositionArgument());
    if (kind === 'entity') return arg<unknown>(name, entityArgument());
    return arg<unknown>(name, stringArgument());
};

/** `/data get <target> <path> [<scale>]`: Java prints the tag without a scale and the scaled number with one. */
const getData = (context: Context, kind: DataKind, scale: number | undefined): number => {
    const current = source(context);
    const target = targetOf(context, kind);
    const path = value<string>(context, 'path');
    const found = current.host.data.getData(target, path, scale);
    // Java throws, so a path that matched nothing fails the line rather than succeeding with 0.
    if (found === undefined) refuse(nothingFound(path));
    current.sendFeedback(
        scale === undefined ? queryMessage(target, found.snbt) : scaledMessage(target, path, scale, found.result)
    );
    return found.result;
};

const modifyData = (
    context: Context,
    kind: DataKind,
    operation: DataModifyOperation,
    from: DataModifySource
): number => {
    const current = source(context);
    const target = targetOf(context, kind);
    const index = operation === 'insert' ? value<number>(context, 'index') : undefined;
    const changed = current.host.data.modifyData(target, value(context, 'path'), operation, from, index);
    if (changed === 0) refuse(UNCHANGED);
    return report(current, changed, modifiedMessage(target));
};

/**
 * `/function <name> with <source> [<path>]`: runs a macro function with a
 * compound read from a block, an entity or a storage as its arguments.
 */
const runFunctionWith = (context: Context, kind: DataKind, path: string | undefined): number => {
    const current = source(context);
    const found = current.host.data.getData(targetOf(context, kind, SOURCE_ARGUMENT), path);
    // Java throws for both, so the line fails rather than succeeding with 0.
    if (found === undefined) refuse(nothingFound(path ?? ''));
    // A compound's SNBT, and nothing else's, starts with `{`: a string is printed quoted.
    if (!found.snbt.startsWith('{')) refuse(`Invalid argument type: ${found.snbt}, expected a compound`);
    const outcome = current.host.data.runFunction(value(context, 'name'), current, found.snbt, true);
    return report(current, outcome.result, `Ran the function`);
};

/** The two kinds of thing with item slots, which `/item` and `/loot replace` address. */
type SlotKind = SlotTarget['kind'];

/**
 * Every target the `target` (or `source`) argument of an `/item` or `/loot replace` line names.
 * @throws {CommandSyntaxException} When an entity selector matched nothing, as Java's
 *   `EntityArgument.getEntities` refuses, so an `/item … from` with no source writes nothing.
 */
const slotTargetsOf = (context: Context, kind: SlotKind, name: string): readonly SlotTarget[] => {
    const current = source(context);
    if (kind === 'block') {
        return [{ kind, dimension: current.dimension, position: resolvePosition(value(context, name), current) }];
    }
    const entities = select(current, value(context, name));
    if (entities.length === 0) refuse('No entity was found');
    return entities.map((entity) => ({ kind, entity }));
};

/** What Java's `/item` feedback names the targets as: one entity by name, a block by position, or a count. */
const slotTargetsLabel = (targets: readonly SlotTarget[]): string => {
    const [first] = targets;
    if (targets.length !== 1 || first === undefined) return `${targets.length} entities`;
    if (first.kind === 'entity') return first.entity.name;
    const { x, y, z } = first.position;
    return `${x}, ${y}, ${z}`;
};

/** The three `/item` actions that write stacks, and how each spreads them over the slots. */
const ITEM_WRITE_ACTIONS = ['replace', 'fill', 'override'] as const;

const buildItem = (content: ContentRegistryIds) => {
    const node = lit('item');

    /** `<slots> <modifier>`, the `/item modify` tail. */
    const modifyTail = (kind: SlotKind) =>
        arg('slots', stringArgument()).then(
            arg('modifier', itemModifierArgument()).executes(
                command((context) => {
                    const current = source(context);
                    const targets = slotTargetsOf(context, kind, 'target');
                    const changed = current.host.data.applyItemModifier(
                        targets,
                        { name: value<string>(context, 'slots') },
                        value(context, 'modifier')
                    );
                    return report(current, changed, `Modified ${changed} slot(s) on ${slotTargetsLabel(targets)}`);
                })
            )
        );

    /** `<slots> with <item> [<count>]` and `<slots> from <block|entity> <source> <sourceSlots> [<modifier>]`. */
    const writeTail = (kind: SlotKind, action: (typeof ITEM_WRITE_ACTIONS)[number]) => {
        const slots = arg('slots', stringArgument());
        slots.then(
            lit('with').then(
                arg('item', resourceArgument('minecraft:item', content.items))
                    .executes(command((context) => setSlots(context, kind, action, 1)))
                    .then(
                        arg('count', integerArgument({ min: 1, max: 99 })).executes(
                            command((context) => setSlots(context, kind, action, value(context, 'count')))
                        )
                    )
            )
        );

        // The source is either kind whatever the target is: Java copies a chest slot onto a
        // player as readily as a player's slot into a chest.
        const from = lit('from');
        for (const sourceKind of ['block', 'entity'] as const) {
            from.then(
                lit(sourceKind).then(
                    targetArgument(sourceKind, SOURCE_ARGUMENT).then(
                        arg('sourceSlots', stringArgument())
                            .executes(command((context) => copySlots(context, kind, sourceKind, action, undefined)))
                            .then(
                                arg('modifier', itemModifierArgument()).executes(
                                    command((context) =>
                                        copySlots(context, kind, sourceKind, action, value<string>(context, 'modifier'))
                                    )
                                )
                            )
                    )
                )
            );
        }
        slots.then(from);
        return slots;
    };

    for (const action of [...ITEM_WRITE_ACTIONS, 'modify'] as const) {
        const actionNode = lit(action);
        for (const kind of ['block', 'entity'] as const) {
            const tail = action === 'modify' ? modifyTail(kind) : writeTail(kind, action);
            actionNode.then(lit(kind).then(targetArgument(kind, 'target').then(tail)));
        }
        node.then(actionNode);
    }

    return node;
};

/** `/item replace|fill|override … with <item> [<count>]`. */
const setSlots = (
    context: Context,
    kind: SlotKind,
    action: (typeof ITEM_WRITE_ACTIONS)[number],
    count: number
): number => {
    const current = source(context);
    const targets = slotTargetsOf(context, kind, 'target');
    const item = value<string>(context, 'item');
    const written = current.host.data.setSlot(targets, { name: value<string>(context, 'slots') }, item, count, action);
    return report(current, written, `Replaced ${written} slot(s) on ${slotTargetsLabel(targets)} with ${item}`);
};

/** `/item replace|fill|override … from <block|entity> <source> <sourceSlots> [<modifier>]`. */
const copySlots = (
    context: Context,
    kind: SlotKind,
    sourceKind: SlotKind,
    action: (typeof ITEM_WRITE_ACTIONS)[number],
    modifier: string | undefined
): number => {
    const current = source(context);
    const targets = slotTargetsOf(context, kind, 'target');
    const written = current.host.data.copySlots(
        slotTargetsOf(context, sourceKind, SOURCE_ARGUMENT),
        { name: value<string>(context, 'sourceSlots') },
        targets,
        { name: value<string>(context, 'slots') },
        action,
        modifier
    );
    return report(current, written, `Replaced ${written} slot(s) on ${slotTargetsLabel(targets)}`);
};

const buildLoot = () => {
    const node = lit('loot');

    /** The tool a `fish` or `mine` source was given, or none when it names the bare hand. */
    const toolOf = (context: Context): string | undefined =>
        context.getNodes().some((entry) => entry.getNode().getName() === 'tool')
            ? value<string>(context, 'tool')
            : undefined;

    /** Reads whichever of the four sources the line ended in. */
    const lootSourceOf = (context: Context, kind: LootSource['kind']): LootSource => {
        const current = source(context);
        if (kind === 'table') return { kind, table: value(context, 'table') };
        if (kind === 'kill') return { kind, entity: selectOne(current, value(context, 'target')) };

        const tool = toolOf(context);
        const position = resolvePosition(value(context, 'pos'), current);
        const where = { dimension: current.dimension, position, ...(tool === undefined ? {} : { tool }) };
        return kind === 'mine' ? { kind, ...where } : { kind, table: value(context, 'table'), ...where };
    };

    /** Hangs the four loot sources under one destination node. */
    const withSources = <T extends RequiredArgumentBuilder<CommandSource, unknown>>(
        destination: T,
        run: (context: Context, loot: LootSource) => number
    ): T => {
        /** `fish` and `mine` both end in an optional tool, so both build the same tail. */
        const withTool = (kind: 'fish' | 'mine') =>
            arg('pos', blockPositionArgument())
                .executes(command((context) => run(context, lootSourceOf(context, kind))))
                .then(
                    arg('tool', stringArgument()).executes(
                        command((context) => run(context, lootSourceOf(context, kind)))
                    )
                );

        destination.then(
            lit('loot').then(
                arg('table', lootTableArgument()).executes(
                    command((context) => run(context, lootSourceOf(context, 'table')))
                )
            )
        );
        destination.then(lit('fish').then(arg('table', lootTableArgument()).then(withTool('fish'))));
        destination.then(
            lit('kill').then(
                arg('target', entityArgument()).executes(
                    command((context) => run(context, lootSourceOf(context, 'kill')))
                )
            )
        );
        destination.then(lit('mine').then(withTool('mine')));
        return destination;
    };

    node.then(
        lit('give').then(
            withSources(arg<unknown>('players', entityArgument()), (context, loot) => {
                const current = source(context);
                const dropped = current.host.data.runLoot(loot, current, {
                    kind: 'give',
                    players: select(current, value(context, 'players'))
                });
                return report(current, dropped, `Gave ${dropped} items`);
            })
        )
    );

    for (const where of ['insert', 'spawn'] as const) {
        node.then(
            lit(where).then(
                withSources(arg<unknown>('targetPos', blockPositionArgument()), (context, loot) => {
                    const current = source(context);
                    const dropped = current.host.data.runLoot(loot, current, {
                        kind: where,
                        dimension: current.dimension,
                        position: resolvePosition(value(context, 'targetPos'), current)
                    });
                    return report(current, dropped, `Produced ${dropped} items`);
                })
            )
        );
    }

    /**
     * One half of `/loot replace`: the entity form or the block form.
     *
     * The count travels on the slot rather than scaling the roll, because
     * Java writes into the slots the count covers starting at the one named.
     */
    const replaceInto = (kind: 'entity' | 'block') => {
        const deliver = (context: Context, loot: LootSource, count: number | undefined): number => {
            const current = source(context);
            const slot: ItemSlot = { name: value(context, 'slot'), ...(count === undefined ? {} : { count }) };
            // One roll for every target, which Java hands to each of them.
            const targets = slotTargetsOf(context, kind, kind === 'block' ? 'targetPos' : 'targets');
            const placed = current.host.data.runLoot(loot, current, { kind: 'replace', targets, slot });
            return report(current, placed, `Replaced ${placed} items`);
        };

        const slot = withSources(arg<unknown>('slot', stringArgument()), (context, loot) =>
            deliver(context, loot, undefined)
        );
        slot.then(
            withSources(arg<unknown>('count', integerArgument({ min: 0 })), (context, loot) =>
                deliver(context, loot, value<number>(context, 'count'))
            )
        );

        const holder =
            kind === 'block'
                ? arg<unknown>('targetPos', blockPositionArgument())
                : arg<unknown>('targets', entityArgument());
        return lit(kind).then(holder.then(slot));
    };

    node.then(lit('replace').then(replaceInto('entity')).then(replaceInto('block')));

    return node;
};

const buildScoreboard = () => {
    const node = lit('scoreboard');

    const objectives = lit('objectives');
    objectives.then(
        lit('add').then(
            arg('objective', stringArgument()).then(
                arg('criterion', enumArgument('ScoreboardCriteria', ['dummy'] as const))
                    .executes(command((context) => addObjective(context, undefined)))
                    .then(
                        arg('displayName', stringArgument()).executes(
                            command((context) => addObjective(context, value<string>(context, 'displayName')))
                        )
                    )
            )
        )
    );
    objectives.then(
        lit('remove').then(
            arg('objective', softEnumArgument('ScoreboardObjectives')).executes(
                command((context) => {
                    const current = source(context);
                    const removed = current.host.scoreboard.removeObjective(value(context, 'objective'));
                    return report(current, removed ? 1 : 0, 'Removed the objective');
                })
            )
        )
    );
    objectives.then(
        lit('list').executes(
            command((context) => {
                const current = source(context);
                const names = current.host.scoreboard.listObjectives();
                return report(current, names.length, `There are ${names.length} objectives`);
            })
        )
    );
    objectives.then(
        lit('setdisplay').then(
            arg('slot', enumArgument('DisplaySlot', ['list', 'sidebar', 'belowname'] as const))
                .executes(
                    command((context) => {
                        const current = source(context);
                        const set = current.host.scoreboard.setDisplay(value(context, 'slot'));
                        return report(current, set ? 1 : 0, 'Cleared the display slot');
                    })
                )
                .then(
                    arg('objective', softEnumArgument('ScoreboardObjectives')).executes(
                        command((context) => {
                            const current = source(context);
                            const set = current.host.scoreboard.setDisplay(
                                value(context, 'slot'),
                                value(context, 'objective')
                            );
                            return report(current, set ? 1 : 0, 'Set the display slot');
                        })
                    )
                )
        )
    );
    node.then(objectives);

    const players = lit('players');
    for (const action of ['set', 'add', 'remove'] as const) {
        players.then(
            lit(action).then(
                arg('targets', scoreHolderArgument()).then(
                    arg('objective', softEnumArgument('ScoreboardObjectives')).then(
                        arg('score', integerArgument()).executes(command((context) => changeScore(context, action)))
                    )
                )
            )
        );
    }
    players.then(
        lit('get').then(
            arg('target', scoreHolderArgument()).then(
                arg('objective', softEnumArgument('ScoreboardObjectives')).executes(
                    command((context) => {
                        const current = source(context);
                        const holder = scoreHolderOne(current, value(context, 'target'));
                        const score = current.host.scoreboard.getScore(holder, value(context, 'objective'));
                        if (score === undefined) return report(current, 0, 'There is no such score');
                        current.sendFeedback(`${holder} has ${score}`);
                        return score;
                    })
                )
            )
        )
    );
    players.then(
        lit('reset').then(
            arg('targets', scoreHolderArgument())
                .executes(command((context) => resetScore(context, undefined)))
                .then(
                    arg('objective', softEnumArgument('ScoreboardObjectives')).executes(
                        command((context) => resetScore(context, value<string>(context, 'objective')))
                    )
                )
        )
    );
    players.then(
        lit('list').then(
            arg('target', scoreHolderArgument()).executes(
                command((context) => {
                    const current = source(context);
                    const holder = scoreHolderOne(current, value(context, 'target'));
                    const scores = current.host.scoreboard.listScores(holder);
                    const count = Object.keys(scores).length;
                    return report(current, count, `${holder} has ${count} scores`);
                })
            )
        )
    );
    players.then(
        lit('enable').then(
            arg('targets', scoreHolderArgument()).then(
                arg('objective', softEnumArgument('ScoreboardObjectives')).executes(
                    command((context) => {
                        const current = source(context);
                        const objective = value<string>(context, 'objective');
                        const enabled = scoreHolders(current, value(context, 'targets')).filter((holder) =>
                            current.host.scoreboard.enableTrigger(holder, objective)
                        ).length;
                        return report(current, enabled, `Enabled the trigger for ${enabled} players`);
                    })
                )
            )
        )
    );
    players.then(
        lit('operation').then(
            arg('target', scoreHolderArgument()).then(
                arg('targetObjective', softEnumArgument('ScoreboardObjectives')).then(
                    arg('operation', operationArgument()).then(
                        arg('source', scoreHolderArgument()).then(
                            arg('sourceObjective', softEnumArgument('ScoreboardObjectives')).executes(
                                command((context) => {
                                    const current = source(context);
                                    const result = current.host.scoreboard.operation(
                                        scoreHolderOne(current, value(context, 'target')),
                                        value(context, 'targetObjective'),
                                        value(context, 'operation'),
                                        scoreHolderOne(current, value(context, 'source')),
                                        value(context, 'sourceObjective')
                                    );
                                    if (result === undefined) return report(current, 0, 'The operation did not apply');
                                    current.sendFeedback(`The score is now ${result}`);
                                    return result;
                                })
                            )
                        )
                    )
                )
            )
        )
    );
    node.then(players);

    return node;
};

const addObjective = (context: Context, displayName: string | undefined): number => {
    const current = source(context);
    const added = current.host.scoreboard.addObjective(
        value(context, 'objective'),
        value(context, 'criterion'),
        displayName
    );
    return report(current, added ? 1 : 0, 'Added the objective');
};

const changeScore = (context: Context, action: 'set' | 'add' | 'remove'): number => {
    const current = source(context);
    const objective = value<string>(context, 'objective');
    const score = value<number>(context, 'score');
    let last = 0;
    for (const holder of scoreHolders(current, value(context, 'targets'))) {
        last =
            action === 'set'
                ? current.host.scoreboard.setScore(holder, objective, score)
                : current.host.scoreboard.addScore(holder, objective, action === 'add' ? score : -score);
    }
    current.sendFeedback(`The score is now ${last}`);
    return last;
};

const resetScore = (context: Context, objective: string | undefined): number => {
    const current = source(context);
    const reset = scoreHolders(current, value(context, 'targets')).filter((holder) =>
        current.host.scoreboard.resetScore(holder, objective)
    ).length;
    return report(current, reset, `Reset ${reset} scores`);
};

const schedule = (context: Context, mode: 'append' | 'replace'): number => {
    const current = source(context);
    const queued = current.host.data.schedule(value(context, 'name'), value(context, 'delay'), mode);
    return report(current, queued ? 1 : 0, 'Scheduled the function');
};

const random = (context: Context, sequence: string | undefined): number => {
    const current = source(context);
    const range = value<{ min?: number; max?: number }>(context, 'range');
    const drawn = current.host.data.randomValue(range.min ?? 1, range.max ?? 1, sequence);
    current.sendFeedback(`Rolled ${drawn}`);
    return drawn;
};
