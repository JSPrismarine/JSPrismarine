import type { Vector3 } from '@jsprismarine/math';
import { getGametypeName } from '@jsprismarine/minecraft';

import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';

/** What a selector reads of an entity: its id, its type, its name and where it is. */
export interface SelectorEntity {
    getRuntimeId(): bigint;
    getType(): string;
    getName(): string;
    getPosition(): Vector3;
}

/** What a selector reads of a player beyond what every entity has: the game mode `m=` compares. */
interface SelectedPlayer {
    readonly gamemode: number;
}

/** Whether an entity is a player, by its type, which every kind of player answers the same. */
const isPlayer = <T extends SelectorEntity>(entity: T): entity is T & SelectedPlayer =>
    entity.getType() === PLAYER_IDENTIFIER;

/**
 * The candidate nearest the source, other than the source itself, as a list of one. The first of
 * those within a hundred-thousandth of a block of the nearest wins a tie. With no candidate the
 * one entry is undefined, which is what `@p` has always answered then.
 */
const nearestTo = <T extends SelectorEntity>(source: T, candidates: readonly T[]): T[] => {
    const at = source.getPosition();
    const others = candidates.filter((entity) => entity.getRuntimeId() !== source.getRuntimeId());
    const distances = others.map((entity) => {
        const position = entity.getPosition();
        return Math.hypot(position.getX() - at.getX(), position.getY() - at.getY(), position.getZ() - at.getZ());
    });
    const closest = Math.min(...distances);
    return [others.find((_entity, index) => distances[index]! - closest < 0.00001)!];
};

const SORTS = ['nearest', 'furthest', 'random', 'arbitrary'] as const;
type Sort = (typeof SORTS)[number];
const isSort = (value: string): value is Sort => SORTS.some((sort) => sort === value);

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
 */
const ParseTargetSelector = <T extends SelectorEntity>({
    input,
    entities,
    source,
    random = Math.random
}: {
    input: string;
    entities: T[];
    source: T;
    /** Random draw for `@r`, supplied by the live server during command execution. */
    random?: () => number;
}): T[] => {
    if (!input.startsWith('@')) throw new Error('input does not start with "@"');

    let targets: T[] = entities;

    // Get input without the at symbol
    const str = input.slice(1, input.length);

    // Type is always after the `a` symbol and always before the optional arguments
    const type = str.split('[')[0];

    // Parse comma-separated arguments in the following format:
    // [arg=val,arg2=val2,arg3=val3]
    const argumentList = str.split('[')[1]?.split(']')[0];
    const args =
        argumentList?.split(',').map((arg) => ({
            argument: arg.split('=')[0],
            value: arg.split('=')[1]!.replace('!', ''),
            reverse: arg.split('=')[1]!.startsWith('!')
        })) ?? [];

    // Filters
    let limit = Number.MAX_SAFE_INTEGER,
        sort: Sort;

    // Apply filters based on type
    switch (type) {
        case 'a':
            targets = targets.filter(isPlayer);
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
                        isPlayer(entity) &&
                        (filter.reverse
                            ? getGametypeName(entity.gamemode).toLowerCase() !== filter.value.toLowerCase()
                            : getGametypeName(entity.gamemode).toLowerCase() === filter.value.toLowerCase())
                );
                break;

            case 'sort':
                if (isSort(filter.value)) sort = filter.value;
                break;

            case 'c': // Bedrock
            case 'limit': // Java
                limit = Number.parseInt(filter.value, 10);
                break;

            default:
                break;
        }
    });

    switch (sort) {
        case 'nearest':
            targets = nearestTo(source, targets.filter(isPlayer));
            break;
        case 'random':
            // FIXME: respect limit filter
            targets = [targets[Math.floor(random() * targets.length)]!];
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
