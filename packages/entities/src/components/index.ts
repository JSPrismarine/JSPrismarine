import type { ComponentFactory } from '@jsprismarine/content';
import { ComponentRegistry } from '@jsprismarine/content';

import type { EntityComponentRegistry } from '../entityType';
import type { EntityHooks } from '../hooks';
import { goalComponent } from '../goals';
import { float, lookAtPlayer, randomStroll } from '../goals/reference';
import { EVENT_TRIGGER_COMPONENTS } from '../triggers';
import { dataComponent } from './schemas';
import {
    ageable,
    admireItem,
    airDragModifier,
    ambientSoundInterval,
    angry,
    attack,
    attributeComponents,
    blockSensor,
    breathable,
    barter,
    burnsInDaylight,
    breedable,
    bounciness,
    collisionBox,
    damageOverTime,
    damageSensor,
    despawn,
    entitySensor,
    environmentSensor,
    equipment,
    equipmentChanged,
    experienceReward,
    frictionModifier,
    healable,
    hurtOnCondition,
    ignoreCannotBeAttacked,
    insideBlockNotifier,
    instantDespawn,
    integerStateComponents,
    interact,
    inventory,
    jumpStatic,
    loot,
    movementComponent,
    navigationComponent,
    physics,
    pushable,
    rideable,
    spawnEntity,
    spawnEggInteraction,
    tameable,
    targetNearbySensor,
    timer,
    transformation,
    triggerComponent,
    typeFamily
} from './vanilla';

export * from './schemas';
export * from './vanilla';

/** The navigation flavors vanilla uses. */
const NAVIGATION_KINDS = ['walk', 'generic', 'float', 'hover', 'climb', 'fly', 'swim'] as const;

/** The movement flavors vanilla uses, with the default `max_turn` of each. */
const MOVEMENT_KINDS: readonly (readonly [string, number])[] = [
    ['basic', 30],
    ['amphibious', 30],
    ['fly', 30],
    ['generic', 30],
    ['glide', 30],
    ['hover', 30],
    ['jump', 30],
    ['skip', 30],
    ['sway', 30]
];

/**
 * The component names this package parses and exposes without running
 * behavior of its own.
 *
 * Dedicated factories validate and normalize their values. Generic factories
 * preserve the raw object. Both make the component available through
 * `EntityInstance.componentParams`, which is all a flag like
 * `minecraft:can_climb` or a table reference like `minecraft:shareables` is.
 *
 * The list covers every non-goal key in the 1.26.51.1 vanilla entity pack.
 * Components with dedicated factories are registered separately; these
 * factories preserve the remaining component bodies for systems that need
 * their data, without claiming to run their behavior.
 */
export const DATA_COMPONENTS: readonly string[] = [
    'minecraft:addrider',
    'minecraft:anger_level',
    'minecraft:annotation.break_door',
    'minecraft:annotation.open_door',
    'minecraft:apply_knockback_rules',
    'minecraft:area_attack',
    'minecraft:attack_cooldown',
    'minecraft:balloonable',
    'minecraft:block_climber',
    'minecraft:block_movement_slowdown_immunity',
    'minecraft:body_rotation_always_follows_head',
    'minecraft:body_rotation_blocked',
    'minecraft:boostable',
    'minecraft:boss',
    'minecraft:break_blocks',
    'minecraft:bribeable',
    'minecraft:buoyant',
    'minecraft:can_climb',
    'minecraft:can_fly',
    'minecraft:can_join_raid',
    'minecraft:can_power_jump',
    'minecraft:can_stand_on_powder_snow',
    'minecraft:celebrate_hunt',
    'minecraft:cannot_be_attacked',
    'minecraft:combat_regeneration',
    'minecraft:conditional_bandwidth_optimization',
    'minecraft:custom_hit_test',
    'minecraft:dash_action',
    'minecraft:dimension_bound',
    'minecraft:drying_out_timer',
    'minecraft:dweller',
    'minecraft:economy_trade_table',
    'minecraft:equip_item',
    'minecraft:equippable',
    'minecraft:exhaustion_values',
    'minecraft:explode',
    'minecraft:fire_immune',
    'minecraft:flocking',
    'minecraft:free_camera_controlled',
    'minecraft:freezing_immune',
    'minecraft:freezing_vulnerable',
    'minecraft:game_event_movement_tracking',
    'minecraft:giveable',
    'minecraft:genetics',
    'minecraft:grows_crop',
    'minecraft:group_size',
    'minecraft:heartbeat',
    'minecraft:hide',
    'minecraft:home',
    'minecraft:input_ground_controlled',
    'minecraft:insomnia',
    'minecraft:is_baby',
    'minecraft:is_charged',
    'minecraft:is_chested',
    'minecraft:is_collidable',
    'minecraft:is_dyeable',
    'minecraft:is_hidden_when_invisible',
    'minecraft:is_ignited',
    'minecraft:is_illager_captain',
    'minecraft:is_pregnant',
    'minecraft:is_saddled',
    'minecraft:is_shaking',
    'minecraft:is_sheared',
    'minecraft:is_stackable',
    'minecraft:is_stunned',
    'minecraft:is_tamed',
    'minecraft:item_controllable',
    'minecraft:item_hopper',
    'minecraft:leashable',
    'minecraft:leashable_to',
    'minecraft:looked_at',
    'minecraft:managed_wandering_trader',
    'minecraft:mob_effect',
    'minecraft:mob_effect_immunity',
    'minecraft:movement_sound_distance_offset',
    'minecraft:nameable',
    'minecraft:not_pickable_from_inside',
    'minecraft:npc',
    'minecraft:offspring',
    'minecraft:offspring_data',
    'minecraft:out_of_control',
    'minecraft:peek',
    'minecraft:persistent',
    'minecraft:player.exhaustion',
    'minecraft:player.experience',
    'minecraft:player.level',
    'minecraft:player.saturation',
    'minecraft:preferred_path',
    'minecraft:projectile',
    'minecraft:pushable_by_block',
    'minecraft:pushable_by_entity',
    'minecraft:raid_trigger',
    'minecraft:ravager_blocked',
    'minecraft:reflect_projectiles',
    'minecraft:rail_movement',
    'minecraft:rail_sensor',
    'minecraft:renders_when_invisible',
    'minecraft:rotation_axis_aligned',
    'minecraft:rotation_locked_to_vehicle',
    'minecraft:scheduler',
    'minecraft:shareables',
    'minecraft:shooter',
    'minecraft:sittable',
    'minecraft:spell_effects',
    'minecraft:strength',
    'minecraft:suspect_tracking',
    'minecraft:tamemount',
    'minecraft:teleport',
    'minecraft:tick_world',
    'minecraft:trade_resupply',
    'minecraft:trade_table',
    'minecraft:trail',
    'minecraft:trust',
    'minecraft:trusting',
    'minecraft:transient',
    'minecraft:underwater_mount_breathing',
    'minecraft:uses_legacy_friction',
    'minecraft:uses_uniform_air_drag',
    'minecraft:variable_max_auto_step',
    'minecraft:vertical_movement_action',
    'minecraft:vibration_damper',
    'minecraft:vibration_listener',
    'minecraft:water_movement'
];

/**
 * Fills a registry with every component this package implements.
 *
 * @param registry - A fresh registry, or one a server has already put its own
 *   components in; registering a name twice is an error, so a caller that
 *   overrides a vanilla component registers it before calling this.
 */
export const registerEntityComponents = (registry: EntityComponentRegistry): EntityComponentRegistry => {
    const register = <P>(factory: ComponentFactory<EntityHooks, P>): void => {
        if (!registry.has(factory.name)) registry.register(factory);
    };

    for (const factory of attributeComponents) register(factory);
    for (const factory of integerStateComponents) register(factory);
    register(airDragModifier);
    register(frictionModifier);
    register(bounciness);
    for (const kind of NAVIGATION_KINDS) register(navigationComponent(kind));
    for (const [kind, maxTurn] of MOVEMENT_KINDS) register(movementComponent(kind, maxTurn));
    for (const name of EVENT_TRIGGER_COMPONENTS) register(triggerComponent(name));
    register(equipmentChanged);
    for (const name of DATA_COMPONENTS) register(dataComponent(name));

    register(ageable);
    register(admireItem);
    register(ambientSoundInterval);
    register(angry);
    register(attack);
    register(blockSensor);
    register(breathable);
    register(barter);
    register(burnsInDaylight);
    register(breedable);
    register(collisionBox);
    register(damageOverTime);
    register(damageSensor);
    register(despawn);
    register(entitySensor);
    register(environmentSensor);
    register(equipment);
    register(experienceReward);
    register(healable);
    register(hurtOnCondition);
    register(ignoreCannotBeAttacked);
    register(insideBlockNotifier);
    register(interact);
    register(instantDespawn);
    register(inventory);
    register(jumpStatic);
    register(loot);
    register(physics);
    register(dataComponent('jsprismarine:falling_block'));
    register(pushable);
    register(rideable);
    register(spawnEntity);
    register(spawnEggInteraction);
    register(tameable);
    register(targetNearbySensor);
    register(timer);
    register(transformation);
    register(typeFamily);
    register(dataComponent('minecraft:jump.dynamic'));

    register(goalComponent(float));
    register(goalComponent(randomStroll));
    register(goalComponent(lookAtPlayer));

    return registry;
};

/** Builds a registry holding every component and reference goal this package implements. */
export const createEntityComponentRegistry = (): EntityComponentRegistry =>
    registerEntityComponents(new ComponentRegistry());
