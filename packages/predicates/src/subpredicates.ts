import type { PredicateContext } from './context';
import type { ItemStack } from './item';
import { asArray, asBoolean, asList, asNumber, asString, isJsonObject, member, namespaced } from './json';
import type { JsonObject } from './json';
import type { ParseContext, SubPredicateParser } from './parse';
import { floatProviderAt, intProviderAt } from './providers';
import { resolveMembers } from './reference';
import type { ReferenceRegistry } from './reference';
import { ENTITY_FLAGS, EQUIPMENT_SLOTS } from './world';
import type {
    BlockEntityView,
    BlockState,
    DamageSource,
    EntityFlag,
    EntityView,
    EquipmentSlot,
    FluidState,
    Vec3
} from './world';

const isEntityFlag = (value: string): value is EntityFlag => ENTITY_FLAGS.some((known) => known === value);

const isEquipmentSlot = (value: string): value is EquipmentSlot => EQUIPMENT_SLOTS.some((known) => known === value);

/** Answers whether a number passes a range or exact check from the grammar. */
export type RangeTest = (value: number, context: PredicateContext) => boolean;

/** Answers whether one entity matches, where undefined means there is no such entity. */
export type EntityMatcher = (entity: EntityView | undefined, context: PredicateContext) => boolean;

/** Answers whether one item stack matches. */
export type ItemMatcher = (stack: ItemStack | undefined, context: PredicateContext) => boolean;

/** Answers whether a block state and its block entity match. */
export type BlockMatcher = (
    state: BlockState | undefined,
    blockEntity: BlockEntityView | undefined,
    context: PredicateContext
) => boolean;

/** Answers whether a fluid state matches. */
export type FluidMatcher = (state: FluidState | undefined, context: PredicateContext) => boolean;

/**
 * Answers whether a position matches. `block` overrides what the level would
 * report, which is how `stepping_on` checks the block under an entity.
 */
export type LocationMatcher = (position: Vec3 | undefined, context: PredicateContext, block?: BlockState) => boolean;

/** Answers whether a damage source matches. */
export type DamageSourceMatcher = (source: DamageSource | undefined, context: PredicateContext) => boolean;

const always = (): boolean => true;

const isRangeObject = (value: unknown): value is JsonObject =>
    isJsonObject(value) && !('type' in value) && ('min' in value || 'max' in value);

const range = (value: unknown, context: ParseContext, kind: 'int' | 'float'): RangeTest => {
    if (value === undefined || value === null) return always;

    const parse = kind === 'int' ? intProviderAt : floatProviderAt;
    if (isRangeObject(value)) {
        const low = 'min' in value ? parse(member(value, 'min'), context.at('min')) : undefined;
        const high = 'max' in value ? parse(member(value, 'max'), context.at('max')) : undefined;
        return (subject, evaluation) =>
            (low === undefined || subject >= low(evaluation)) && (high === undefined || subject <= high(evaluation));
    }

    const exact = parse(value, context);
    return (subject, evaluation) => subject === exact(evaluation);
};

/** Parses an int range: an exact int provider, or a `{min, max}` pair of them. */
export const intRange = (value: unknown, context: ParseContext): RangeTest => range(value, context, 'int');

/** Parses a float range: an exact float provider, or a `{min, max}` pair of them. */
export const floatRange = (value: unknown, context: ParseContext): RangeTest => range(value, context, 'float');

const memberTest = (
    value: unknown,
    registry: ReferenceRegistry,
    context: ParseContext
): ((id: string | undefined, tags?: readonly string[]) => boolean) => {
    const { ids, tags } = resolveMembers(value, registry, context);
    return (id, subjectTags) =>
        (id !== undefined && ids.has(id)) || tags.some((tag) => subjectTags?.includes(tag) ?? false);
};

const comparableProperty = (left: string, right: string): number => {
    const a = Number(left);
    const b = Number(right);
    if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
    return left < right ? -1 : left > right ? 1 : 0;
};

/**
 * Parses Java's state properties predicate: a map from property name to an
 * exact value or a `{min, max}` pair, compared numerically when both sides are
 * numbers and as text otherwise.
 */
export const statePropertiesTest = (
    value: unknown,
    context: ParseContext
): ((properties: Readonly<Record<string, string>> | undefined) => boolean) => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a state properties predicate must be an object');
        return always;
    }

    const matchers = Object.entries(value).map(([name, expected]) => {
        if (isJsonObject(expected)) {
            const min = expected['min'];
            const max = expected['max'];
            const low = min === undefined ? undefined : String(min);
            const high = max === undefined ? undefined : String(max);
            return (properties: Readonly<Record<string, string>> | undefined): boolean => {
                const actual = properties?.[name];
                if (actual === undefined) return false;
                return (
                    (low === undefined || comparableProperty(actual, low) >= 0) &&
                    (high === undefined || comparableProperty(actual, high) <= 0)
                );
            };
        }

        const text = String(expected);
        return (properties: Readonly<Record<string, string>> | undefined): boolean => properties?.[name] === text;
    });

    return (properties) => matchers.every((matcher) => matcher(properties));
};

const DATA_COMPONENT_PREDICATE_TYPES = [
    'minecraft:damage',
    'minecraft:enchantments',
    'minecraft:stored_enchantments',
    'minecraft:potion_contents',
    'minecraft:custom_data',
    'minecraft:container',
    'minecraft:bundle_contents',
    'minecraft:firework_explosion',
    'minecraft:fireworks',
    'minecraft:writable_book_content',
    'minecraft:written_book_content',
    'minecraft:attribute_modifiers',
    'minecraft:trim',
    'minecraft:jukebox_playable',
    'minecraft:villager/variant'
] as const;

/** The 15 data component predicate types Java 26.3 registers. */
export const DATA_COMPONENT_PREDICATES: readonly string[] = DATA_COMPONENT_PREDICATE_TYPES;

const enchantmentsTest =
    (component: string): SubPredicateParser<ItemStack> =>
    (value, context) => {
        const clauses = (Array.isArray(value) ? value : [value]).map((entry: unknown, index: number) => {
            const at = context.at(index);
            const matches = memberTest(member(entry, 'enchantments'), 'enchantment', at.at('enchantments'));
            const levels = intRange(member(entry, 'levels'), at.at('levels'));
            return { matches, levels };
        });

        return (stack, evaluation) => {
            const held = stack.components.get(component);
            const record: Record<string, unknown> = typeof held === 'object' && held !== null ? { ...held } : {};
            const nested = record['levels'];
            const source: Record<string, unknown> =
                typeof nested === 'object' && nested !== null ? { ...nested } : record;
            const entries = Object.entries(source).flatMap(([id, level]) =>
                typeof level === 'number' ? [[namespaced(id), level] as const] : []
            );
            return clauses.every((clause) =>
                entries.some(([id, level]) => clause.matches(id) && clause.levels(level, evaluation))
            );
        };
    };

const BUILT_IN_DATA_COMPONENT_PREDICATES: Readonly<Record<string, SubPredicateParser<ItemStack>>> = {
    'minecraft:enchantments': enchantmentsTest('minecraft:enchantments'),
    'minecraft:stored_enchantments': enchantmentsTest('minecraft:stored_enchantments'),
    'minecraft:damage': (value, context) => {
        const durability = intRange(member(value, 'durability'), context.at('durability'));
        const damage = intRange(member(value, 'damage'), context.at('damage'));
        return (stack, evaluation) => {
            const held = stack.components.get('minecraft:damage');
            const dealt = typeof held === 'number' ? held : 0;
            const max = evaluation.items.maxDamage(stack);
            return damage(dealt, evaluation) && durability(max - dealt, evaluation);
        };
    },
    'minecraft:jukebox_playable': (value, context) => {
        const song =
            'song' in (isJsonObject(value) ? value : {})
                ? memberTest(member(value, 'song'), 'item', context.at('song'))
                : undefined;
        return (stack) => {
            const held = stack.components.get('minecraft:jukebox_playable');
            if (held === undefined) return false;
            if (!song) return true;
            const id = typeof held === 'string' ? namespaced(held) : asString(member(held, 'song'));
            return song(id === undefined ? undefined : namespaced(id));
        };
    }
};

const componentsTest = (
    value: unknown,
    context: ParseContext
): ((components: ReadonlyMap<string, unknown> | undefined) => boolean) => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('an exact component match must be an object');
        return always;
    }

    const expected = Object.entries(value).map(([type, json]) => [namespaced(type), JSON.stringify(json)] as const);
    return (components) => expected.every(([type, json]) => JSON.stringify(components?.get(type) ?? null) === json);
};

const dataComponentPredicatesTest = (
    value: unknown,
    context: ParseContext
): ((stack: ItemStack, evaluation: PredicateContext) => boolean) => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a data component predicate map must be an object');
        return always;
    }

    const tests = Object.entries(value).map(([type, json]) => {
        const id = namespaced(type);
        const at = context.at(type);
        const parser = context.extensions.dataComponentPredicates?.[id] ?? BUILT_IN_DATA_COMPONENT_PREDICATES[id];
        if (parser) return parser(json, at);
        if (DATA_COMPONENT_PREDICATES.includes(id)) {
            at.warn(`data component predicate ${id} is not implemented; it evaluates false`);
            return () => false;
        }
        // 26.3 falls back to AnyValue for a key that names a data component
        // type rather than a predicate type, which is a presence check.
        if (Object.keys(isJsonObject(json) ? json : { ignored: true }).length > 0) {
            at.warn(`${id} is not a data component predicate type, so only the presence of the component is checked`);
        }
        return (stack: ItemStack) => stack.components.get(id) !== undefined;
    });

    return (stack, evaluation) => tests.every((test) => test(stack, evaluation));
};

/** Parses Java's `ItemPredicate`: which items, how many, and which components. */
export const itemPredicate = (value: unknown, context: ParseContext): ItemMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('an item predicate must be an object');
        return always;
    }

    const items = 'items' in value ? memberTest(value['items'], 'item', context.at('items')) : undefined;
    const count = intRange(value['count'], context.at('count'));
    const components = componentsTest(value['components'], context.at('components'));
    const predicates = dataComponentPredicatesTest(value['predicates'], context.at('predicates'));

    return (stack, evaluation) => {
        if (!stack) return false;
        if (items && !items(stack.id)) return false;
        if (!count(stack.count, evaluation)) return false;
        if (!components(stack.components)) return false;
        return predicates(stack, evaluation);
    };
};

/** Parses Java's `BlockPredicate`: which blocks, which state properties, and which block entity data. */
export const blockPredicate = (value: unknown, context: ParseContext): BlockMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a block predicate must be an object');
        return always;
    }

    const blocks = 'blocks' in value ? memberTest(value['blocks'], 'block', context.at('blocks')) : undefined;
    const state = statePropertiesTest(value['state'], context.at('state'));
    const nbt = value['nbt'];
    if (nbt !== undefined) context.at('nbt').warn('the nbt member of a block predicate is not implemented');

    return (blockState, _blockEntity) => {
        if (!blockState) return false;
        if (blocks && !blocks(namespaced(blockState.name))) return false;
        return state(blockState.properties);
    };
};

/** Parses Java's `FluidPredicate`. */
export const fluidPredicate = (value: unknown, context: ParseContext): FluidMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a fluid predicate must be an object');
        return always;
    }

    const fluids = 'fluids' in value ? memberTest(value['fluids'], 'fluid', context.at('fluids')) : undefined;
    const state = statePropertiesTest(value['state'], context.at('state'));

    return (fluidState) => {
        if (!fluidState) return false;
        if (fluids && !fluids(namespaced(fluidState.name))) return false;
        return state(fluidState.properties);
    };
};

const positionTest = (value: unknown, context: ParseContext): ((position: Vec3) => boolean) => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a position predicate must be an object');
        return always;
    }

    const axes = (['x', 'y', 'z'] as const).map((axis) => {
        const bounds = value[axis];
        const min = asNumber(member(bounds, 'min'));
        const max = asNumber(member(bounds, 'max'));
        return { axis, min, max };
    });

    return (position) =>
        axes.every(
            ({ axis, min, max }) =>
                (min === undefined || position[axis] >= min) && (max === undefined || position[axis] <= max)
        );
};

/** Parses Java's `LocationPredicate`: biome, structure, dimension, light, block, fluid and sky checks at a position. */
export const locationPredicate = (value: unknown, context: ParseContext): LocationMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a location predicate must be an object');
        return always;
    }

    const position = positionTest(value['position'], context.at('position'));
    const biomes = 'biomes' in value ? memberTest(value['biomes'], 'worldgen/biome', context.at('biomes')) : undefined;
    const structures =
        'structures' in value
            ? memberTest(value['structures'], 'worldgen/structure', context.at('structures'))
            : undefined;
    const dimension = asString(value['dimension']);
    const light = 'light' in value ? intRange(member(value['light'], 'light'), context.at('light')) : undefined;
    const block = 'block' in value ? blockPredicate(value['block'], context.at('block')) : undefined;
    const fluid = 'fluid' in value ? fluidPredicate(value['fluid'], context.at('fluid')) : undefined;
    const smokey = asBoolean(value['smokey']);
    const canSeeSky = asBoolean(value['can_see_sky']);
    const path = context.path;

    return (origin, evaluation, blockOverride) => {
        if (!origin) return false;
        if (!position(origin)) return false;

        if (dimension !== undefined) {
            const level = evaluation.levelWith('dimension', path);
            if (!level || namespaced(level.dimension()) !== namespaced(dimension)) return false;
        }
        if (biomes) {
            const level = evaluation.levelWith('biomeAt', path);
            const id = level?.biomeAt(origin);
            const tags = level?.biomeTagsAt?.(origin);
            if (!biomes(id === undefined ? undefined : namespaced(id), tags)) return false;
        }
        if (structures) {
            const level = evaluation.levelWith('structuresAt', path);
            const found = level?.structuresAt(origin) ?? [];
            if (!found.some((id) => structures(namespaced(id)))) return false;
        }
        if (light) {
            const level = evaluation.levelWith('lightAt', path);
            if (!level || !light(level.lightAt(origin), evaluation)) return false;
        }
        if (block) {
            const state = blockOverride ?? evaluation.levelWith('blockAt', path)?.blockAt(origin);
            if (!block(state, undefined, evaluation)) return false;
        }
        if (fluid) {
            const level = evaluation.levelWith('fluidAt', path);
            if (!fluid(level?.fluidAt(origin), evaluation)) return false;
        }
        if (smokey !== undefined) {
            const level = evaluation.levelWith('isSmokey', path);
            if (!level || level.isSmokey(origin) !== smokey) return false;
        }
        if (canSeeSky !== undefined) {
            const level = evaluation.levelWith('canSeeSky', path);
            if (!level || level.canSeeSky(origin) !== canSeeSky) return false;
        }
        return true;
    };
};

/** The 25 entity sub-predicate types Java 26.3 registers. */
export const ENTITY_SUB_PREDICATES = [
    'minecraft:entity_type',
    'minecraft:location',
    'minecraft:stepping_on',
    'minecraft:movement_affected_by',
    'minecraft:distance',
    'minecraft:movement',
    'minecraft:effects',
    'minecraft:nbt',
    'minecraft:flags',
    'minecraft:equipment',
    'minecraft:periodic_tick',
    'minecraft:vehicle',
    'minecraft:passenger',
    'minecraft:targeted_entity',
    'minecraft:team',
    'minecraft:slots',
    'minecraft:components',
    'minecraft:predicates',
    'minecraft:entity_tags',
    'minecraft:type_specific/lightning',
    'minecraft:type_specific/fishing_hook',
    'minecraft:type_specific/player',
    'minecraft:type_specific/cube_mob',
    'minecraft:type_specific/raider',
    'minecraft:type_specific/sheep'
] as const;

const flagTest = (value: unknown, context: ParseContext): EntityMatcher => {
    if (!isJsonObject(value)) {
        context.error('an entity flags predicate must be an object');
        return () => false;
    }

    const expected = Object.entries(value).flatMap(([flag, wanted]) => {
        const bool = asBoolean(wanted);
        if (bool === undefined) {
            context.at(flag).error('an entity flag must be a boolean');
            return [];
        }
        if (!isEntityFlag(flag)) {
            context.at(flag).error(`unknown entity flag ${flag}`);
            return [];
        }
        return [[flag, bool] as const];
    });

    return (entity, evaluation) =>
        expected.every(([flag, wanted]) => {
            const actual = entity?.flags?.[flag];
            if (actual === undefined) {
                evaluation.diagnostics.error(context.path, `the entity view does not report the ${flag} flag`);
                return false;
            }
            return actual === wanted;
        });
};

/**
 * Parses Java's `FoodPredicate`, the `food` member of a player predicate: a
 * bound on the food level and one on the saturation, both optional.
 */
const foodTest: SubPredicateParser<EntityView> = (value, context) => {
    const level = intRange(member(value, 'level'), context.at('level'));
    const saturation = floatRange(member(value, 'saturation'), context.at('saturation'));
    return (entity, evaluation) => {
        const food = entity.food;
        if (food === undefined) {
            evaluation.diagnostics.error(context.path, 'the entity view does not report the food level');
            return false;
        }
        return level(food.level, evaluation) && saturation(food.saturation, evaluation);
    };
};

const typeSpecificFlag =
    (field: string): SubPredicateParser<EntityView> =>
    (value, context) => {
        const wanted = asBoolean(member(value, field));
        return (entity, evaluation) => {
            if (wanted === undefined) return true;
            const actual = entity.typeSpecific?.[field];
            if (typeof actual !== 'boolean') {
                evaluation.diagnostics.error(context.path, `the entity view does not report ${field}`);
                return false;
            }
            return actual === wanted;
        };
    };

const BUILT_IN_ENTITY_SUB_PREDICATES: Readonly<Record<string, SubPredicateParser<EntityView>>> = {
    'minecraft:entity_type': (value, context) => {
        const test = memberTest(value, 'entity_type', context);
        return (entity) => test(namespaced(entity.type), entity.typeTags);
    },
    'minecraft:entity_tags': (value, context) => {
        const test = memberTest(value, 'entity_type', context);
        return (entity) => test(undefined, entity.typeTags);
    },
    'minecraft:location': (value, context) => {
        const test = locationPredicate(value, context);
        return (entity, evaluation) => test(entity.position, evaluation);
    },
    'minecraft:stepping_on': (value, context) => {
        const test = locationPredicate(value, context);
        return (entity, evaluation) => test(entity.position, evaluation, entity.steppingOn);
    },
    'minecraft:movement_affected_by': (value, context) => {
        const test = locationPredicate(value, context);
        return (entity, evaluation) => test(entity.position, evaluation, entity.movementAffectedBy);
    },
    'minecraft:distance': (value, context) => {
        const absolute = floatRange(member(value, 'absolute'), context.at('absolute'));
        const horizontal = floatRange(member(value, 'horizontal'), context.at('horizontal'));
        const axes = (['x', 'y', 'z'] as const).map(
            (axis) => [axis, floatRange(member(value, axis), context.at(axis))] as const
        );
        return (entity, evaluation) => {
            const origin = evaluation.parameter('origin', context.path);
            const position = entity.position;
            if (!origin || !position) return false;
            const dx = Math.abs(position.x - origin.x);
            const dy = Math.abs(position.y - origin.y);
            const dz = Math.abs(position.z - origin.z);
            const deltas = { x: dx, y: dy, z: dz };
            return (
                axes.every(([axis, test]) => test(deltas[axis], evaluation)) &&
                horizontal(Math.sqrt(dx * dx + dz * dz), evaluation) &&
                absolute(Math.sqrt(dx * dx + dy * dy + dz * dz), evaluation)
            );
        };
    },
    'minecraft:movement': (value, context) => {
        const fields = (
            [
                ['x', 'x'],
                ['y', 'y'],
                ['z', 'z'],
                ['speed', 'speed'],
                ['horizontal_speed', 'horizontalSpeed'],
                ['vertical_speed', 'verticalSpeed'],
                ['fall_distance', 'fallDistance']
            ] as const
        ).map(([json, field]) => [field, floatRange(member(value, json), context.at(json))] as const);
        return (entity, evaluation) => fields.every(([field, test]) => test(entity.movement?.[field] ?? 0, evaluation));
    },
    'minecraft:effects': (value, context) => {
        if (!isJsonObject(value)) {
            context.error('an effects predicate must be an object');
            return () => false;
        }
        const wanted = Object.entries(value).map(([id, detail]) => {
            const at = context.at(id);
            return {
                id: namespaced(id),
                amplifier: intRange(member(detail, 'amplifier'), at.at('amplifier')),
                duration: intRange(member(detail, 'duration'), at.at('duration')),
                ambient: asBoolean(member(detail, 'ambient')),
                visible: asBoolean(member(detail, 'visible'))
            };
        });
        return (entity, evaluation) =>
            wanted.every((want) => {
                const active = entity.effects?.get(want.id);
                if (!active) return false;
                if (want.ambient !== undefined && active.ambient !== want.ambient) return false;
                if (want.visible !== undefined && active.visible !== want.visible) return false;
                return want.amplifier(active.amplifier, evaluation) && want.duration(active.duration, evaluation);
            });
    },
    'minecraft:flags': flagTest,
    'minecraft:equipment': (value, context) => {
        if (!isJsonObject(value)) {
            context.error('an equipment predicate must be an object');
            return () => false;
        }
        const slots = Object.entries(value).flatMap(([slot, detail]) => {
            if (!isEquipmentSlot(slot)) {
                context.at(slot).error(`unknown equipment slot ${slot}`);
                return [];
            }
            return [[slot, itemPredicate(detail, context.at(slot))] as const];
        });
        return (entity, evaluation) => slots.every(([slot, test]) => test(entity.equipment?.[slot], evaluation));
    },
    'minecraft:periodic_tick': (value, context) => {
        const period = asNumber(value) ?? 1;
        return (entity, evaluation) => {
            if (entity.ticksExisted === undefined) {
                evaluation.diagnostics.error(context.path, 'the entity view does not report ticksExisted');
                return false;
            }
            return period > 0 && entity.ticksExisted % period === 0;
        };
    },
    'minecraft:team': (value, context) => {
        const name = asString(value);
        if (name === undefined) context.error('a team predicate must be a string');
        return (entity) => entity.team === name;
    },
    'minecraft:components': (value, context) => {
        const test = componentsTest(value, context);
        return (entity) => test(entity.components);
    },
    'minecraft:predicates': (value, context) => {
        const test = dataComponentPredicatesTest(value, context);
        return (entity, evaluation) =>
            test({ id: namespaced(entity.type), count: 1, components: entity.components ?? new Map() }, evaluation);
    },
    'minecraft:vehicle': (value, context) => {
        const test = entityPredicate(value, context);
        return (entity, evaluation) => test(entity.vehicle, evaluation);
    },
    'minecraft:passenger': (value, context) => {
        const test = entityPredicate(value, context);
        return (entity, evaluation) => test(entity.passenger, evaluation);
    },
    'minecraft:targeted_entity': (value, context) => {
        const test = entityPredicate(value, context);
        return (entity, evaluation) => test(entity.target, evaluation);
    },
    'minecraft:type_specific/sheep': typeSpecificFlag('sheared'),
    'minecraft:type_specific/fishing_hook': typeSpecificFlag('in_open_water'),
    'minecraft:type_specific/raider': (value, context) => {
        const checks = [typeSpecificFlag('is_captain')(value, context), typeSpecificFlag('has_raid')(value, context)];
        return (entity, evaluation) => checks.every((check) => check(entity, evaluation));
    },
    'minecraft:type_specific/cube_mob': (value, context) => {
        const size = intRange(member(value, 'size'), context.at('size'));
        return (entity, evaluation) => {
            const actual = entity.typeSpecific?.['size'];
            if (typeof actual !== 'number') {
                evaluation.diagnostics.error(context.path, 'the entity view does not report size');
                return false;
            }
            return size(actual, evaluation);
        };
    },
    'minecraft:type_specific/lightning': (value, context) => {
        const struck = intRange(member(value, 'blocks_set_on_fire'), context.at('blocks_set_on_fire'));
        const victim =
            member(value, 'entity_struck') === undefined
                ? undefined
                : entityPredicate(member(value, 'entity_struck'), context.at('entity_struck'));
        return (entity, evaluation) => {
            const burned = entity.typeSpecific?.['blocks_set_on_fire'];
            if (typeof burned !== 'number') {
                evaluation.diagnostics.error(context.path, 'the entity view does not report blocks_set_on_fire');
                return false;
            }
            if (!struck(burned, evaluation)) return false;
            return victim ? victim(entity.target, evaluation) : true;
        };
    },
    'minecraft:type_specific/player': (value, context) => {
        const unsupported = ['advancements', 'recipes', 'stats', 'input'].filter(
            (field) => member(value, field) !== undefined
        );
        for (const field of unsupported) {
            context.at(field).warn(`the ${field} member of a player predicate is not implemented`);
        }
        const level = intRange(member(value, 'level'), context.at('level'));
        const gameModes = asArray(member(value, 'gamemode')).flatMap((entry) => {
            const name = asString(entry);
            if (name === undefined) {
                context.at('gamemode').error('a game mode must be a string');
                return [];
            }
            return [name];
        });
        const food =
            member(value, 'food') === undefined ? undefined : foodTest(member(value, 'food'), context.at('food'));
        const lookingAt =
            member(value, 'looking_at') === undefined
                ? undefined
                : entityPredicate(member(value, 'looking_at'), context.at('looking_at'));
        return (entity, evaluation) => {
            if (unsupported.length > 0) return false;
            if (!level(entity.experienceLevel ?? 0, evaluation)) return false;
            if (gameModes.length > 0 && !gameModes.includes(entity.gameMode ?? '')) return false;
            if (food && !food(entity, evaluation)) return false;
            return lookingAt ? lookingAt(entity.lookingAt, evaluation) : true;
        };
    }
};

/**
 * Parses Java 26.3's entity predicate, which is a map from entity
 * sub-predicate type to its value. A type this package does not implement
 * reports a diagnostic and evaluates false rather than throwing, and a host
 * can supply its own through {@link GrammarExtensions}.
 */
export const entityPredicate = (value: unknown, context: ParseContext): EntityMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('an entity predicate must be an object');
        return (entity) => entity !== undefined;
    }

    const tests = Object.entries(value).map(([type, json]) => {
        const id = namespaced(type);
        const at = context.at(type);
        const parser = context.extensions.entitySubPredicates?.[id] ?? BUILT_IN_ENTITY_SUB_PREDICATES[id];
        if (parser) return parser(json, at);
        if (ENTITY_SUB_PREDICATES.some((known) => known === id)) {
            at.warn(`entity sub-predicate ${id} is not implemented; it evaluates false`);
            return () => false;
        }
        at.error(`unknown entity sub-predicate type ${type}`);
        return () => false;
    });

    return (entity, evaluation) => entity !== undefined && tests.every((test) => test(entity, evaluation));
};

/** Parses Java's `DamageSourcePredicate`. */
export const damageSourcePredicate = (value: unknown, context: ParseContext): DamageSourceMatcher => {
    if (!isJsonObject(value)) {
        if (value !== undefined) context.error('a damage source predicate must be an object');
        return (source) => source !== undefined;
    }

    const tags = asList(value['tags']).map((entry, index) => {
        const at = context.at('tags').at(index);
        return {
            id: namespaced(asString(member(entry, 'id')) ?? ''),
            expected: asBoolean(member(entry, 'expected')) ?? true,
            path: at.path
        };
    });
    const isDirect = asBoolean(value['is_direct']);
    const directEntity =
        value['direct_entity'] === undefined
            ? undefined
            : entityPredicate(value['direct_entity'], context.at('direct_entity'));
    const sourceEntity =
        value['source_entity'] === undefined
            ? undefined
            : entityPredicate(value['source_entity'], context.at('source_entity'));

    return (source, evaluation) => {
        if (!source) return false;
        const carried = source.tags ?? [];
        if (!tags.every((tag) => carried.includes(tag.id.replace(/^#/, '')) === tag.expected)) return false;
        if (isDirect !== undefined && (source.directEntity === source.sourceEntity) !== isDirect) return false;
        if (directEntity && !directEntity(source.directEntity, evaluation)) return false;
        return sourceEntity ? sourceEntity(source.sourceEntity, evaluation) : true;
    };
};
