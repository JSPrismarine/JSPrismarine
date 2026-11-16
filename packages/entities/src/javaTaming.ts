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
