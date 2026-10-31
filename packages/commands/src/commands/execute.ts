/**
 * `/execute` as Java spells it: 14 subcommands that each redirect back to
 * `execute`, 13 `if`/`unless` conditions, 8 `on` relations and 5 `store`
 * targets.
 *
 * This is the shape the rest of the package exists to support. Every
 * subcommand derives a new `CommandSource` and hands control back to the
 * `execute` node, so a chain of any length parses without the tree growing.
 * `as`, `at`, `on` and the two `positioned as`/`rotated as` forms fork, which
 * means one command runs once per matched entity; the Brigadier port's
 * breadth-first loop in `CommandDispatcher.execute` does the fan-out.
 *
 * `store` needs the value a later command returns, which upstream Brigadier
 * carries on the source as a `CommandResultCallback`. The port predates
 * `ContextChain`, so {@link storeCommandResults} installs a `ResultConsumer`
 * on the dispatcher and the sinks on the derived source receive the value
 * from there.
 */
import type { CommandDispatcher, RequiredArgumentBuilder } from '@jsprismarine/brigadier';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    blockPositionArgument,
    compareOperatorArgument,
    entityArgument,
    enumArgument,
    floatArgument,
    integerRangeArgument,
    lootPredicateArgument,
    lootTableArgument,
    nbtPathArgument,
    positionArgument,
    relativeValueArgument,
    resourceArgument,
    scoreHolderArgument,
    softEnumArgument,
    stringArgument
} from '../argumentTypes';
import type { CommandSource, DataTarget, EntityRelation, Vector3 } from '../host';
import type { CommandRegistry, ContentRegistryIds } from '../tree';
import type { Context } from './support';
import {
    anchorArgument,
    arg,
    command,
    dimensionArgument,
    dimensionSuggestions,
    lit,
    resolvePosition,
    resolveRotation,
    scoreHolderOne,
    scoreHolders,
    select,
    selectOne,
    source,
    toDimensionId,
    value
} from './support';

/** The eight relationships `execute on` walks. */
export const EXECUTE_ON_RELATIONS: readonly EntityRelation[] = [
    'attacker',
    'controller',
    'leasher',
    'origin',
    'owner',
    'passengers',
    'target',
    'vehicle'
];

/** The 13 conditions `execute if` and `execute unless` accept. */
export const EXECUTE_CONDITIONS: readonly string[] = [
    'biome',
    'block',
    'blocks',
    'data',
    'dimension',
    'entity',
    'function',
    'items',
    'loaded',
    'predicate',
    'score',
    'slots',
    'stopwatch'
];

/** The five things `execute store` writes into. */
export const EXECUTE_STORE_TARGETS: readonly string[] = ['block', 'bossbar', 'entity', 'score', 'storage'];

/** The 14 subcommands of `/execute`. */
export const EXECUTE_SUBCOMMANDS: readonly string[] = [
    'align',
    'anchored',
    'as',
    'at',
    'facing',
    'if',
    'in',
    'on',
    'positioned',
    'rotated',
    'run',
    'store',
    'summon',
    'unless'
];

const positionAt = (context: Context, name: string): Vector3 => resolvePosition(value(context, name), source(context));

/**
 * Builds the `/execute` tree and registers it.
 *
 * @returns The root node, so a caller can hang more subcommands off it.
 */
export const registerExecute = (registry: CommandRegistry<CommandSource>) => {
    const content = registry.getContent();
    const root = registry.register(lit('execute'), {
        description: 'Runs a command with a changed source, position, rotation or dimension.',
        permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
        requiresCheats: true
    });

    // --- the spatial subcommands, none of which fork ----------------------

    root.addChild(
        lit('align')
            .then(
                arg('axes', stringArgument()).redirect(root, {
                    apply: (context) => {
                        const axes = value<string>(context, 'axes');
                        const current = source(context);
                        const floorOn = (axis: 'x' | 'y' | 'z') =>
                            axes.includes(axis) ? Math.floor(current.position[axis]) : current.position[axis];
                        return current.withPosition({ x: floorOn('x'), y: floorOn('y'), z: floorOn('z') });
                    }
                })
            )
            .build()
    );

    root.addChild(
        lit('anchored')
            .then(
                arg('anchor', anchorArgument()).redirect(root, {
                    apply: (context) => source(context).withAnchor(value(context, 'anchor'))
                })
            )
            .build()
    );

    root.addChild(
        lit('in')
            .then(
                arg('dimension', dimensionArgument())
                    .suggests(dimensionSuggestions)
                    .redirect(root, {
                        apply: (context) => source(context).withDimension(toDimensionId(value(context, 'dimension')))
                    })
            )
            .build()
    );

    root.addChild(
        lit('positioned')
            .then(
                arg('position', positionArgument()).redirect(root, {
                    apply: (context) => source(context).withPosition(positionAt(context, 'position'))
                })
            )
            .then(
                lit('as').then(
                    // `positioned as` forks: each matched entity contributes a position.
                    arg('origin', entityArgument()).fork(root, {
                        apply: (context) =>
                            select(source(context), value(context, 'origin')).map((entity) =>
                                source(context).withPosition(entity.position)
                            )
                    })
                )
            )
            .then(
                lit('over').then(
                    arg(
                        'heightmap',
                        enumArgument('Heightmap', [
                            'world_surface',
                            'motion_blocking',
                            'motion_blocking_no_leaves',
                            'ocean_floor'
                        ] as const)
                    ).redirect(root, {
                        apply: (context) => {
                            const current = source(context);
                            const y = current.host.world.heightmap(
                                current.dimension,
                                current.position,
                                value(context, 'heightmap')
                            );
                            return current.withPosition({ ...current.position, y });
                        }
                    })
                )
            )
            .build()
    );

    root.addChild(
        lit('rotated')
            .then(
                arg('yaw', relativeValueArgument()).then(
                    arg('pitch', relativeValueArgument()).redirect(root, {
                        apply: (context) =>
                            source(context).withRotation(
                                resolveRotation(value(context, 'yaw'), value(context, 'pitch'), source(context))
                            )
                    })
                )
            )
            .then(
                lit('as').then(
                    arg('origin', entityArgument()).fork(root, {
                        apply: (context) =>
                            select(source(context), value(context, 'origin')).map((entity) =>
                                source(context).withRotation(entity.rotation)
                            )
                    })
                )
            )
            .build()
    );

    const facingRotation = (from: Vector3, to: Vector3) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const horizontal = Math.sqrt(dx * dx + dz * dz);
        return {
            yaw: (Math.atan2(-dx, dz) * 180) / Math.PI,
            pitch: (Math.atan2(-dy, horizontal) * 180) / Math.PI
        };
    };

    root.addChild(
        lit('facing')
            .then(
                arg('position', positionArgument()).redirect(root, {
                    apply: (context) => {
                        const current = source(context);
                        return current.withRotation(facingRotation(current.position, positionAt(context, 'position')));
                    }
                })
            )
            .then(
                lit('entity').then(
                    arg('targets', entityArgument()).then(
                        arg('anchor', anchorArgument()).fork(root, {
                            apply: (context) => {
                                const current = source(context).withAnchor(value(context, 'anchor'));
                                return select(current, value(context, 'targets')).map((entity) =>
                                    current.withRotation(facingRotation(current.position, entity.position))
                                );
                            }
                        })
                    )
                )
            )
            .build()
    );

    // --- the forking subcommands ------------------------------------------

    root.addChild(
        lit('as')
            .then(
                // `as` changes who runs the command and leaves the position alone.
                arg('targets', entityArgument()).fork(root, {
                    apply: (context) =>
                        select(source(context), value(context, 'targets')).map((entity) =>
                            source(context).withEntity(entity)
                        )
                })
            )
            .build()
    );

    root.addChild(
        lit('at')
            .then(
                // `at` moves the frame of reference and leaves the runner alone.
                arg('targets', entityArgument()).fork(root, {
                    apply: (context) =>
                        select(source(context), value(context, 'targets')).map((entity) =>
                            source(context)
                                .withPosition(entity.position)
                                .withRotation(entity.rotation)
                                .withDimension(entity.dimension)
                        )
                })
            )
            .build()
    );

    const on = lit('on');
    for (const relation of EXECUTE_ON_RELATIONS) {
        on.then(
            lit(relation).fork(root, {
                apply: (context) => {
                    const current = source(context);
                    if (current.entity === undefined) return [];
                    return current.host.entities
                        .related(current.entity, relation)
                        .map((entity) => current.withEntity(entity));
                }
            })
        );
    }
    root.addChild(on.build());

    root.addChild(
        lit('summon')
            .then(
                arg('entity', resourceArgument('minecraft:entity_type', content.entityTypes)).redirect(root, {
                    apply: (context) => {
                        const current = source(context);
                        const summoned = current.host.entities.summon(
                            value(context, 'entity'),
                            current.position,
                            current.rotation,
                            { dimension: current.dimension }
                        );
                        return summoned === undefined ? current : current.withEntity(summoned);
                    }
                })
            )
            .build()
    );

    // --- run, the terminal -------------------------------------------------

    root.addChild(
        lit('run')
            // The only redirect in the tree that leaves `/execute`. Bedrock
            // spells it `run <command: CODEBUILDERARGS>`; the flattener turns
            // the root redirect into exactly that.
            .redirect(registry.getRoot())
            .build()
    );

    root.addChild(buildConditions(root, 'if', content));
    root.addChild(buildConditions(root, 'unless', content));
    root.addChild(buildStore(root));

    return root;
};

type Condition = (context: Context) => boolean;

/** Any node a condition can end on. */
type ConditionTerminal = RequiredArgumentBuilder<CommandSource, unknown>;

const dataTargetOf = (context: Context, kind: 'block' | 'entity' | 'storage'): DataTarget => {
    const current = source(context);
    if (kind === 'block') {
        return { kind, dimension: current.dimension, position: positionAt(context, 'sourcePos') };
    }
    if (kind === 'entity') return { kind, entity: selectOne(current, value(context, 'source')) };
    return { kind, id: value(context, 'source') };
};

const buildConditions = (
    root: ReturnType<CommandRegistry<CommandSource>['register']>,
    keyword: 'if' | 'unless',
    content: ContentRegistryIds
) => {
    const positive = keyword === 'if';
    const node = lit(keyword);

    /**
     * Wires one condition as both a terminal command and a chaining fork.
     *
     * `execute if entity @e` runs on its own and `execute if entity @e run ...`
     * continues, so the node needs an executor and a redirect. The executor
     * goes on first: a node with a redirect refuses children, and `fork`
     * installs the redirect.
     */
    const attach = (builder: ConditionTerminal, condition: Condition): ConditionTerminal => {
        builder.executes(command((context) => (condition(context) === positive ? 1 : 0)));
        return builder.fork(root, {
            apply: (context) => (condition(context) === positive ? [source(context)] : [])
        });
    };

    node.then(
        lit('entity').then(
            attach(
                arg('targets', entityArgument()),
                (context) => select(source(context), value(context, 'targets')).length > 0
            )
        )
    );

    node.then(
        lit('block').then(
            arg('pos', blockPositionArgument()).then(
                attach(arg('block', resourceArgument('minecraft:block', content.blocks)), (context) => {
                    const current = source(context);
                    const found = current.host.world.getBlock(current.dimension, positionAt(context, 'pos'));
                    return found?.identifier === value<string>(context, 'block');
                })
            )
        )
    );

    node.then(
        lit('blocks').then(
            arg('begin', blockPositionArgument()).then(
                arg('end', blockPositionArgument()).then(
                    arg('destination', blockPositionArgument()).then(
                        attach(
                            arg('scanMode', enumArgument('BlocksScanMode', ['all', 'masked'] as const)),
                            (context) => {
                                const current = source(context);
                                return (
                                    current.host.world.compareRegions(
                                        current.dimension,
                                        positionAt(context, 'begin'),
                                        positionAt(context, 'end'),
                                        positionAt(context, 'destination'),
                                        value<string>(context, 'scanMode') === 'masked'
                                    ) > 0
                                );
                            }
                        )
                    )
                )
            )
        )
    );

    const scoreOf = (context: Context, targetKey: string, objectiveKey: string): number | undefined => {
        const current = source(context);
        return current.host.scoreboard.getScore(
            scoreHolderOne(current, value(context, targetKey)),
            value<string>(context, objectiveKey)
        );
    };

    node.then(
        lit('score').then(
            arg('target', scoreHolderArgument()).then(
                arg('targetObjective', softEnumArgument('ScoreboardObjectives'))
                    .then(
                        lit('matches').then(
                            attach(arg('range', integerRangeArgument()), (context) => {
                                const score = scoreOf(context, 'target', 'targetObjective');
                                const range = value<{ min?: number; max?: number }>(context, 'range');
                                return (
                                    score !== undefined &&
                                    score >= (range.min ?? Number.NEGATIVE_INFINITY) &&
                                    score <= (range.max ?? Number.POSITIVE_INFINITY)
                                );
                            })
                        )
                    )
                    .then(
                        arg('operation', compareOperatorArgument()).then(
                            arg('source', scoreHolderArgument()).then(
                                attach(arg('sourceObjective', softEnumArgument('ScoreboardObjectives')), (context) => {
                                    const left = scoreOf(context, 'target', 'targetObjective');
                                    const right = scoreOf(context, 'source', 'sourceObjective');
                                    if (left === undefined || right === undefined) return false;
                                    switch (value<string>(context, 'operation')) {
                                        case '<':
                                            return left < right;
                                        case '<=':
                                            return left <= right;
                                        case '>':
                                            return left > right;
                                        case '>=':
                                            return left >= right;
                                        default:
                                            return left === right;
                                    }
                                })
                            )
                        )
                    )
            )
        )
    );

    node.then(
        lit('dimension').then(
            attach(
                arg('dimension', dimensionArgument()).suggests(dimensionSuggestions),
                (context) => source(context).dimension === toDimensionId(value(context, 'dimension'))
            )
        )
    );

    node.then(
        lit('biome').then(
            arg('pos', blockPositionArgument()).then(
                attach(arg('biome', resourceArgument('minecraft:worldgen/biome')), (context) => {
                    const current = source(context);
                    return (
                        current.host.world.getBiome(current.dimension, positionAt(context, 'pos')) ===
                        value<string>(context, 'biome')
                    );
                })
            )
        )
    );

    node.then(
        lit('loaded').then(
            attach(arg('pos', blockPositionArgument()), (context) => {
                const current = source(context);
                return current.host.world.isLoaded(current.dimension, positionAt(context, 'pos'));
            })
        )
    );

    node.then(
        lit('predicate').then(
            attach(arg('predicate', lootPredicateArgument()), (context) =>
                source(context).host.data.testPredicate(value(context, 'predicate'), source(context))
            )
        )
    );

    node.then(
        lit('function').then(
            attach(
                arg('name', stringArgument()),
                // The 1.20.3 rule: a function matches when it returned a
                // non-zero value through `/return`, so one that ran forty
                // lines and never returned does not match. A tag runs every
                // member and matches when any of them did.
                (context) => source(context).host.data.runFunction(value(context, 'name'), source(context)).matched
            )
        )
    );

    for (const [keywordName, kind] of [
        ['block', 'block'],
        ['entity', 'entity'],
        ['storage', 'storage']
    ] as const) {
        node.then(
            lit('data').then(
                lit(keywordName).then(
                    arg<unknown>(
                        kind === 'block' ? 'sourcePos' : 'source',
                        kind === 'block'
                            ? blockPositionArgument()
                            : kind === 'entity'
                              ? entityArgument()
                              : stringArgument()
                    ).then(
                        attach(
                            arg('path', nbtPathArgument()),
                            (context) =>
                                source(context).host.data.countData(
                                    dataTargetOf(context, kind),
                                    value(context, 'path')
                                ) > 0
                        )
                    )
                )
            )
        );
    }

    node.then(
        lit('items').then(
            lit('entity').then(
                arg('source', entityArgument()).then(
                    arg('slots', stringArgument()).then(
                        attach(arg('items', lootTableArgument()), (context) => {
                            const current = source(context);
                            return (
                                current.host.data.countData(
                                    { kind: 'entity', entity: selectOne(current, value(context, 'source')) },
                                    value(context, 'slots')
                                ) > 0
                            );
                        })
                    )
                )
            )
        )
    );

    node.then(
        lit('slots').then(
            arg('slots', stringArgument()).then(
                attach(arg('item', stringArgument()), (context) => {
                    const current = source(context);
                    if (current.entity === undefined) return false;
                    return (
                        current.host.data.countData(
                            { kind: 'entity', entity: current.entity },
                            value(context, 'slots')
                        ) > 0
                    );
                })
            )
        )
    );

    node.then(
        lit('stopwatch').then(
            arg('id', stringArgument()).then(attach(arg('range', integerRangeArgument()), () => false))
        )
    );

    return node.build();
};

const buildStore = (root: ReturnType<CommandRegistry<CommandSource>['register']>) => {
    const node = lit('store');

    for (const which of ['result', 'success'] as const) {
        const kind = lit(which);
        const pick = (outcome: { success: boolean; value: number }) =>
            which === 'result' ? outcome.value : outcome.success ? 1 : 0;

        kind.then(
            lit('score').then(
                arg('targets', scoreHolderArgument()).then(
                    arg('objective', softEnumArgument('ScoreboardObjectives')).redirect(root, {
                        apply: (context) => {
                            const current = source(context);
                            const holders = scoreHolders(current, value(context, 'targets'));
                            const objective = value<string>(context, 'objective');
                            return current.withStore((outcome) => {
                                for (const holder of holders) {
                                    current.host.scoreboard.setScore(holder, objective, pick(outcome));
                                }
                            });
                        }
                    })
                )
            )
        );

        kind.then(
            lit('bossbar').then(
                arg('id', stringArgument()).then(
                    arg('field', enumArgument('BossBarField', ['value', 'max'] as const)).redirect(root, {
                        apply: (context) => {
                            const current = source(context);
                            const target = {
                                kind: 'bossbar' as const,
                                id: value<string>(context, 'id'),
                                field: value<'value' | 'max'>(context, 'field')
                            };
                            return current.withStore((outcome) => {
                                current.host.data.modifyData(
                                    { kind: 'storage', id: `bossbar/${target.id}` },
                                    target.field,
                                    'set',
                                    String(pick(outcome))
                                );
                            });
                        }
                    })
                )
            )
        );

        for (const where of ['block', 'entity', 'storage'] as const) {
            const holder = lit(where);
            const targetArgument: RequiredArgumentBuilder<CommandSource, unknown> =
                where === 'block'
                    ? arg('sourcePos', blockPositionArgument())
                    : where === 'entity'
                      ? arg('source', entityArgument())
                      : arg('source', stringArgument());

            holder.then(
                targetArgument.then(
                    arg('path', nbtPathArgument()).then(
                        arg(
                            'type',
                            enumArgument('StoreType', ['byte', 'short', 'int', 'long', 'float', 'double'] as const)
                        ).then(
                            arg('scale', floatArgument()).redirect(root, {
                                apply: (context) => {
                                    const current = source(context);
                                    const target = dataTargetOf(context, where);
                                    const path = value<string>(context, 'path');
                                    const scale = value<number>(context, 'scale');
                                    return current.withStore((outcome) => {
                                        current.host.data.modifyData(
                                            target,
                                            path,
                                            'set',
                                            String(pick(outcome) * scale)
                                        );
                                    });
                                }
                            })
                        )
                    )
                )
            );
            kind.then(holder);
        }

        node.then(kind);
    }

    return node.build();
};

/**
 * Feeds every command result back to the `execute store` sinks waiting on its
 * source.
 *
 * The Brigadier port predates upstream's `ContextChain`, so there is no
 * staged execution to hang a `CommandResultCallback` off. The dispatcher's
 * `ResultConsumer` sees the same thing, one call per executed context, so
 * `store` is wired through it. Call this once per dispatcher.
 *
 * @throws Nothing. A result the port passes as an exception rather than a
 *   number, which it does on a failed branch, is recorded as a failure with
 *   value 0.
 */
export const storeCommandResults = (dispatcher: CommandDispatcher<CommandSource>): void => {
    dispatcher.setConsumer({
        onCommandComplete: (context, success, result) => {
            const current = context.getSource();
            if (current.stores.length === 0) return;
            const value = typeof result === 'number' ? result : 0;
            for (const sink of current.stores) sink({ success, value });
        }
    });
};
