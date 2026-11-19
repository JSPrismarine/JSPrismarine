/**
 * `/tickingarea`: keeps chunks loaded and ticking with no player near.
 *
 * The tree follows Bedrock's eight overloads in `bedrockCommands.json`: `add` by two corners or
 * as a circle, `remove` by position or name, `remove_all`, `list` with or without
 * `all-dimensions`, and `preload` by position or name. A circle covers the square of chunks
 * around its center chunk, `radius` chunks out, which holds every chunk the circle reaches. The
 * host keeps the areas; on a host without ticking areas the command fails.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import { blockPositionArgument, enumArgument, integerArgument, stringArgument } from '../argumentTypes';
import type { CommandSource, TickingAreaCommandHost, Vector3 } from '../host';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import { arg, command, lit, report, resolvePosition, source, value } from './support';

/** The most chunks out a circle reaches, as Bedrock's command takes it. */
const MAX_CIRCLE_RADIUS = 4;

/** Runs a verb over the host's ticking areas, or fails where the host keeps none. */
const withAreas = (current: CommandSource, run: (areas: TickingAreaCommandHost) => number): number => {
    const host = current.host.world.tickingAreas;
    return host === undefined ? report(current, 0, 'This server keeps no ticking areas') : run(host);
};

const add = (context: Context, from: Vector3, to: Vector3, named: boolean, preloadKey: boolean): number => {
    const current = source(context);
    const name = named ? value<string>(context, 'name') : undefined;
    const preload = preloadKey && value<string>(context, 'preload') === 'true';
    return withAreas(current, (areas) => {
        const added = areas.add(current.dimension, from, to, name, preload);
        if (added === 'in-use') return report(current, 0, `A ticking area named ${name ?? ''} already exists`);
        if (added === 'limit') return report(current, 0, 'The maximum number of ticking areas has been reached');
        return report(
            current,
            1,
            `Added ticking area ${added} from ${from.x}, ${from.y}, ${from.z} to ${to.x}, ${to.y}, ${to.z}`
        );
    });
};

const addBox = (context: Context, named: boolean, preload: boolean): number => {
    const current = source(context);
    return add(
        context,
        resolvePosition(value(context, 'from'), current),
        resolvePosition(value(context, 'to'), current),
        named,
        preload
    );
};

const addCircle = (context: Context, named: boolean, preload: boolean): number => {
    const current = source(context);
    const center = resolvePosition(value(context, 'center'), current);
    const reach = value<number>(context, 'radius') * 16;
    return add(
        context,
        { x: center.x - reach, y: center.y, z: center.z - reach },
        { x: center.x + reach, y: center.y, z: center.z + reach },
        named,
        preload
    );
};

/** What a `remove` or `preload` names: the areas of a name, or the ones over a position. */
const targetOf = (context: Context, by: 'name' | 'position') => {
    const current = source(context);
    return by === 'name'
        ? { name: value<string>(context, 'name') }
        : { position: resolvePosition(value(context, 'position'), current) };
};

const remove = (context: Context, by: 'name' | 'position'): number => {
    const current = source(context);
    return withAreas(current, (areas) => {
        const removed = areas.remove(current.dimension, targetOf(context, by));
        if (removed.length === 0) return report(current, 0, 'No ticking area matches');
        return report(current, removed.length, `Removed ticking area ${removed.join(', ')}`);
    });
};

const preload = (context: Context, by: 'name' | 'position', given: boolean): number => {
    const current = source(context);
    const wanted = given ? value<string>(context, 'preload') === 'true' : true;
    return withAreas(current, (areas) => {
        const changed = areas.setPreload(current.dimension, targetOf(context, by), wanted);
        if (changed.length === 0) return report(current, 0, 'No ticking area matches');
        return report(current, changed.length, `Set ticking area ${changed.join(', ')} to preload ${wanted}`);
    });
};

const list = (context: Context, everywhere: boolean): number => {
    const current = source(context);
    return withAreas(current, (areas) => {
        const found = areas.list(everywhere ? undefined : current.dimension);
        if (found.length === 0) return report(current, 1, 'There are no ticking areas');
        const lines = found.map(
            (area) =>
                `- ${area.name}: ${area.from.x} ${area.from.y} ${area.from.z} to ${area.to.x} ${area.to.y} ${area.to.z}` +
                (everywhere ? ` in ${area.dimension}` : '')
        );
        return report(current, 1, ['Ticking areas:', ...lines].join('\n'));
    });
};

const BOOLEAN = ['true', 'false'] as const;

/**
 * Registers `/tickingarea`.
 * @param registry - The registry the vanilla commands go into.
 */
export const registerTickingArea = (registry: CommandRegistry<CommandSource>): void => {
    const named = (run: (context: Context, named: boolean, preload: boolean) => number) =>
        arg('name', stringArgument())
            .executes(command((context) => run(context, true, false)))
            .then(
                arg('preload', enumArgument('Boolean', BOOLEAN)).executes(
                    command((context) => run(context, true, true))
                )
            );
    registry.register(
        lit('tickingarea')
            .then(
                lit('add')
                    .then(
                        arg('from', blockPositionArgument()).then(
                            arg('to', blockPositionArgument())
                                .executes(command((context) => addBox(context, false, false)))
                                .then(named(addBox))
                        )
                    )
                    .then(
                        lit('circle').then(
                            arg('center', blockPositionArgument()).then(
                                arg('radius', integerArgument({ min: 1, max: MAX_CIRCLE_RADIUS }))
                                    .executes(command((context) => addCircle(context, false, false)))
                                    .then(named(addCircle))
                            )
                        )
                    )
            )
            .then(
                lit('remove')
                    .then(
                        arg('position', blockPositionArgument()).executes(
                            command((context) => remove(context, 'position'))
                        )
                    )
                    .then(arg('name', stringArgument()).executes(command((context) => remove(context, 'name'))))
            )
            .then(
                lit('remove_all').executes(
                    command((context) => {
                        const current = source(context);
                        return withAreas(current, (areas) => {
                            const removed = areas.removeAll(current.dimension);
                            if (removed.length === 0) return report(current, 0, 'There are no ticking areas to remove');
                            return report(current, removed.length, `Removed ticking area ${removed.join(', ')}`);
                        });
                    })
                )
            )
            .then(
                lit('list')
                    .executes(command((context) => list(context, false)))
                    .then(lit('all-dimensions').executes(command((context) => list(context, true))))
            )
            .then(
                lit('preload')
                    .then(
                        arg('position', blockPositionArgument())
                            .executes(command((context) => preload(context, 'position', false)))
                            .then(
                                arg('preload', enumArgument('Boolean', BOOLEAN)).executes(
                                    command((context) => preload(context, 'position', true))
                                )
                            )
                    )
                    .then(
                        arg('name', stringArgument())
                            .executes(command((context) => preload(context, 'name', false)))
                            .then(
                                arg('preload', enumArgument('Boolean', BOOLEAN)).executes(
                                    command((context) => preload(context, 'name', true))
                                )
                            )
                    )
            ),
        {
            description: 'Add, remove, or list ticking areas.',
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            requiresCheats: true
        }
    );
};
