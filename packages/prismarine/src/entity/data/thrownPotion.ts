/**
 * What a thrown potion does where it breaks, transcribed from Java 26.3's `AbstractThrownPotion`,
 * `ThrownSplashPotion` and `ThrownLingeringPotion`.
 *
 * Bedrock's files write it as `on_hit.thrown_potion_effect` and `on_hit.spawn_aoe_cloud`, which
 * the server had no handler for, so a thrown potion broke into nothing. Java's breaks first reach
 * the living things within 4 blocks for a water bottle: a water-sensitive mob takes 1 indirect
 * magic and a burning one is put out. A splash potion then gives each living thing whose box is
 * within 4 blocks of its own its effects, scaled down by the distance, and a lingering potion
 * leaves a cloud of radius 3 that shrinks to nothing over its 600 ticks and by half a block for
 * everyone it reaches, after a 10 tick wait.
 */
import { isRecord } from '@jsprismarine/entities';
import type { EntityPosition } from '@jsprismarine/entities';

/** The thrown potion that splashes its effects around it. */
export const SPLASH_POTION = 'minecraft:splash_potion';
/** The thrown potion that leaves a cloud. */
export const LINGERING_POTION = 'minecraft:lingering_potion';

/** Whether a projectile is a thrown potion this module breaks. */
export const isThrownPotion = (identifier: string): boolean =>
    identifier === SPLASH_POTION || identifier === LINGERING_POTION;

/** The potion tag whose potions hurt a water-sensitive mob, read by `affectEntitiesAround`; it holds water. */
export const HURTS_WATER_SENSITIVE_TAG = 'minecraft:hurts_water_sensitive_entities';
/** The potion tag whose potions put out a burning mob, read by `affectEntitiesAround`; it holds water. */
export const EXTINGUISHES_TAG = 'minecraft:extinguishes_entities';

/**
 * The mobs whose Java class overrides `LivingEntity.isSensitiveToWater` with true: `Blaze`,
 * `EnderMan`, `SnowGolem` and `Strider`.
 */
export const WATER_SENSITIVE: ReadonlySet<string> = new Set([
    'minecraft:blaze',
    'minecraft:enderman',
    'minecraft:snow_golem',
    'minecraft:strider'
]);

/** The box `affectEntitiesAround` searches, the potion's box inflated by 4, 2 and 4. */
export const WATER_REACH = { across: 4, up: 2 } as const;

/** Both reaches end short of 4 blocks, Java's `distanceToSqr < 16`. */
export const REACH_SQUARED = 16;

/** The blow a water-sensitive mob takes from a water bottle, Java's indirect magic 1. */
export const WATER_DAMAGE = 1;

/** One effect a potion carries, by Java's identifier. */
export interface PotionEffectEntry {
    readonly id: string;
    readonly durationTicks: number;
    readonly amplifier: number;
}

/** A thrown potion's `minecraft:potion_contents`: the potion it names and the effects it adds. */
export interface ThrownPotionContents {
    readonly potion: string | undefined;
    readonly customEffects: readonly PotionEffectEntry[];
}

/** Reads a thrown potion's contents from its spawn data. */
export const thrownPotionContentsOf = (data: Readonly<Record<string, unknown>> | undefined): ThrownPotionContents => {
    const contents = data?.['minecraft:potion_contents'];
    if (!isRecord(contents)) return { potion: undefined, customEffects: [] };
    const custom = Array.isArray(contents['custom_effects']) ? contents['custom_effects'] : [];
    return {
        potion: typeof contents['potion'] === 'string' ? contents['potion'] : undefined,
        customEffects: custom.flatMap((effect): PotionEffectEntry[] =>
            isRecord(effect) && typeof effect['id'] === 'string'
                ? [
                      {
                          id: effect['id'],
                          durationTicks: typeof effect['duration'] === 'number' ? effect['duration'] : 1,
                          amplifier: typeof effect['amplifier'] === 'number' ? effect['amplifier'] : 0
                      }
                  ]
                : []
        )
    };
};

/** An axis-aligned box by its corners. */
export interface Box {
    readonly min: EntityPosition;
    readonly max: EntityPosition;
}

/** A body's box: `width` across, centered on its position, and `height` up from its feet. */
export const boxAt = (at: EntityPosition, width: number, height: number): Box => ({
    min: { x: at.x - width / 2, y: at.y, z: at.z - width / 2 },
    max: { x: at.x + width / 2, y: at.y + height, z: at.z + width / 2 }
});

/**
 * The point of a box nearest another point. Java's hit on an entity lands on the struck entity's
 * box, which is where `ThrownSplashPotion.onHitAsPotion` measures every distance from.
 */
export const closestPointOf = (box: Box, at: EntityPosition): EntityPosition => ({
    x: Math.min(Math.max(at.x, box.min.x), box.max.x),
    y: Math.min(Math.max(at.y, box.min.y), box.max.y),
    z: Math.min(Math.max(at.z, box.min.z), box.max.z)
});

/** Java's `AABB.distanceToSqr(AABB)`: the squared gap between two boxes, 0 where they touch. */
export const boxDistanceSquared = (a: Box, b: Box): number => {
    const gap = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
        Math.max(aMin - bMax, bMin - aMax, 0);
    const x = gap(a.min.x, a.max.x, b.min.x, b.max.x);
    const y = gap(a.min.y, a.max.y, b.min.y, b.max.y);
    const z = gap(a.min.z, a.max.z, b.min.z, b.max.z);
    return x * x + y * y + z * z;
};

/**
 * How strongly a splash potion reaches a living thing, Java's `ThrownSplashPotion.onHitAsPotion`:
 * `1 - distance / 4` for a box within 4 blocks of the potion's own at the point it hit, and nothing
 * further out.
 */
export const splashStrength = (potion: Box, target: Box): number | undefined => {
    const squared = boxDistanceSquared(potion, target);
    return squared < REACH_SQUARED ? 1 - Math.sqrt(squared) / 4 : undefined;
};

/**
 * The ticks a splash gives a lasting effect, `(int) (strength * duration * scale + 0.5)`, or
 * undefined when that ends within 20 ticks, which Java's `MobEffectInstance.endsWithin(20)` skips.
 */
export const splashDuration = (ticks: number, strength: number, scale: number): number | undefined => {
    const duration = Math.trunc(strength * ticks * scale + 0.5);
    return duration > 20 ? duration : undefined;
};

/**
 * The cloud a lingering potion leaves, `ThrownLingeringPotion.onHitAsPotion`: radius 3 shrinking to
 * nothing over its 600 ticks, half a block smaller for each entity it reaches, a 10 tick wait, and
 * the potion's effects at the stack's duration scale.
 */
export const lingeringCloudData = (
    effects: readonly PotionEffectEntry[],
    durationScale: number
): Readonly<Record<string, unknown>> => ({
    radius: 3,
    radius_on_use: -0.5,
    duration: 600,
    wait_time: 10,
    radius_per_tick: -3 / 600,
    potion_duration_scale: durationScale,
    effects: effects.map(({ id, durationTicks, amplifier }) => ({ id, amplifier, duration: durationTicks }))
});
