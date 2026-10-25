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
import type { CommandSource, DataModifyOperation, DataTarget, ItemSlot, LootSource } from '../host';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import {
    arg,
    command,
    lit,
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

const targetOf = (context: Context, kind: 'block' | 'entity' | 'storage', prefix = ''): DataTarget => {
    const current = source(context);
    if (kind === 'block') {
        return {
            kind,
            dimension: current.dimension,
            position: resolvePosition(value(context, `${prefix}pos`), current)
        };
    }
    if (kind === 'entity') return { kind, entity: selectOne(current, value(context, `${prefix}target`)) };
    return { kind, id: value(context, `${prefix}storage`) };
};

/** Adds `block <pos>`, `entity <target>` and `storage <id>` under one node. */
const withTargets = (
    node: ReturnType<typeof lit>,
    build: (kind: 'block' | 'entity' | 'storage') => ReturnType<typeof arg>
) =>
    node
        .then(lit('block').then(build('block')))
        .then(lit('entity').then(build('entity')))
        .then(lit('storage').then(build('storage')));

/** Registers the seven data-driven commands. */
export const registerDataCommands = (registry: CommandRegistry<CommandSource>): void => {
    registry.register(buildData(), { description: 'Reads and writes NBT.', ...CHEATS });
    registry.register(buildItem(), { description: 'Changes items in a slot.', ...CHEATS });
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
                        const found = current.host.data.getData(targetOf(context, kind));
                        if (found === undefined) return report(current, 0, 'There is no data there');
                        current.sendFeedback(found);
                        return 1;
                    })
                )
                .then(
                    arg('path', nbtPathArgument())
                        .executes(command((context) => getData(context, kind, 1)))
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
                        const merged = current.host.data.mergeData(targetOf(context, kind), value(context, 'nbt'));
                        return report(current, merged ? 1 : 0, 'Merged the data');
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
                        const removed = current.host.data.removeData(targetOf(context, kind), value(context, 'path'));
                        return report(current, removed ? 1 : 0, 'Removed the data');
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
            const operationNode = lit(operation);
            const valueNode = lit('value').then(
                arg('nbt', nbtTagArgument()).executes(
                    command((context) => modifyData(context, kind, operation, value(context, 'nbt')))
                )
            );
            if (operation === 'insert') {
                operationNode.then(arg('index', integerArgument()).then(valueNode));
            } else {
                operationNode.then(valueNode);
            }
            path.then(operationNode);
        }
        return target.then(path);
    });
    node.then(modify);

    return node;
};

const targetArgument = (kind: 'block' | 'entity' | 'storage') =>
    kind === 'block'
        ? arg<unknown>('pos', blockPositionArgument())
        : kind === 'entity'
          ? arg<unknown>('target', entityArgument())
          : arg<unknown>('storage', stringArgument());

const getData = (context: Context, kind: 'block' | 'entity' | 'storage', scale: number): number => {
    const current = source(context);
    const path = value<string>(context, 'path');
    const found = current.host.data.getData(targetOf(context, kind), path);
    if (found === undefined) return report(current, 0, `The path ${path} matched nothing`);
    current.sendFeedback(found);
    const parsed = Number(found);
    return Number.isFinite(parsed) ? Math.trunc(parsed * scale) : 1;
};

const modifyData = (
    context: Context,
    kind: 'block' | 'entity' | 'storage',
    operation: DataModifyOperation,
    nbt: string
): number => {
    const current = source(context);
    const index = operation === 'insert' ? value<number>(context, 'index') : undefined;
    const changed = current.host.data.modifyData(
        targetOf(context, kind),
        value(context, 'path'),
        operation,
        nbt,
        index
    );
    return report(current, changed ? 1 : 0, 'Modified the data');
};

const slotOf = (context: Context): ItemSlot => ({ name: value<string>(context, 'slots') });

const buildItem = () => {
    const node = lit('item');

    for (const action of ['replace', 'fill', 'modify', 'override'] as const) {
        const actionNode = lit(action);
        for (const kind of ['block', 'entity'] as const) {
            const holder = lit(kind);
            const slots = arg('slots', stringArgument());

            if (action === 'modify') {
                slots.then(
                    arg('modifier', itemModifierArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const changed = current.host.data.applyItemModifier(
                                targetOf(context, kind),
                                slotOf(context),
                                value(context, 'modifier')
                            );
                            return report(current, changed, `Changed ${changed} items`);
                        })
                    )
                );
            } else {
                slots.then(
                    lit('with').then(
                        arg('item', resourceArgument('minecraft:item'))
                            .executes(command((context) => setSlot(context, kind, 1)))
                            .then(
                                arg('count', integerArgument({ min: 1, max: 99 })).executes(
                                    command((context) => setSlot(context, kind, value(context, 'count')))
                                )
                            )
                    )
                );
                slots.then(
                    lit('from').then(
                        lit(kind).then(
                            targetArgument(kind).then(
                                arg('sourceSlots', stringArgument())
                                    .executes(command((context) => copySlots(context, kind, undefined)))
                                    .then(
                                        arg('modifier', itemModifierArgument()).executes(
                                            command((context) =>
                                                copySlots(context, kind, value<string>(context, 'modifier'))
                                            )
                                        )
                                    )
                            )
                        )
                    )
                );
            }

            holder.then(targetArgument(kind).then(slots));
            actionNode.then(holder);
        }
        node.then(actionNode);
    }

    return node;
};

const setSlot = (context: Context, kind: 'block' | 'entity', count: number): number => {
    const current = source(context);
    const placed = current.host.data.setSlot(targetOf(context, kind), slotOf(context), value(context, 'item'), count);
    return report(current, placed, `Set ${placed} items`);
};

const copySlots = (context: Context, kind: 'block' | 'entity', modifier: string | undefined): number => {
    const current = source(context);
    const copied = current.host.data.copySlots(
        targetOf(context, kind),
        { name: value<string>(context, 'sourceSlots') },
        targetOf(context, kind),
        slotOf(context),
        modifier
    );
    return report(current, copied, `Copied ${copied} items`);
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
            const targets: readonly DataTarget[] =
                kind === 'block'
                    ? [
                          {
                              kind: 'block',
                              dimension: current.dimension,
                              position: resolvePosition(value(context, 'targetPos'), current)
                          }
                      ]
                    : select(current, value(context, 'targets')).map((entity) => ({ kind: 'entity', entity }));

            const placed = targets.reduce(
                (total, target) => total + current.host.data.runLoot(loot, current, { kind: 'replace', target, slot }),
                0
            );
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
