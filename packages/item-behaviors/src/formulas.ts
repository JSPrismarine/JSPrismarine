/**
 * Java Edition's mining speed, attack damage and durability arithmetic,
 * transcribed from the unobfuscated 26.3 server jar.
 *
 * Every function here is pure, so the server calls them from wherever it
 * already holds the numbers and the tests check them against values the jar
 * itself produces. Each one names the Java method it came from, because the
 * point of the package is that these are Java's formulas rather than
 * approximations of them.
 *
 * All the arithmetic runs through {@link float} because Java computes these in
 * `float` and the differences are visible: `0.2F` is not `0.2`, and a mining
 * speed rounded twice in `float` is not the same number as one rounded once in
 * `double`.
 */
import type { ItemStack } from '@jsprismarine/items';
import { damage as damageComponent, enchantments, equippable, maxDamage, tool } from '@jsprismarine/items';

import type { ActiveEffect, BlockReference, WorldActions } from './world';

/** Rounds a number to the nearest `float`, which is what every step of Java's arithmetic does. */
export const float = Math.fround;

/** `0.2F`, the per-level Haste term, as the `float` Java compiles it to. */
const HASTE_PER_LEVEL = float(0.2);

/** The effect identifiers the mining formula reads. */
export const HASTE_EFFECT = 'minecraft:haste';
/** The effect that divides mining speed. */
export const MINING_FATIGUE_EFFECT = 'minecraft:mining_fatigue';
/** Conduit Power stands in for Haste underwater and uses the same term. */
export const CONDUIT_POWER_EFFECT = 'minecraft:conduit_power';

/** `Attributes.MINING_EFFICIENCY`'s default, which is zero without Efficiency. */
export const DEFAULT_MINING_EFFICIENCY = 0;
/** `Attributes.BLOCK_BREAK_SPEED`'s default. */
export const DEFAULT_BLOCK_BREAK_SPEED = 1;
/** `Attributes.SUBMERGED_MINING_SPEED`'s default, which Aqua Affinity multiplies up to 1. */
export const DEFAULT_SUBMERGED_MINING_SPEED = 0.2;
/** `Attributes.ATTACK_DAMAGE`'s default for a player, before the weapon's modifier. */
export const PLAYER_BASE_ATTACK_DAMAGE = 1;
/** `Attributes.ATTACK_SPEED`'s default, which is the bare hand's four swings a second. */
export const DEFAULT_ATTACK_SPEED = 4;

/**
 * The highest amplifier Haste or Conduit Power contributes, taken as the
 * strongest of the two the way `MobEffectUtil.getDigSpeedAmplification` does.
 *
 * @returns The amplifier, or undefined when the source has neither effect.
 */
export const digSpeedAmplification = (effects: readonly ActiveEffect[]): number | undefined => {
    let best: number | undefined;
    for (const effect of effects) {
        if (effect.id !== HASTE_EFFECT && effect.id !== CONDUIT_POWER_EFFECT) continue;
        best = best === undefined ? effect.amplifier : Math.max(best, effect.amplifier);
    }
    return best;
};

/** The amplifier of Mining Fatigue, or undefined when the source does not have it. */
export const miningFatigueAmplification = (effects: readonly ActiveEffect[]): number | undefined =>
    effects.find((effect) => effect.id === MINING_FATIGUE_EFFECT)?.amplifier;

/** What {@link miningSpeed} needs, which is one line of `Player.getDestroySpeed` each. */
export interface MiningContext {
    /** `ItemStack.getDestroySpeed`: the tool's speed for this block, 1 with no tool. */
    readonly toolSpeed: number;
    /** `Attributes.MINING_EFFICIENCY`, which Efficiency raises by `level * level + 1`. */
    readonly miningEfficiency?: number;
    /** The Haste or Conduit Power amplifier, absent when neither is active. */
    readonly digSpeedAmplifier?: number;
    /** The Mining Fatigue amplifier, absent when it is not active. */
    readonly miningFatigueAmplifier?: number;
    /** `Attributes.BLOCK_BREAK_SPEED`, 1 unless something modifies it. */
    readonly blockBreakSpeed?: number;
    /** `Attributes.SUBMERGED_MINING_SPEED`, 0.2 unless Aqua Affinity raises it. */
    readonly submergedMiningSpeed?: number;
    /** Whether the source's eyes are in water. */
    readonly eyeInWater?: boolean;
    /** Whether the source is standing on something. */
    readonly onGround?: boolean;
}

/**
 * How fast an entity mines, which is `Player.getDestroySpeed(BlockState)` in
 * the 26.3 server jar, line for line:
 *
 * ```java
 * float speed = this.inventory.getSelectedItem().getDestroySpeed(state);
 * if (speed > 1.0F) speed += (float)this.getAttributeValue(Attributes.MINING_EFFICIENCY);
 * if (MobEffectUtil.hasDigSpeed(this)) speed *= 1.0F + (MobEffectUtil.getDigSpeedAmplification(this) + 1) * 0.2F;
 * if (this.hasEffect(MobEffects.MINING_FATIGUE)) speed *= (float)Math.pow(0.3, amplifier + 1);
 * speed *= (float)this.getAttributeValue(Attributes.BLOCK_BREAK_SPEED);
 * if (this.isEyeInFluid(FluidTags.WATER)) speed *= (float)...SUBMERGED_MINING_SPEED...;
 * if (!this.onGround()) speed /= 5.0F;
 * ```
 *
 * The Efficiency bonus only applies when the tool is already faster than bare
 * hands, which is why a pickaxe with Efficiency V mines dirt no faster.
 *
 * The Bedrock client computes its own, different number and the server cannot
 * override it; see the README for what that costs.
 *
 * @returns Blocks of hardness per tick-unit, before `destroyProgress` divides
 *   by the block's hardness.
 */
export const miningSpeed = (context: MiningContext): number => {
    let speed = float(context.toolSpeed);

    if (speed > 1) speed = float(speed + float(context.miningEfficiency ?? DEFAULT_MINING_EFFICIENCY));

    if (context.digSpeedAmplifier !== undefined) {
        speed = float(speed * float(1 + float((context.digSpeedAmplifier + 1) * HASTE_PER_LEVEL)));
    }

    if (context.miningFatigueAmplifier !== undefined) {
        speed = float(speed * float(0.3 ** (context.miningFatigueAmplifier + 1)));
    }

    speed = float(speed * float(context.blockBreakSpeed ?? DEFAULT_BLOCK_BREAK_SPEED));

    if (context.eyeInWater === true) {
        speed = float(speed * float(context.submergedMiningSpeed ?? DEFAULT_SUBMERGED_MINING_SPEED));
    }

    if (context.onGround === false) speed = float(speed / 5);

    return speed;
};

/**
 * The fraction of a block broken in one tick, which is
 * `BlockBehaviour.getDestroyProgress`:
 *
 * ```java
 * int modifier = player.hasCorrectToolForDrops(state) ? 30 : 100;
 * return player.getDestroySpeed(state) / destroySpeed / modifier;
 * ```
 *
 * @param speed - What {@link miningSpeed} returned.
 * @param hardness - The block's `destroySpeed`; -1 means unbreakable.
 * @param correctToolForDrops - Whether the held tool drops the block.
 * @returns A fraction per tick; the block breaks when the running total
 *   reaches 1, so the whole break takes `ceil(1 / progress)` ticks.
 */
export const destroyProgress = (speed: number, hardness: number, correctToolForDrops: boolean): number => {
    if (hardness === -1) return 0;
    return float(float(speed / float(hardness)) / (correctToolForDrops ? 30 : 100));
};

/** How many ticks breaking a block takes, which is the figure a server schedules against. */
export const breakTicks = (speed: number, hardness: number, correctToolForDrops: boolean): number => {
    const progress = destroyProgress(speed, hardness, correctToolForDrops);
    return progress <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(1 / progress);
};

/** The level of one enchantment on a stack, read off `minecraft:enchantments`. */
export const enchantmentLevel = (stack: ItemStack, enchantment: string): number =>
    stack.params(enchantments)?.[enchantment] ?? 0;

/**
 * The `minecraft:mining_efficiency` an Efficiency level contributes, which is
 * the enchantment's own `levels_squared` value with `added: 1.0`.
 */
export const miningEfficiencyOf = (level: number): number => (level <= 0 ? 0 : level * level + 1);

/**
 * The `minecraft:submerged_mining_speed` an Aqua Affinity level produces.
 *
 * The enchantment is `add_multiplied_total` with `base: 4.0`, so one level
 * takes the 0.2 default to 1.0 and removes the underwater penalty outright.
 */
export const submergedMiningSpeedOf = (level: number): number =>
    DEFAULT_SUBMERGED_MINING_SPEED * (1 + 4 * Math.max(0, level));

/** Reads `minecraft:tool` off a stack. */
export const toolOf = (stack: ItemStack) => stack.params(tool);

/** The `minecraft:tool` parameters as the item package parses them. */
export type ToolParameters = NonNullable<ReturnType<typeof toolOf>>;

/**
 * The tool's mining speed for one block, which is `Tool.getMiningSpeed`: the
 * first rule whose block set matches and that carries a speed wins, and the
 * default applies when none does.
 *
 * An item with no `minecraft:tool` mines at 1, which is `Item.getDestroySpeed`.
 */
export const toolSpeedFor = (stack: ItemStack, block: BlockReference, world: WorldActions): number => {
    const parameters = toolOf(stack);
    if (parameters === undefined) return 1;
    for (const rule of parameters.rules) {
        if (rule.speed === undefined) continue;
        if (world.includes(rule.blocks, block.identifier)) return rule.speed;
    }
    return parameters.default_mining_speed ?? 1;
};

/**
 * Whether the tool makes the block drop, which is `Tool.isCorrectForDrops`:
 * the first rule that matches and states a verdict decides, and an item with
 * no rule for the block is not correct.
 */
export const correctForDrops = (stack: ItemStack, block: BlockReference, world: WorldActions): boolean => {
    const parameters = toolOf(stack);
    if (parameters === undefined) return false;
    for (const rule of parameters.rules) {
        if (rule.correct_for_drops === undefined) continue;
        if (world.includes(rule.blocks, block.identifier)) return rule.correct_for_drops;
    }
    return false;
};

/** What {@link attackDamage} needs, which is one line of `Player.attack` each. */
export interface AttackContext {
    /** `Attributes.ATTACK_DAMAGE`, the player's 1 plus the weapon's modifier. */
    readonly baseAttackDamage: number;
    /**
     * `Player.getAttackStrengthScale(0.5F)`, from 0 to 1.
     *
     * Defaults to 1, a fully charged swing, because this project takes
     * Bedrock's behavior for the attack cooldown: the Bedrock client draws no
     * cooldown meter, so a scaled hit would be unexplained. See the README.
     */
    readonly attackStrengthScale?: number;
    /** What the weapon's enchantments add, before the charge scales them. */
    readonly enchantmentBonus?: number;
    /** `Item.getAttackDamageBonus`, which is zero for everything but the mace. */
    readonly itemBonus?: number;
    /** Whether the hit is a critical, which multiplies the base by 1.5. */
    readonly critical?: boolean;
}

/**
 * How much one melee hit deals, which is the damage half of `Player.attack`:
 *
 * ```java
 * float magicBoost = attackStrengthScale * (this.getEnchantedDamage(...) - baseDamage);
 * baseDamage *= 0.2F + attackStrengthScale * attackStrengthScale * 0.8F;
 * baseDamage += attackingItemStack.getItem().getAttackDamageBonus(...);
 * if (criticalAttack) baseDamage *= 1.5F;
 * float totalDamage = baseDamage + magicBoost;
 * ```
 *
 * The enchantment bonus scales linearly with the charge while the base scales
 * quadratically, which is why a half-charged sharpened sword keeps most of its
 * enchantment damage and almost none of its own.
 */
export const attackDamage = (context: AttackContext): number => {
    const scale = float(context.attackStrengthScale ?? 1);
    const magicBoost = float(scale * float(context.enchantmentBonus ?? 0));

    let base = float(context.baseAttackDamage);
    base = float(base * float(float(0.2) + float(float(scale * scale) * float(0.8))));
    base = float(base + float(context.itemBonus ?? 0));
    if (context.critical === true) base = float(base * float(1.5));

    return float(base + magicBoost);
};

/**
 * How charged a swing is, which is `Player.getAttackStrengthScale`:
 * `clamp((attackStrengthTicker + 0.5) / (20 / attackSpeed), 0, 1)`.
 *
 * @param ticksSinceAttack - `attackStrengthTicker`, reset to zero on each swing.
 * @param attackSpeed - `Attributes.ATTACK_SPEED`, four for a bare hand.
 */
export const attackStrengthScale = (ticksSinceAttack: number, attackSpeed = DEFAULT_ATTACK_SPEED): number => {
    const delay = float((1 / attackSpeed) * 20);
    return Math.min(1, Math.max(0, float(float(ticksSinceAttack + float(0.5)) / delay)));
};

/** Reads one `add_value` attribute modifier off a stack's `minecraft:attribute_modifiers`. */
const baseModifier = (stack: ItemStack, attribute: string, id: string): number => {
    const modifiers = stack.get('minecraft:attribute_modifiers');
    if (!Array.isArray(modifiers)) return 0;
    for (const entry of modifiers) {
        if (typeof entry !== 'object' || entry === null) continue;
        const record: Record<string, unknown> = { ...entry };
        if (record.type !== attribute || record.id !== id) continue;
        if (record.operation !== 'add_value' || typeof record.amount !== 'number') continue;
        return record.amount;
    }
    return 0;
};

/**
 * The `minecraft:attack_damage` a player holding this stack has: the player's
 * own base of 1 plus the item's `minecraft:base_attack_damage` modifier.
 */
export const baseAttackDamageOf = (stack: ItemStack): number =>
    PLAYER_BASE_ATTACK_DAMAGE + baseModifier(stack, 'minecraft:attack_damage', 'minecraft:base_attack_damage');

/** The `minecraft:attack_speed` a player holding this stack has, which sets the charge time. */
export const attackSpeedOf = (stack: ItemStack): number =>
    DEFAULT_ATTACK_SPEED + baseModifier(stack, 'minecraft:attack_speed', 'minecraft:base_attack_speed');

/**
 * Whether a stack can take durability damage at all, which is
 * `ItemStack.isDamageableItem`: it needs a maximum, a current value, and no
 * `minecraft:unbreakable`.
 */
export const isDamageable = (stack: ItemStack): boolean =>
    stack.has('minecraft:max_damage') && !stack.has('minecraft:unbreakable') && stack.has('minecraft:damage');

/**
 * How much of a durability hit Unbreaking removes, which is
 * `RemoveBinomial.process`: one roll per point of damage against the
 * enchantment's chance.
 *
 * The chance comes from `unbreaking.json`: `level / (level + 1)` for anything
 * that is not armor, and `2 * level / (5 * level + 5)` for armor. Java
 * switches to a normal approximation above 128 points in one hit, which no
 * item use produces, so only the exact branch is implemented.
 *
 * @param random - A source of numbers in [0, 1), which the tests make fixed.
 */
export const applyUnbreaking = (amount: number, level: number, isArmor: boolean, random: () => number): number => {
    if (level <= 0 || amount <= 0) return amount;
    const chance = isArmor ? float(float(2 * level) / float(5 * level + 5)) : float(float(level) / float(level + 1));
    let dropped = 0;
    for (let roll = 0; roll < amount; roll++) if (random() < chance) dropped++;
    return amount - dropped;
};

/** What {@link spendDurability} worked out. */
export interface DurabilitySpend {
    /** The damage actually applied after Unbreaking and the creative check. */
    readonly amount: number;
    /** The stack's new `minecraft:damage`. */
    readonly damage: number;
    /** Whether the item is used up. */
    readonly broke: boolean;
    /** The stack to put back, already carrying the new damage, or an empty one when it broke. */
    readonly stack: ItemStack;
}

/** What {@link spendDurability} needs besides the stack and the amount. */
export interface DurabilityOptions {
    /** A source of numbers in [0, 1) for the Unbreaking rolls. */
    readonly random: () => number;
    /** Whether the holder has infinite materials, which spends nothing. */
    readonly creative?: boolean;
}

/** The `minecraft:equippable` slots that make a piece of equipment armor for Unbreaking. */
const ARMOR_SLOTS = new Set(['head', 'chest', 'legs', 'feet', 'body']);

/**
 * Whether Unbreaking treats the stack as armor, which halves its benefit.
 *
 * Java asks the `#minecraft:enchantable/armor` tag; the equipment slot is the
 * same question asked of data this package already has.
 */
export const isArmorForUnbreaking = (stack: ItemStack): boolean => {
    const slot = stack.params(equippable)?.slot;
    return slot !== undefined && ARMOR_SLOTS.has(slot);
};

/**
 * Spends durability on a stack, which is `ItemStack.hurtAndBreak` through
 * `processDurabilityChange` and `applyDamage`.
 *
 * Java truncates the Unbreaking result to an `int` and skips the whole path
 * when the amount lands on zero, so an Unbreaking III pickaxe spends nothing
 * three times out of four.
 *
 * @returns The outcome; `stack` is a copy and the argument is left alone.
 */
export const spendDurability = (stack: ItemStack, amount: number, options: DurabilityOptions): DurabilitySpend => {
    const current = stack.params(damageComponent) ?? 0;
    const unchanged: DurabilitySpend = { amount: 0, damage: current, broke: false, stack: stack.copy() };

    if (!isDamageable(stack) || options.creative === true || amount <= 0) return unchanged;

    const level = enchantmentLevel(stack, 'minecraft:unbreaking');
    const applied = Math.trunc(applyUnbreaking(amount, level, isArmorForUnbreaking(stack), options.random));
    if (applied === 0) return unchanged;

    const limit = stack.params(maxDamage) ?? 0;
    const damage = Math.min(current + applied, limit);
    const broke = damage >= limit;
    const next = stack.copy(broke ? stack.count - 1 : stack.count);
    next.set('minecraft:damage', damage);

    return { amount: applied, damage, broke, stack: next };
};
