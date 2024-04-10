import type { Entity } from '../entity/Entity';
import type Player from '../Player';

/**
 * Parse target selector argument.
 *
 * @remarks
 * A target selector is made up of 3 parts:
 *
 * - First there's the `@` (at symbol) part,
 * notifying us that this is in fact a target selector
 *
 * - Secondly there's the target selector type (`a`, `e`, `p`, `r`, `s`),
 * this specifies what kind of entities we should query for
 * and in what way.
 *
 * - Thirdly there's the arguments,
 * they are split up in a comma-separated list in the
 * argument=value format.
 *
 * This results in an input similar to:
 * `@e[type=player,gamemode=creative,limit=3]`
 *
 * @returns The entities matching the target query
 *
 * @public
 */
const ParseTargetSelector = ({
    input,
    entities,
    source
}: {
    input: string;
    entities: Entity[];
    source: Entity;
}): Entity[] => {
    if (!input.startsWith('@')) throw new Error('input does not start with "@"');

    let targets: Entity[] = entities;

    // Get input without the at symbol
    const str = input.slice(1, input.length);

    // Type is always after the `a` symbol and always before the optional arguments
    const type: 'a' | 'e' | 'p' | 'r' | 's' = str.split('[')[0] as any;

    // Parse comma-separated arguments in the following format:
    // [arg=val,arg2=val2,arg3=val3]
    const args =
        str
            .split('[')[1]
            ?.split(']')[0]!
            .split(',')
            .map((arg) => ({
                argument: arg.split('=')[0],
                value: arg.split('=')[1]!.replace('!', ''),
                reverse: arg.split('=')[1]!.startsWith('!')
            })) || [];

    // Filters
    let limit = Number.MAX_SAFE_INTEGER,
        sort: 'nearest' | 'furthest' | 'random' | 'arbitrary';

    // Apply filters based on type
    switch (type) {
        case 'a':
            targets = targets.filter((entity) => entity.isPlayer());
            sort = 'arbitrary';
            break;
        case 'e':
            sort = 'arbitrary';
            break;
        case 'p':
            limit = 1;
            sort = 'nearest';
            break;
        case 'r':
            limit = 1;
            sort = 'random';
            break;
        case 's':
            limit = 1;
            sort = 'arbitrary';
            targets = [source];
            break;
        default:
            throw new Error(`type "${type}" is invalid. Expected "a", "e", "p", "r" or "s"`);
    }

    args.forEach((filter) => {
        switch (filter.argument) {
            case 'type':
                if (filter.value.split(':').length === 1)
                    targets = targets.filter((entity) =>
                        filter.reverse
                            ? entity.getType().split(':')[1] !== filter.value
                            : entity.getType().split(':')[1] === filter.value
                    );
                else
                    targets = targets.filter((entity) =>
                        filter.reverse ? entity.getType() !== filter.value : entity.getType() === filter.value
                    );
                break;

            case 'name':
                targets = targets.filter((entity) =>
                    filter.reverse ? entity.getName() !== filter.value : entity.getName() === filter.value
                );
                break;

            case 'm': // Bedrock
            case 'gamemode': // Java
                targets = targets.filter(
                    (entity) =>
                        entity.isPlayer() &&
                        (filter.reverse
                            ? (entity as Player).getGamemode() !== filter.value
                            : (entity as Player).getGamemode() === filter.value)
                );
                break;

            case 'sort':
                sort = filter.value as any;
                break;

            case 'c': // Bedrock
            case 'limit': // Java
                limit = Number.parseInt(filter.value as any, 10);
                break;

            default:
                break;
        }
    });

    switch (sort) {
        case 'nearest':
            targets = source.getNearestEntity(targets.filter((entity) => entity.isPlayer()));
            break;
        case 'random':
            // FIXME: respect limit filter
            targets = [targets[Math.floor(Math.random() * targets.length)]!];
            break;
        // TODO: case 'arbitrary':
        default:
            break;
    }

    targets = targets.slice(0, limit);
    if (targets.length <= 0) throw new Error('no results');
    return targets;
};

export default ParseTargetSelector;
