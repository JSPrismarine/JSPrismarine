import type { EntityInstance } from '@jsprismarine/entities';

/**
 * The `minecraft:navigation.*` component, read as the rules the path finder
 * follows.
 *
 * `@jsprismarine/entities` already parses the component body into
 * `NavigationParams`, so this module reads the active component off the entity
 * and adds the three facts the component does not carry: how tall the entity
 * is, how high it steps and how far it drops.
 */

/** The seven `minecraft:navigation.*` flavors vanilla declares. */
export const NAVIGATION_KINDS = ['walk', 'generic', 'float', 'hover', 'climb', 'fly', 'swim'] as const;

/** One of {@link NAVIGATION_KINDS}. */
export type NavigationKind = (typeof NAVIGATION_KINDS)[number];

/** How an entity is allowed to move, and what it refuses to path through. */
export interface NavigationProfile {
    readonly kind: NavigationKind;
    /** How many whole blocks of headroom the entity needs, at least 1. */
    readonly height: number;
    /** How high the entity climbs without jumping, in blocks. */
    readonly stepHeight: number;
    /** How far the entity drops in one step, in blocks. */
    readonly maxFallDistance: number;
    readonly canPathOverWater: boolean;
    readonly canPathOverLava: boolean;
    readonly canPathFromAir: boolean;
    readonly canFloat: boolean;
    readonly canSink: boolean;
    readonly canSwim: boolean;
    readonly canWalk: boolean;
    readonly canWalkInLava: boolean;
    /** Whether `minecraft:can_climb` lets the entity climb ladder blocks. */
    readonly canClimbLadders?: boolean;
    /** Whether `minecraft:can_stand_on_powder_snow` lets the entity use powder snow as support. */
    readonly canStandOnPowderSnow?: boolean;
    readonly canFly: boolean;
    readonly canBreach: boolean;
    readonly canJump: boolean;
    readonly canOpenDoors: boolean;
    readonly canOpenIronDoors: boolean;
    readonly canPassDoors: boolean;
    readonly canBreakDoors: boolean;
    readonly avoidWater: boolean;
    readonly avoidSun: boolean;
    readonly avoidPortals: boolean;
    readonly avoidDamageBlocks: boolean;
    readonly isAmphibious: boolean;
    /** Java's path-type costs, keyed by `PathType`; negative values are blocked. */
    readonly pathfindingMalus?: Readonly<Record<string, number>>;
    /** Block identifiers the path refuses to enter, from `blocks_to_avoid`. */
    readonly blocksToAvoid: readonly string[];
}

/**
 * The profile of an entity with no `minecraft:navigation.*` component: a
 * one-block walker that opens nothing and avoids nothing.
 */
export const defaultNavigationProfile: NavigationProfile = {
    kind: 'walk',
    height: 2,
    stepHeight: 1,
    maxFallDistance: 3,
    canPathOverWater: false,
    canPathOverLava: false,
    canPathFromAir: false,
    canFloat: false,
    canSink: true,
    canSwim: false,
    canWalk: true,
    canWalkInLava: false,
    canClimbLadders: false,
    canStandOnPowderSnow: false,
    canFly: false,
    canBreach: false,
    canJump: true,
    canOpenDoors: false,
    canOpenIronDoors: false,
    canPassDoors: true,
    canBreakDoors: false,
    avoidWater: false,
    avoidSun: false,
    avoidPortals: false,
    avoidDamageBlocks: false,
    isAmphibious: false,
    blocksToAvoid: []
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const flag = (body: Record<string, unknown>, key: string, fallback: boolean): boolean =>
    typeof body[key] === 'boolean' ? body[key] : fallback;

/** The identifiers of `blocks_to_avoid`, which vanilla writes as names or as `{name}` objects. */
const avoidedBlocks = (value: unknown): readonly string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        if (typeof value === 'string') return [value];
        if (isRecord(value) && typeof value.name === 'string') return [value.name];
        return [];
    }

    const avoided: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const member = value[index];
        if (typeof member === 'string') avoided.push(member);
        else if (isRecord(member) && typeof member.name === 'string') avoided.push(member.name);
    }
    return avoided;
};

/** How tall an entity is, from `minecraft:collision_box`, rounded up to whole blocks. */
const heightOf = (entity: EntityInstance): number => {
    const box = entity.componentParams('minecraft:collision_box');
    const height = isRecord(box) && typeof box.height === 'number' ? box.height : 1.8;
    return Math.max(1, Math.ceil(height));
};

/** How high the entity steps, from `minecraft:variable_max_auto_step`. */
const stepHeightOf = (entity: EntityInstance, canJump: boolean): number => {
    const step = entity.componentParams('minecraft:variable_max_auto_step');
    if (isRecord(step) && typeof step.base_value === 'number') return step.base_value;
    return canJump ? 1 : 0.5625;
};

/** Adds entity abilities declared separately from the navigation component. */
const withEntityAbilities = (entity: EntityInstance, profile: NavigationProfile): NavigationProfile => ({
    ...profile,
    canFly: profile.canFly || entity.hasComponent('minecraft:can_fly'),
    canClimbLadders: entity.hasComponent('minecraft:can_climb'),
    canStandOnPowderSnow: entity.hasComponent('minecraft:can_stand_on_powder_snow')
});

/**
 * Builds the path finder's rules from the entity's active navigation
 * component.
 *
 * @returns The profile of the first `minecraft:navigation.*` the entity has
 *   active, or {@link defaultNavigationProfile} when it has none.
 */
export const navigationProfile = (entity: EntityInstance): NavigationProfile => {
    for (const kind of NAVIGATION_KINDS) {
        const body = entity.componentParams(`minecraft:navigation.${kind}`);
        if (!isRecord(body)) continue;

        const canJump = flag(body, 'canJump', true);
        return withEntityAbilities(
            entity,
            withJavaNavigation(entity, {
                kind,
                height: heightOf(entity),
                stepHeight: stepHeightOf(entity, canJump),
                maxFallDistance: 3,
                canPathOverWater: flag(body, 'canPathOverWater', false),
                canPathOverLava: flag(body, 'canPathOverLava', false),
                canPathFromAir: flag(body, 'canPathFromAir', false),
                canFloat: flag(body, 'canFloat', false),
                canSink: flag(body, 'canSink', true),
                canSwim: flag(body, 'canSwim', kind === 'swim'),
                canWalk: flag(body, 'canWalk', kind !== 'fly' && kind !== 'hover' && kind !== 'float'),
                canWalkInLava: flag(body, 'canWalkInLava', false),
                canFly: flag(body, 'canFly', kind === 'fly' || kind === 'hover' || kind === 'float'),
                canBreach: flag(body, 'canBreach', false),
                canJump,
                canOpenDoors: flag(body, 'canOpenDoors', false),
                canOpenIronDoors: flag(body, 'canOpenIronDoors', false),
                canPassDoors: flag(body, 'canPassDoors', true),
                canBreakDoors: flag(body, 'canBreakDoors', false),
                avoidWater: flag(body, 'avoidWater', false),
                avoidSun: flag(body, 'avoidSun', false),
                avoidPortals: flag(body, 'avoidPortals', false),
                avoidDamageBlocks: flag(body, 'avoidDamageBlocks', false),
                isAmphibious: flag(body, 'isAmphibious', false),
                blocksToAvoid: avoidedBlocks(body.blocksToAvoid)
            })
        );
    }

    return withEntityAbilities(
        entity,
        withJavaNavigation(entity, { ...defaultNavigationProfile, height: heightOf(entity) })
    );
};

/** Lets the pinned Java navigator decide which media its path can enter and hold. */
const withJavaNavigation = (entity: EntityInstance, profile: NavigationProfile): NavigationProfile => {
    const java = entity.javaNavigation;
    if (java === undefined) return profile;

    const navigationClass = java.navigationClass;
    const isWaterBound = navigationClass.endsWith('WaterBoundPathNavigation');
    const isAmphibious = navigationClass.endsWith('AmphibiousPathNavigation');
    const isClimber = navigationClass.endsWith('WallClimberNavigation');
    const isFlying = navigationClass.endsWith('FlyingPathNavigation') || profile.canFly;
    const kind: NavigationKind = isWaterBound ? 'swim' : isFlying ? 'fly' : isClimber ? 'climb' : 'walk';

    return {
        ...profile,
        kind,
        canFloat: java.canFloat,
        canSwim: isWaterBound || isAmphibious,
        canWalk: java.canNavigateGround,
        canFly: isFlying,
        isAmphibious,
        pathfindingMalus: java.pathfindingMalus
    };
};

/** Builds a profile for a test or a caller that has no entity, over the defaults. */
export const navigationProfileOf = (overrides: Partial<NavigationProfile> = {}): NavigationProfile => ({
    ...defaultNavigationProfile,
    ...overrides
});
