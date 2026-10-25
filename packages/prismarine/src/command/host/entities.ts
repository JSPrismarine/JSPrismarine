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
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';

import Player from '../../Player';
import type Server from '../../Server';
import { AttributeIds } from '../../entity/Attribute';
import { DamageCause } from '../../entity/DamageCause';
import { DamageSource } from '../../entity/DamageSource';
import type { Entity } from '../../entity/Entity';
import { spawnableEntities } from '../../entity/Entities';
import ContainerEntry from '../../inventory/ContainerEntry';
import { Position } from '../../world/Position';
import PositionMode from '../../network/type/PositionMode';
import { carryOut, entityRefOf, resolveEntity, resolvePlayer, unsupported, vectorOf, worldOf } from './support';

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
 * The facts an `EntityRef` does not carry, as far as this server can answer
 * them.
 *
 * `level`, `score` and `families` are left out rather than faked: a selector
 * argument this server cannot evaluate must not silently match everything, and
 * {@link matchSelector} fails a test whose fact is absent.
 */
const selectorFacts = (server: Server): Partial<SelectorFacts> => ({
    gameMode: (ref) => {
        const player = resolvePlayer(server, ref);
        return player === undefined ? undefined : gameModeNameOf(player);
    },
    tags: (ref) => resolveEntity(server, ref)?.getTags() ?? []
});

/**
 * Builds the `entities` group.
 *
 * @param server - The live server every verb reads and writes through.
 */
export const entityCommandHost = (server: Server): EntityCommandHost => {
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
                facts: selectorFacts(server),
                random: () => server.getRandom()()
            }),

        related: () => unsupported('entity relationship tracking'),

        summon: (type: string, position: Vector3, rotation: Rotation, options): EntityRef | undefined => {
            if (options.nbt !== undefined) unsupported('entity NBT');

            const identifier = type.includes(':') ? type : `minecraft:${type}`;
            const Spawnable = spawnableEntities().find((candidate) => candidate.MOB_ID === identifier);
            if (Spawnable === undefined) return undefined;

            const world = worldOf(server, 'minecraft:overworld');
            const entity = new Spawnable({
                position: Position.fromVector3(vectorOf(position), world),
                yaw: rotation.yaw,
                pitch: rotation.pitch,
                headYaw: rotation.yaw
            });
            if (options.name !== undefined) entity.setName(options.name);

            return carryOut(world.addEntity(entity), entityRefOf(entity));
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

            const destination = worldOf(server, dimension);
            const move =
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
            // player-only move on this server.
            if (entity instanceof Player && entity.getWorld() !== destination) {
                return carryOut(
                    entity.setWorld(destination).then(async () => move),
                    true
                );
            }

            return carryOut(move, true);
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

            const item = server
                .getItemManager()
                .getItem(identifier.includes(':') ? identifier : `minecraft:${identifier}`);
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

        addEffect: () => unsupported('status effect system'),
        clearEffect: () => unsupported('status effect system'),
        enchant: () => unsupported('enchanting'),
        changeExperience: () => unsupported('experience system'),
        queryExperience: () => unsupported('experience system'),

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
