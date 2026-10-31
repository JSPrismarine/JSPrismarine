/**
 * The `entities` group of the server's `CommandHost`.
 *
 * Every verb here either reaches a real subsystem or refuses. The ones that
 * refuse are named in {@link import('../vanillaCommands').UNWIRED_COMMANDS}
 * together with the command they would have served, so a command whose body is
 * one of them is never advertised in the first place and the refusal is only
 * reachable through `/execute`.
 */
import type { EntityCommandHost, EntityRef, Rotation, SelectorFacts, Vector3 } from '@jsprismarine/commands';
import { matchSelector } from '@jsprismarine/commands';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';
import { PositionMode } from '@jsprismarine/protocol';

import Player from '../../Player';
import type Server from '../../Server';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { DamageCause } from '../../entity/DamageCause';
import { DamageSource } from '../../entity/DamageSource';
import { normalizeStatusEffectId } from '../../entity/StatusEffect';
import type { Entity } from '../../entity/Entity';
import type { ExperienceHolder } from '../../entity/Experience';
import { addExperiencePoints, pointsForNextLevel } from '../../entity/Experience';
import ContainerEntry from '../../inventory/ContainerEntry';
import { itemFromContent } from '../../item/itemFromContent';
import type { World } from '../../world/World';
import type { Scoreboard } from './scoreboard';
import { scoreFactOf } from './scoreboard';
import {
    carryOut,
    dimensionIdOf,
    entityRefOf,
    javaDimensionIdOf,
    refuse,
    resolveEntity,
    resolvePlayer,
    unsupported,
    vectorOf,
    worldFor,
    worldOf
} from './support';

/**
 * The Java attribute names `/attribute` and `execute store` use, mapped onto
 * the ids this server's `Attributes` allocates.
 *
 * Only the ones this server actually tracks. Java has 40 attributes and the
 * `Attributes` table here has a handful, so an unmapped name answers undefined
 * and the command reports that the entity has no such attribute, which is the
 * truth.
 */
const ATTRIBUTE_IDS: Readonly<Record<string, string>> = {
    'minecraft:max_health': AttributeIds.Health,
    'minecraft:movement_speed': AttributeIds.Movement,
    'minecraft:follow_range': AttributeIds.FollowRange,
    'minecraft:knockback_resistance': AttributeIds.KnockbackResistence,
    'minecraft:attack_damage': AttributeIds.AttackDamage,
    'minecraft:absorption': AttributeIds.Absorption,
    'minecraft:luck': AttributeIds.Luck
};

const attributeIdOf = (name: string): string | undefined =>
    ATTRIBUTE_IDS[name.includes(':') ? name : `minecraft:${name}`];

/** The game mode a selector's `gamemode=` compares against, in Mojang's lower-case spelling. */
const gameModeNameOf = (player: Player): string => getGametypeName(player.gamemode).toLowerCase();

/**
 * A player's experience as the two attributes Bedrock carries it in.
 *
 * `minecraft:player.level` is a whole number and `minecraft:player.experience`
 * is the bar from 0 to 1, while every rule that grants or spends experience
 * counts points. {@link import('../../entity/Experience')} holds the curve
 * that converts between them.
 */
const experienceOf = (player: Player): ExperienceHolder => ({
    getLevel: () => player.attributes.getValue(AttributeIds.PlayerLevel),
    getProgress: () => player.attributes.getValue(AttributeIds.PlayerExperience),
    setLevel: (level) => player.attributes.setValue(AttributeIds.PlayerLevel, level),
    setProgress: (progress) => player.attributes.setValue(AttributeIds.PlayerExperience, progress)
});

/** What `/xp query` answers, in the unit it was asked in. */
const readExperience = (holder: ExperienceHolder, unit: 'points' | 'levels'): number => {
    const level = Math.max(0, Math.trunc(holder.getLevel()));
    if (unit === 'levels') return level;
    return Math.round(holder.getProgress() * pointsForNextLevel(level));
};

/**
 * The bar fraction `/xp set <n> points` leaves behind.
 *
 * Java clamps it just below full rather than to 1, so setting the points to
 * exactly what the level costs does not promote the player - which is what
 * `Player.setExperiencePoints` does with its `(f - 1) / f` ceiling.
 */
const barFractionOf = (level: number, points: number): number => {
    const needed = pointsForNextLevel(Math.max(0, Math.trunc(level)));
    return Math.max(0, Math.min(points / needed, (needed - 1) / needed));
};

/**
 * The facts an `EntityRef` does not carry, as far as this server can answer
 * them.
 *
 * `families` is left out rather than faked: a selector argument this server
 * cannot evaluate must not silently match everything, and
 * {@link matchSelector} fails a test whose fact is absent.
 */
const selectorFacts = (server: Server, scoreboard: Scoreboard): Partial<SelectorFacts> => ({
    gameMode: (ref) => {
        const player = resolvePlayer(server, ref);
        return player === undefined ? undefined : gameModeNameOf(player);
    },
    level: (ref) => resolvePlayer(server, ref)?.attributes.getValue(AttributeIds.PlayerLevel),
    score: scoreFactOf(scoreboard),
    tags: (ref) => resolveEntity(server, ref)?.getTags() ?? []
});

/**
 * Summons an entity through the data-driven runtime, when the world has one.
 *
 * The runtime is the only thing that builds and drives entities through their
 * components, goals, and brain.
 *
 * @returns The summoned entity, or undefined when the loaded pack does not
 *   declare the identifier.
 */
const summonDataEntity = (
    world: World,
    identifier: string,
    position: Vector3,
    rotation: Rotation,
    name: string | undefined
): EntityRef | undefined => {
    const live = world.dataEntities();
    if (live === undefined || !live.runtime.content().entities.registry.has(identifier)) return undefined;

    const spawned = live.runtime.spawn(
        identifier,
        { x: position.x, y: position.y, z: position.z },
        { yaw: rotation.yaw, pitch: 0 }
    );
    if (spawned === undefined) return undefined;

    // The runtime announced the spawn while it was still inside `spawn`, so the
    // body is already in the world by the time this reads it back.
    const body = live.bodies.bodyOf(spawned.id);
    if (body === undefined) return undefined;

    if (name !== undefined) body.setName(name);
    return entityRefOf(body);
};

/**
 * The identifier a typed entity name actually spawns under.
 *
 * Five Bedrock entities kept a legacy identifier when Mojang rewrote their
 * file, and Mojang's own `EntityType` command enum still lists the old
 * spelling: it has `villager` and no `villager_v2`. Typed as-is, `/summon
 * villager` would reach `minecraft:villager`, the pre-1.11 entity the vanilla
 * behavior pack still ships for world compatibility, rather than the villager
 * with the brain, the professions and the trades. The rename sends it to
 * `minecraft:villager_v2`, which is what Bedrock itself spawns.
 *
 * The rename comes from `@jsprismarine/mapping`, which owns the Java to
 * Bedrock identifier seam, rather than from an alias table written here.
 * That is the same source `brainMobFor` reads for the same five renames, so
 * the command and the runtime cannot disagree about which villager they
 * mean. A Bedrock-only identifier such as `minecraft:villager_v2` is not a
 * Java type, so it resolves to `unknown` and is used as typed.
 */
const spawnIdentifierOf = (identifier: string): string => {
    const mapped = javaEntityTypeToBedrock(identifier);
    return mapped.kind === 'mapped' ? mapped.bedrock : identifier;
};

/**
 * Builds the `entities` group.
 *
 * @param server - The live server every verb reads and writes through.
 * @param scoreboard - The scoreboard a selector's `scores=` reads.
 */
export const entityCommandHost = (server: Server, scoreboard: Scoreboard): EntityCommandHost => {
    const refsOf = (entities: readonly Entity[]): EntityRef[] => entities.map(entityRefOf);

    /**
     * Who a selector may name.
     *
     * A player-only base looks at every player on the server, as Java's
     * `@a` does; anything else looks at the dimension the command is running
     * in, because that is the only place an `@e` can reach.
     */
    const candidatesFor = (base: string, dimension: string): Entity[] =>
        base === '@a' || base === '@p' || base === '@r'
            ? server.getSessionManager().getAllPlayers()
            : worldOf(server, dimension).getEntities();

    const applyAttribute = (
        ref: EntityRef,
        attribute: string,
        read: (id: string, entity: Entity) => number | undefined
    ) => {
        const id = attributeIdOf(attribute);
        const entity = resolveEntity(server, ref);
        if (id === undefined || entity === undefined) return undefined;
        return read(id, entity);
    };

    return {
        select: (selector, source) =>
            matchSelector(selector, source, {
                candidates: refsOf(candidatesFor(selector.base, source.dimension)),
                facts: selectorFacts(server, scoreboard),
                random: () => server.getRandom()()
            }),

        related: () => unsupported('entity relationship tracking'),

        summon: (type: string, position: Vector3, rotation: Rotation, options): EntityRef | undefined => {
            if (options.nbt !== undefined) unsupported('entity NBT');

            const identifier = spawnIdentifierOf(type.includes(':') ? type : `minecraft:${type}`);
            const world = worldOf(server, options.dimension ?? 'minecraft:overworld');

            return summonDataEntity(world, identifier, position, rotation, options.name);
        },

        kill: (ref) => {
            const entity = resolveEntity(server, ref);
            if (entity === undefined) return false;

            // An item stack or a painting has no health to take away, so the
            // only way to kill it is to take it out of the world.
            return entity.isAlive()
                ? carryOut(entity.setHealth(0, DamageCause.Generic), true)
                : carryOut(entity.getWorld().removeEntity(entity), true);
        },

        damage: (ref, amount, _damageType, attacker) => {
            const entity = resolveEntity(server, ref);
            if (entity === undefined || !entity.isAlive()) return false;

            // `/damage` names a Java damage type and this server models causes
            // rather than types, so the attacker is what survives the trip.
            const by = attacker === undefined ? undefined : resolveEntity(server, attacker);
            const source = by === undefined ? DamageCause.Generic : DamageSource.entity(by);
            return carryOut(entity.damage(amount, source), true);
        },

        teleport: (ref, position, rotation, dimension) => {
            const entity = resolveEntity(server, ref);
            if (entity === undefined) return false;

            // A thunk rather than a promise: `setPosition` starts the moment it is
            // called, and a cross-dimension move has to know its destination first.
            const move = async () =>
                entity instanceof Player
                    ? entity.setPosition({
                          position: vectorOf(position),
                          type: PositionMode.Teleport,
                          yaw: rotation.yaw,
                          pitch: rotation.pitch,
                          headYaw: rotation.yaw
                      })
                    : entity.setPosition({
                          position: vectorOf(position),
                          yaw: rotation.yaw,
                          pitch: rotation.pitch,
                          headYaw: rotation.yaw
                      });

            // Only a player can change world here; `Entity.setPosition` keeps
            // the world it is in, which is why `/tp` across dimensions is a
            // player-only move on this server. The destination is built if the
            // level has its stem and nobody has entered it yet, and the player
            // arrives at the requested position in one move rather than at the
            // world's spawn and then at the position.
            if (entity instanceof Player && dimensionIdOf(entity.getWorld()) !== javaDimensionIdOf(dimension)) {
                return carryOut(
                    worldFor(server, dimension).then(async (destination) =>
                        entity.getWorld() === destination
                            ? move()
                            : entity.getNetworkSession().changeWorld({
                                  world: destination,
                                  position: vectorOf(position),
                                  yaw: rotation.yaw,
                                  pitch: rotation.pitch
                              })
                    ),
                    true
                );
            }

            return carryOut(move(), true);
        },

        ride: () => unsupported('riding'),

        setGameMode: (ref, gameMode) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return false;

            // `default` means the server's configured mode, which is what the
            // Bedrock enum spells and what a player joining is given.
            const wanted = gameMode === 'default' ? server.getConfig().getGamemode() : gameMode;
            return carryOut(player.setGamemode(getGametypeId(wanted)), true);
        },

        giveItem: (ref, identifier, count) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return 0;

            const item = itemFromContent(
                identifier.includes(':') ? identifier : `minecraft:${identifier}`,
                server.getContent()
            );
            if (item === null) return 0;

            const leftover = player.getInventory().addItem(new ContainerEntry({ item, count }));
            const given = count - leftover;
            if (given === 0) return 0;

            return carryOut(player.getNetworkSession().sendInventory(), given);
        },

        clearItems: (ref, identifier, _data, maxCount) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return 0;

            const wanted =
                identifier === undefined
                    ? undefined
                    : identifier.includes(':')
                      ? identifier
                      : `minecraft:${identifier}`;
            const inventory = player.getInventory();
            let removed = 0;

            for (let slot = 0; slot < inventory.getSlotCount() && removed < maxCount; slot += 1) {
                const entry = inventory.getEntry(slot);
                if (entry === null) continue;
                if (wanted !== undefined && entry.getItem().getName() !== wanted) continue;
                if (entry.getCount() === 0) continue;

                const take = Math.min(entry.getCount(), maxCount - removed);
                removed += take;
                if (take === entry.getCount()) inventory.removeItem(slot);
                else entry.setCount(entry.getCount() - take);
            }

            if (removed === 0) return 0;
            return carryOut(player.getNetworkSession().sendInventory(), removed);
        },

        addEffect: (ref, effect, seconds, amplifier, hideParticles) => {
            const entity = resolveEntity(server, ref);
            if (entity === undefined) return false;

            const id = normalizeStatusEffectId(effect);
            if (seconds === 0) return entity.removeStatusEffect(id);
            return entity.addStatusEffect({
                id,
                durationTicks: Math.min(seconds, 1_000_000) * 20,
                amplifier,
                showParticles: !hideParticles,
                showIcon: !hideParticles
            });
        },
        clearEffect: (ref, effect) => {
            const entity = resolveEntity(server, ref);
            if (entity === undefined) return 0;
            if (effect === undefined) return entity.clearStatusEffects();
            return entity.removeStatusEffect(normalizeStatusEffectId(effect)) ? 1 : 0;
        },

        enchant: (ref, enchantment, level) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return false;

            const inventory = player.getInventory();
            const held = inventory.getItemInHand();
            if (held.getName() === 'minecraft:air') refuse(`${ref.name} is not holding anything`);

            const id = enchantment.includes(':') ? enchantment : `minecraft:${enchantment}`;
            // Java's three checks, made only for an enchantment the stack
            // declares. For one it does not, the level still lands on the
            // stack and the combat and mining code reads it; what is missing
            // is the refusal, not the effect.
            const registry = server.getContent().enchantments;
            if (registry.get(id) !== undefined) {
                if (!registry.supports(held.asPredicateStack(), id)) {
                    refuse(`${held.getName()} cannot carry ${id}`);
                }
                const limit = registry.maxLevelOf(id) ?? level;
                if (level > limit) refuse(`${id} goes up to level ${limit}`);
                for (const carried of held.getEnchantments().keys()) {
                    if (!registry.areCompatible(carried, id)) refuse(`${id} conflicts with ${carried}`);
                }
            }

            const enchanted = held.withEnchantments(new Map([...held.getEnchantments(), [id, level]]));
            inventory.setItemInHand(new ContainerEntry({ item: enchanted, count: held.getAmount() }));
            return carryOut(player.getNetworkSession().sendInventory(), true);
        },

        changeExperience: (ref, amount, unit, mode) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return 0;

            const holder = experienceOf(player);
            if (unit === 'levels') {
                const level = Math.max(0, mode === 'set' ? amount : holder.getLevel() + amount);
                holder.setLevel(level);
                // Java zeroes the bar only when the change took the player to
                // or below level zero; adding a level keeps the bar it had.
                if (level === 0) holder.setProgress(0);
            } else if (mode === 'set') {
                holder.setProgress(barFractionOf(holder.getLevel(), amount));
            } else {
                addExperiencePoints(holder, amount);
            }

            return carryOut(player.getNetworkSession().sendAttributes(), readExperience(holder, unit));
        },

        queryExperience: (ref, unit) => {
            const player = resolvePlayer(server, ref);
            return player === undefined ? 0 : readExperience(experienceOf(player), unit);
        },

        addTag: (ref, tag) => resolveEntity(server, ref)?.addTag(tag) ?? false,
        removeTag: (ref, tag) => resolveEntity(server, ref)?.removeTag(tag) ?? false,
        listTags: (ref) => resolveEntity(server, ref)?.getTags() ?? [],

        getAttributeBase: (ref, attribute) =>
            applyAttribute(ref, attribute, (id, entity) => entity.attributes.getAttribute(id)?.getDefault()),
        setAttributeBase: (ref, attribute, value) => {
            const id = attributeIdOf(attribute);
            const entity = resolveEntity(server, ref);
            if (id === undefined || entity === undefined) return false;
            return entity.attributes.setValue(id, value);
        },
        getAttributeValue: (ref, attribute) =>
            applyAttribute(ref, attribute, (id, entity) => entity.attributes.getAttribute(id)?.getValue()),
        addAttributeModifier: () => unsupported('attribute modifiers'),
        removeAttributeModifier: () => unsupported('attribute modifiers'),
        getAttributeModifier: () => unsupported('attribute modifiers')
    };
};
