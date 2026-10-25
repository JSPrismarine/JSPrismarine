/**
 * The Bedrock commands Java has no counterpart for.
 *
 * Java 26.3 and Bedrock 1.26.50 share 46 command names, and the ones here are
 * among Bedrock's other 38. Four of them are older spellings of something Java
 * says differently - `/testfor` is `execute if entity`, `/testforblock` is
 * `execute if block`, `/testforblocks` is `execute if blocks`, `/daylock` is
 * `gamerule doDaylightCycle` - and a Bedrock player types the short form, so
 * the short form runs the same host verbs rather than a second implementation.
 *
 * `/replaceitem` is Bedrock's `/item replace`, which Java renamed in 1.17 and
 * Bedrock kept. `/titleraw` is `/title` over a `rawtext` object and lives in
 * `server.ts` beside it, because the two share a tree.
 *
 * `/camerashake`, `/fog` and `/playanimation` have no gameplay rule behind
 * them at all: each asks the client to draw something, and the server's whole
 * part is the packet. They are here because a Bedrock operator expects them and
 * because the packets are the entire behavior, so nothing about them is
 * approximated.
 *
 * Every tree follows the overload list in `mojang-commands.json`, including the
 * enum names, so the client autocompletes each one the way it autocompletes
 * Mojang's own.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    blockPositionArgument,
    blockStatesArgument,
    entityArgument,
    enumArgument,
    floatArgument,
    integerArgument,
    resourceArgument,
    stringArgument
} from '../argumentTypes';
import { gameRule } from '../gamerules';
import type { CommandSource } from '../host';
import type { CommandRegistry } from '../tree';
import { registerTitleRaw } from './server';
import type { Context } from './support';
import { arg, command, lit, report, resolvePosition, select, source, value } from './support';
import { parseBlockStates } from './world';

const CHEATS = {
    permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
    requiresCheats: true
} as const;

/** The gamerule `/daylock` is a shorthand for, resolved once rather than spelled twice. */
const DAYLIGHT_CYCLE = gameRule('doDaylightCycle')?.name ?? 'minecraft:advance_time';

/**
 * The slots `/replaceitem entity` addresses, as Mojang's `EntityEquipmentSlot`
 * enum lists them.
 */
export const ENTITY_EQUIPMENT_SLOTS = [
    'slot.weapon.mainhand',
    'slot.weapon.offhand',
    'slot.armor.head',
    'slot.armor.chest',
    'slot.armor.legs',
    'slot.armor.feet',
    'slot.armor.body',
    'slot.hotbar',
    'slot.inventory',
    'slot.enderchest',
    'slot.saddle',
    'slot.armor',
    'slot.chest',
    'slot.equippable'
] as const;

/** Registers the nine Bedrock-only commands. */
export const registerBedrockCommands = (registry: CommandRegistry<CommandSource>): void => {
    registry.register(
        lit('testfor').then(
            arg('victim', entityArgument()).executes(
                command((context) => {
                    const current = source(context);
                    const found = select(current, value(context, 'victim'));
                    return report(current, found.length, `Found ${found.length} entities`);
                })
            )
        ),
        { description: 'Counts entities matching specified conditions.', ...CHEATS }
    );

    registry.register(
        lit('testforblock').then(
            arg('position', blockPositionArgument()).then(
                arg('tileName', resourceArgument('minecraft:block'))
                    .executes(command((context) => testForBlock(context, undefined)))
                    .then(
                        arg('blockStates', blockStatesArgument()).executes(
                            command((context) => testForBlock(context, 'blockStates'))
                        )
                    )
            )
        ),
        { description: 'Tests whether a certain block is in a specific location.', ...CHEATS }
    );

    registry.register(
        lit('testforblocks').then(
            arg('begin', blockPositionArgument()).then(
                arg('end', blockPositionArgument()).then(
                    arg('destination', blockPositionArgument())
                        .executes(command((context) => testForBlocks(context, false)))
                        .then(
                            arg('mode', enumArgument('TestForBlocksMode', ['masked', 'all'] as const)).executes(
                                command((context) =>
                                    testForBlocks(context, value<string>(context, 'mode') === 'masked')
                                )
                            )
                        )
                )
            )
        ),
        { description: 'Tests whether the blocks in two regions match.', ...CHEATS }
    );

    registry.register(
        lit('daylock')
            .executes(command((context) => daylock(context, true)))
            .then(
                arg('lock', enumArgument('Boolean', ['true', 'false'] as const)).executes(
                    command((context) => daylock(context, value<string>(context, 'lock') === 'true'))
                )
            ),
        { description: 'Locks and unlocks the day-night cycle.', ...CHEATS }
    );

    registerTitleRaw(registry);

    registry.register(
        lit('replaceitem').then(
            lit('entity').then(
                arg('target', entityArgument()).then(
                    arg('slotType', enumArgument('EntityEquipmentSlot', ENTITY_EQUIPMENT_SLOTS)).then(
                        arg('slotId', integerArgument({ min: 0 }))
                            .then(
                                arg('itemName', resourceArgument('minecraft:item'))
                                    .executes(command((context) => replaceItem(context, 'replace', 1)))
                                    .then(
                                        arg('amount', integerArgument({ min: 1 })).executes(
                                            command((context) =>
                                                replaceItem(context, 'replace', value<number>(context, 'amount'))
                                            )
                                        )
                                    )
                            )
                            .then(
                                arg('oldItemHandling', enumArgument('ReplaceMode', ['destroy', 'keep'] as const)).then(
                                    arg('itemName', resourceArgument('minecraft:item'))
                                        .executes(
                                            command((context) =>
                                                replaceItem(context, value(context, 'oldItemHandling'), 1)
                                            )
                                        )
                                        .then(
                                            arg('amount', integerArgument({ min: 1 })).executes(
                                                command((context) =>
                                                    replaceItem(
                                                        context,
                                                        value(context, 'oldItemHandling'),
                                                        value<number>(context, 'amount')
                                                    )
                                                )
                                            )
                                        )
                                )
                            )
                    )
                )
            )
        ),
        { description: 'Replaces items in inventories.', ...CHEATS }
    );

    registry.register(
        lit('camerashake')
            .then(
                lit('add').then(
                    arg('player', entityArgument())
                        .executes(command((context) => shake(context, 1, 1, 'positional')))
                        .then(
                            arg('intensity', floatArgument({ min: 0, max: 4 }))
                                .executes(
                                    command((context) => shake(context, value(context, 'intensity'), 1, 'positional'))
                                )
                                .then(
                                    arg('seconds', floatArgument({ min: 0 }))
                                        .executes(
                                            command((context) =>
                                                shake(
                                                    context,
                                                    value(context, 'intensity'),
                                                    value(context, 'seconds'),
                                                    'positional'
                                                )
                                            )
                                        )
                                        .then(
                                            arg(
                                                'shakeType',
                                                enumArgument('CameraShakeType', ['positional', 'rotational'] as const)
                                            ).executes(
                                                command((context) =>
                                                    shake(
                                                        context,
                                                        value(context, 'intensity'),
                                                        value(context, 'seconds'),
                                                        value(context, 'shakeType')
                                                    )
                                                )
                                            )
                                        )
                                )
                        )
                )
            )
            .then(
                lit('stop').then(
                    arg('player', entityArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const shaken = current.host.server.shakeCamera(select(current, value(context, 'player')), {
                                action: 'stop',
                                intensity: 0,
                                seconds: 0,
                                shakeType: 'positional'
                            });
                            return report(current, shaken, `Stopped the shake for ${shaken} players`);
                        })
                    )
                )
            ),
        { description: "Applies shaking to the players' camera.", ...CHEATS }
    );

    // Literals rather than one `mode` argument: Brigadier keys argument nodes
    // by name, so two siblings both called `mode` would collapse into one and
    // only the first spelling would parse. The flattener folds sibling literals
    // whose continuations match back into one enum, which is how `pop` and
    // `remove` reach the client as the pair Mojang spells `Delete`.
    registry.register(
        lit('fog').then(
            arg('victim', entityArgument())
                .then(
                    lit('push').then(
                        arg('fogId', stringArgument()).then(
                            arg('userProvidedId', stringArgument()).executes(
                                command((context) => {
                                    const current = source(context);
                                    const changed = current.host.server.setFog(
                                        select(current, value(context, 'victim')),
                                        {
                                            mode: 'push',
                                            fogId: value(context, 'fogId'),
                                            userId: value(context, 'userProvidedId')
                                        }
                                    );
                                    return report(current, changed, `Pushed the fog for ${changed} players`);
                                })
                            )
                        )
                    )
                )
                .then(
                    lit('pop').then(
                        arg('userProvidedId', stringArgument()).executes(command((context) => fog(context, 'pop')))
                    )
                )
                .then(
                    lit('remove').then(
                        arg('userProvidedId', stringArgument()).executes(command((context) => fog(context, 'remove')))
                    )
                )
        ),
        { description: 'Adds or removes fog settings.', ...CHEATS }
    );

    registry.register(
        lit('playanimation').then(
            arg('entity', entityArgument()).then(
                arg('animation', stringArgument())
                    .executes(command((context) => animate(context, 0)))
                    .then(
                        arg('next_state', stringArgument())
                            .executes(command((context) => animate(context, 1)))
                            .then(
                                arg('blend_out_time', floatArgument({ min: 0 }))
                                    .executes(command((context) => animate(context, 2)))
                                    .then(
                                        arg('stop_expression', stringArgument())
                                            .executes(command((context) => animate(context, 3)))
                                            .then(
                                                arg('controller', stringArgument()).executes(
                                                    command((context) => animate(context, 4))
                                                )
                                            )
                                    )
                            )
                    )
            )
        ),
        { description: 'Makes one or more entities play a one-off animation.', ...CHEATS }
    );
};

const testForBlock = (context: Context, statesKey: string | undefined): number => {
    const current = source(context);
    const at = resolvePosition(value(context, 'position'), current);
    const found = current.host.world.getBlock(current.dimension, at);
    if (found === undefined) return report(current, 0, 'That chunk is not loaded');

    if (found.identifier !== value<string>(context, 'tileName')) {
        return report(current, 0, `The block is ${found.identifier}`);
    }

    // A state the line does not name is not compared, which is what lets
    // `/testforblock ~ ~ ~ oak_stairs` match a stair facing any way.
    if (statesKey !== undefined) {
        const wanted = parseBlockStates(value<string>(context, statesKey));
        for (const [name, expected] of Object.entries(wanted)) {
            if (String(found.states[name]) !== expected) return report(current, 0, `The ${name} state does not match`);
        }
    }

    return report(current, 1, `Found the block at ${at.x}, ${at.y}, ${at.z}`);
};

const testForBlocks = (context: Context, masked: boolean): number => {
    const current = source(context);
    const matching = current.host.world.compareRegions(
        current.dimension,
        resolvePosition(value(context, 'begin'), current),
        resolvePosition(value(context, 'end'), current),
        resolvePosition(value(context, 'destination'), current),
        masked
    );
    return report(current, matching, `${matching} blocks match`);
};

const daylock = (context: Context, lock: boolean): number => {
    const current = source(context);
    // Locking the day is turning the cycle *off*, which is the one thing about
    // this command that reads backwards.
    const set = current.host.world.setGameRule(DAYLIGHT_CYCLE, !lock);
    return report(current, set ? 1 : 0, `${lock ? 'Locked' : 'Unlocked'} the day-night cycle`);
};

const replaceItem = (context: Context, mode: 'destroy' | 'keep' | 'replace', amount: number): number => {
    const current = source(context);
    const slot = { name: value<string>(context, 'slotType'), index: value<number>(context, 'slotId') };
    const item = value<string>(context, 'itemName');

    const replaced = select(current, value(context, 'target')).reduce(
        (total, entity) =>
            total +
            current.host.data.setSlot({ kind: 'entity', entity }, { ...slot, count: amount }, item, amount, mode),
        0
    );
    return report(current, replaced, `Replaced ${replaced} items`);
};

const fog = (context: Context, mode: 'pop' | 'remove'): number => {
    const current = source(context);
    const changed = current.host.server.setFog(select(current, value(context, 'victim')), {
        mode,
        userId: value(context, 'userProvidedId')
    });
    return report(current, changed, `Changed the fog for ${changed} players`);
};

const shake = (
    context: Context,
    intensity: number,
    seconds: number,
    shakeType: 'positional' | 'rotational'
): number => {
    const current = source(context);
    const shaken = current.host.server.shakeCamera(select(current, value(context, 'player')), {
        action: 'add',
        intensity,
        seconds,
        shakeType
    });
    return report(current, shaken, `Shook the camera of ${shaken} players`);
};

/**
 * `/playanimation`'s five growing overloads, built from how many optional
 * arguments the line carried.
 *
 * Read off the depth rather than from `context.getNodes()`, because the
 * arguments are positional and a later one is only present when every earlier
 * one is.
 */
const animate = (context: Context, given: number): number => {
    const current = source(context);
    const played = current.host.server.playAnimation(select(current, value(context, 'entity')), {
        animation: value(context, 'animation'),
        ...(given >= 1 ? { nextState: value<string>(context, 'next_state') } : {}),
        ...(given >= 2 ? { blendOutTime: value<number>(context, 'blend_out_time') } : {}),
        ...(given >= 3 ? { stopExpression: value<string>(context, 'stop_expression') } : {}),
        ...(given >= 4 ? { controller: value<string>(context, 'controller') } : {})
    });
    return report(current, played, `Played the animation on ${played} entities`);
};
