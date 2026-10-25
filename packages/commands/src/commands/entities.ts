/**
 * The entity-side commands: `/summon`, `/kill`, `/teleport`, `/damage`,
 * `/effect`, `/enchant`, `/gamemode`, `/give`, `/clear`, `/xp`, `/ride`,
 * `/attribute` and `/tag`.
 *
 * Each one is a Brigadier tree whose executor calls `CommandHost.entities`
 * and returns the count `execute store result` captures.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    entityArgument,
    enumArgument,
    integerArgument,
    floatArgument,
    nbtCompoundArgument,
    positionArgument,
    relativeValueArgument,
    resourceArgument,
    stringArgument
} from '../argumentTypes';
import type { CommandSource } from '../host';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import {
    arg,
    command,
    gameModeArgument,
    lit,
    report,
    resolvePosition,
    resolveRotation,
    select,
    selectOne,
    source,
    value
} from './support';

/** The three attribute modifier operations Java 26.3 accepts. */
export const ATTRIBUTE_OPERATIONS = ['add_value', 'add_multiplied_base', 'add_multiplied_total'] as const;

const CHEATS = {
    permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
    requiresCheats: true
} as const;

/** Registers the 13 entity commands. */
export const registerEntityCommands = (registry: CommandRegistry<CommandSource>): void => {
    registry.register(
        lit('summon').then(
            arg('entity', resourceArgument('minecraft:entity_type'))
                .executes(
                    command((context) => {
                        const current = source(context);
                        const summoned = current.host.entities.summon(
                            value(context, 'entity'),
                            current.position,
                            current.rotation,
                            {}
                        );
                        return report(current, summoned === undefined ? 0 : 1, 'Summoned new entity');
                    })
                )
                .then(
                    arg('position', positionArgument())
                        .executes(
                            command((context) => {
                                const current = source(context);
                                const summoned = current.host.entities.summon(
                                    value(context, 'entity'),
                                    resolvePosition(value(context, 'position'), current),
                                    current.rotation,
                                    {}
                                );
                                return report(current, summoned === undefined ? 0 : 1, 'Summoned new entity');
                            })
                        )
                        .then(
                            arg('nbt', nbtCompoundArgument()).executes(
                                command((context) => {
                                    const current = source(context);
                                    const summoned = current.host.entities.summon(
                                        value(context, 'entity'),
                                        resolvePosition(value(context, 'position'), current),
                                        current.rotation,
                                        { nbt: value(context, 'nbt') }
                                    );
                                    return report(current, summoned === undefined ? 0 : 1, 'Summoned new entity');
                                })
                            )
                        )
                )
        ),
        { description: 'Summons an entity.', ...CHEATS }
    );

    registry.register(
        lit('kill')
            .executes(
                command((context) => {
                    const current = source(context);
                    if (current.entity === undefined) return report(current, 0, 'No entity to kill');
                    return report(current, current.host.entities.kill(current.entity) ? 1 : 0, 'Killed 1 entity');
                })
            )
            .then(
                arg('targets', entityArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const killed = select(current, value(context, 'targets')).filter((entity) =>
                            current.host.entities.kill(entity)
                        ).length;
                        return report(current, killed, `Killed ${killed} entities`);
                    })
                )
            ),
        { description: 'Kills entities.', ...CHEATS }
    );

    registry.register(
        lit('teleport')
            .then(
                arg('destination', entityArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        if (current.entity === undefined) return report(current, 0, 'No entity to teleport');
                        const to = selectOne(current, value(context, 'destination'));
                        const moved = current.host.entities.teleport(
                            current.entity,
                            to.position,
                            to.rotation,
                            to.dimension
                        );
                        return report(current, moved ? 1 : 0, `Teleported to ${to.name}`);
                    })
                )
            )
            .then(
                arg('targets', entityArgument()).then(
                    arg('position', positionArgument())
                        .executes(command((context) => teleportTo(context, undefined)))
                        .then(
                            arg('yaw', relativeValueArgument()).then(
                                arg('pitch', relativeValueArgument()).executes(
                                    command((context) => teleportTo(context, 'rotation'))
                                )
                            )
                        )
                )
            ),
        { description: 'Teleports entities.', aliases: ['tp'], ...CHEATS }
    );

    registry.register(
        lit('damage').then(
            arg('target', entityArgument()).then(
                arg('amount', floatArgument({ min: 0 }))
                    .executes(command((context) => damage(context, 'minecraft:generic')))
                    .then(
                        arg('damageType', resourceArgument('minecraft:damage_type')).executes(
                            command((context) => damage(context, value(context, 'damageType')))
                        )
                    )
            )
        ),
        { description: 'Applies damage to entities.', ...CHEATS }
    );

    registry.register(
        lit('effect')
            .then(
                lit('clear').then(
                    arg('targets', entityArgument())
                        .executes(
                            command((context) => {
                                const current = source(context);
                                const cleared = select(current, value(context, 'targets')).reduce(
                                    (total, entity) => total + current.host.entities.clearEffect(entity),
                                    0
                                );
                                return report(current, cleared, `Cleared ${cleared} effects`);
                            })
                        )
                        .then(
                            arg('effect', resourceArgument('minecraft:mob_effect')).executes(
                                command((context) => {
                                    const current = source(context);
                                    const effect = value<string>(context, 'effect');
                                    const cleared = select(current, value(context, 'targets')).reduce(
                                        (total, entity) => total + current.host.entities.clearEffect(entity, effect),
                                        0
                                    );
                                    return report(current, cleared, `Cleared ${cleared} effects`);
                                })
                            )
                        )
                )
            )
            .then(
                lit('give').then(
                    arg('targets', entityArgument()).then(
                        arg('effect', resourceArgument('minecraft:mob_effect'))
                            .executes(command((context) => giveEffect(context, 30, 0, false)))
                            .then(
                                arg('seconds', integerArgument({ min: 0 }))
                                    .executes(
                                        command((context) =>
                                            giveEffect(context, value<number>(context, 'seconds'), 0, false)
                                        )
                                    )
                                    .then(
                                        arg('amplifier', integerArgument({ min: 0, max: 255 }))
                                            .executes(
                                                command((context) =>
                                                    giveEffect(
                                                        context,
                                                        value<number>(context, 'seconds'),
                                                        value<number>(context, 'amplifier'),
                                                        false
                                                    )
                                                )
                                            )
                                            .then(
                                                arg(
                                                    'hideParticles',
                                                    enumArgument('Boolean', ['true', 'false'] as const)
                                                ).executes(
                                                    command((context) =>
                                                        giveEffect(
                                                            context,
                                                            value<number>(context, 'seconds'),
                                                            value<number>(context, 'amplifier'),
                                                            value<string>(context, 'hideParticles') === 'true'
                                                        )
                                                    )
                                                )
                                            )
                                    )
                            )
                    )
                )
            ),
        { description: 'Adds or removes status effects.', ...CHEATS }
    );

    registry.register(
        lit('enchant').then(
            arg('targets', entityArgument()).then(
                arg('enchantment', resourceArgument('minecraft:enchantment'))
                    .executes(command((context) => enchant(context, 1)))
                    .then(
                        arg('level', integerArgument({ min: 1 })).executes(
                            command((context) => enchant(context, value<number>(context, 'level')))
                        )
                    )
            )
        ),
        { description: 'Enchants a held item.', ...CHEATS }
    );

    registry.register(
        lit('gamemode').then(
            arg('gameMode', gameModeArgument())
                .executes(
                    command((context) => {
                        const current = source(context);
                        if (current.entity === undefined) return report(current, 0, 'No player to change');
                        const changed = current.host.entities.setGameMode(current.entity, value(context, 'gameMode'));
                        return report(current, changed ? 1 : 0, `Set own game mode`);
                    })
                )
                .then(
                    arg('targets', entityArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const mode = value<string>(context, 'gameMode');
                            const changed = select(current, value(context, 'targets')).filter((entity) =>
                                current.host.entities.setGameMode(entity, mode)
                            ).length;
                            return report(current, changed, `Set the game mode of ${changed} players`);
                        })
                    )
                )
        ),
        { description: "Changes a player's game mode.", ...CHEATS }
    );

    registry.register(
        lit('give').then(
            arg('targets', entityArgument()).then(
                arg('item', resourceArgument('minecraft:item'))
                    .executes(command((context) => give(context, 1, 0)))
                    .then(
                        arg('amount', integerArgument({ min: 1 }))
                            .executes(command((context) => give(context, value<number>(context, 'amount'), 0)))
                            .then(
                                arg('data', integerArgument({ min: 0 })).executes(
                                    command((context) =>
                                        give(context, value<number>(context, 'amount'), value<number>(context, 'data'))
                                    )
                                )
                            )
                    )
            )
        ),
        { description: 'Gives an item to players.', ...CHEATS }
    );

    registry.register(
        lit('clear')
            .executes(command((context) => clear(context, undefined, Number.POSITIVE_INFINITY)))
            .then(
                arg('targets', entityArgument())
                    .executes(command((context) => clear(context, undefined, Number.POSITIVE_INFINITY)))
                    .then(
                        arg('item', resourceArgument('minecraft:item'))
                            .executes(
                                command((context) =>
                                    clear(context, value<string>(context, 'item'), Number.POSITIVE_INFINITY)
                                )
                            )
                            .then(
                                arg('maxCount', integerArgument({ min: 0 })).executes(
                                    command((context) =>
                                        clear(context, value<string>(context, 'item'), value(context, 'maxCount'))
                                    )
                                )
                            )
                    )
            ),
        { description: 'Removes items from inventories.', ...CHEATS }
    );

    registry.register(
        lit('xp')
            .then(
                lit('query').then(
                    arg('targets', entityArgument()).then(
                        arg('unit', enumArgument('ExperienceUnit', ['levels', 'points'] as const)).executes(
                            command((context) => {
                                const current = source(context);
                                const unit = value<'levels' | 'points'>(context, 'unit');
                                const [player] = select(current, value(context, 'targets'));
                                if (player === undefined) return report(current, 0, 'No player was found');
                                const amount = current.host.entities.queryExperience(player, unit);
                                current.sendFeedback(`${player.name} has ${amount} ${unit}`);
                                return amount;
                            })
                        )
                    )
                )
            )
            .then(
                lit('add').then(
                    arg('targets', entityArgument()).then(
                        arg('amount', integerArgument()).then(
                            arg('unit', enumArgument('ExperienceUnit', ['levels', 'points'] as const)).executes(
                                command((context) => changeExperience(context))
                            )
                        )
                    )
                )
            ),
        { description: 'Adds or queries experience.', aliases: ['experience'], ...CHEATS }
    );

    registry.register(
        lit('ride').then(
            arg('target', entityArgument())
                .then(
                    lit('mount').then(
                        arg('vehicle', entityArgument()).executes(
                            command((context) => {
                                const current = source(context);
                                const rider = selectOne(current, value(context, 'target'));
                                const vehicle = selectOne(current, value(context, 'vehicle'));
                                const mounted = current.host.entities.ride(rider, vehicle);
                                return report(current, mounted ? 1 : 0, `${rider.name} is riding ${vehicle.name}`);
                            })
                        )
                    )
                )
                .then(
                    lit('dismount').executes(
                        command((context) => {
                            const current = source(context);
                            const rider = selectOne(current, value(context, 'target'));
                            const dismounted = current.host.entities.ride(rider, undefined);
                            return report(current, dismounted ? 1 : 0, `${rider.name} dismounted`);
                        })
                    )
                )
        ),
        { description: 'Mounts and dismounts entities.', ...CHEATS }
    );

    registry.register(
        lit('attribute').then(
            arg('target', entityArgument()).then(
                arg('attribute', resourceArgument('minecraft:attribute'))
                    .then(
                        lit('get').executes(
                            command((context) => {
                                const current = source(context);
                                const entity = selectOne(current, value(context, 'target'));
                                const found = current.host.entities.getAttributeValue(
                                    entity,
                                    value(context, 'attribute')
                                );
                                if (found === undefined) return report(current, 0, 'The entity has no such attribute');
                                current.sendFeedback(`${entity.name} has ${found}`);
                                return Math.trunc(found);
                            })
                        )
                    )
                    .then(
                        lit('base')
                            .then(
                                lit('get').executes(
                                    command((context) => {
                                        const current = source(context);
                                        const entity = selectOne(current, value(context, 'target'));
                                        const found = current.host.entities.getAttributeBase(
                                            entity,
                                            value(context, 'attribute')
                                        );
                                        if (found === undefined) {
                                            return report(current, 0, 'The entity has no such attribute');
                                        }
                                        current.sendFeedback(`${entity.name} has a base of ${found}`);
                                        return Math.trunc(found);
                                    })
                                )
                            )
                            .then(
                                lit('set').then(
                                    arg('value', floatArgument()).executes(
                                        command((context) => {
                                            const current = source(context);
                                            const entity = selectOne(current, value(context, 'target'));
                                            const set = current.host.entities.setAttributeBase(
                                                entity,
                                                value(context, 'attribute'),
                                                value(context, 'value')
                                            );
                                            return report(current, set ? 1 : 0, 'Set the attribute base');
                                        })
                                    )
                                )
                            )
                    )
                    .then(
                        lit('modifier')
                            .then(
                                lit('add').then(
                                    arg('id', stringArgument()).then(
                                        arg('value', floatArgument()).then(
                                            arg(
                                                'operation',
                                                enumArgument('AttributeOperation', ATTRIBUTE_OPERATIONS)
                                            ).executes(
                                                command((context) => {
                                                    const current = source(context);
                                                    const entity = selectOne(current, value(context, 'target'));
                                                    const added = current.host.entities.addAttributeModifier(
                                                        entity,
                                                        value(context, 'attribute'),
                                                        value(context, 'id'),
                                                        value(context, 'value'),
                                                        value(context, 'operation')
                                                    );
                                                    return report(current, added ? 1 : 0, 'Added the modifier');
                                                })
                                            )
                                        )
                                    )
                                )
                            )
                            .then(
                                lit('remove').then(
                                    arg('id', stringArgument()).executes(
                                        command((context) => {
                                            const current = source(context);
                                            const entity = selectOne(current, value(context, 'target'));
                                            const removed = current.host.entities.removeAttributeModifier(
                                                entity,
                                                value(context, 'attribute'),
                                                value(context, 'id')
                                            );
                                            return report(current, removed ? 1 : 0, 'Removed the modifier');
                                        })
                                    )
                                )
                            )
                            .then(
                                lit('value').then(
                                    lit('get').then(
                                        arg('id', stringArgument()).executes(
                                            command((context) => {
                                                const current = source(context);
                                                const entity = selectOne(current, value(context, 'target'));
                                                const found = current.host.entities.getAttributeModifier(
                                                    entity,
                                                    value(context, 'attribute'),
                                                    value(context, 'id')
                                                );
                                                if (found === undefined) {
                                                    return report(current, 0, 'The entity has no such modifier');
                                                }
                                                current.sendFeedback(`The modifier is ${found}`);
                                                return Math.trunc(found);
                                            })
                                        )
                                    )
                                )
                            )
                    )
            )
        ),
        { description: 'Reads and writes entity attributes.', ...CHEATS }
    );

    registry.register(
        lit('tag').then(
            arg('targets', entityArgument())
                .then(
                    lit('add').then(arg('name', stringArgument()).executes(command((context) => tag(context, 'add'))))
                )
                .then(
                    lit('remove').then(
                        arg('name', stringArgument()).executes(command((context) => tag(context, 'remove')))
                    )
                )
                .then(
                    lit('list').executes(
                        command((context) => {
                            const current = source(context);
                            const tags = new Set(
                                select(current, value(context, 'targets')).flatMap((entity) =>
                                    current.host.entities.listTags(entity)
                                )
                            );
                            return report(current, tags.size, `The entities have ${tags.size} tags`);
                        })
                    )
                )
        ),
        { description: 'Adds, removes and lists entity tags.', ...CHEATS }
    );
};

const teleportTo = (context: Context, withRotation: 'rotation' | undefined): number => {
    const current = source(context);
    const position = resolvePosition(value(context, 'position'), current);
    const targets = select(current, value(context, 'targets'));
    const moved = targets.filter((entity) =>
        current.host.entities.teleport(
            entity,
            position,
            withRotation === undefined
                ? entity.rotation
                : resolveRotation(value(context, 'yaw'), value(context, 'pitch'), current),
            current.dimension
        )
    ).length;
    return report(current, moved, `Teleported ${moved} entities`);
};

const damage = (context: Context, damageType: string): number => {
    const current = source(context);
    const amount = value<number>(context, 'amount');
    const hurt = select(current, value(context, 'target')).filter((entity) =>
        current.host.entities.damage(entity, amount, damageType, current.entity)
    ).length;
    return report(current, hurt, `Damaged ${hurt} entities`);
};

const giveEffect = (context: Context, seconds: number, amplifier: number, hideParticles: boolean): number => {
    const current = source(context);
    const effect = value<string>(context, 'effect');
    const affected = select(current, value(context, 'targets')).filter((entity) =>
        current.host.entities.addEffect(entity, effect, seconds, amplifier, hideParticles)
    ).length;
    return report(current, affected, `Applied ${effect} to ${affected} entities`);
};

const enchant = (context: Context, level: number): number => {
    const current = source(context);
    const enchantment = value<string>(context, 'enchantment');
    const enchanted = select(current, value(context, 'targets')).filter((entity) =>
        current.host.entities.enchant(entity, enchantment, level)
    ).length;
    return report(current, enchanted, `Enchanted ${enchanted} entities`);
};

const give = (context: Context, amount: number, data: number): number => {
    const current = source(context);
    const item = value<string>(context, 'item');
    const given = select(current, value(context, 'targets')).reduce(
        (total, entity) => total + current.host.entities.giveItem(entity, item, amount, data),
        0
    );
    return report(current, given, `Gave ${given} items`);
};

const clear = (context: Context, item: string | undefined, maxCount: number): number => {
    const current = source(context);
    const targets = context.getNodes().some((node) => node.getNode().getName() === 'targets')
        ? select(current, value(context, 'targets'))
        : current.entity === undefined
          ? []
          : [current.entity];
    const removed = targets.reduce(
        (total, entity) => total + current.host.entities.clearItems(entity, item, undefined, maxCount),
        0
    );
    return report(current, removed, `Removed ${removed} items`);
};

const changeExperience = (context: Context): number => {
    const current = source(context);
    const amount = value<number>(context, 'amount');
    const unit = value<'levels' | 'points'>(context, 'unit');
    const players = select(current, value(context, 'targets'));
    for (const player of players) current.host.entities.changeExperience(player, amount, unit);
    return report(current, players.length, `Gave ${amount} ${unit} to ${players.length} players`);
};

const tag = (context: Context, action: 'add' | 'remove'): number => {
    const current = source(context);
    const name = value<string>(context, 'name');
    const changed = select(current, value(context, 'targets')).filter((entity) =>
        action === 'add' ? current.host.entities.addTag(entity, name) : current.host.entities.removeTag(entity, name)
    ).length;
    return report(current, changed, `${action === 'add' ? 'Added' : 'Removed'} the tag on ${changed} entities`);
};
