/**
 * The experience a mob drops when it dies, by Java's rule.
 *
 * Java's `LivingEntity.dropExperience` pays out only when a player hurt the mob shortly before it
 * died, `shouldDropExperience` allows it (not for a baby animal) and `doMobLoot` is on. The amount
 * is `getBaseExperienceReward`: one to three for an animal or a water creature, and for any other
 * mob its `xpReward` plus one to three for each held or worn item, which a baby zombie multiplies
 * by two and a half first. Bedrock's `minecraft:experience_reward` writes the same idea in Molang,
 * but with a float `Math.Random` that cannot give an animal its full one-to-three spread, so the
 * server runs Java's numbers.
 *
 * @javaSee LivingEntity.dropExperience
 */
/** How one Java mob type computes its death experience. */
export type ExperienceRule =
    /** `Animal`, `WaterAnimal` and `AgeableWaterCreature`: `1 + nextInt(3)`, nothing for a baby. */
    | { readonly kind: 'animal' }
    /** `Mob.getBaseExperienceReward`: `xpReward`, plus `1 + nextInt(3)` for each equipped item. */
    | { readonly kind: 'mob'; readonly xp: number }
    /** `Zombie`: the mob rule, after a baby's `xpReward` is multiplied by 2.5. */
    | { readonly kind: 'zombie'; readonly xp: number }
    /** `Piglin` and `Hoglin`: `xpReward` alone. */
    | { readonly kind: 'fixed'; readonly xp: number }
    /** `Slime` and `MagmaCube`: `setSize` makes `xpReward` the size. */
    | { readonly kind: 'size' }
    /** `SulfurCube`: `1 + nextInt(2)`, nothing for a baby. */
    | { readonly kind: 'sulfur_cube' };

const ANIMAL: ExperienceRule = { kind: 'animal' };
const mob = (xp: number): ExperienceRule => ({ kind: 'mob', xp });
const zombie: ExperienceRule = { kind: 'zombie', xp: 5 };

/**
 * Java's rule for each mob, keyed by the Bedrock identifier the server runs it as. The `xpReward`
 * values are the ones each class's constructor sets: 5 from `Monster`, 10 for the blaze, breeze,
 * guardians and evoker, 3 for the endermite and vex, 20 for the ravager and piglin brute, 50 for
 * the wither. The parity suite reads them back out of the pinned Java jar.
 */
export const JAVA_EXPERIENCE: ReadonlyMap<string, ExperienceRule> = new Map<string, ExperienceRule>([
    ...[
        'armadillo',
        'axolotl',
        'bee',
        'camel',
        'camel_husk',
        'cat',
        'chicken',
        'cod',
        'cow',
        'dolphin',
        'donkey',
        'fox',
        'frog',
        'glow_squid',
        'goat',
        'happy_ghast',
        'horse',
        'llama',
        'mooshroom',
        'mule',
        'nautilus',
        'ocelot',
        'panda',
        'parrot',
        'pig',
        'polar_bear',
        'pufferfish',
        'rabbit',
        'salmon',
        'sheep',
        'skeleton_horse',
        'sniffer',
        'squid',
        'strider',
        'trader_llama',
        'tropicalfish',
        'turtle',
        'wolf',
        'zombie_horse',
        'zombie_nautilus'
    ].map((name): [string, ExperienceRule] => [`minecraft:${name}`, ANIMAL]),
    ...(
        [
            ['blaze', 10],
            ['bogged', 5],
            ['breeze', 10],
            ['cave_spider', 5],
            ['creeper', 5],
            ['elder_guardian', 10],
            ['enderman', 5],
            ['endermite', 3],
            ['evocation_illager', 10],
            ['ghast', 5],
            ['guardian', 10],
            ['parched', 5],
            ['phantom', 5],
            ['piglin_brute', 20],
            ['pillager', 5],
            ['ravager', 20],
            ['shulker', 5],
            ['silverfish', 5],
            ['skeleton', 5],
            ['spider', 5],
            ['stray', 5],
            ['vex', 3],
            ['vindicator', 5],
            ['warden', 5],
            ['witch', 5],
            ['wither', 50],
            ['wither_skeleton', 5],
            ['zoglin', 5]
        ] as const
    ).map(([name, xp]): [string, ExperienceRule] => [`minecraft:${name}`, mob(xp)]),
    ...['drowned', 'husk', 'zombie', 'zombie_villager_v2', 'zombie_pigman'].map((name): [string, ExperienceRule] => [
        `minecraft:${name}`,
        zombie
    ]),
    ['minecraft:piglin', { kind: 'fixed', xp: 5 }],
    ['minecraft:hoglin', { kind: 'fixed', xp: 5 }],
    ['minecraft:slime', { kind: 'size' }],
    ['minecraft:magma_cube', { kind: 'size' }],
    ['minecraft:sulfur_cube', { kind: 'sulfur_cube' }]
]);

/** What one death's experience depends on. */
export interface ExperienceFacts {
    readonly baby: boolean;
    /** The mob's held and worn items, which `Mob.getBaseExperienceReward` pays one to three each for. */
    readonly equippedItems: number;
    /** A slime's or magma cube's size. */
    readonly size: number;
    /** Draws a value in [0, 1). */
    readonly random: { next(): number };
}

/** `1 + nextInt(bound)`. */
const roll = (random: ExperienceFacts['random'], bound: number): number => 1 + Math.floor(random.next() * bound);

/**
 * The experience one death drops under Java's `getBaseExperienceReward`.
 *
 * @returns The points, zero for a baby whose type `shouldDropExperience` refuses.
 */
export const deathExperience = (rule: ExperienceRule, facts: ExperienceFacts): number => {
    const withGear = (xp: number): number => {
        if (xp <= 0) return xp;
        let total = xp;
        for (let item = 0; item < facts.equippedItems; item += 1) total += roll(facts.random, 3);
        return total;
    };
    switch (rule.kind) {
        case 'animal':
            return facts.baby ? 0 : roll(facts.random, 3);
        case 'mob':
            return withGear(rule.xp);
        case 'zombie':
            return withGear(facts.baby ? Math.trunc(rule.xp * 2.5) : rule.xp);
        case 'fixed':
            return rule.xp;
        case 'size':
            return facts.size;
        case 'sulfur_cube':
            return facts.baby ? 0 : roll(facts.random, 2);
    }
};

/**
 * The orb sizes Java's `ExperienceOrb.getExperienceValue` splits an award into, largest first.
 *
 * @javaSource ExperienceOrb.getExperienceValue
 */
const ORB_SIZES = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1] as const;

/**
 * Splits an award into orbs the way Java's `ExperienceOrb.award` does: the largest size that fits,
 * again and again.
 *
 * @javaSource ExperienceOrb.award
 */
export const experienceOrbs = (points: number): readonly number[] => {
    const orbs: number[] = [];
    let left = Math.max(0, Math.trunc(points));
    while (left > 0) {
        const size = ORB_SIZES.find((candidate) => candidate <= left) ?? 1;
        orbs.push(size);
        left -= size;
    }
    return orbs;
};
