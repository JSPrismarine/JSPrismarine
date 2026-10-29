/**
 * The entity half of the `items` group, over the live player sessions and the live entity index.
 *
 * `contentAdapter.ts` beside this file splits `ItemWorldAction`'s 28 variants in two. A variant
 * whose subject is a place in the world is performed there; a variant whose subject is an entity,
 * an inventory or a screen arrives here, along with queries about
 * the actor and any entity the interaction targeted.
 *
 * What a variant does here is what this server can actually do. The ones it has a system for -
 * eating, a blow, a stack into the inventory, durability, armor, a name tag, dyeing, a teleport,
 * an item cooldown - are performed against that system. The ones whose system this server has not written
 * are reported once per kind and ignored, naming what is missing, because `perform` returns
 * nothing and there is no value to guess; what would be dishonest is reporting success. The item
 * cooldowns are the one piece of state the port keeps, because `minecraft:use_cooldown` is the
 * only one whose state nothing else on the server holds.
 */
import { Vector3 } from '@jsprismarine/math';
import { Gametype, LevelSoundEvent } from '@jsprismarine/minecraft';

import { advancementConsumedItem, advancementDurabilityChanged } from '../advancement/triggers';
import { ArmorSlot } from '@jsprismarine/minecraft';
import ContainerEntry from '../inventory/ContainerEntry';
import { itemDropOf, itemOfDrop, storedItem } from '../inventory/persistence';
import { damageCauseOf } from '../entity/DamageCause';
import { DamageSource } from '../entity/DamageSource';
import { normalizeStatusEffectId } from '../entity/StatusEffect';
import { Item } from './Item';
import { itemFromContent } from './itemFromContent';
import Player from '../Player';
import { Position } from '../world/Position';
import type { ActorItemAction, ItemActorPort } from './contentAdapter';
import type { ContentEntityAccess, ContentItemDrop, ContentLevelFacts } from '../content/world/adapter';
import type { Entity } from '../entity/Entity';
import type { EntityItemInteraction } from '../entity/data/itemInteraction';
import type { ContentTags } from '../content/tags';
import type { ItemStack } from '@jsprismarine/items';
import type {
    EquipmentSlot,
    HolderSet,
    ItemSource,
    LaunchProjectileAction,
    SourceState
} from '@jsprismarine/item-behaviors';
import type { World } from '../world/World';

/** The live world whose entities and players this port acts on. */
export type LiveWorld = () => World | undefined;

/** What {@link createItemActorPort} is built over. */
export interface ItemActorPortOptions {
    /** The live world, read at call time, because the content is built before any world loads. */
    readonly world: LiveWorld;
    /** The `entities` group, which is how a stack that does not fit reaches the ground. */
    readonly entities: ContentEntityAccess;
    /** The clock, which is what an item cooldown is measured against. */
    readonly level: ContentLevelFacts;
    /** Starts a projectile in the live entity runtime, or is absent when that runtime is unavailable. */
    readonly launchProjectile?: (action: LaunchProjectileAction, shooter: Entity) => boolean;
    /** Attaches a live holder to a leashable data-driven entity. */
    readonly attachLead?: (holder: ItemSource, target: ItemSource) => boolean;
    /** Whether the target is a data-driven entity that accepts a name tag. */
    readonly canNameEntity?: (target: Entity) => boolean;
    /** Applies a player's held item to a data-driven entity, when its components accept it. */
    readonly interactWithEntity?: (
        target: Entity,
        player: Player,
        itemIdentifier: string,
        heldItem: ContentItemDrop
    ) => EntityItemInteraction;
    /** Names a data-driven entity after its active `minecraft:nameable` component accepts it. */
    readonly nameEntity?: (target: Entity, name: string) => boolean;
    /** Whether a data-driven entity accepts the requested dye. */
    readonly canDyeEntity?: (target: Entity, color: string) => boolean;
    /** Applies a dye to a data-driven entity. */
    readonly dyeEntity?: (target: Entity, color: string) => boolean;
}

/**
 * The port, plus the interaction context and data-driven entity capabilities.
 *
 * `targetOf` answers a question about an interaction that is happening now, so the interaction
 * has to say what it landed on. Scoped to the call rather than stored, so a target cannot outlive
 * the interaction that found it and be read by the next one.
 */
export interface ServerItemActorPort extends ItemActorPort {
    /** Runs a body with one interaction's target recorded, so {@link ItemActorPort.targetOf} answers. */
    duringInteraction<T>(source: ItemSource, target: ItemSource | undefined, body: () => T): T;
    /** Runs the target entity's data-defined item interaction and consumes or replaces its item. */
    interactWithEntity(source: ItemSource): boolean;
    /** Whether a live data-driven entity accepts a name tag. */
    canNameEntity?(target: ItemSource): boolean;
    /** Whether a live data-driven entity accepts the requested dye. */
    canDyeEntity?(target: ItemSource, color: string): boolean;
}

/** The armor inventory index each `minecraft:equippable` slot name writes into. */
const ARMOR_INDEX: Partial<Record<EquipmentSlot, number>> = {
    head: ArmorSlot.HEAD,
    chest: ArmorSlot.TORSO,
    legs: ArmorSlot.LEGS,
    feet: ArmorSlot.FEET
};

/**
 * The cause for a Java damage type identifier.
 *
 * Uses the server's shared cause resolver, so Java identifiers and Bedrock cause names meet in
 * one mapping. A type this server does not name is generic damage, which is what every unmodeled
 * source already is here.
 */
const causeOf = damageCauseOf;

/** One cooldown, keyed by the entity and the group `minecraft:use_cooldown` names. */
const cooldownKey = (runtimeId: number, group: string): string => `${runtimeId}:${group}`;

/** Whether one effect belongs to a holder set in the current content stack. */
const effectInHolderSet = (effects: HolderSet, identifier: string, tags: ContentTags): boolean =>
    effects.kind === 'entries'
        ? effects.entries.some((entry) => normalizeStatusEffectId(entry) === identifier)
        : tags.includes('mob_effect', effects.tag.includes(':') ? effects.tag : `minecraft:${effects.tag}`, identifier);

/**
 * Whether the point an entity reports is in water.
 *
 * A player reports its eyes rather than its feet, which is what `eyeInWater` asks about, and a
 * player is the only thing on this server that uses an item.
 */
const inWater = (world: World, entity: Entity): boolean => {
    const position = entity.getPosition();
    const block = world.loadedBlockAt(
        Math.floor(position.getX()),
        Math.floor(position.getY()),
        Math.floor(position.getZ())
    );

    return block?.name === 'minecraft:water' || block?.name === 'minecraft:flowing_water';
};

/** Builds the port over one live world. */
export const createItemActorPort = (options: ItemActorPortOptions): ServerItemActorPort => {
    const {
        world,
        entities,
        level,
        launchProjectile,
        attachLead,
        canNameEntity,
        interactWithEntity,
        nameEntity,
        canDyeEntity,
        dyeEntity
    } = options;

    /** Game tick each cooldown runs out at. */
    const cooldowns = new Map<string, number>();

    /** What the interaction being performed landed on, by the runtime id of whoever started it. */
    const targets = new Map<number, ItemSource>();

    const entityOf = (source: ItemSource): Entity | null => world()?.getEntity(BigInt(source.runtimeId)) ?? null;

    const useItemOnEntity = (source: ItemSource): boolean => {
        const player = entityOf(source);
        const targetSource = targets.get(source.runtimeId);
        const target = targetSource === undefined ? null : entityOf(targetSource);
        if (!(player instanceof Player) || target === null || interactWithEntity === undefined) return false;

        const inventory = player.getInventory();
        const heldEntry = inventory.getEntry(inventory.getHandSlotIndex());
        const held = inventory.getItemInHand();
        const emptyHand = (heldEntry?.getCount() ?? 0) < 1 || held.getName() === 'minecraft:air';
        let itemIdentifier: string;
        let heldItem: ContentItemDrop;
        if (emptyHand) {
            itemIdentifier = 'minecraft:air';
            heldItem = { identifier: itemIdentifier, count: 0 };
        } else {
            const stored = storedItem(held, heldEntry?.getCount());
            if (stored === null) return false;
            itemIdentifier = held.getName();
            heldItem = itemDropOf(stored);
        }
        const outcome = interactWithEntity(target, player, itemIdentifier, heldItem);
        if (!outcome.accepted) return false;

        for (const drop of outcome.addedItems ?? []) giveDrop(source, drop);

        if (outcome.takenItem !== undefined) {
            const takenItem = itemOfDrop(outcome.takenItem, player.getServer().getContent());
            if (takenItem !== null) {
                inventory.setItemInHand(new ContainerEntry({ item: takenItem, count: outcome.takenItem.count }));
            } else {
                const position = player.getPosition();
                if (position !== undefined)
                    entities.drop(
                        {
                            x: Math.floor(position.getX()),
                            y: Math.floor(position.getY()),
                            z: Math.floor(position.getZ())
                        },
                        outcome.takenItem
                    );
            }
            return true;
        }
        if (emptyHand) return true;
        if (heldEntry === null) return true;

        let resultItem: Item | undefined;
        if (outcome.resultItem !== undefined) {
            const item = itemFromContent(outcome.resultItem, player.getServer().getContent());
            if (item === null) return false;
            resultItem = outcome.resultItemData === undefined ? item : item.withMeta(outcome.resultItemData);
        }

        if (player.gamemode === Gametype.CREATIVE) {
            const alreadyHasResult =
                resultItem !== undefined &&
                inventory
                    .getItems()
                    .some(
                        (entry) =>
                            entry.getItem().getName() === resultItem.getName() &&
                            entry.getItem().getMeta() === resultItem.getMeta()
                    );
            if (resultItem !== undefined && !alreadyHasResult) {
                inventory.addItem(new ContainerEntry({ item: resultItem, count: 1 }));
            }
            return true;
        }

        if (outcome.hurtItem !== undefined && outcome.hurtItem > 0 && held.getMaxDurability() > 0) {
            const broke = held.getDurability() <= outcome.hurtItem;
            spend(source, outcome.hurtItem, broke);
            if (broke) return true;
        }

        if (outcome.consumeItem === false) return true;

        if (resultItem !== undefined) {
            const replacement = new ContainerEntry({ item: resultItem, count: 1 });
            if (heldEntry.getCount() === 1) inventory.setItemInHand(replacement);
            else {
                inventory.setItemInHand(new ContainerEntry({ item: held, count: heldEntry.getCount() - 1 }));
                const leftOver = inventory.addItem(replacement);
                const position = player.getPosition();
                if (leftOver > 0 && position !== undefined) {
                    entities.drop(
                        {
                            x: Math.floor(position.getX()),
                            y: Math.floor(position.getY()),
                            z: Math.floor(position.getZ())
                        },
                        { identifier: resultItem.getName(), count: leftOver }
                    );
                }
            }
        } else {
            inventory.setItemInHand(new ContainerEntry({ item: held, count: heldEntry.getCount() - 1 }));
        }
        return true;
    };

    /** What is reported for a system this server has not written, once per kind. */
    const reported = new Set<string>();
    const missing = (action: ActorItemAction, system: string): void => {
        if (reported.has(action.kind)) return;
        reported.add(action.kind);

        world()
            ?.getServer()
            .getLogger()
            .debug(`an item behavior asked for ${action.kind}, which needs ${system}`, 'item/actorPort');
    };

    /** The server's own item for a stack an item behavior built, or null when nothing has it. */
    const itemOf = (stack: ItemStack): Item | null => {
        const loaded = world();
        if (loaded === undefined) return null;

        const content = loaded.getServer().getContent();
        const registered = itemFromContent(stack.identifier, content);
        if (registered === null) return null;

        return new Item({
            name: registered.getName(),
            meta: registered.getMeta(),
            count: stack.count,
            content
        });
    };

    const give = (source: ItemSource, stack: ItemStack): void => {
        const entity = entityOf(source);
        const item = itemOf(stack);
        if (item === null) return;

        const position = entity?.getPosition();
        if (!(entity instanceof Player)) {
            if (position === undefined) return;
            entities.drop(
                { x: Math.floor(position.getX()), y: Math.floor(position.getY()), z: Math.floor(position.getZ()) },
                { identifier: stack.identifier, count: stack.count }
            );
            return;
        }

        // What would not fit goes on the ground, which is what vanilla does with a full
        // inventory, and `addItem` reports how many of them that is.
        const leftOver = entity.getInventory().addItem(new ContainerEntry({ item, count: stack.count }));
        if (leftOver > 0 && position !== undefined) {
            entities.drop(
                { x: Math.floor(position.getX()), y: Math.floor(position.getY()), z: Math.floor(position.getZ()) },
                { identifier: stack.identifier, count: leftOver }
            );
        }
    };

    /** Adds a loot drop to a player's inventory, dropping any overflow at their feet. */
    const giveDrop = (source: ItemSource, drop: ContentItemDrop): void => {
        const entity = entityOf(source);
        if (!(entity instanceof Player)) return;

        const item = itemOfDrop(drop, entity.getServer().getContent());
        if (item === null) return;

        const position = entity.getPosition();
        const leftOver = entity.getInventory().addItem(new ContainerEntry({ item, count: drop.count }));
        if (leftOver > 0 && position !== undefined) {
            entities.drop(
                { x: Math.floor(position.getX()), y: Math.floor(position.getY()), z: Math.floor(position.getZ()) },
                { ...drop, count: leftOver }
            );
        }
    };

    const equip = (source: ItemSource, slot: EquipmentSlot, stack: ItemStack): boolean => {
        const entity = entityOf(source);
        const item = itemOf(stack);
        if (!(entity instanceof Player) || item === null) return false;

        const entry = new ContainerEntry({ item, count: stack.count });
        const inventory = entity.getInventory();

        if (slot === 'offhand') {
            inventory.getOffhand().setItem(0, entry);
            return true;
        }
        if (slot === 'hand' || slot === 'mainhand') {
            inventory.setItemInHand(entry);
            return true;
        }

        const index = ARMOR_INDEX[slot];
        if (index === undefined) return false;

        inventory.getArmor().setItem(index, entry);
        return true;
    };

    /**
     * Spends durability on whatever the source is holding.
     *
     * The amount is already through `spendDurability`, so Unbreaking and an item with no
     * `minecraft:max_damage` are accounted for. A stack the hit finished off is cleared, which is
     * what `broke` says happened.
     */
    const spend = (source: ItemSource, amount: number, broke: boolean): void => {
        const entity = entityOf(source);
        if (!(entity instanceof Player)) return;

        const inventory = entity.getInventory();
        const held = inventory.getItemInHand();
        held.durability = Math.max(0, held.durability - amount);

        // Emptied to air. Setting the entry's count to zero left the item's count at one, and
        // the client is sent the item's, so a tool that broke stayed in the hand.
        if (broke) inventory.removeItem(inventory.getHandSlotIndex());

        // After the write, so what the trigger reports is the stack as it now
        // stands rather than as it stood before the hit.
        advancementDurabilityChanged(entity, held, held.durability, amount);
    };

    const teleportRandomly = (source: ItemSource, radius: number): void => {
        const entity = entityOf(source);
        const loaded = world();
        if (entity === null || loaded === undefined) return;

        const from = entity.getPosition();
        const x = from.getX() + (loaded.getServer().getRandom()() * 2 - 1) * radius;
        const z = from.getZ() + (loaded.getServer().getRandom()() * 2 - 1) * radius;

        // Onto whatever is standing at the column, because dropping a player inside terrain is
        // worse than not teleporting them at all.
        const surface = loaded.getLoadedChunk(Math.floor(x) >> 4, Math.floor(z) >> 4)
            ? loaded
                  .getLoadedChunk(Math.floor(x) >> 4, Math.floor(z) >> 4)!
                  .getHighestBlockAt(Math.floor(x) & 0xf, Math.floor(z) & 0xf)
            : null;
        if (surface === null) return;

        void entity
            .setPosition({ position: Position.fromVector3(new Vector3(x + 0.5, surface + 1, z + 0.5), loaded) })
            .catch((error: unknown) => loaded.getServer().getLogger().error(error));
    };

    const perform = (action: ActorItemAction): void => {
        switch (action.kind) {
            case 'feed': {
                const entity = entityOf(action.target);
                if (!(entity instanceof Player)) return;

                entity.addFood(action.nutrition, action.saturation);

                // The action names the nutrition and not the food, so what was
                // eaten is read out of the hand. `minecraft:consumable` raises
                // this while the stack is still there: the behavior returns the
                // reduced stack to its caller, which writes it back afterwards.
                advancementConsumedItem(entity, entity.getInventory().getItemInHand());
                return;
            }
            case 'damage-entity': {
                const entity = entityOf(action.target);
                if (entity === null) return;

                void entity
                    .damage(action.amount, DamageSource.of(causeOf(action.damageType)))
                    .catch((error: unknown) => world()?.getServer().getLogger().error(error));
                return;
            }
            case 'give-item':
                give(action.source, action.item);
                return;
            case 'equip':
                if (!equip(action.target, action.slot, action.item))
                    missing(action, `an equipment slot for ${action.slot}`);
                return;
            case 'consume-durability':
                spend(action.source, action.amount, action.broke);
                return;
            case 'name-entity': {
                const target = entityOf(action.target);
                if (target === null || nameEntity === undefined) {
                    missing(action, 'a live data-driven nameable entity');
                    return;
                }
                if (!nameEntity(target, action.name)) return;
                return;
            }
            case 'teleport-randomly':
                teleportRandomly(action.target, action.radius);
                return;
            case 'start-cooldown':
                cooldowns.set(cooldownKey(action.source.runtimeId, action.group), level.gameTime() + action.ticks);
                return;
            case 'launch-projectile': {
                const shooter = entityOf(action.source);
                if (shooter === null || launchProjectile === undefined || !launchProjectile(action, shooter))
                    missing(action, 'a live data-driven projectile runtime');
                return;
            }
            case 'apply-effects': {
                const target = entityOf(action.target);
                if (target === null) return;
                for (const effect of action.effects) {
                    target.addStatusEffect({
                        id: effect.id,
                        durationTicks: effect.durationTicks,
                        amplifier: effect.amplifier,
                        showParticles: true,
                        showIcon: effect.showIcon
                    });
                }
                return;
            }
            case 'remove-effects': {
                const target = entityOf(action.target);
                if (target === null) return;
                if (action.effects === undefined) {
                    target.clearStatusEffects();
                    return;
                }

                const tags = world()?.getServer().getContent().tags;
                if (tags === undefined) return;
                for (const effect of target.getStatusEffects()) {
                    if (effectInHolderSet(action.effects, effect.id, tags)) target.removeStatusEffect(effect.id);
                }
                return;
            }
            case 'grant-experience':
                return missing(action, 'a player experience bar');
            case 'attach-lead': {
                if (attachLead === undefined) {
                    missing(action, 'a live data-driven leash runtime');
                    return;
                }
                if (!attachLead(action.source, action.target)) return;

                const target = entityOf(action.target);
                if (target !== null) {
                    void target
                        .getWorld()
                        .sendActorSound(target, LevelSoundEvent.LEAD_LEASH)
                        .catch((error: unknown) => world()?.getServer().getLogger().error(error));
                }
                return;
            }
            case 'dye-entity': {
                const target = entityOf(action.target);
                if (target === null || dyeEntity === undefined) {
                    missing(action, 'a live data-driven dyeable entity');
                    return;
                }
                dyeEntity(target, action.color);
                return;
            }
            case 'shear-entity':
                return missing(action, 'the entity components that hold it');
            case 'blocking':
            case 'disable-shield':
                return missing(action, 'shield blocking');
            case 'brush':
            case 'fishing':
            case 'locate':
            case 'map':
            case 'open-screen':
                return missing(action, `the ${action.kind} system`);
        }
    };

    return {
        stateOf: (source): SourceState => {
            const entity = entityOf(source);
            const loaded = world();
            const position = entity?.getPosition();
            const player = entity instanceof Player ? entity : undefined;
            const now = level.gameTime();

            const waiting: string[] = [];
            for (const [key, expiry] of cooldowns) {
                if (expiry <= now) {
                    cooldowns.delete(key);
                    continue;
                }
                const [runtimeId, group] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
                if (Number(runtimeId) === source.runtimeId) waiting.push(group);
            }

            return {
                position: {
                    x: Math.floor(position?.getX() ?? 0),
                    y: Math.floor(position?.getY() ?? 0),
                    z: Math.floor(position?.getZ() ?? 0)
                },
                creative: player?.gamemode === Gametype.CREATIVE,
                onGround: player?.isOnGround() ?? true,
                eyeInWater: entity !== null && loaded !== undefined ? inWater(loaded, entity) : false,
                // No elytra and no weather on this server, so both are facts rather than
                // defaults: nothing can be gliding and nothing can be rained on.
                gliding: false,
                inWaterOrRain: entity !== null && loaded !== undefined ? inWater(loaded, entity) : false,
                fallDistance: player?.getFallDistance() ?? 0,
                effects: entity?.getStatusEffects().map(({ id, amplifier }) => ({ id, amplifier })) ?? [],
                cooldownGroups: waiting,
                foodLevel: player?.getFood() ?? 20
            };
        },
        targetOf: (source) => targets.get(source.runtimeId),
        canNameEntity: (source) => {
            const target = entityOf(source);
            return target !== null && (canNameEntity?.(target) ?? false);
        },
        canDyeEntity: (source, color) => {
            const target = entityOf(source);
            return target !== null && (canDyeEntity?.(target, color) ?? false);
        },
        interactWithEntity: useItemOnEntity,
        perform,
        duringInteraction: (source, target, body) => {
            const previous = targets.get(source.runtimeId);
            if (target === undefined) targets.delete(source.runtimeId);
            else targets.set(source.runtimeId, target);

            try {
                return body();
            } finally {
                if (previous === undefined) targets.delete(source.runtimeId);
                else targets.set(source.runtimeId, previous);
            }
        }
    };
};
