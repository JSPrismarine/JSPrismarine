import { asArray, asInteger, asObject, fail } from '../json';
import { normalizeIdentifier, typeNameOf } from '../registry';
import type { Direction, FluidKind } from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { isOutsideBuildHeight, offset as offsetPos } from '../world/FeatureWorld';
import { parseBlockState } from './blockStateProvider';
import type { VerticalAnchor } from './heightProvider';
import { parseVerticalAnchor, resolveAnchor } from './heightProvider';

/**
 * A test on one world position, Java's `BlockPredicate`.
 *
 * Predicates gate placement (`block_predicate_filter`), stop a scan (`environment_scan`) and
 * decide what a feature may overwrite. They draw no randomness, so running one costs nothing
 * against the seed and a feature can test freely.
 */
export type BlockPredicate = (world: FeatureWorld, position: BlockPos) => boolean;

/** The sixteen types Java 26.3 registers in `block_predicate_type`. */
export type BlockPredicateTypeName =
    | 'matching_blocks'
    | 'matching_block_tag'
    | 'matching_fluids'
    | 'matching_biomes'
    | 'has_sturdy_face'
    | 'solid'
    | 'replaceable'
    | 'would_survive'
    | 'inside_world_bounds'
    | 'any_of'
    | 'all_of'
    | 'not'
    | 'true'
    | 'unobstructed'
    | 'height_range'
    | 'volume_match';

/** The predicate that accepts everything, which several optional fields default to. */
export const alwaysTrue: BlockPredicate = () => true;

const ZERO_OFFSET: readonly [number, number, number] = [0, 0, 0];

const parseOffset = (source: unknown, path: string): readonly [number, number, number] => {
    if (source === undefined) return ZERO_OFFSET;
    const values = asArray(source, path);
    if (values.length !== 3) return fail(path, `expected three integers, got ${values.length}`);
    return [asInteger(values[0], `${path}[0]`), asInteger(values[1], `${path}[1]`), asInteger(values[2], `${path}[2]`)];
};

const at = (position: BlockPos, [dx, dy, dz]: readonly [number, number, number]): BlockPos =>
    dx === 0 && dy === 0 && dz === 0 ? position : offsetPos(position, dx, dy, dz);

const DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east'] as const satisfies readonly Direction[];
const FLUID_NAMES = { 'minecraft:empty': 'empty', 'minecraft:water': 'water', 'minecraft:lava': 'lava' } as const;

const parseFluidName = (value: unknown, path: string): FluidKind => {
    const name = normalizeIdentifier(value, path);
    // Flowing fluids share their still fluid's identity for the purposes of this predicate.
    const resolved = name.replace('flowing_', '');
    if (resolved === 'minecraft:empty' || resolved === 'minecraft:water' || resolved === 'minecraft:lava') {
        return FLUID_NAMES[resolved];
    }
    return fail(path, `unknown fluid ${JSON.stringify(name)}`);
};

const parseNameList = (source: unknown, path: string): readonly string[] => {
    if (typeof source === 'string') {
        return source.startsWith('#') ? [] : [normalizeIdentifier(source, path)];
    }
    return asArray(source, path).map((entry, index) => normalizeIdentifier(entry, `${path}[${index}]`));
};

/**
 * Reads a `block_predicate_type` document.
 *
 * `matching_blocks`, `matching_fluids` and `matching_biomes` accept a `#tag` reference as well as
 * a list, which this resolves through {@link FeatureWorld.blocks} rather than at parse time, so a
 * predicate stays usable when tag data changes.
 */
export const parseBlockPredicate = (source: unknown, path: string): BlockPredicate => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'true':
            return alwaysTrue;

        case 'not': {
            const inner = parseBlockPredicate(raw['predicate'], `${path}.predicate`);
            return (world, position) => !inner(world, position);
        }

        case 'all_of': {
            const inner = parsePredicateList(raw['predicates'], `${path}.predicates`);
            return (world, position) => inner.every((predicate) => predicate(world, position));
        }

        case 'any_of': {
            const inner = parsePredicateList(raw['predicates'], `${path}.predicates`);
            return (world, position) => inner.some((predicate) => predicate(world, position));
        }

        case 'matching_blocks': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            const blocksField = raw['blocks'];
            const tag =
                typeof blocksField === 'string' && blocksField.startsWith('#')
                    ? normalizeIdentifier(blocksField.slice(1), `${path}.blocks`)
                    : undefined;
            const names = new Set(parseNameList(blocksField, `${path}.blocks`));
            return (world, position) => {
                const state = world.getBlock(at(position, delta));
                return tag === undefined ? names.has(state.name) : world.blocks.hasTag(state, tag);
            };
        }

        case 'matching_block_tag': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            const tag = normalizeIdentifier(raw['tag'], `${path}.tag`);
            return (world, position) => world.blocks.hasTag(world.getBlock(at(position, delta)), tag);
        }

        case 'matching_fluids': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            const fluidsField = raw['fluids'];
            const wanted = new Set(
                (typeof fluidsField === 'string' ? [fluidsField] : asArray(fluidsField, `${path}.fluids`)).map(
                    (entry, index) => parseFluidName(entry, `${path}.fluids[${index}]`)
                )
            );
            return (world, position) => wanted.has(world.blocks.fluid(world.getBlock(at(position, delta))));
        }

        case 'matching_biomes': {
            const biomesField = raw['biomes'];
            const tag =
                typeof biomesField === 'string' && biomesField.startsWith('#')
                    ? normalizeIdentifier(biomesField.slice(1), `${path}.biomes`)
                    : undefined;
            const names = new Set(parseNameList(biomesField, `${path}.biomes`));
            // A biome tag needs the biome registry, which this package does not hold. Membership
            // is therefore exact-name only, and a tag reference matches nothing rather than
            // everything. No vanilla feature uses this predicate.
            return (world, position) => tag === undefined && names.has(world.getBiome(position));
        }

        case 'has_sturdy_face': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            const direction = parseDirection(raw['direction'], `${path}.direction`);
            return (world, position) => {
                const target = at(position, delta);
                return world.blocks.isSturdy(world.getBlock(target), direction);
            };
        }

        case 'solid': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            return (world, position) => world.blocks.isSolid(world.getBlock(at(position, delta)));
        }

        case 'replaceable': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            return (world, position) => world.blocks.isReplaceable(world.getBlock(at(position, delta)));
        }

        case 'would_survive': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            const state = parseBlockState(raw['state'], `${path}.state`);
            return (world, position) => world.blocks.canSurvive(world, at(position, delta), state);
        }

        case 'inside_world_bounds': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            return (world, position) => !isOutsideBuildHeight(world, at(position, delta).y);
        }

        case 'unobstructed': {
            const delta = parseOffset(raw['offset'], `${path}.offset`);
            // Java asks whether an entity-sized box at the position collides with anything. That
            // needs the entity list, which decoration does not have here, so the oracle answers
            // when it can and the predicate passes when it cannot. No vanilla feature uses it.
            return (world, position) => world.blocks.isUnobstructed?.(world, at(position, delta)) ?? true;
        }

        case 'height_range': {
            const min = parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`);
            const max = parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`);
            return (world, position) => inRange(world, position, min, max);
        }

        case 'volume_match': {
            const min = parseOffset(raw['min'], `${path}.min`);
            const max = parseOffset(raw['max'], `${path}.max`);
            const match = parseBlockPredicate(raw['match'], `${path}.match`);
            return (world, position) => {
                for (let dx = min[0]; dx <= max[0]; dx++) {
                    for (let dz = min[2]; dz <= max[2]; dz++) {
                        for (let dy = min[1]; dy <= max[1]; dy++) {
                            if (!match(world, offsetPos(position, dx, dy, dz))) return false;
                        }
                    }
                }
                return true;
            };
        }

        default:
            return fail(path, `unknown block predicate type ${JSON.stringify(type)}`);
    }
};

const inRange = (world: FeatureWorld, position: BlockPos, min: VerticalAnchor, max: VerticalAnchor): boolean =>
    position.y >= resolveAnchor(min, world) && position.y <= resolveAnchor(max, world);

const parsePredicateList = (source: unknown, path: string): BlockPredicate[] =>
    asArray(source, path).map((entry, index) => parseBlockPredicate(entry, `${path}[${index}]`));

/** Reads a `Direction`. */
export const parseDirection = (value: unknown, path: string): Direction => {
    if (typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value)) {
        // The membership test narrows the string to the Direction union.
        return value as Direction;
    }
    return fail(path, `expected a direction, got ${JSON.stringify(value)}`);
};
