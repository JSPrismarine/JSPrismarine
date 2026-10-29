import {
    asBoolean,
    asList,
    asString,
    floatProviderAt,
    levelBasedValueAt,
    member,
    namespaced,
    resolveMembers,
    rootContext
} from '@jsprismarine/predicates';
import type { MemberSet, ParseContext, ParseOptions, ParseResult, PredicateContext } from '@jsprismarine/predicates';

/** Members of `minecraft:enchantment_entity_effect_type` in 26.3. */
export const ENTITY_EFFECT_TYPES = [
    'all_of',
    'apply_exhaustion',
    'apply_impulse',
    'apply_mob_effect',
    'change_item_damage',
    'damage_entity',
    'explode',
    'ignite',
    'play_sound',
    'replace_block',
    'replace_disk',
    'run_function',
    'set_block_properties',
    'spawn_particles',
    'summon_entity'
] as const;

/**
 * Members of `minecraft:enchantment_location_based_effect_type` in 26.3,
 * which are the entity effects plus `attribute`. Only `location_changed`
 * takes this wider set, because only it can hold a modifier while the
 * condition stays true and withdraw it when the condition stops.
 */
export const LOCATION_EFFECT_TYPES = [...ENTITY_EFFECT_TYPES, 'attribute'] as const;

/** One of {@link ENTITY_EFFECT_TYPES}. */
export type EntityEffectType = (typeof ENTITY_EFFECT_TYPES)[number];

/** One of {@link LOCATION_EFFECT_TYPES}. */
export type LocationEffectType = (typeof LOCATION_EFFECT_TYPES)[number];

/** Which set of effect types a component accepts. */
export type EffectScope = 'entity' | 'location';

/** An `[x, y, z]` triple, as the effect grammar writes offsets and directions. */
export type Vec3 = readonly [number, number, number];

/** The three attribute modifier operations of 26.3. */
export const ATTRIBUTE_OPERATIONS = ['add_value', 'add_multiplied_base', 'add_multiplied_total'] as const;

/** One of {@link ATTRIBUTE_OPERATIONS}. */
export type AttributeOperation = (typeof ATTRIBUTE_OPERATIONS)[number];

/**
 * One world change an enchantment asks for, with every level based value and
 * number provider already resolved against the level and the context.
 *
 * Identifiers, block states, block predicates and particle options stay as the
 * parsed JSON they came from: those registries live in the host, and copying
 * them here would make this package own data it cannot validate. Durations are
 * in seconds, which is the unit the Java effects carry before they multiply by
 * 20.
 */
export type ResolvedEffect =
    | { readonly type: 'apply_exhaustion'; readonly amount: number }
    | {
          readonly type: 'apply_impulse';
          readonly direction: Vec3;
          readonly coordinateScale: Vec3;
          readonly magnitude: number;
      }
    | {
          readonly type: 'apply_mob_effect';
          /** Mob effect ids to choose one from, with any tags the host still has to expand. */
          readonly toApply: MemberSet;
          readonly minDuration: number;
          readonly maxDuration: number;
          readonly minAmplifier: number;
          readonly maxAmplifier: number;
      }
    | { readonly type: 'change_item_damage'; readonly amount: number }
    | {
          readonly type: 'damage_entity';
          readonly minDamage: number;
          readonly maxDamage: number;
          readonly damageType: string;
      }
    | {
          readonly type: 'explode';
          readonly attributeToUser: boolean;
          readonly damageType: string | undefined;
          readonly knockbackMultiplier: number | undefined;
          readonly immuneBlocks: MemberSet | undefined;
          readonly offset: Vec3;
          readonly radius: number;
          readonly createFire: boolean;
          readonly blockInteraction: string;
          readonly smallParticle: unknown;
          readonly largeParticle: unknown;
          readonly blockParticles: unknown;
          readonly sound: string | undefined;
      }
    | { readonly type: 'ignite'; readonly duration: number }
    | {
          readonly type: 'play_sound';
          /** Sound event ids to choose one from, in the order the file lists them. */
          readonly sounds: readonly string[];
          readonly volume: number;
          readonly pitch: number;
      }
    | {
          readonly type: 'replace_block';
          readonly offset: Vec3;
          readonly predicate: unknown;
          readonly blockState: unknown;
          readonly triggerGameEvent: string | undefined;
      }
    | {
          readonly type: 'replace_disk';
          readonly radius: number;
          readonly height: number;
          readonly offset: Vec3;
          readonly predicate: unknown;
          readonly blockState: unknown;
          readonly triggerGameEvent: string | undefined;
      }
    | { readonly type: 'run_function'; readonly function: string }
    | {
          readonly type: 'set_block_properties';
          readonly properties: unknown;
          readonly offset: Vec3;
          readonly triggerGameEvent: string | undefined;
      }
    | {
          readonly type: 'spawn_particles';
          readonly particle: unknown;
          readonly horizontalPosition: unknown;
          readonly verticalPosition: unknown;
          readonly horizontalVelocity: unknown;
          readonly verticalVelocity: unknown;
          readonly speed: number;
      }
    | { readonly type: 'summon_entity'; readonly entityTypes: MemberSet; readonly joinTeam: boolean }
    | {
          readonly type: 'attribute';
          readonly id: string;
          readonly attribute: string;
          readonly amount: number;
          readonly operation: AttributeOperation;
      };

/**
 * A compiled entity or location effect. Running it resolves the effect against
 * one level and one context and hands each leaf to `emit`; `all_of` emits each
 * of its members in order and never surfaces itself.
 */
export type CompiledEffect = (level: number, context: PredicateContext, emit: (effect: ResolvedEffect) => void) => void;

const ORIGIN: Vec3 = [0, 0, 0];

const vec3At = (value: unknown, fallback: Vec3): Vec3 => {
    const entries = asList(value);
    if (entries.length !== 3) return fallback;
    const [x, y, z] = entries.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0));
    return [x ?? 0, y ?? 0, z ?? 0];
};

const identifierAt = (value: unknown): string | undefined => {
    const declared = asString(value);
    return declared === undefined ? undefined : namespaced(declared);
};

const isAttributeOperation = (value: string): value is AttributeOperation =>
    (ATTRIBUTE_OPERATIONS as readonly string[]).includes(value);

type EffectParser = (value: unknown, scope: EffectScope, context: ParseContext) => CompiledEffect;

const EFFECTS: Readonly<Record<LocationEffectType, EffectParser>> = {
    all_of: (value, scope, context) => {
        const members = asList(member(value, 'effects')).map((entry, index) =>
            effectAt(entry, scope, context.at('effects').at(index))
        );
        return (level, evaluation, emit) => {
            for (const effect of members) effect(level, evaluation, emit);
        };
    },
    apply_exhaustion: (value, _scope, context) => {
        const amount = levelBasedValueAt(member(value, 'amount'), context.at('amount'));
        return (level, _evaluation, emit) => emit({ type: 'apply_exhaustion', amount: amount(level) });
    },
    apply_impulse: (value, _scope, context) => {
        const direction = vec3At(member(value, 'direction'), [0, 1, 0]);
        const coordinateScale = vec3At(member(value, 'coordinate_scale'), [1, 1, 1]);
        const magnitude = levelBasedValueAt(member(value, 'magnitude'), context.at('magnitude'));
        return (level, _evaluation, emit) =>
            emit({ type: 'apply_impulse', direction, coordinateScale, magnitude: magnitude(level) });
    },
    apply_mob_effect: (value, _scope, context) => {
        const toApply = resolveMembers(member(value, 'to_apply'), 'mob_effect', context.at('to_apply'));
        const minDuration = levelBasedValueAt(member(value, 'min_duration'), context.at('min_duration'));
        const maxDuration = levelBasedValueAt(member(value, 'max_duration'), context.at('max_duration'));
        const minAmplifier = levelBasedValueAt(member(value, 'min_amplifier'), context.at('min_amplifier'));
        const maxAmplifier = levelBasedValueAt(member(value, 'max_amplifier'), context.at('max_amplifier'));
        return (level, _evaluation, emit) =>
            emit({
                type: 'apply_mob_effect',
                toApply,
                minDuration: minDuration(level),
                maxDuration: maxDuration(level),
                minAmplifier: minAmplifier(level),
                maxAmplifier: maxAmplifier(level)
            });
    },
    change_item_damage: (value, _scope, context) => {
        const amount = levelBasedValueAt(member(value, 'amount'), context.at('amount'));
        return (level, _evaluation, emit) => emit({ type: 'change_item_damage', amount: amount(level) });
    },
    damage_entity: (value, _scope, context) => {
        const minDamage = levelBasedValueAt(member(value, 'min_damage'), context.at('min_damage'));
        const maxDamage = levelBasedValueAt(member(value, 'max_damage'), context.at('max_damage'));
        const damageType = identifierAt(member(value, 'damage_type'));
        if (damageType === undefined) context.at('damage_type').error('damage_entity needs a damage type');
        return (level, _evaluation, emit) =>
            emit({
                type: 'damage_entity',
                minDamage: minDamage(level),
                maxDamage: maxDamage(level),
                damageType: damageType ?? 'minecraft:generic'
            });
    },
    explode: (value, _scope, context) => {
        const attributeToUser = asBoolean(member(value, 'attribute_to_user')) ?? false;
        const damageType = identifierAt(member(value, 'damage_type'));
        const knockback =
            member(value, 'knockback_multiplier') === undefined
                ? undefined
                : levelBasedValueAt(member(value, 'knockback_multiplier'), context.at('knockback_multiplier'));
        const immuneBlocks =
            member(value, 'immune_blocks') === undefined
                ? undefined
                : resolveMembers(member(value, 'immune_blocks'), 'block', context.at('immune_blocks'));
        const offset = vec3At(member(value, 'offset'), ORIGIN);
        const radius = levelBasedValueAt(member(value, 'radius'), context.at('radius'));
        const createFire = asBoolean(member(value, 'create_fire')) ?? false;
        const blockInteraction = asString(member(value, 'block_interaction')) ?? 'none';
        const smallParticle = member(value, 'small_particle');
        const largeParticle = member(value, 'large_particle');
        const blockParticles = member(value, 'block_particles');
        const sound = identifierAt(member(value, 'sound'));
        return (level, _evaluation, emit) =>
            emit({
                type: 'explode',
                attributeToUser,
                damageType,
                knockbackMultiplier: knockback?.(level),
                immuneBlocks,
                offset,
                radius: radius(level),
                createFire,
                blockInteraction,
                smallParticle,
                largeParticle,
                blockParticles,
                sound
            });
    },
    ignite: (value, _scope, context) => {
        const duration = levelBasedValueAt(member(value, 'duration'), context.at('duration'));
        return (level, _evaluation, emit) => emit({ type: 'ignite', duration: duration(level) });
    },
    play_sound: (value, _scope, context) => {
        const declared = member(value, 'sound');
        const sounds = (Array.isArray(declared) ? declared : [declared]).flatMap((entry) => {
            const id = identifierAt(entry);
            return id === undefined ? [] : [id];
        });
        if (sounds.length === 0) context.at('sound').error('play_sound needs at least one sound event');
        const volume = floatProviderAt(member(value, 'volume'), context.at('volume'));
        const pitch = floatProviderAt(member(value, 'pitch'), context.at('pitch'));
        return (_level, evaluation, emit) =>
            emit({ type: 'play_sound', sounds, volume: volume(evaluation), pitch: pitch(evaluation) });
    },
    replace_block: (value) => {
        const offset = vec3At(member(value, 'offset'), ORIGIN);
        const predicate = member(value, 'predicate');
        const blockState = member(value, 'block_state');
        const triggerGameEvent = identifierAt(member(value, 'trigger_game_event'));
        return (_level, _evaluation, emit) =>
            emit({ type: 'replace_block', offset, predicate, blockState, triggerGameEvent });
    },
    replace_disk: (value, _scope, context) => {
        const radius = levelBasedValueAt(member(value, 'radius'), context.at('radius'));
        const height = levelBasedValueAt(member(value, 'height'), context.at('height'));
        const offset = vec3At(member(value, 'offset'), ORIGIN);
        const predicate = member(value, 'predicate');
        const blockState = member(value, 'block_state');
        const triggerGameEvent = identifierAt(member(value, 'trigger_game_event'));
        return (level, _evaluation, emit) =>
            emit({
                type: 'replace_disk',
                radius: radius(level),
                height: height(level),
                offset,
                predicate,
                blockState,
                triggerGameEvent
            });
    },
    run_function: (value, _scope, context) => {
        const name = identifierAt(member(value, 'function'));
        if (name === undefined) context.at('function').error('run_function needs a function id');
        return (_level, _evaluation, emit) => emit({ type: 'run_function', function: name ?? 'minecraft:empty' });
    },
    set_block_properties: (value) => {
        const properties = member(value, 'properties');
        const offset = vec3At(member(value, 'offset'), ORIGIN);
        const triggerGameEvent = identifierAt(member(value, 'trigger_game_event'));
        return (_level, _evaluation, emit) =>
            emit({ type: 'set_block_properties', properties, offset, triggerGameEvent });
    },
    spawn_particles: (value, _scope, context) => {
        const particle = member(value, 'particle');
        const horizontalPosition = member(value, 'horizontal_position');
        const verticalPosition = member(value, 'vertical_position');
        const horizontalVelocity = member(value, 'horizontal_velocity');
        const verticalVelocity = member(value, 'vertical_velocity');
        const speed = floatProviderAt(member(value, 'speed'), context.at('speed'));
        return (_level, evaluation, emit) =>
            emit({
                type: 'spawn_particles',
                particle,
                horizontalPosition,
                verticalPosition,
                horizontalVelocity,
                verticalVelocity,
                speed: speed(evaluation)
            });
    },
    summon_entity: (value, _scope, context) => {
        const entityTypes = resolveMembers(member(value, 'entity'), 'entity_type', context.at('entity'));
        const joinTeam = asBoolean(member(value, 'join_team')) ?? false;
        return (_level, _evaluation, emit) => emit({ type: 'summon_entity', entityTypes, joinTeam });
    },
    attribute: (value, _scope, context) => {
        const id = identifierAt(member(value, 'id'));
        const attribute = identifierAt(member(value, 'attribute'));
        const amount = levelBasedValueAt(member(value, 'amount'), context.at('amount'));
        const declared = asString(member(value, 'operation'));
        if (declared !== undefined && !isAttributeOperation(declared)) {
            context.at('operation').error(`unknown attribute modifier operation ${declared}`);
        }
        const operation = declared !== undefined && isAttributeOperation(declared) ? declared : 'add_value';
        if (id === undefined || attribute === undefined) {
            context.error('an attribute effect needs an id and an attribute');
        }
        return (level, _evaluation, emit) =>
            emit({
                type: 'attribute',
                id: id ?? 'minecraft:unnamed',
                attribute: attribute ?? 'minecraft:unnamed',
                amount: amount(level),
                operation
            });
    }
};

const isInScope = (name: string, scope: EffectScope): name is LocationEffectType =>
    scope === 'location'
        ? (LOCATION_EFFECT_TYPES as readonly string[]).includes(name)
        : (ENTITY_EFFECT_TYPES as readonly string[]).includes(name);

/**
 * Compiles an entity or location effect at a position inside a larger parse.
 * An unknown type, or a location-only type in an entity component, reports and
 * emits nothing.
 */
export const effectAt = (value: unknown, scope: EffectScope, context: ParseContext): CompiledEffect => {
    const article = scope === 'entity' ? 'an' : 'a';
    const declared = asString(member(value, 'type'));
    if (declared === undefined) {
        context.error(`${article} ${scope} effect needs a type`);
        return () => undefined;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    if (!isInScope(name, scope)) {
        context.error(`unknown ${scope} effect type ${declared}`);
        return () => undefined;
    }
    return EFFECTS[name](value, scope, context);
};

/** Compiles an entity or location effect from parsed JSON. */
export const parseEffect = (
    value: unknown,
    scope: EffectScope,
    options?: ParseOptions
): ParseResult<CompiledEffect> => {
    const context = rootContext(options);
    return { value: effectAt(value, scope, context), diagnostics: context.diagnostics.entries };
};
