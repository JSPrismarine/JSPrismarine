/**
 * Whether two entities may breed, and what they produce.
 *
 * `minecraft:behavior.breed` owns the courtship and asks the server the two
 * questions it cannot answer itself, because the rule is in
 * `minecraft:breedable` rather than in the goal. This module is that
 * component read back: which types are mates, whether taming is required, how
 * long the pair waits afterwards, and which type the child is.
 *
 * Being in love is the one part the component does not carry. In Java it is
 * `Animal.inLove`, a timer the feeding interaction sets, so it is a timer on
 * the body here too. A type that declares `love_filters` answers the question
 * with a filter instead, which is Bedrock's own way of saying it.
 */
import type { EntityInstance } from '@jsprismarine/entities';
import { evaluateFilter, isRecord } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';
import { parseFilter } from '@jsprismarine/packs';

import type { DataEntity } from './DataEntity';

/** How long a pair waits before breeding again by default, in seconds. */
const DEFAULT_BREED_COOLDOWN = 60;

/** Ticks in one second, which is what `breed_cooldown` is measured in. */
const TICKS_PER_SECOND = 20;

/**
 * Parsed breeding rules for each active component definition. A component group
 * that changes these parameters supplies a different object, while repeated
 * reads of the same data-driven component reuse its parsed rules.
 */
const rulesByParams = new WeakMap<Record<string, unknown>, BreedableRules>();

/** One entry of `breeds_with`: a type this entity mates with, and the child it makes. */
export interface MateType {
    /** The entity type that counts as a mate, such as `minecraft:horse`. */
    readonly mateType: string;
    /** The child's type, which differs from both parents for a mule. */
    readonly babyType: string | undefined;
    /** The event to run on the child. */
    readonly breedEvent: string | undefined;
}

/** `minecraft:breedable`, as the two breeding questions read it. */
export interface BreedableRules {
    readonly requireTame: boolean;
    readonly requireFullHealth: boolean;
    readonly breedCooldownTicks: number;
    /** Every accepted mate; empty means the entity breeds with its own type only. */
    readonly mates: readonly MateType[];
    /** A filter that decides whether the entity is in love, when the type writes one. */
    readonly loveFilters: Filter | undefined;
}

/**
 * The breeding rules of one live entity.
 *
 * @returns The rules, or undefined when `minecraft:breedable` is not active
 *   on the entity now. A component group that removes it stops the entity
 *   breeding, which is how a baby's group works.
 */
export const breedableOf = (instance: EntityInstance): BreedableRules | undefined => {
    const params = instance.componentParams('minecraft:breedable');
    if (!isRecord(params)) return undefined;

    const cached = rulesByParams.get(params);
    if (cached !== undefined) return cached;

    const cooldown = typeof params.breed_cooldown === 'number' ? params.breed_cooldown : DEFAULT_BREED_COOLDOWN;
    const rules = {
        requireTame: params.require_tame !== false,
        requireFullHealth: params.require_full_health === true,
        breedCooldownTicks: Math.round(cooldown * TICKS_PER_SECOND),
        mates: matesOf(params.breeds_with),
        loveFilters: params.love_filters === undefined ? undefined : parseFilter(params.love_filters)
    };
    rulesByParams.set(params, rules);
    return rules;
};

/** Whether the entity is in love now, which is what makes it look for a mate at all. */
export const isInLove = (entity: DataEntity, rules: BreedableRules): boolean => {
    if (rules.loveFilters !== undefined) return evaluateFilter(rules.loveFilters, entity.instance.filterContext());
    return entity.body.loveTicks > 0;
};

/**
 * Reads the offspring type declared for one mate by an entity's active component data.
 *
 * @param instance - Entity instance whose offspring component declares the pair.
 * @param mateIdentifier - The other entity's type identifier.
 * @param resolveIdentifier - Maps Java or Bedrock names into the active entity registry.
 * @returns The declared offspring type, or undefined when the component has no pair for that mate.
 */
export const offspringIdentifierOf = (
    instance: EntityInstance,
    mateIdentifier: string,
    resolveIdentifier: (identifier: string) => string | undefined = (identifier) => identifier
): string | undefined => {
    const offspring = instance.componentParams('minecraft:offspring');
    if (!isRecord(offspring) || !isRecord(offspring.offspring_pairs)) return undefined;

    const resolvedMate = resolveIdentifier(mateIdentifier);
    if (resolvedMate === undefined) return undefined;

    const pair = Object.entries(offspring.offspring_pairs).find(
        ([parentIdentifier]) => resolveIdentifier(parentIdentifier) === resolvedMate
    );
    return pair === undefined || typeof pair[1] !== 'string' ? undefined : resolveIdentifier(pair[1]);
};

/**
 * Whether two entities may breed with each other now.
 *
 * Both sides have to agree: an entity breeds with a mate its own
 * `breeds_with` names, and the mate has to be willing on the same terms.
 */
export const canBreed = (self: DataEntity, other: DataEntity): boolean => {
    if (self.id === other.id) return false;

    const rules = breedableOf(self.instance);
    if (rules === undefined || accepts(rules, self, other) === undefined) return false;

    const otherRules = breedableOf(other.instance);
    if (otherRules === undefined) return false;

    return ready(self, rules) && ready(other, otherRules);
};

/**
 * The child two entities produce.
 *
 * @param resolveIdentifier - Maps Java or Bedrock names into the active entity registry.
 * @returns The child's type and the event to run on it, or undefined when the
 *   pair is not a pair.
 */
export const offspringOf = (
    self: DataEntity,
    other: DataEntity,
    resolveIdentifier: (identifier: string) => string | undefined = (identifier) => identifier
): { identifier: string; event?: string } | undefined => {
    const rules = breedableOf(self.instance);
    if (rules === undefined) return undefined;

    const mate = accepts(rules, self, other);
    if (mate === undefined) return undefined;

    const offspringIdentifier = offspringIdentifierOf(self.instance, other.identifier, resolveIdentifier);
    if (mate === SAME_TYPE) return { identifier: offspringIdentifier ?? self.identifier };
    return {
        identifier:
            offspringIdentifier ??
            (mate.babyType === undefined ? self.identifier : (resolveIdentifier(mate.babyType) ?? mate.babyType)),
        ...(mate.breedEvent === undefined ? {} : { event: mate.breedEvent })
    };
};

/**
 * Spends one pair's love and starts their cooldown, which is what breeding
 * costs them.
 */
export const spendLove = (entity: DataEntity): void => {
    const rules = breedableOf(entity.instance);
    entity.body.loveTicks = 0;
    entity.body.breedCooldown = rules?.breedCooldownTicks ?? DEFAULT_BREED_COOLDOWN * TICKS_PER_SECOND;
};

/** The marker for a type that breeds with its own kind, which declares no `breeds_with`. */
const SAME_TYPE = Symbol('breeds with its own type');

/** Whether one entity's rules accept the other as a mate, and on what terms. */
const accepts = (
    rules: BreedableRules,
    self: DataEntity,
    other: DataEntity
): MateType | typeof SAME_TYPE | undefined => {
    if (rules.mates.length === 0) return self.identifier === other.identifier ? SAME_TYPE : undefined;
    return rules.mates.find((mate) => mate.mateType === other.identifier);
};

/** Whether one side is willing: grown up, in love, off cooldown and tame enough. */
const ready = (entity: DataEntity, rules: BreedableRules): boolean => {
    if (entity.instance.hasComponent('minecraft:is_baby')) return false;
    if (entity.body.breedCooldown > 0) return false;
    if (rules.requireTame && !entity.instance.hasComponent('minecraft:is_tamed') && entity.body.owner === undefined)
        return false;
    if (rules.requireFullHealth && !atFullHealth(entity)) return false;
    return isInLove(entity, rules);
};

/** Whether the entity's health is at its maximum, for `require_full_health`. */
const atFullHealth = (entity: DataEntity): boolean => {
    const health = entity.instance.attributes.get('health');
    return health !== undefined && health.current >= health.max;
};

/** `breeds_with`, which vanilla writes as one object or an array of them. */
const matesOf = (value: unknown): readonly MateType[] => {
    const entries = value === undefined ? [] : Array.isArray(value) ? value : [value];
    return entries.filter(isRecord).flatMap((entry) => {
        const mateType = typeof entry.mate_type === 'string' ? entry.mate_type : undefined;
        if (mateType === undefined) return [];
        return [
            {
                mateType,
                babyType: typeof entry.baby_type === 'string' ? entry.baby_type : undefined,
                breedEvent: typeof entry.breed_event === 'string' ? entry.breed_event : undefined
            }
        ];
    });
};
