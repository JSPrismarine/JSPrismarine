/**
 * The gameplay side of the 58 advancement triggers.
 *
 * One function per thing that happens in the world, each named after the
 * event rather than after the trigger, because the call site knows it just
 * killed something and should not have to know that Java calls that
 * `player_killed_entity` and raises it twice - once for the killer and once
 * for the victim. Keeping the mapping here is also what keeps the trigger
 * names out of the handlers.
 *
 * ## What is wired, and what is not
 *
 * Twelve of the 58 fire, and a function is here only when something in this
 * server actually calls it. A helper for a trigger with no call site would
 * read as coverage while firing never, which is worth less than saying so.
 *
 * | Trigger | Raised from |
 * | --- | --- |
 * | `inventory_changed` | a dropped stack picked up, and a finished craft |
 * | `thrown_item_picked_up_by_player` | a dropped stack picked up |
 * | `recipe_crafted` | `ItemStackRequestHandler`'s crafting action |
 * | `player_killed_entity`, `entity_killed_player` | `Entity.onDeath` |
 * | `player_hurt_entity`, `entity_hurt_player` | `Entity.damage` |
 * | `placed_block` | `World.useItemOn` |
 * | `enchanted_item` | a row taken at an enchanting table |
 * | `location`, `tick` | `Player.update`, every second |
 * | `changed_dimension` | `Player.setWorld` |
 *
 * The other 46 have no call site, and the reason is nearly always that the
 * subsystem which would know the event does not exist. There is no status
 * effect system, so `effects_changed`, `levitation` and `used_totem` cannot
 * fire. There is no brewing, beacon, fishing, breeding, taming, riding,
 * trading, shearing or sleeping, so none of those can. There is no recipe
 * book, so `recipe_unlocked` has nothing to unlock, and no container loot
 * generation, so `player_generates_container_loot` has nothing to report.
 *
 * Four are nearer than that, and each needs one call from a file this module
 * does not own:
 *
 * - `consume_item` wants the `feed` action in `src/item/actorPort.ts`, which
 *   is where eating lands. It is the whole of `husbandry/root`.
 * - `item_used_on_block` and the two `*_block_use` ids want
 *   `useItemOnBlock` in `src/item/interaction.ts`, the content interaction
 *   path, which is the only place that knows a click acted on a block without
 *   placing one.
 * - `item_durability_changed` wants `spendDurability` in
 *   `src/item/actorPort.ts`.
 */
import type { ItemStack as PredicateItemStack, Vec3 } from '@jsprismarine/predicates';

import type Player from '../Player';
import type { Entity } from '../entity/Entity';
import type { DamageSource } from '../entity/DamageSource';
import type { Item } from '../item/Item';
import { entityPredicateView, vec3Of } from '../entity/predicateView';
import { lootDamageSource } from '../entity/mobLoot';
import { raiseAdvancement } from './raise';
import { advancementSubject } from './subject';

/** Whether anything at all is listening, so a call site pays nothing with the content off. */
const enabled = (player: Player): boolean => player.getServer().getContent() !== undefined;

/** One entity as a trigger condition reads it, equipment included. */
const viewOf = (entity: Entity) => entityPredicateView(entity, { equipment: entity.getEquipment() });

/** Every slot of a player's main inventory, with an empty slot as undefined. */
const inventoryOf = (player: Player): readonly (PredicateItemStack | undefined)[] => {
    const inventory = player.getInventory();
    const slots: (PredicateItemStack | undefined)[] = [];

    for (let slot = 0; slot < inventory.getSlotCount(); slot += 1) {
        const held = inventory.getEntry(slot)?.toItemStack();
        slots.push(held && held.getName() !== 'minecraft:air' ? held.asPredicateStack() : undefined);
    }
    return slots;
};

/**
 * A player's inventory changed.
 *
 * The single most important trigger in the game: 1914 of the 4045 vanilla
 * criteria use it, and it is how nearly every "get this item" advancement is
 * earned - including the ones a player gets for breaking a block, because Java
 * has no "broke a block" trigger at all. `minecraft:story/mine_stone` is an
 * `inventory_changed` on `#minecraft:stone_tool_materials`.
 *
 * @param changed - The stack that changed, which is what a single-item
 *   criterion is tested against. 1913 of the 1914 take that path, so leaving
 *   it out makes almost all of them unreachable.
 */
export const advancementInventoryChanged = (player: Player, changed?: Item): void => {
    if (!enabled(player)) return;

    raiseAdvancement(player, 'inventory_changed', {
        player: advancementSubject(player),
        inventory: inventoryOf(player),
        ...(changed === undefined ? {} : { changed: changed.asPredicateStack() })
    });
};

/**
 * A player finished a recipe.
 *
 * Raised alongside the inventory change the result produces, because Java
 * raises both and a vanilla advancement may be listening for either.
 */
export const advancementItemCrafted = (
    player: Player,
    recipe: string,
    ingredients: readonly Item[],
    result?: Item
): void => {
    if (!enabled(player)) return;

    raiseAdvancement(player, 'recipe_crafted', {
        player: advancementSubject(player),
        recipe,
        ingredients: ingredients.map((stack) => stack.asPredicateStack())
    });
    advancementInventoryChanged(player, result);
};

/**
 * Something died.
 *
 * Raised from both sides, which is Java's arrangement: the killer's
 * `player_killed_entity` and the victim's `entity_killed_player` are two
 * different triggers over the same event, and a player killed by a player
 * raises both.
 */
export const advancementKill = (victim: Entity, source: DamageSource): void => {
    const killer = source.attacker;

    if (killer && isPlayer(killer) && enabled(killer)) {
        raiseAdvancement(killer, 'player_killed_entity', {
            player: advancementSubject(killer),
            entity: viewOf(victim),
            damageSource: damageSourceView(victim, source)
        });
    }

    // Only with a killer, which is Java's own condition: `entity_killed_player`
    // names the entity that did it, and falling into a hole names nobody.
    if (killer && isPlayer(victim) && enabled(victim)) {
        raiseAdvancement(victim, 'entity_killed_player', {
            player: advancementSubject(victim),
            entity: viewOf(killer),
            damageSource: damageSourceView(victim, source)
        });
    }
};

/**
 * A blow landed, from both sides.
 *
 * `dealt` is before armor and `taken` after, which is the pair Java's
 * `DamagePredicate` compares - the two are different numbers and a criterion
 * may name either.
 */
export const advancementDamage = (
    victim: Entity,
    source: DamageSource,
    dealt: number,
    taken: number,
    blocked: boolean
): void => {
    const attacker = source.attacker;

    if (attacker && isPlayer(attacker) && enabled(attacker)) {
        raiseAdvancement(attacker, 'player_hurt_entity', {
            player: advancementSubject(attacker),
            entity: viewOf(victim),
            damageSource: damageSourceView(victim, source),
            dealt,
            taken,
            blocked
        });
    }

    if (isPlayer(victim) && enabled(victim)) {
        raiseAdvancement(victim, 'entity_hurt_player', {
            player: advancementSubject(victim),
            damageSource: damageSourceView(victim, source),
            dealt,
            taken,
            blocked
        });
    }
};

/** What a player did with an item against a block, which is also how a placement is reported. */
export interface BlockUseEvent {
    readonly origin: Vec3;
    /** The block that ended up there for a placement, or the one clicked for a use. */
    readonly block: string;
    /** What was in hand. */
    readonly tool: Item;
}

/**
 * A player placed a block.
 *
 * The `location` field of this trigger evaluates in Java's
 * `advancement_location` key set, so the block state and the tool both reach
 * the conditions. The state goes out under its Bedrock identifier, which is
 * the same string as Java's for the great majority of blocks and is not for
 * the handful the two editions name differently; translating the other way is
 * not something `@jsprismarine/mapping` does.
 */
export const advancementPlacedBlock = (player: Player, event: BlockUseEvent): void => {
    if (!enabled(player)) return;

    raiseAdvancement(player, 'placed_block', {
        player: advancementSubject(player),
        origin: event.origin,
        blockState: { name: event.block },
        tool: event.tool.asPredicateStack()
    });
};

/** An enchanting table gave a player an enchanted item, with what it cost. */
export const advancementEnchantedItem = (player: Player, item: Item, levels: number): void => {
    if (!enabled(player)) return;

    raiseAdvancement(player, 'enchanted_item', {
        player: advancementSubject(player),
        item: item.asPredicateStack(),
        levels
    });
};

/** A player picked a dropped stack up off the ground. */
export const advancementPickedUpItem = (player: Player, item: Item, thrower?: Entity): void => {
    if (!enabled(player)) return;

    raiseAdvancement(player, 'thrown_item_picked_up_by_player', {
        player: advancementSubject(player),
        item: item.asPredicateStack(),
        ...(thrower === undefined ? {} : { entity: viewOf(thrower) })
    });
    advancementInventoryChanged(player, item);
};

/**
 * A player's periodic check, which is how the 67 `location` criteria are
 * earned.
 *
 * Java runs this every 20 ticks for every player, and `tick` with it; the
 * location conditions are about where the player is standing rather than
 * about anything that happened, so there is nothing else to hang them on.
 */
export const advancementPlayerTick = (player: Player): void => {
    if (!enabled(player)) return;

    const subject = advancementSubject(player);
    raiseAdvancement(player, 'location', { player: subject });
    raiseAdvancement(player, 'tick', { player: subject });
};

/** A player moved between dimensions. */
export const advancementChangedDimension = (player: Player, from: string, to: string): void => {
    if (!enabled(player) || from === to) return;

    raiseAdvancement(player, 'changed_dimension', { player: advancementSubject(player), from, to });
};

/** Whether an entity is a player, without importing the class into a type position that loops. */
const isPlayer = (entity: Entity): entity is Player => entity.getType() === 'minecraft:player';

/**
 * The blow as the damage source conditions read it.
 *
 * The real type and its tags come from the content build, because `lootDamageSource`
 * is what resolves a `DamageCause` into a Java damage type and looks its
 * `damage_type` tags up. With no content there is nothing to resolve against,
 * and the catch-all keeps the required `damage_source` parameter present
 * rather than absent, which is the difference between a condition reporting
 * and a condition failing.
 */
const damageSourceView = (victim: Entity, source: DamageSource) => {
    const content = victim.getServer().getContent();
    return (
        (content && lootDamageSource(content, source)) ?? {
            type: 'minecraft:generic',
            tags: [],
            position: vec3Of(victim.getPosition())
        }
    );
};
