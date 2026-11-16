/**
 * Java Edition's odds for the rolls a player's feeding starts: taming a wolf, cat, parrot or
 * nautilus, and winning an ocelot's trust.
 *
 * Bedrock's definitions write each chance as a rounded decimal, 0.33 for all of them, including
 * the parrot. Java rolls `random.nextInt(n) == 0`, which is one in three for every one of them but
 * the parrot's one in ten. The server decides each roll and the client only sees whether it
 * succeeded, so the server runs Java's odds for the vanilla types and keeps a definition's own
 * probability for any other type.
 */

/** One in `n` for each vanilla type's taming roll, from the `nextInt` bound in Java's code. */
const JAVA_TAME_ODDS: Readonly<Record<string, number>> = {
    /** Java `Wolf.tryToTame`. */
    'minecraft:wolf': 3,
    /** Java `Cat.tryToTame`. */
    'minecraft:cat': 3,
    /** Java `Parrot.mobInteract`. */
    'minecraft:parrot': 10,
    /** Java `AbstractNautilus.tryToTame`. */
    'minecraft:nautilus': 3,
    'minecraft:zombie_nautilus': 3
};

/** One in `n` for each vanilla type's trust roll: Java `Ocelot.mobInteract`. */
const JAVA_TRUST_ODDS: Readonly<Record<string, number>> = {
    'minecraft:ocelot': 3
};

/**
 * The chance one feeding tames an entity type.
 *
 * @param identifier - The entity type.
 * @param declared - The probability its `minecraft:tameable` declares.
 * @returns Java's chance for a vanilla type, otherwise the declared one.
 */
export const tameChance = (identifier: string, declared: number): number => {
    const odds = JAVA_TAME_ODDS[identifier];
    return odds === undefined ? declared : 1 / odds;
};

/**
 * The chance one feeding wins an entity type's trust.
 *
 * @param identifier - The entity type.
 * @param declared - The probability its `minecraft:trusting` declares.
 * @returns Java's chance for a vanilla type, otherwise the declared one.
 */
export const trustChance = (identifier: string, declared: number): number => {
    const odds = JAVA_TRUST_ODDS[identifier];
    return odds === undefined ? declared : 1 / odds;
};

/**
 * The temper Java's `AbstractHorse.handleEating` adds for each food a horse, donkey or mule eats
 * from its `horse_food` tag. Hay feeds and heals but adds none.
 */
const HORSE_TEMPER: Readonly<Record<string, number>> = {
    'minecraft:wheat': 3,
    'minecraft:sugar': 3,
    'minecraft:apple': 3,
    'minecraft:carrot': 3,
    'minecraft:golden_carrot': 5,
    'minecraft:golden_apple': 10,
    'minecraft:enchanted_golden_apple': 10
};

/**
 * The temper each food adds to an untamed vanilla mount, from the food tag its Java `isFood`
 * reads and the amounts its `handleEating` adds. A zombie horse eats the red mushrooms of
 * `zombie_horse_food` through `AbstractHorse.handleEating` for 3, where Bedrock writes 10; a llama
 * eats `llama_food` through `Llama.handleEating`, wheat for 3 and hay for 6.
 */
const JAVA_TEMPER: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    'minecraft:horse': HORSE_TEMPER,
    'minecraft:donkey': HORSE_TEMPER,
    'minecraft:mule': HORSE_TEMPER,
    'minecraft:zombie_horse': { 'minecraft:red_mushroom': 3 },
    'minecraft:llama': { 'minecraft:wheat': 3, 'minecraft:hay_block': 6 },
    'minecraft:trader_llama': { 'minecraft:wheat': 3, 'minecraft:hay_block': 6 }
};

/**
 * The temper one food adds to an untamed mount.
 *
 * @param identifier - The mount's entity type.
 * @param item - The food, namespaced.
 * @param declared - What its `minecraft:tamemount` feed items give each item.
 * @returns Java's amount for a vanilla type, otherwise the declared one; undefined when the food
 *   adds no temper.
 */
export const temperOf = (
    identifier: string,
    item: string,
    declared: ReadonlyMap<string, number>
): number | undefined => {
    const java = JAVA_TEMPER[identifier];
    return java === undefined ? declared.get(item) : java[item];
};
