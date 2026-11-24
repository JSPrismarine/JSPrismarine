import { findPath } from '@jsprismarine/entity-goals/navigation/pathfinder';
import { navigationProfile } from '@jsprismarine/entity-goals/navigation/profile';
import { placedEntityOf } from '@jsprismarine/item-behaviors/behaviors/placement';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import type { ContentEntity, ContentItemDrop } from '@jsprismarine/prismarine/content/world/adapter';
import type { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { orbViewOf } from '@jsprismarine/prismarine/entity/data/experienceOrbs';
import { SURVIVAL_REACH, distanceToBody } from '@jsprismarine/prismarine/entity/Combat';
import { savedWithChunk } from '@jsprismarine/prismarine/entity/data/storeActors';
import { blockPosTracker } from '@jsprismarine/entity-brains/world';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains/memory';
import { TestEntityWorld, spawnDeclared } from '@jsprismarine/prismarine/entity/data/testing';
import type { FilterEntityView } from '@jsprismarine/entities';
import { packJson } from '@jsprismarine/loot';
import type { LootRollRequest } from '@jsprismarine/loot/registry';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import {
    javaFieldStores,
    javaMemberRefs,
    javaOperations,
    pinnedJavaClass,
    pinnedJavaClassFile,
    pinnedJavaClassNames,
    pinnedJavaClassesNaming,
    pinnedJavaConstants
} from '../javaClassFile.ts';
import type { JavaClass } from '../javaClassFile.ts';
import { loadVanillaDatapack, vanillaLootRegistry } from '../javaDatapack.ts';
import type { VanillaDatapack } from '../javaDatapack.ts';
import { javaEntityClasses, javaIsA } from '../javaEntityClasses.ts';
import { buildRealStack, seededDraws, serverContent } from '../serverStack.ts';
import type { RealStack } from '../serverStack.ts';
import { javaClassChain, javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { componentValues, entitiesDeclaring, field, groupsDeclaring, javaEntityIds, mappedEntity } from './subjects.ts';
import { containerOf, equipmentOf, hold } from './mobSlots.ts';

/**
 * Scenarios for what a mob leaves behind and when it leaves: its death loot and experience,
 * despawning and persistence, the gear it spawns with and picks up, the inventories it carries,
 * and the doors it opens or breaks. Each one drives the server's entity runtime and compares
 * what happened with the rule Java's code or data states.
 */

/** One entity the runtime runs. */
type DataEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

/** An entity as Java's loot predicates read one. */
type EntityView = NonNullable<NonNullable<LootRollRequest['parameters']>['this_entity']>;

/** The runtime id the scenario player is filed under, far above anything the runtime draws. */
const PLAYER_ID = 2_000_000_001;

/** Where every scenario mob stands, on the test world's floor. */
const ORIGIN = { x: 0.5, y: 64, z: 0.5 } as const;

/** Kills per mob a distribution is measured over. */
const KILLS = 24;

/** Java rolls per server kill, so Java's side of a comparison has much less noise than the server's. */
const JAVA_ROLLS_PER_KILL = 8;

/**
 * A stack of its own whose world random varies, because the shared stack's world replays 0.5 and
 * every roll would land on the same value: a sheep always white, an animal always two experience.
 * The values come from a fixed linear congruential sequence, so every run sees the same draws.
 */
let lootStack: RealStack | undefined;
const realStack = (): RealStack => {
    if (lootStack !== undefined) return lootStack;
    const values = seededDraws();
    lootStack = buildRealStack(new TestEntityWorld({ random: values }));
    return lootStack;
};

/** One player standing `distance` blocks east of the origin, as the host reports players. */
const playerAt = (distance: number): ContentEntity => ({
    id: PLAYER_ID,
    identifier: 'minecraft:player',
    position: { x: ORIGIN.x + distance, y: ORIGIN.y, z: ORIGIN.z }
});

/** Takes every item lying in the loot stack's world off the ground. */
const clearLyingItems = (): void => {
    const { host } = realStack().world;
    for (const lying of host.items?.() ?? []) host.takeItem?.(lying.id);
};

/**
 * Runs `body` with one player in the shared test world and every entity and dropped item it left
 * removed afterwards, so one scenario's mobs and drops never stand in the next one's way.
 */
const withWorld = <Result>(player: ContentEntity | undefined, body: () => Result): Result => {
    const { runtime, world } = realStack();
    const before = world.players;
    world.players = player === undefined ? [] : [player];
    world.drops.length = 0;
    clearLyingItems();
    try {
        return body();
    } finally {
        for (const entity of runtime.near(ORIGIN, 512)) runtime.remove(entity.id, 'parity scenario cleanup');
        world.players = before;
        world.drops.length = 0;
        clearLyingItems();
    }
};

/** Spawns one mob at the origin, or throws when the runtime refuses it. */
const spawn = (bedrock: string): DataEntity => {
    const entity = realStack().runtime.spawn(bedrock, ORIGIN);
    if (entity === undefined) throw new Error(`the runtime refused to spawn ${bedrock}`);
    return entity;
};

/** Kills a mob with one player blow that takes all of its health, the way a sword kill commits. */
const killByPlayer = (entity: DataEntity): void => {
    const health = entity.instance.attributes.get('health')?.current ?? 20;
    realStack().runtime.damage({
        target: entity.id,
        attacker: PLAYER_ID,
        cause: 'entity_attack',
        amount: health + 1000,
        source: { route: 'melee', graced: false, mitigated: false, bypassesGrace: true }
    });
};

/** Every item identifier a list of drops holds, with the counts summed. */
const tally = (drops: readonly ContentItemDrop[], into = new Map<string, number>()): Map<string, number> => {
    for (const drop of drops) into.set(drop.identifier, (into.get(drop.identifier) ?? 0) + drop.count);
    return into;
};

/** A Java item id as the Bedrock identifier the server drops it under. */
const bedrockItemOf = (javaItem: string): string => {
    const mapped = javaItemToBedrock(javaItem);
    return mapped.kind === 'unknown' ? javaItem : mapped.bedrock.identifier;
};

let vanilla: { readonly datapack: VanillaDatapack; readonly loot: ReturnType<typeof vanillaLootRegistry> } | undefined;

/** Java's vanilla datapack and a loot registry over it, loaded once for every loot row. */
const javaLoot = () => {
    if (vanilla !== undefined) return vanilla;
    const datapack = loadVanillaDatapack();
    vanilla = { datapack, loot: vanillaLootRegistry(datapack.definitions) };
    return vanilla;
};

/** The Java dye color names in Bedrock's color index order, which is what `minecraft:color` holds. */
const DYE_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
] as const;

/** The player as Java's loot context sees the killer. */
const JAVA_KILLER: EntityView = { type: 'minecraft:player', position: { x: ORIGIN.x + 1, y: ORIGIN.y, z: ORIGIN.z } };

/**
 * The state of a mob Java's entity loot predicates read, taken from the mob the server spawned so
 * both sides roll for the same sheep color and the same cube size.
 */
const javaDeathState = (subject: EntitySubject, entity: DataEntity): EntityView => {
    const color = entity.body.color;
    const variant = entity.instance.componentParams('minecraft:variant');
    const size = typeof variant === 'number' ? variant : undefined;
    return {
        type: subject.javaId,
        position: ORIGIN,
        flags: { is_on_fire: false, is_baby: entity.instance.hasComponent('minecraft:is_baby') },
        equipment: {},
        components: new Map(
            color === undefined || DYE_COLORS[color] === undefined
                ? []
                : [['minecraft:sheep/color', DYE_COLORS[color]] as const]
        ),
        typeSpecific: { sheared: false, ...(size === undefined ? {} : { size }) }
    };
};

/** What one Java roll of a mob's death table drops, as Bedrock item identifiers. */
const javaDeathRoll = (table: string, self: EntityView): Map<string, number> => {
    const rolled = javaLoot().loot.roll(table, {
        parameterSet: 'entity',
        parameters: {
            this_entity: self,
            origin: ORIGIN,
            damage_source: {
                type: 'minecraft:player_attack',
                tags: [],
                sourceEntity: JAVA_KILLER,
                directEntity: JAVA_KILLER
            },
            attacking_entity: JAVA_KILLER,
            direct_attacking_entity: JAVA_KILLER,
            last_damage_player: JAVA_KILLER
        }
    });
    return tally(rolled.map((stack) => ({ identifier: bedrockItemOf(stack.id), count: stack.count })));
};

/** Every item the mob holds or wears, which a death may drop beside its table and the table does not cover. */
const equippedItems = (entity: DataEntity): ReadonlySet<string> =>
    new Set(Object.values(equipmentOf(entity.body)).flatMap((drop) => (drop === undefined ? [] : [drop.identifier])));

/** A class's simple name, such as `Monster` for `net/minecraft/world/entity/monster/Monster`. */
const simpleName = (javaClass: JavaClass): string => javaClass.name.slice(javaClass.name.lastIndexOf('/') + 1);

/**
 * A Java entity's class and every superclass, nearest first: the class `EntityTypes` registers the
 * type's factory with, or, for the player, which has no factory, the class named after it.
 */
const javaChain = (javaId: string): readonly JavaClass[] =>
    javaClassChain(javaEntityClasses().get(javaId) ?? javaEntityClassName(javaId));

/** The most derived class in a chain that declares `method`, which is the one Java runs. */
const declaring = (chain: readonly JavaClass[], method: string): string | undefined => {
    const owner = chain.find((javaClass) => javaClass.methods.some((candidate) => candidate.name === method));
    return owner === undefined ? undefined : simpleName(owner);
};

/** Whether the type is a `Monster`, whose babies still drop loot (`Monster.shouldDropLoot`). */
const isMonster = (javaId: string): boolean =>
    javaChain(javaId).some((javaClass) => simpleName(javaClass) === 'Monster');

/** Mean and standard deviation of a list of numbers. */
const moments = (values: readonly number[]): { readonly mean: number; readonly sd: number } => {
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
    return { mean, sd: Math.sqrt(variance) };
};

/**
 * Compares the drops of `KILLS` server deaths with Java's table rolled for each of those deaths.
 * An item the server drops that Java never does, or a per-death mean outside four standard
 * errors of Java's, is a difference.
 */
const compareDeathDrops = (subject: EntitySubject, table: string): string | undefined => {
    const server: Map<string, number>[] = [];
    const java: Map<string, number>[] = [];
    withWorld(playerAt(1), () => {
        const { world, runtime } = realStack();
        for (let kill = 0; kill < KILLS; kill += 1) {
            world.drops.length = 0;
            const entity = spawn(subject.bedrock);
            const equipped = equippedItems(entity);
            const self = javaDeathState(subject, entity);
            // `LivingEntity.shouldDropLoot` drops nothing for a baby, but a `Monster` overrides it.
            const javaDrops = !entity.instance.hasComponent('minecraft:is_baby') || isMonster(subject.javaId);
            killByPlayer(entity);
            if (entity.removed === undefined && (entity.instance.attributes.get('health')?.current ?? 0) > 0)
                throw new Error(`a killing blow left ${subject.bedrock} alive`);
            // A dead mob stays for its death animation; its loot has fallen, so the next kill
            // does not need its body.
            if (entity.removed === undefined) runtime.remove(entity.id, 'parity death-loot kill complete');
            server.push(tally(world.drops.map((drop) => drop.item).filter((item) => !equipped.has(item.identifier))));
            for (let roll = 0; roll < JAVA_ROLLS_PER_KILL; roll += 1)
                java.push(javaDrops ? javaDeathRoll(table, self) : new Map());
        }
    });

    const items = new Set([...server, ...java].flatMap((drops) => [...drops.keys()]));
    const differences: string[] = [];
    for (const item of [...items].sort()) {
        const serverMoments = moments(server.map((drops) => drops.get(item) ?? 0));
        const javaMoments = moments(java.map((drops) => drops.get(item) ?? 0));
        if (javaMoments.mean === 0) {
            differences.push(`it drops ${item}, which Java's ${table} never does`);
            continue;
        }
        const tolerance = (4 * javaMoments.sd) / Math.sqrt(KILLS) + 0.05;
        if (Math.abs(serverMoments.mean - javaMoments.mean) > tolerance)
            differences.push(
                `it drops ${serverMoments.mean.toFixed(2)} ${item} a death where Java's ${table} drops ${javaMoments.mean.toFixed(2)}`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** A discrete distribution: probability by value. */
type Distribution = ReadonlyMap<number, number>;

const point = (value: number): Distribution => new Map([[value, 1]]);

/** `1 + nextInt(bound)` as a distribution. */
const uniformFromOne = (bound: number): Distribution =>
    new Map(Array.from({ length: bound }, (_, index) => [index + 1, 1 / bound] as const));

/** The distribution of a sum of two independent draws. */
const convolve = (left: Distribution, right: Distribution): Distribution => {
    const sum = new Map<number, number>();
    for (const [a, p] of left) for (const [b, q] of right) sum.set(a + b, (sum.get(a + b) ?? 0) + p * q);
    return sum;
};

/** What a death's Java experience depends on, taken from the mob the server spawned. */
interface DeathFacts {
    readonly baby: boolean;
    readonly equipped: number;
    readonly size: number;
}

/** The `xpReward` a Java class's constructor sets, walking from the type's own class up. */
const xpRewardOf = (chain: readonly JavaClass[]): number | undefined => {
    for (const javaClass of chain) {
        const store = javaClass.methods
            .filter((method) => method.name === '<init>')
            .flatMap((method) => javaFieldStores(method))
            .find((candidate) => candidate.field.endsWith('.xpReward') && candidate.value !== undefined);
        if (store?.value !== undefined) return store.value;
    }
    return undefined;
};

/**
 * Java's death experience for a mob killed by a player, read out of the pinned jar: the
 * `xpReward` its constructors set, and which class's `getBaseExperienceReward` and
 * `shouldDropExperience` it runs.
 */
const javaExperience = (javaId: string, facts: DeathFacts): Distribution => {
    const chain = javaChain(javaId);
    const dropper = declaring(chain, 'shouldDropExperience');
    const drops =
        dropper === 'LivingEntity'
            ? !facts.baby
            : dropper === 'Monster' || dropper === 'Hoglin'
              ? true
              : dropper === 'Tadpole'
                ? false
                : undefined;
    if (drops === undefined)
        throw new Error(`${javaId} runs ${String(dropper)}.shouldDropExperience, which no rule here reads`);
    if (!drops) return point(0);

    // `Slime.setSize` and `MagmaCube.setSize` write the size into `xpReward`.
    const sized = chain.some((javaClass) =>
        javaClass.methods.some(
            (method) =>
                method.name === 'setSize' && javaFieldStores(method).some((store) => store.field.endsWith('.xpReward'))
        )
    );
    const base = sized ? facts.size : (xpRewardOf(chain) ?? 0);
    const owner = declaring(chain, 'getBaseExperienceReward');
    const mobRule = (xp: number): Distribution => {
        let total = point(xp);
        if (xp > 0) for (let item = 0; item < facts.equipped; item += 1) total = convolve(total, uniformFromOne(3));
        return total;
    };
    switch (owner) {
        case 'Animal':
        case 'WaterAnimal':
        case 'AgeableWaterCreature':
        case 'Chicken':
            return uniformFromOne(3);
        case 'SulfurCube':
            return facts.baby ? point(0) : uniformFromOne(2);
        case 'Piglin':
        case 'Hoglin':
            return point(base);
        case 'Zombie':
            return mobRule(facts.baby ? Math.trunc(base * 2.5) : base);
        case 'Mob':
            return mobRule(base);
        default:
            throw new Error(`${javaId} runs ${String(owner)}.getBaseExperienceReward, which no rule here reads`);
    }
};

/** The experience orbs standing near the origin, removed once counted, and the points they hold. */
const collectOrbs = (): number => {
    const { runtime } = realStack();
    let total = 0;
    for (const entity of runtime.near(ORIGIN, 16)) {
        const orb = orbViewOf(entity);
        if (orb === undefined) continue;
        // An award may join an orb already lying there, which then holds more than one.
        total += orb.value * orb.count;
        runtime.remove(entity.id, 'parity scenario counted');
    }
    return total;
};

/** The equipped hand and armor slots, which `EquipmentSlot.canIncreaseExperience` counts. */
const equippedCount = (entity: DataEntity): number =>
    Object.entries(equipmentOf(entity.body)).filter(([slot, item]) => slot !== 'body' && item !== undefined).length;

/** Compares `KILLS` server deaths' experience with Java's distribution for each of those deaths. */
const compareDeathExperience = (subject: EntitySubject): string | undefined => {
    const differences: string[] = [];
    let serverTotal = 0;
    let javaMean = 0;
    let javaVariance = 0;
    const seen = new Set<number>();
    const expectedCounts = new Map<number, number>();
    withWorld(playerAt(1), () => {
        for (let kill = 0; kill < KILLS; kill += 1) {
            const entity = spawn(subject.bedrock);
            const variant = entity.instance.componentParams('minecraft:variant');
            const facts: DeathFacts = {
                baby: entity.instance.hasComponent('minecraft:is_baby'),
                equipped: equippedCount(entity),
                size: typeof variant === 'number' ? variant : 1
            };
            const java = javaExperience(subject.javaId, facts);
            killByPlayer(entity);
            const server = collectOrbs();
            if (!java.has(server))
                differences.push(
                    `a kill dropped ${server} experience, which Java never drops for it (${[...java.keys()].sort((a, b) => a - b).join(', ')})`
                );
            serverTotal += server;
            seen.add(server);
            for (const [value, p] of java) expectedCounts.set(value, (expectedCounts.get(value) ?? 0) + p);
            const mean = [...java].reduce((sum, [value, p]) => sum + value * p, 0);
            javaMean += mean;
            javaVariance += [...java].reduce((sum, [value, p]) => sum + p * (value - mean) ** 2, 0);
        }

        // Java pays nothing for a death no player had a hand in.
        const unattended = spawn(subject.bedrock);
        realStack().runtime.damage({
            target: unattended.id,
            cause: 'fall',
            amount: 10_000,
            source: { route: 'component', bypassesGrace: true }
        });
        const fallen = collectOrbs();
        if (fallen !== 0) differences.push(`a fall death dropped ${fallen} experience, where Java drops none`);
    });
    // A value Java drops eight times in expectation and the server never once is a spread the server lacks.
    const missing = [...expectedCounts]
        .filter(([value, count]) => count >= 8 && !seen.has(value))
        .map(([value]) => value);
    if (missing.length > 0)
        differences.push(
            `no kill dropped ${missing.sort((a, b) => a - b).join(' or ')} experience, which Java often drops`
        );
    const tolerance = 4 * Math.sqrt(javaVariance) + 0.05 * KILLS;
    if (Math.abs(serverTotal - javaMean) > tolerance)
        differences.push(
            `it dropped ${(serverTotal / KILLS).toFixed(2)} experience a kill, where Java drops ${(javaMean / KILLS).toFixed(2)}`
        );
    return differences.length === 0 ? undefined : [...new Set(differences)].join('; ');
};

/** The server tick the loot stack's runtime last ran, so every scenario's ticks keep counting up. */
let serverTick = 0;

/** Runs the loot stack's runtime for `ticks` ticks, stopping early once `done` holds. */
const runTicks = (ticks: number, done: () => boolean = () => false): void => {
    const { runtime, world } = realStack();
    for (let tick = 0; tick < ticks && !done(); tick += 1) {
        serverTick += 1;
        world.advance();
        runtime.tick(serverTick);
    }
};

/** Makes the groups that declare `component` active, as the event that adds them would. */
const activateGroupsDeclaring = (entity: DataEntity, bedrock: string, component: string): void => {
    if (entity.instance.hasComponent(component)) return;
    // The loaded type's groups, which carry what the server's overlays add to the pack's file.
    const loaded = serverContent().entities.registry.get(bedrock)?.groups;
    const groups =
        loaded === undefined
            ? groupsDeclaring(bedrock, component)
            : [...loaded.values()]
                  .filter((group) => group.components.some((bound) => bound.name === component))
                  .map((group) => group.name);
    entity.instance.restoreComponentGroups([...entity.instance.activeComponentGroups(), ...groups]);
};

/**
 * Takes off the active groups that declare any of `components`, as an event that removes them
 * would, and the groups that switch the mob into them.
 */
const deactivateGroupsDeclaring = (entity: DataEntity, bedrock: string, components: readonly string[]): void => {
    const loaded = serverContent().entities.registry.get(bedrock)?.groups;
    if (loaded === undefined) return;
    const dropped = new Set(
        [...loaded.values()]
            .filter((group) => group.components.some((bound) => components.includes(bound.name)))
            .map((group) => group.name)
    );
    entity.instance.restoreComponentGroups(
        entity.instance.activeComponentGroups().filter((group) => !dropped.has(group))
    );
};

/** Java's `MobCategory.getDespawnDistance`: 64 for water ambient mobs, 128 for every other category. */
const JAVA_DESPAWN_DISTANCE: Readonly<Record<string, number>> = { WATER_AMBIENT: 64 };

/**
 * What `EntityTypes`'s static initializer registers each type with: each registration reads its
 * `EntityTypeIds` key, calls the builder with its `MobCategory` and options such as `noSave` and
 * `notInPeaceful`, then stores the type.
 */
let registrations:
    | {
          readonly categories: ReadonlyMap<string, string>;
          readonly noSave: ReadonlySet<string>;
          readonly notInPeaceful: ReadonlySet<string>;
      }
    | undefined;
const javaRegistrations = () => {
    if (registrations === undefined) {
        const found = new Map<string, string>();
        const noSave = new Set<string>();
        const notInPeaceful = new Set<string>();
        const init = pinnedJavaClass('net/minecraft/world/entity/EntityTypes').find(
            (method) => method.name === '<clinit>'
        );
        let key: string | undefined;
        let category: string | undefined;
        for (const ref of init === undefined ? [] : javaMemberRefs(init)) {
            if (ref.kind === 'get' && ref.member.startsWith('EntityTypeIds.')) {
                key = ref.member.slice('EntityTypeIds.'.length).toLowerCase();
                category = undefined;
            } else if (ref.kind === 'get' && ref.member.startsWith('MobCategory.')) {
                category = ref.member.slice('MobCategory.'.length);
            } else if (ref.kind === 'call' && ref.member === 'EntityType$Builder.noSave' && key !== undefined) {
                noSave.add(`minecraft:${key}`);
            } else if (ref.kind === 'call' && ref.member === 'EntityType$Builder.notInPeaceful' && key !== undefined) {
                notInPeaceful.add(`minecraft:${key}`);
            } else if (ref.kind === 'put' && key !== undefined && category !== undefined) {
                found.set(`minecraft:${key}`, category);
                key = undefined;
            }
        }
        registrations = { categories: found, noSave, notInPeaceful };
    }
    return registrations;
};

/** The `MobCategory` a type registers with. */
const javaCategoryOf = (javaId: string): string | undefined => javaRegistrations().categories.get(javaId);

/** Whether a type's builder calls `noSave`, which keeps `Entity.shouldBeSaved` false for it. */
const javaNoSave = (javaId: string): boolean => javaRegistrations().noSave.has(javaId);

/**
 * Whether Java's `Mob.removeWhenFarAway` lets a freshly spawned mob of this type despawn: not
 * named, not tamed, not from a bucket, in no raid or patrol, and younger than a cat's 2400 ticks.
 */
const javaRemovesWhenFarAway = (javaId: string): boolean => {
    const owner = declaring(javaChain(javaId), 'removeWhenFarAway');
    switch (owner) {
        case 'Mob':
        case 'ZombieHorse':
        case 'CamelHusk':
        case 'AbstractNautilus':
        case 'Hoglin':
        case 'AbstractFish':
        case 'Axolotl':
        case 'ZombieVillager':
        case 'Raider':
        case 'PatrollingMonster':
            return true;
        case 'Animal':
        case 'AbstractGolem':
        case 'Allay':
        case 'Warden':
        case 'Villager':
        case 'WanderingTrader':
        case 'Chicken':
        case 'Cat':
        case 'Ocelot':
            return false;
        default:
            throw new Error(`${javaId} runs ${String(owner)}.removeWhenFarAway, which no rule here reads`);
    }
};

/** Whether a mob standing alone with a player `distance` blocks away was despawned within `ticks`. */
const despawnedWithPlayerAt = (
    bedrock: string,
    distance: number,
    ticks: number,
    prepare?: (entity: DataEntity) => void
): boolean =>
    withWorld(playerAt(distance), () => {
        const entity = spawn(bedrock);
        prepare?.(entity);
        runTicks(ticks, () => entity.removed !== undefined);
        return entity.removed?.includes('despawn') === true;
    });

/** The distances the despawn rows put a player at: inside 32 blocks, between, and past Java's limit. */
const despawnDistances = (javaLimit: number): readonly number[] => [16, 48, javaLimit + 8];

/** The marker a despawn difference carries when the server ran Bedrock's own declared rule. */
const BEDROCK_MODEL = "as Bedrock's minecraft:despawn declares";

/** The Java item a destroyed boat or raft drops, which `AbstractBoat.getDropItem` names after the boat itself. */
const boatItemOf = (subject: EntitySubject): string | undefined =>
    subject.bedrock === 'minecraft:boat' || subject.bedrock === 'minecraft:chest_boat' ? subject.javaId : undefined;

/**
 * How many one-point blows in a row break a boat in Java: `VehicleEntity.hurtServer` adds ten
 * times a blow to the damage and destroys the vehicle once it passes 40, both read from the jar.
 */
const javaBoatBlows = (): number => {
    const hurt = javaMethodOf('net/minecraft/world/entity/vehicle/VehicleEntity', 'hurtServer');
    const pushed = hurt === undefined ? [] : pushedNumbers(hurt.method);
    if (!pushed.includes(10) || !pushed.includes(40))
        throw new Error('VehicleEntity.hurtServer no longer scales a blow by 10 and breaks past 40');
    return Math.floor(40 / 10) + 1;
};

/**
 * Places a boat the way its item does and punches it once per tick-less blow: it must hold for
 * one blow fewer than Java needs, break on the next, and drop its own item.
 */
const compareBoatBreaking = (boatItem: string): string | undefined =>
    withWorld(playerAt(1), () => {
        const { runtime, world } = realStack();
        const placed = placedEntityOf(boatItem);
        const entity = runtime.spawn(
            placed.entity,
            ORIGIN,
            placed.variant === undefined ? {} : { data: { variant: placed.variant } }
        );
        if (entity === undefined) throw new Error(`the runtime refused to spawn ${placed.entity}`);
        const blows = javaBoatBlows();
        const punch = (): void => {
            runtime.damage({
                target: entity.id,
                attacker: PLAYER_ID,
                cause: 'entity_attack',
                amount: 1,
                source: { route: 'melee', graced: false, mitigated: false, bypassesGrace: true }
            });
        };
        for (let blow = 1; blow < blows; blow += 1) punch();
        if (entity.removed !== undefined)
            return `${blows - 1} punches broke it, where Java's boat holds until its damage passes 40`;
        punch();
        if (entity.removed === undefined) return `${blows} punches in a row left it whole, where Java breaks it`;
        const dropped = tally(world.drops.map((drop) => drop.item));
        const expected = bedrockItemOf(boatItem);
        return dropped.size === 1 && (dropped.get(expected) ?? 0) === 1
            ? undefined
            : `breaking it drops ${[...dropped].map(([item, count]) => `${count} ${item}`).join(', ') || 'nothing'}, where Java drops one ${expected}`;
    });

/** Java's default loot table for an entity type: `EntityType.getDefaultLootTable`, `entities/<path>`. */
const javaDeathTable = (javaId: string): string => `minecraft:entities/${javaId.slice('minecraft:'.length)}`;

/** Spawns per mob a spawn gear distribution is measured over. */
const SPAWNS = 48;

/** Probability by Java item id, for one equipment slot. */
type SlotOdds = Readonly<Record<string, number>>;

/** What Java gives one fresh mob, by `EquipmentSlot` name in lower case. */
type SpawnGear = Readonly<Partial<Record<'mainhand' | 'offhand' | 'head' | 'chest' | 'legs' | 'feet', SlotOdds>>>;

/** One type's Java spawn gear: the class whose `populateDefaultEquipmentSlots` runs, and what it gives. */
interface JavaGearRule {
    readonly owner: string;
    readonly gear: (baby: boolean) => SpawnGear;
}

const alwaysHolds = (owner: string, item: string): JavaGearRule => ({
    owner,
    gear: () => ({ mainhand: { [item]: 1 } })
});

/** Zombie.populateDefaultEquipmentSlots on normal difficulty: 1%, then `nextInt(6)` picks sword, spear or shovel. */
const ZOMBIE_GEAR: JavaGearRule = {
    owner: 'Zombie',
    gear: () => ({
        mainhand: {
            'minecraft:iron_sword': 0.01 / 6,
            'minecraft:iron_spear': 0.01 / 6,
            'minecraft:iron_shovel': 0.04 / 6
        }
    })
};

const SKELETON_GEAR = alwaysHolds('AbstractSkeleton', 'minecraft:bow');

/**
 * What a freshly spawned mob holds and wears in Java, on normal difficulty in a fresh chunk, with
 * no raid and outside Halloween. `Mob.populateDefaultEquipmentSlots` adds armor only with a
 * nonzero `DifficultyInstance.getSpecialMultiplier`, which is zero until the regional difficulty
 * passes 2, so no type wears any. A wrong item fails the row: the owner's code in the pinned jar
 * must name it.
 */
const JAVA_SPAWN_GEAR: ReadonlyMap<string, JavaGearRule> = new Map([
    ['minecraft:skeleton', SKELETON_GEAR],
    ['minecraft:stray', SKELETON_GEAR],
    ['minecraft:bogged', SKELETON_GEAR],
    ['minecraft:parched', SKELETON_GEAR],
    ['minecraft:wither_skeleton', alwaysHolds('WitherSkeleton', 'minecraft:stone_sword')],
    ['minecraft:zombie', ZOMBIE_GEAR],
    ['minecraft:husk', ZOMBIE_GEAR],
    [
        'minecraft:drowned',
        {
            // `nextFloat() > 0.9`, then `nextInt(16) < 10` for a trident; finalizeSpawn adds a
            // nautilus shell to an empty off hand 3% of the time.
            owner: 'Drowned',
            gear: () => ({
                mainhand: { 'minecraft:trident': 0.1 * (10 / 16), 'minecraft:fishing_rod': 0.1 * (6 / 16) },
                offhand: { 'minecraft:nautilus_shell': 0.03 }
            })
        }
    ],
    [
        'minecraft:zombified_piglin',
        {
            owner: 'ZombifiedPiglin',
            gear: () => ({ mainhand: { 'minecraft:golden_spear': 0.05, 'minecraft:golden_sword': 0.95 } })
        }
    ],
    [
        'minecraft:piglin',
        {
            // finalizeSpawn arms an adult with createSpawnWeapon (a crossbow half the time, else a
            // golden spear one time in ten and a golden sword), and maybeWearArmor gives each
            // golden piece 10% of the time. A baby gets neither.
            owner: 'Piglin',
            gear: (baby) =>
                baby
                    ? {}
                    : {
                          mainhand: {
                              'minecraft:crossbow': 0.5,
                              'minecraft:golden_spear': 0.05,
                              'minecraft:golden_sword': 0.45
                          },
                          head: { 'minecraft:golden_helmet': 0.1 },
                          chest: { 'minecraft:golden_chestplate': 0.1 },
                          legs: { 'minecraft:golden_leggings': 0.1 },
                          feet: { 'minecraft:golden_boots': 0.1 }
                      }
        }
    ],
    ['minecraft:piglin_brute', alwaysHolds('PiglinBrute', 'minecraft:golden_axe')],
    ['minecraft:pillager', alwaysHolds('Pillager', 'minecraft:crossbow')],
    ['minecraft:vindicator', alwaysHolds('Vindicator', 'minecraft:iron_axe')],
    ['minecraft:vex', alwaysHolds('Vex', 'minecraft:iron_sword')],
    [
        'minecraft:fox',
        {
            // 20% of foxes hold one item: the second float picks it.
            owner: 'Fox',
            gear: () => ({
                mainhand: {
                    'minecraft:emerald': 0.2 * 0.05,
                    'minecraft:egg': 0.2 * 0.15,
                    'minecraft:rabbit_foot': 0.2 * 0.1,
                    'minecraft:rabbit_hide': 0.2 * 0.1,
                    'minecraft:wheat': 0.2 * 0.2,
                    'minecraft:leather': 0.2 * 0.2,
                    'minecraft:feather': 0.2 * 0.2
                }
            })
        }
    ],
    ['minecraft:copper_golem', { owner: 'Mob', gear: () => ({}) }],
    ['minecraft:sulfur_cube', { owner: 'Mob', gear: () => ({}) }],
    ['minecraft:villager', { owner: 'Mob', gear: () => ({}) }]
]);

/** `Items.IRON_SWORD` for `minecraft:iron_sword`: the field Java's code reads an item through. */
const itemsField = (javaItem: string): string => `Items.${javaItem.slice('minecraft:'.length).toUpperCase()}`;

/** Why a gear rule does not match the pinned jar, or undefined when every part of it does. */
const gearRuleMismatch = (javaId: string, rule: JavaGearRule): string | undefined => {
    const chain = javaChain(javaId);
    const owner = declaring(chain, 'populateDefaultEquipmentSlots');
    if (owner !== rule.owner)
        return `${javaId} runs ${String(owner)}.populateDefaultEquipmentSlots, where the rule here reads ${rule.owner}`;
    const named = new Set(
        chain.flatMap((javaClass) =>
            javaClass.methods.flatMap((method) => javaMemberRefs(method).map((ref) => ref.member))
        )
    );
    const items = Object.values({ ...rule.gear(false), ...rule.gear(true) }).flatMap((odds) => Object.keys(odds ?? {}));
    const missing = items.filter((item) => !named.has(itemsField(item)));
    return missing.length === 0
        ? undefined
        : `the code of ${javaId}'s classes never reads ${missing.map(itemsField).join(', ')}`;
};

/** Compares the gear of `SPAWNS` server spawns with Java's odds for each of those spawns. */
const compareSpawnGear = (subject: EntitySubject): string | undefined => {
    const rule = JAVA_SPAWN_GEAR.get(subject.javaId);
    if (rule === undefined) return `no Java spawn gear rule is listed for ${subject.javaId}`;
    const mismatch = gearRuleMismatch(subject.javaId, rule);
    if (mismatch !== undefined) throw new Error(mismatch);

    const server = new Map<string, number>();
    const java = new Map<string, number>();
    const key = (slot: string, item: string): string => `${item} in the ${slot} slot`;
    withWorld(undefined, () => {
        for (let index = 0; index < SPAWNS; index += 1) {
            const entity = spawn(subject.bedrock);
            for (const [slot, item] of Object.entries(equipmentOf(entity.body))) {
                if (item === undefined || slot === 'body') continue;
                server.set(key(slot, item.identifier), (server.get(key(slot, item.identifier)) ?? 0) + 1);
            }
            for (const [slot, odds] of Object.entries(rule.gear(entity.instance.hasComponent('minecraft:is_baby'))))
                for (const [item, p] of Object.entries(odds ?? {}))
                    java.set(key(slot, bedrockItemOf(item)), (java.get(key(slot, bedrockItemOf(item))) ?? 0) + p);
            realStack().runtime.remove(entity.id, 'parity scenario counted');
        }
    });

    const differences: string[] = [];
    for (const name of [...new Set([...server.keys(), ...java.keys()])].sort()) {
        const expected = (java.get(name) ?? 0) / SPAWNS;
        const observed = (server.get(name) ?? 0) / SPAWNS;
        if (expected === 0) {
            differences.push(`${(observed * 100).toFixed(0)}% spawn with ${name}, which Java never gives`);
            continue;
        }
        const tolerance = 4 * Math.sqrt((expected * (1 - expected)) / SPAWNS) + 0.03;
        if (Math.abs(observed - expected) > tolerance)
            differences.push(
                `${(observed * 100).toFixed(0)}% spawn with ${name}, where Java gives it to ${(expected * 100).toFixed(1)}%`
            );
    }
    return differences.length === 0 ? undefined : differences.join('; ');
};

/**
 * The storage slots Java gives a type, not counting its saddle, armor or carpet, which Java keeps
 * as equipment slots. A chested mount counts with its chest on.
 */
const JAVA_STORAGE: ReadonlyMap<string, (strength: number) => number> = new Map<string, (strength: number) => number>([
    // `new SimpleContainer(1)`, `(8)` and AbstractVillager's `(8)`.
    ['minecraft:allay', () => 1],
    ['minecraft:piglin', () => 8],
    ['minecraft:villager', () => 8],
    // Panda keeps the one item it picks up in its main hand (Panda.canTakeItem), which Bedrock's
    // private one-slot inventory holds.
    ['minecraft:panda', () => 1],
    // AbstractHorse and AbstractNautilus getInventoryColumns return 0, AbstractChestedHorse 5 with
    // a chest and Llama its strength; AbstractMountInventoryMenu.getInventorySize is three a column.
    ['minecraft:horse', () => 0],
    ['minecraft:zombie_horse', () => 0],
    ['minecraft:skeleton_horse', () => 0],
    ['minecraft:camel', () => 0],
    ['minecraft:camel_husk', () => 0],
    ['minecraft:nautilus', () => 0],
    ['minecraft:zombie_nautilus', () => 0],
    ['minecraft:donkey', () => 15],
    ['minecraft:mule', () => 15],
    ['minecraft:llama', (strength) => 3 * strength],
    ['minecraft:trader_llama', (strength) => 3 * strength],
    // AbstractChestBoat.CONTAINER_SIZE, MinecartChest and MinecartHopper getContainerSize; a command
    // block minecart is no container.
    ['minecraft:chest_minecart', () => 27],
    ['minecraft:hopper_minecart', () => 5],
    ['minecraft:command_block_minecart', () => 0]
]);

/**
 * The equipment slots a Bedrock `minecraft:equippable` puts at the front of a mount's container:
 * one per slot it lists, as the llama's carpet sits in container slot 0 though its screen calls it
 * slot 1.
 */
const equippableSlots = (bedrock: string, live?: DataEntity): number =>
    [
        ...componentValues(bedrock, 'minecraft:equippable'),
        // The live entity's copy covers slots a server overlay adds, which the pack's file lacks.
        live?.instance.componentParams('minecraft:equippable')
    ].reduce<number>((most, declared) => {
        const slots = field(declared, 'slots');
        return Array.isArray(slots) ? Math.max(most, slots.length) : most;
    }, 0);

/** The members of one of Java's entity type tags, as the vanilla datapack lists them. */
const javaEntityTag = (tag: string): ReadonlySet<string> => {
    const values = field(packJson(javaLoot().datapack.definitions.tags.get(`entity_type/minecraft:${tag}`)), 'values');
    if (!Array.isArray(values)) throw new Error(`Java's datapack has no entity type tag ${tag}`);
    return new Set(values.filter((value) => typeof value === 'string'));
};

/** The entity types `Equippable.llamaSwag` lets wear a carpet, read out of the pinned jar. */
const javaCarpetWearers = (): ReadonlySet<string> =>
    new Set(
        pinnedJavaClass('net/minecraft/world/item/equipment/Equippable')
            .filter((method) => method.name === 'llamaSwag')
            .flatMap((method) => javaMemberRefs(method))
            .flatMap(({ member }) =>
                member.startsWith('EntityTypes.')
                    ? [`minecraft:${member.slice('EntityTypes.'.length).toLowerCase()}`]
                    : []
            )
    );

/**
 * The mount gear Java lets a player put on a mob, and which mobs take it: a saddle through the
 * `can_equip_saddle` tag, horse and nautilus armor through their tags, and a carpet on the types
 * `Equippable.llamaSwag` allows.
 */
const MOUNT_GEAR: readonly { readonly item: string; readonly takes: (javaId: string) => boolean }[] = [
    { item: 'minecraft:saddle', takes: (javaId) => javaEntityTag('can_equip_saddle').has(javaId) },
    { item: 'minecraft:iron_horse_armor', takes: (javaId) => javaEntityTag('can_wear_horse_armor').has(javaId) },
    {
        item: 'minecraft:copper_nautilus_armor',
        takes: (javaId) => javaEntityTag('can_wear_nautilus_armor').has(javaId)
    },
    { item: 'minecraft:white_carpet', takes: (javaId) => javaCarpetWearers().has(javaId) }
];

/** A tamed adult of the type, the state in which Java's mounts take their gear. */
const tamedAdult = (bedrock: string): DataEntity => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const entity = spawn(bedrock);
        if (entity.instance.hasComponent('minecraft:is_baby')) {
            realStack().runtime.remove(entity.id, 'parity scenario wants an adult');
            continue;
        }
        // Tame it the way a player's taming does, through the event its definition names.
        const tameEvent = [
            ...componentValues(bedrock, 'minecraft:tamemount'),
            ...componentValues(bedrock, 'minecraft:tameable')
        ]
            .map((declared) => field(field(declared, 'tame_event'), 'event'))
            .find((event) => typeof event === 'string');
        if (typeof tameEvent === 'string') entity.instance.fire(tameEvent);
        activateGroupsDeclaring(entity, bedrock, 'minecraft:equippable');
        entity.body.conditions.add('is_tamed');
        runTicks(1);
        return entity;
    }
    throw new Error(`every ${bedrock} the runtime spawned was a baby`);
};

/** The runtime id of the store player a scenario hands an item from. */
const HOLDER_ID = PLAYER_ID + 2;

/** Whether the server lets a player put `item` on a tamed adult of the type, and keeps it there. */
const serverTakesGear = (bedrock: string, item: string): boolean =>
    withWorld(undefined, () => {
        const { runtime } = realStack();
        // A store player holding the item, so the definition's has_equipment filters see it.
        const holder = runtime.spawnPlayer(HOLDER_ID, { ...ORIGIN, x: ORIGIN.x + 1 });
        if (holder === undefined) throw new Error('the runtime refused to spawn a player');
        hold(holder.body, item);
        const entity = tamedAdult(bedrock);
        runtime.setOwner(entity.id, HOLDER_ID);
        // The live server hands the interacting player's own filter view, which knows whether the
        // player sneaks; a store player's goal view does not answer that.
        const view = runtime.mobById(HOLDER_ID)?.view();
        if (view === undefined) throw new Error('the runtime has no view of its own player');
        const standing: FilterEntityView = {
            ...view,
            flag: (name) => (name === 'is_sneaking' ? false : view.flag?.(name))
        };
        const result = runtime.interactWithItem(entity.id, HOLDER_ID, item, standing);
        const held = [...containerOf(entity.body), ...Object.values(equipmentOf(entity.body))];
        return result.accepted && held.some((drop) => drop?.identifier === item);
    });

/** How Java sets `Mob.canPickUpLoot` for a fresh mob of a type. */
type JavaLootPickup = 'always' | 'never' | 'regional';

/** Whether one of a class's own methods calls `setCanPickUpLoot`, and with what. */
const pickupSetting = (javaClass: JavaClass): JavaLootPickup | undefined => {
    for (const method of javaClass.methods) {
        if (method.name !== '<init>' && method.name !== 'finalizeSpawn') continue;
        const calls = javaMemberRefs(method).flatMap((ref) => (ref.kind === 'call' ? [ref.member] : []));
        if (!calls.some((member) => member.endsWith('.setCanPickUpLoot'))) continue;
        // `Zombie` and `AbstractSkeleton` roll `nextFloat() < 0.55F * getSpecialMultiplier()`;
        // `Fox`, `AbstractPiglin` and `Villager` pass `true`.
        return calls.some((member) => member.endsWith('.getSpecialMultiplier')) ? 'regional' : 'always';
    }
    return undefined;
};

/**
 * Java's `Mob.canPickUpLoot` for a freshly spawned mob, read from the pinned jar: the value the
 * nearest class's constructor or `finalizeSpawn` sets, `false` when none does, and the
 * `canPickUpLoot` overrides of `Allay` (only with an item in hand, which a fresh allay lacks).
 */
const javaLootPickup = (javaId: string): JavaLootPickup => {
    const chain = javaChain(javaId);
    const getter = declaring(chain, 'canPickUpLoot');
    if (getter === 'Allay') return 'never';
    // SulfurCube.canPickUpLoot is `!hasBodyItem()`, and a fresh cube's body is empty.
    if (getter === 'SulfurCube') return 'always';
    if (getter !== 'Mob') throw new Error(`${javaId} runs ${String(getter)}.canPickUpLoot, which no rule here reads`);
    for (const javaClass of chain) {
        const setting = pickupSetting(javaClass);
        if (setting !== undefined) return setting;
    }
    return 'never';
};

/** The items one of Java's item tags holds, with the tags it names expanded. */
const javaItemTag = (tag: string): readonly string[] => {
    const values = field(packJson(javaLoot().datapack.definitions.tags.get(`item/minecraft:${tag}`)), 'values');
    if (!Array.isArray(values)) throw new Error(`Java's datapack has no item tag ${tag}`);
    return values.flatMap((value) =>
        typeof value !== 'string'
            ? []
            : value.startsWith('#minecraft:')
              ? javaItemTag(value.slice('#minecraft:'.length))
              : [value]
    );
};

/** What a mob holds where Java's pickup rules look, and whether it is a baby. */
interface PickupHolder {
    readonly mainhand: string | undefined;
    readonly offhand: string | undefined;
    readonly head: string | undefined;
    readonly baby: boolean;
}

/**
 * Whether Java's `Mob.wantsToPickUp` takes one item, and the slot `Mob.pickUpItem` puts it in:
 * `undefined` for an item the mob leaves on the ground, `'taken'` for one it takes elsewhere.
 * Reads which class's `wantsToPickUp` and `canHoldItem` the type runs.
 */
const javaPickupSlot = (
    javaId: string,
    item: string,
    holder: PickupHolder
): 'mainhand' | 'head' | 'taken' | undefined => {
    const chain = javaChain(javaId);
    const wants = declaring(chain, 'wantsToPickUp');
    const armor = item.endsWith('_helmet');
    switch (wants) {
        case 'Piglin':
            // PiglinAi.wantsToPickup: gold ingots are barter currency, wanted while the off hand
            // is free; anything else that is not food or loved replaces what the slot holds.
            if (item === 'minecraft:gold_ingot') return holder.offhand === undefined ? 'taken' : undefined;
            return armor && holder.head === undefined ? 'head' : undefined;
        case 'Villager':
            // Villager.wantsToPickUp: the villager_picks_up tag, or what an unemployed villager's
            // profession requests, which is nothing.
            return javaItemTag('villager_picks_up').includes(item) ? 'taken' : undefined;
        case 'Mob':
        case 'Zombie':
        case 'Drowned':
        case 'AbstractSkeleton':
        case 'ZombifiedPiglin':
            break;
        default:
            throw new Error(`${javaId} runs ${String(wants)}.wantsToPickUp, which no rule here reads`);
    }
    const holds = declaring(chain, 'canHoldItem');
    if (holds === 'Fox') return holder.mainhand === undefined ? 'mainhand' : undefined;
    if (holds === 'SulfurCube') {
        // SulfurCube.canHoldItem and pickUpItem: an adult with an empty body swallows one item of
        // #sulfur_cube_swallowable into its body slot. Bedrock's cube keeps its block in the main
        // hand, which its equip_item (can_wear_armor false) routes every pickup to and its client
        // draws inside the cube, so the server's main hand stands for Java's body slot.
        const swallowable = javaItemTag('sulfur_cube_swallowable').map(bedrockItemOf).includes(item);
        return swallowable && holder.mainhand === undefined && !holder.baby ? 'mainhand' : undefined;
    }
    // Zombie.canHoldItem refuses only an egg for a baby riding something, and
    // WitherSkeleton.canHoldItem the wither_skeleton_disliked_weapons tag; both then ask Mob's.
    if (holds === 'WitherSkeleton' && javaItemTag('wither_skeleton_disliked_weapons').includes(item)) return undefined;
    if (holds !== 'Mob' && holds !== 'Zombie' && holds !== 'WitherSkeleton')
        throw new Error(`${javaId} runs ${String(holds)}.canHoldItem, which no rule here reads`);
    // Mob.pickUpItem equips the item where getEquipmentSlotForItem puts it, when that slot is free.
    if (armor) return holder.head === undefined ? 'head' : undefined;
    return holder.mainhand === undefined ? 'mainhand' : undefined;
};

/** Ticks a mob gets to take an item lying at its feet. */
const PICKUP_TICKS = 60;

/** Where a picked-up item sits on the server's mob: the slot it is worn or held in, or `'taken'`. */
const serverPickup = (
    entity: DataEntity,
    item: string
): { readonly slot: 'mainhand' | 'head' | 'taken' | undefined; readonly holder: PickupHolder } => {
    const { runtime, world } = realStack();
    const equipment = equipmentOf(entity.body);
    const holder: PickupHolder = {
        mainhand: equipment.mainhand?.identifier,
        offhand: equipment.offhand?.identifier,
        head: equipment.head?.identifier,
        baby: entity.instance.hasComponent('minecraft:is_baby')
    };
    world.host.drop({ x: Math.floor(ORIGIN.x), y: ORIGIN.y, z: Math.floor(ORIGIN.z) }, { identifier: item, count: 1 });
    runTicks(PICKUP_TICKS, () => (world.host.items?.() ?? []).length === 0);
    const lying = (world.host.items?.() ?? []).some((stack) => stack.item.identifier === item);
    clearLyingItems();
    if (lying || entity.removed !== undefined) return { slot: undefined, holder };
    const now = equipmentOf(entity.body);
    const slot =
        now.head?.identifier === item && holder.head !== item
            ? 'head'
            : now.mainhand?.identifier === item && holder.mainhand !== item
              ? 'mainhand'
              : 'taken';
    runtime.remove(entity.id, 'parity scenario counted');
    return { slot, holder };
};

/**
 * The items a pickup row lays at a fresh mob's feet: a gold ingot, for a villager what it
 * gathers, and for a sulfur cube a block it swallows.
 */
const pickupItems = (javaId: string): readonly string[] => {
    const chain = javaChain(javaId);
    if (declaring(chain, 'wantsToPickUp') === 'Villager')
        return ['minecraft:gold_ingot', bedrockItemOf(javaItemTag('villager_picks_up')[0] ?? 'minecraft:bread')];
    if (declaring(chain, 'canHoldItem') === 'SulfurCube')
        return ['minecraft:gold_ingot', bedrockItemOf(javaItemTag('sulfur_cube_swallowable')[0] ?? 'minecraft:dirt')];
    return ['minecraft:gold_ingot'];
};

/**
 * Compares what a fresh mob in a fresh region does with each item laid at its feet, then, for a
 * mob that equips what it picks up, what it does with an iron helmet once it may pick up at all,
 * as a mob in a hard region whose `canPickUpLoot` roll passed may.
 */
const comparePickup = (subject: EntitySubject): string | undefined => {
    const loot = javaLootPickup(subject.javaId);
    const differences: string[] = [];
    const check = (item: string, mayPickUp: boolean, force: boolean): void =>
        withWorld(playerAt(8), () => {
            const entity = spawn(subject.bedrock);
            if (force) entity.body.canPickUpLoot = true;
            const server = serverPickup(entity, item);
            const java = mayPickUp ? javaPickupSlot(subject.javaId, item, server.holder) : undefined;
            if (server.slot === java) return;
            const describe = (slot: string | undefined): string =>
                slot === undefined ? 'leaves it' : slot === 'taken' ? 'takes it' : `puts it in its ${slot} slot`;
            differences.push(
                `${force ? 'once it may pick up, ' : ''}it ${describe(server.slot)} with ${item} at its feet, where Java ${describe(java)}`
            );
        });
    for (const item of pickupItems(subject.javaId)) check(item, loot === 'always', false);
    if (serverContent().entities.registry.get(subject.bedrock)?.declaredComponents.includes('minecraft:equip_item'))
        check('minecraft:iron_helmet', loot !== 'never', loot === 'regional');
    return differences.length === 0 ? undefined : differences.join('; ');
};

/**
 * How far sideways Java's `MinecartHopper.suckInItems` grows the cart's box to find items, read
 * from the jar.
 */
const javaHopperReach = (javaId: string): number => {
    const className = javaEntityClasses().get(javaId);
    const method = className === undefined ? undefined : javaMethodOf(className, 'suckInItems');
    const reach = method === undefined ? undefined : pushedNumbers(method.method).find((value) => value > 0);
    if (reach === undefined) throw new Error(`${javaId} runs no suckInItems that grows its box`);
    return reach;
};

/**
 * Lays three stacks on a fresh hopper minecart and one a little beyond Java's reach, then counts
 * what the cart took after one tick and after five.
 */
const compareHopperCollecting = (subject: EntitySubject): string | undefined =>
    withWorld(playerAt(8), () => {
        const { world } = realStack();
        const cart = spawn(subject.bedrock);
        runTicks(1);
        const width = cart.facts.box.width;
        // Past the box grown by Java's reach and an item's own half width, and past the suck box.
        const far = {
            x: ORIGIN.x + Math.max(width / 2 + javaHopperReach(subject.javaId), 0.5) + 0.5,
            y: ORIGIN.y,
            z: ORIGIN.z
        };
        const stacks = [
            { identifier: 'minecraft:dirt', count: 5 },
            { identifier: 'minecraft:cobblestone', count: 3 },
            { identifier: 'minecraft:oak_log', count: 2 }
        ];
        for (const stack of stacks) world.host.drop(ORIGIN, stack);
        world.host.drop(far, { identifier: 'minecraft:diamond', count: 1 });
        // Only the stacks laid here count: the shared world may hold items other rows dropped.
        const near = () =>
            (world.host.items?.() ?? []).filter(
                (stack) => Math.abs(stack.position.x - ORIGIN.x) < 4 && Math.abs(stack.position.z - ORIGIN.z) < 4
            );
        const lying = (): number => near().filter((stack) => stack.item.identifier !== 'minecraft:diamond').length;
        const held = (): number => containerOf(cart.body).reduce((sum, stack) => sum + stack.count, 0);
        const differences: string[] = [];
        runTicks(1);
        if (lying() !== stacks.length - 1)
            differences.push(`one tick left ${lying()} of the three stacks in reach, where Java takes one a tick`);
        runTicks(4);
        if (held() !== 10)
            differences.push(`it holds ${held()} items after five ticks, where Java takes all 10 in reach`);
        if (!near().some((stack) => stack.item.identifier === 'minecraft:diamond'))
            differences.push("it took a diamond lying past Java's reach");
        return differences.length === 0 ? undefined : differences.join('; ');
    });

/** Where the door course stands, far from every other scenario's mobs. */
const DOOR_COURSE = { x: 4096, y: ORIGIN.y, z: 0 } as const;

/**
 * Builds a stone wall across x with a closed oak door in it, plans a path for the mob from one
 * side to the other through the server's live block view, and takes the course down again.
 * @returns Whether the path reached the far side.
 */
const routesThroughClosedDoor = (entity: DataEntity): boolean => {
    const { runtime, world } = realStack();
    const { x, y, z } = DOOR_COURSE;
    const wall: ContentEntity['position'][] = [];
    for (let dz = -3; dz <= 3; dz += 1) for (let dy = 0; dy <= 2; dy += 1) wall.push({ x, y: y + dy, z: z + dz });
    try {
        for (const cell of wall)
            world.setBlock(cell, cell.z === z && cell.y < y + 2 ? 'minecraft:wooden_door' : 'minecraft:stone');
        const path = findPath(runtime.navigation(), navigationProfile(entity.instance), {
            from: { x: x - 3 + 0.5, y, z: z + 0.5 },
            to: { x: x + 3 + 0.5, y, z: z + 0.5 },
            maxNodes: 4096
        });
        return path?.reachedGoal === true;
    } finally {
        for (const cell of wall) world.setBlock(cell, 'minecraft:air');
    }
};

/** Whether a type's constructor calls `PathNavigation.setCanOpenDoors(true)`, as `Villager`'s does. */
const javaConstructorOpensDoors = (javaId: string): boolean =>
    javaChain(javaId).some((javaClass) =>
        javaClass.methods.some((method) => {
            if (method.name !== '<init>') return false;
            const operations = javaOperations(method);
            const call = operations.findIndex(
                (operation) => operation.kind === 'call' && operation.target.endsWith('.setCanOpenDoors')
            );
            const pushed = call > 0 ? operations[call - 1] : undefined;
            return pushed?.kind === 'number' && pushed.value === 1;
        })
    );

/** Compares whether the server plans a mob's path through a closed wooden door with Java's navigator. */
const compareDoorRoute = (subject: EntitySubject): string | undefined =>
    withWorld(playerAt(8), () => {
        const entity = spawn(subject.bedrock);
        // WalkNodeEvaluator reads a closed wooden door as WALKABLE_DOOR only for a navigator
        // that opens doors, and as DOOR_WOOD_CLOSED, which no path enters, otherwise. A type the
        // navigation dump leaves out, such as the villager, answers from its constructor.
        const java = entity.instance.javaNavigation;
        const opens = java?.canOpenDoors ?? javaConstructorOpensDoors(subject.javaId);
        const javaRoutes = opens && (java?.pathfindingMalus['walkable_door'] ?? 0) >= 0;
        const server = routesThroughClosedDoor(entity);
        if (server !== javaRoutes)
            return server
                ? 'the server plans its path through a closed wooden door, which Java never does for it'
                : "the server will not plan its path through a closed wooden door, which Java's navigator opens";
        if (!javaRoutes || entity.brain === undefined) return undefined;
        // Java's InteractWithDoor, in the core activity of every brain mob whose navigator opens
        // doors, opens the door on the mob's path.
        const walk = serverWalksThroughDoor(subject);
        const differences = [
            !walk.opened && 'it never opened the closed door on its path, which Java opens',
            !walk.out && `it did not get out through the door in ${DOOR_WALK_TICKS} ticks`
        ].filter((difference) => difference !== false);
        return differences.length === 0 ? undefined : differences.join('; ');
    });

/** What Java's `BreakDoorGoal` does for one type. */
interface JavaDoorBreaker {
    /** The difficulties the type's `DOOR_BREAKING_PREDICATE` accepts, such as `hard`. */
    readonly difficulties: ReadonlySet<string>;
    /** Whether the goal also needs an active raid, as `Vindicator.VindicatorBreakDoorGoal.canUse` does. */
    readonly raidOnly: boolean;
    /**
     * Game ticks from the goal's start to the break: `BreakDoorGoal.DEFAULT_DOOR_BREAK_TIME`, which
     * `getDoorBreakTime` never goes below, counted in goal ticks. `Mob.serverAiStep` runs
     * `GoalSelector.tick` on every other game tick and `tickRunningGoals(false)` between, which
     * ticks only a goal whose `requiresUpdateEveryTick` is set, and no class of `BreakDoorGoal`'s
     * sets it, so a goal tick is two game ticks.
     */
    readonly ticks: number;
}

/**
 * The door breaking of a Java type, read from the pinned jar: the difficulties the static lambda
 * behind its class's `DOOR_BREAKING_PREDICATE` compares with, whether a `BreakDoorGoal` subclass
 * nested in that class asks `hasActiveRaid`, and the goal's break time.
 */
const javaDoorBreaker = (javaId: string): JavaDoorBreaker => {
    const ticks = pinnedJavaConstants('net/minecraft/world/entity/ai/goal/BreakDoorGoal').get(
        'DEFAULT_DOOR_BREAK_TIME'
    );
    if (ticks === undefined) throw new Error('BreakDoorGoal holds no DEFAULT_DOOR_BREAK_TIME');
    const everyTick = javaClassChain('net/minecraft/world/entity/ai/goal/BreakDoorGoal').some(
        (javaClass) =>
            simpleName(javaClass) !== 'Goal' &&
            javaClass.methods.some((method) => method.name === 'requiresUpdateEveryTick')
    );
    const gameTicks = everyTick ? ticks : ticks * 2;
    for (const javaClass of javaChain(javaId)) {
        const difficulties = new Set(
            javaClass.methods
                .filter((method) => method.name.startsWith('lambda$static$'))
                .flatMap((method) => javaOperations(method))
                .flatMap((operation) =>
                    operation.kind === 'field' && operation.target.startsWith('Difficulty.')
                        ? [operation.target.slice('Difficulty.'.length).toLowerCase()]
                        : []
                )
        );
        if (difficulties.size === 0) continue;
        const raidOnly = pinnedJavaClassNames(`${javaClass.name}$`)
            .filter((name) => name.endsWith('BreakDoorGoal'))
            .some((name) =>
                pinnedJavaClassFile(name)?.methods.some(
                    (method) => method.name === 'canUse' && method.calls.some((call) => call.endsWith('.hasActiveRaid'))
                )
            );
        return { difficulties, raidOnly, ticks: gameTicks };
    }
    throw new Error(`no class in ${javaId}'s chain builds a BreakDoorGoal predicate`);
};

/** Game ticks a door-breaking row watches: Java's 480-tick break and the walk to the door. */
const DOOR_BREAK_WATCH = 560;

/** What the server did with a closed door between a door breaker and its target. */
interface ServerDoorBreak {
    /** The tick, counted from the spawn, the door was gone at, or undefined when it stood. */
    readonly brokeAt: number | undefined;
    readonly drops: number;
    /** Whether the door crash level event was played. */
    readonly crashed: boolean;
}

/** The component Bedrock gives a mob while it may break doors. */
const BREAK_DOOR = 'minecraft:annotation.break_door';

/** Bedrock's door crash level event, which Java numbers 1021. */
const SOUND_ZOMBIE_DOOR_CRASH = 1012;

/**
 * Pens a mob whose door-breaking group is active in stone walls whose one way out is a closed oak
 * door, its target a player outside, and watches the door for {@link DOOR_BREAK_WATCH}
 * ticks at one difficulty, with `mobGriefing` on or off.
 */
const serverDoorBreak = (subject: EntitySubject, difficulty: 'easy' | 'normal' | 'hard', griefing: boolean) => {
    const { world } = realStack();
    return inDoorPen(subject, true, (entity, door) => {
        world.difficulty = difficulty;
        world.gameRules.set('mobGriefing', griefing);
        try {
            const events = world.levelEvents.length;
            const drops = world.drops.length;
            // A mob that breaks doors walks in to its target. A drowned's spawn event makes it a
            // trident thrower at random, and one holds its ground within 10 blocks, as Java's
            // DrownedTridentAttackGoal does; which one spawns comes from a random sequence every
            // earlier row of the theme draws from, so the door test takes the ranged groups off.
            deactivateGroupsDeclaring(entity, subject.bedrock, [
                'minecraft:behavior.ranged_attack',
                'minecraft:target_nearby_sensor'
            ]);
            activateGroupsDeclaring(entity, subject.bedrock, BREAK_DOOR);
            activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:behavior.melee_box_attack');
            entity.body.target = PLAYER_ID;
            let brokeAt: number | undefined;
            for (let tick = 1; tick <= DOOR_BREAK_WATCH && brokeAt === undefined; tick += 1) {
                runTicks(1);
                if (!isDoorAt(world, door)) brokeAt = tick;
            }
            return {
                brokeAt,
                drops: world.drops.length - drops,
                crashed: world.levelEvents.slice(events).some((event) => event.event === SOUND_ZOMBIE_DOOR_CRASH)
            };
        } finally {
            world.difficulty = 'normal';
            world.gameRules.delete('mobGriefing');
        }
    });
};

/**
 * Runs `body` with a mob of the type penned in stone walls three blocks across whose east wall
 * holds a closed oak door, the one way out, and, with `withPlayer`, a player three blocks past the
 * door, then takes the pen and the mob away.
 */
const inDoorPen = <Result>(
    subject: EntitySubject,
    withPlayer: boolean,
    body: (entity: DataEntity, door: ContentEntity['position']) => Result
): Result => {
    const { runtime, world } = realStack();
    const { x, y, z } = DOOR_COURSE;
    const player: ContentEntity = {
        id: PLAYER_ID,
        identifier: 'minecraft:player',
        position: { x: x + 3.5, y, z: z + 0.5 }
    };
    const wall: ContentEntity['position'][] = [];
    for (let dx = -4; dx <= 0; dx += 1)
        for (let dz = -2; dz <= 2; dz += 1)
            for (let dy = 0; dy <= 2; dy += 1)
                if (dx === -4 || dx === 0 || Math.abs(dz) === 2) wall.push({ x: x + dx, y: y + dy, z: z + dz });
    return withWorld(withPlayer ? player : undefined, () => {
        let entity: DataEntity | undefined;
        try {
            for (const cell of wall) {
                const half = cell.x === x && cell.z === z && cell.y < y + 2 ? cell.y - y : undefined;
                if (half === undefined) world.setBlock(cell, 'minecraft:stone');
                else world.setBlock(cell, 'minecraft:wooden_door', { ...CLOSED_DOOR, upper_block_bit: half === 1 });
            }
            entity = runtime.spawn(subject.bedrock, { x: x - 2.5, y, z: z + 0.5 });
            if (entity === undefined) throw new Error(`the runtime refused to spawn ${subject.bedrock}`);
            return body(entity, { x, y, z });
        } finally {
            if (entity !== undefined) runtime.remove(entity.id, 'parity scenario cleanup');
            for (const cell of wall) world.setBlock(cell, 'minecraft:air');
        }
    });
};

/** Ticks a door-opening row gives a mob to walk out of the pen and on past the door. */
const DOOR_WALK_TICKS = 300;

/**
 * Sends a brain mob from the door pen to a block eight past the door, as its walk target, and
 * reports whether it opened the door and got out. Whether it then closes the door depends on how
 * far it walked while `InteractWithDoor` waited out its 20-tick recheck, which a fast villager
 * outruns in Java as well, so the row does not ask.
 */
const serverWalksThroughDoor = (subject: EntitySubject) =>
    inDoorPen(subject, false, (entity, door) => {
        const { world } = realStack();
        const brain = entity.brain;
        if (brain === undefined) throw new Error(`${subject.bedrock} runs no brain`);
        const outside = { x: door.x + 8, y: door.y, z: door.z };
        // The pen writes `open_bit` as a boolean, and a door keeps the type it was written with.
        const isOpen = (): boolean => world.world.blocks.get(door)?.states['open_bit'] === true;
        let opened = false;
        let out = false;
        for (let tick = 0; tick < DOOR_WALK_TICKS && !out; tick += 1) {
            brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                target: blockPosTracker(outside),
                speedModifier: 0.6,
                closeEnoughDist: 0
            });
            runTicks(1);
            opened ||= isOpen();
            out = entity.position.x > door.x + 1.5;
        }
        return { opened, out };
    });

/** The states of a closed oak door half, upright and hinged on the left. */
const CLOSED_DOOR = { open_bit: false, 'minecraft:cardinal_direction': 'south', door_hinge_bit: false } as const;

/** Whether a door half still stands at a position of the test world. */
const isDoorAt = (world: TestEntityWorld, at: ContentEntity['position']): boolean =>
    world.world.blocks.get(at)?.identifier === 'minecraft:wooden_door';

/**
 * Compares what a door breaker does with a closed wooden door in its way with Java's
 * `BreakDoorGoal`: on a difficulty its predicate accepts it breaks the door 240 goal ticks after
 * it starts beating on it, dropping nothing; below that difficulty, or with `mobGriefing` off, the
 * door stands. A type whose goal needs a raid spawns unable to break doors.
 */
const compareDoorBreaking = (subject: EntitySubject): string | undefined => {
    const java = javaDoorBreaker(subject.javaId);
    const lowest = (['easy', 'normal', 'hard'] as const).find((difficulty) => java.difficulties.has(difficulty));
    if (lowest === undefined) return `Java's predicate accepts no difficulty for ${subject.javaId}`;
    const below = lowest === 'hard' ? 'normal' : 'easy';
    const differences: string[] = [];
    const breaks = serverDoorBreak(subject, lowest, true);
    if (breaks.brokeAt === undefined)
        differences.push(
            `it left the door standing for ${DOOR_BREAK_WATCH} ticks on ${lowest}, where Java breaks it after ${java.ticks}`
        );
    else if (breaks.brokeAt < java.ticks)
        differences.push(`it broke the door ${breaks.brokeAt} ticks after it spawned, before Java's ${java.ticks}`);
    if (breaks.brokeAt !== undefined && breaks.drops > 0)
        differences.push(`the broken door dropped ${breaks.drops} stacks, where Java's drops nothing`);
    if (breaks.brokeAt !== undefined && !breaks.crashed)
        differences.push('the door broke without the door crash level event Java plays');
    if (serverDoorBreak(subject, below, true).brokeAt !== undefined)
        differences.push(`it broke the door on ${below}, which Java's predicate refuses`);
    if (serverDoorBreak(subject, lowest, false).brokeAt !== undefined)
        differences.push('it broke the door with mobGriefing off, which Java refuses');
    if (java.raidOnly && withWorld(undefined, () => spawn(subject.bedrock).instance.hasComponent(BREAK_DOOR)))
        differences.push('it spawns able to break doors outside a raid, which Java only lets it do in one');
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** One method of the pinned jar, as `Owner.name` with its descriptor. */
interface JavaMethodRef {
    readonly owner: string;
    readonly name: string;
    readonly descriptor: string;
}

/** Every method of the jar whose code calls a method, found through the classes that name it. */
const javaCallersOf = (callee: string, matches: (member: string, descriptor: string | undefined) => boolean) =>
    pinnedJavaClassesNaming(callee).flatMap((javaClass) =>
        javaClass.methods
            .filter((method) =>
                method.instructions.some(
                    (instruction) =>
                        instruction.member !== undefined && matches(instruction.member, instruction.descriptor)
                )
            )
            .map((method): JavaMethodRef => ({
                owner: javaClass.name,
                name: method.name,
                descriptor: method.descriptor
            }))
    );

let pickedFromInsideReaders: readonly string[] | undefined;

/**
 * The server-side code that reads `Entity.canBePickedFromInside`, Java's rule for whether a
 * crosshair inside an entity's box picks it: each method of the server jar that calls it, then the
 * methods that call those. In the 26.3 jar the one reader is the `ProjectileUtil.getEntityHitResult`
 * overload with a `double` range, and nothing in the server jar calls that overload: its caller is
 * the client's `GameRenderer.pick`, so the rule never reaches a server.
 * @returns The server entry points that reach the flag, as `Owner.name`; none for a client rule.
 */
const javaServerPickedFromInsideReaders = (): readonly string[] => {
    if (pickedFromInsideReaders !== undefined) return pickedFromInsideReaders;
    const readers = javaCallersOf('canBePickedFromInside', (member) => member.endsWith('.canBePickedFromInside'));
    if (readers.length === 0) throw new Error('no class of the jar calls Entity.canBePickedFromInside');
    pickedFromInsideReaders = readers.flatMap((reader) =>
        javaCallersOf(
            reader.name,
            (member, descriptor) => member === `${reader.owner}.${reader.name}` && descriptor === reader.descriptor
        ).map((caller) => `${caller.owner.slice(caller.owner.lastIndexOf('/') + 1)}.${caller.name}`)
    );
    return pickedFromInsideReaders;
};

/** The client decision a `not_pickable_from_inside` row reports, which `classify` files under category 2. */
const CLIENT_PICKING =
    "Java decides it only in the client: Entity.canBePickedFromInside is read by ProjectileUtil.getEntityHitResult(Entity, Vec3, Vec3, AABB, Predicate, double), which no class of the pinned 26.3 server jar calls (the client's GameRenderer.pick does), and the server takes a blow from a player standing inside the box at reach 0 either way";

/**
 * Checks that a mob's `minecraft:not_pickable_from_inside` is a client rule on both sides: no Java
 * server code reaches `canBePickedFromInside`, and the server's attack reach, `Combat.distanceToBody`
 * against `SURVIVAL_REACH`, takes a blow from a player standing inside the mob's box while the
 * component is active.
 */
const compareNotPickableFromInside = (subject: EntitySubject): string => {
    const readers = javaServerPickedFromInsideReaders();
    if (readers.length > 0) return `Java's server reads canBePickedFromInside through ${readers.join(', ')}`;
    return withWorld(undefined, () => {
        const entity = spawn(subject.bedrock);
        activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:not_pickable_from_inside');
        if (!entity.instance.hasComponent('minecraft:not_pickable_from_inside'))
            return 'no group that declares minecraft:not_pickable_from_inside stays active on it';
        runTicks(1);
        const at = entity.position;
        const point = (x: number, y: number, z: number) => ({ getX: () => x, getY: () => y, getZ: () => z });
        const body = {
            getPosition: () => point(at.x, at.y, at.z),
            getBox: () => entity.facts.box,
            getFeetY: () => at.y
        };
        // A player's eyes in the middle of the box, as one standing inside a sulfur cube has them.
        const reach = distanceToBody(point(at.x, at.y + entity.facts.box.height / 2, at.z), body);
        return reach > SURVIVAL_REACH
            ? `the server refuses a blow from inside its box, measuring ${reach} blocks`
            : CLIENT_PICKING;
    });
};

/** The scenarios this module adds to `ENTITY_SCENARIO_GROUPS`. */
export const lootScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'death-loot',
        java: 'A mob killed by a player drops what its Java entity loot table rolls for that kill, and a boat breaks under five punches in a row and drops itself.',
        reference:
            'Java LivingEntity.dropAllDeathLoot and dropFromLootTable (THIS_ENTITY, DAMAGE_SOURCE, ATTACKING_ENTITY and LAST_DAMAGE_PLAYER), EntityType.getDefaultLootTable (entities/<id>), and VehicleEntity.hurtServer and destroy with AbstractBoat.getDropItem',
        subjects: () => entitiesDeclaring('minecraft:loot'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:loot'],
        run: (subject) => {
            const boat = boatItemOf(subject);
            if (boat !== undefined) return compareBoatBreaking(boat);
            if (subject.javaId === 'minecraft:fishing_bobber') {
                // The bobber's own table is the catch, which Java rolls from gameplay/fishing when
                // the line is reeled in, not on any death.
                const [declared] = componentValues(subject.bedrock, 'minecraft:loot');
                const table = field(declared, 'table');
                return table === 'loot_tables/gameplay/fishing.json'
                    ? undefined
                    : `its catch table is ${String(table)}, where Java's FishingHook.retrieve rolls gameplay/fishing`;
            }
            const table = javaDeathTable(subject.javaId);
            if (!javaLoot().datapack.definitions.lootTablesJava.has(table)) return `Java's datapack has no ${table}`;
            if (subject.javaId === 'minecraft:player') {
                // A player's death drops its inventory, which is not this table's; the table itself is empty.
                const java = javaDeathRoll(table, { type: subject.javaId });
                const server = withWorld(undefined, () => {
                    const { runtime, world } = realStack();
                    const player = runtime.spawnPlayer(PLAYER_ID + 1, ORIGIN);
                    if (player === undefined) throw new Error('the runtime refused to spawn a player');
                    runtime.kill(player);
                    return tally(world.drops.map((drop) => drop.item));
                });
                return java.size === 0 && server.size === 0
                    ? undefined
                    : `a player's death drops ${[...server.keys()].join(', ') || 'nothing'} from its table, where Java's ${table} drops ${[...java.keys()].join(', ') || 'nothing'}`;
            }
            return compareDeathDrops(subject, table);
        }
    },
    {
        name: 'death-experience',
        java: "A mob a player killed drops Java's experience for it, and a mob no player hurt drops none.",
        reference:
            "Java LivingEntity.dropExperience (lastHurtByPlayerMemoryTime, shouldDropExperience, doMobLoot), Mob.getBaseExperienceReward (xpReward plus 1 + nextInt(3) per equipped item), Animal, WaterAnimal and AgeableWaterCreature (1 + nextInt(3)), Zombie (a baby's xpReward times 2.5), Piglin, Hoglin and SulfurCube, and the xpReward each constructor sets, read from the pinned jar",
        subjects: () => entitiesDeclaring('minecraft:experience_reward'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:experience_reward'],
        run: (subject) => {
            if (subject.javaId !== 'minecraft:player') return compareDeathExperience(subject);
            // Player.getBaseExperienceReward pays min(level * 7, 100), so a fresh level 0 player drops none.
            return withWorld(undefined, () => {
                const { runtime } = realStack();
                const player = runtime.spawnPlayer(PLAYER_ID + 1, ORIGIN);
                if (player === undefined) throw new Error('the runtime refused to spawn a player');
                runtime.kill(player);
                const dropped = collectOrbs();
                return dropped === 0
                    ? undefined
                    : `a level 0 player's death dropped ${dropped} experience, where Java drops none`;
            });
        }
    },
    {
        name: 'peaceful-despawn',
        java: 'On peaceful, a mob whose type is registered notInPeaceful is discarded on its next tick, named or not, and every other mob stays.',
        reference:
            'Java Mob.checkDespawn (Difficulty.PEACEFUL and EntityType.isAllowedInPeaceful, before isPersistenceRequired) and the notInPeaceful() calls in EntityTypes; issue #3005',
        subjects: () =>
            javaEntityIds().flatMap((javaId) => {
                const className = javaEntityClasses().get(javaId);
                const subject = mappedEntity(javaId);
                return subject !== undefined &&
                    className !== undefined &&
                    javaIsA(className, 'net/minecraft/world/entity/Mob') &&
                    serverContent().entities.registry.has(subject.bedrock)
                    ? [subject]
                    : [];
            }),
        idOf: (subject) => subject.javaId,
        aspects: () => ['peaceful-despawn'],
        run: (subject) => {
            const javaDiscards = javaRegistrations().notInPeaceful.has(subject.javaId);
            const { world } = realStack();
            const before = world.difficulty;
            world.difficulty = 'peaceful';
            try {
                // A player beside it, so no distance rule takes it, and a name, which Java's
                // peaceful rule ignores and every other despawn rule honors.
                return withWorld(playerAt(2), () => {
                    const entity = spawn(subject.bedrock);
                    realStack().runtime.nameEntity(entity.id, 'Parity');
                    runTicks(1);
                    const discarded = entity.removed !== undefined;
                    if (discarded === javaDiscards) return undefined;
                    return discarded
                        ? `it was removed on peaceful (${entity.removed}), where Java keeps it`
                        : 'it stayed on peaceful, where Java discards it';
                });
            } finally {
                world.difficulty = before;
            }
        }
    },
    {
        name: 'despawn-distance',
        java: "A mob with no player within its category's despawn distance (128 blocks, 64 for water ambient mobs) despawns at once when Mob.removeWhenFarAway allows it, and a fresh mob nearer than that stays.",
        reference:
            'Java Mob.checkDespawn (MobCategory.getDespawnDistance, getNoDespawnDistance 32, noActionTime > 600 before the 1 in 800 roll), the removeWhenFarAway overrides of Animal, AbstractGolem, AbstractFish, Raider, PatrollingMonster and the rest, and the categories EntityTypes registers',
        subjects: () => entitiesDeclaring('minecraft:despawn'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:despawn'],
        classify: (_subject, difference) =>
            difference.includes(BEDROCK_MODEL)
                ? {
                      kind: 'intentional',
                      reason: `Spawn and cap model (category 7 of docs/data-driven/parity.md): the server despawns this mob by Bedrock's own minecraft:despawn distances, which every Bedrock mob farm is built around. ${difference}`
                  }
                : undefined,
        run: (subject) => {
            const category = javaCategoryOf(subject.javaId);
            if (category === undefined) return `EntityTypes registers no category for ${subject.javaId}`;
            const javaLimit = JAVA_DESPAWN_DISTANCE[category] ?? 128;
            const removable = javaRemovesWhenFarAway(subject.javaId);
            // Bedrock's rule for a fresh mob: the despawn its spawn leaves active, if any. A raider
            // declares one only in the group a raid adds, so a fresh one never despawns.
            const despawn = withWorld(undefined, () =>
                spawn(subject.bedrock).instance.componentParams('minecraft:despawn')
            );
            const bedrockMax =
                despawn === undefined || field(despawn, 'filters') !== undefined
                    ? undefined
                    : Number(field(despawn, 'maxDistance'));
            const differences: string[] = [];
            let followsBedrock = despawn === undefined || bedrockMax !== undefined;
            for (const distance of despawnDistances(javaLimit)) {
                const java = removable && distance > javaLimit;
                const server = despawnedWithPlayerAt(subject.bedrock, distance, 20);
                if (server !== java)
                    differences.push(
                        server
                            ? `it despawned with a player ${distance} blocks away, where Java keeps it`
                            : `it stayed with a player ${distance} blocks away, where Java despawns it`
                    );
                if (server !== (bedrockMax !== undefined && distance > bedrockMax)) followsBedrock = false;
            }
            if (differences.length === 0) return undefined;
            const model = bedrockMax === undefined ? 'with none active on a fresh spawn' : `past ${bedrockMax} blocks`;
            return `${differences.join('; ')}${followsBedrock ? ` (${BEDROCK_MODEL}, ${model})` : ''}`;
        }
    },
    {
        name: 'persistent-stays',
        java: 'A mob whose persistence is required never despawns, however far the nearest player is.',
        reference:
            'Java Mob.checkDespawn: isPersistenceRequired or requiresCustomPersistence resets noActionTime and skips both despawn rules',
        subjects: () => entitiesDeclaring('minecraft:persistent'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:persistent'],
        run: (subject) => {
            let active = false;
            const despawned = despawnedWithPlayerAt(subject.bedrock, 200, 20, (entity) => {
                activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:persistent');
                active = entity.instance.hasComponent('minecraft:persistent');
            });
            if (!active) return 'no group that declares minecraft:persistent stays active on it';
            return despawned ? 'it despawned with no player within 200 blocks while persistent' : undefined;
        }
    },
    {
        name: 'instant-despawn',
        java: 'A creaking whose heart is gone and a copper golem that turns into a statue leave the world at once, dropping nothing.',
        reference:
            'Java Creaking.tearDown and CopperGolem.turnToStatue, which discard the entity without dropFromLootTable or dropExperience',
        subjects: () => entitiesDeclaring('minecraft:instant_despawn'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:instant_despawn'],
        run: (subject) =>
            withWorld(playerAt(1), () => {
                const entity = spawn(subject.bedrock);
                activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:instant_despawn');
                runTicks(1, () => entity.removed !== undefined);
                const drops = realStack().world.drops.length;
                const orbs = collectOrbs();
                if (entity.removed === undefined)
                    return 'it stays in the world once its instant despawn group is added';
                if (entity.removed === 'death' || drops > 0 || orbs > 0)
                    return `it left by ${entity.removed} with ${drops} drops and ${orbs} experience, where Java discards it with none`;
                return undefined;
            })
    },
    {
        name: 'transient-save',
        java: 'A fishing bobber is never saved with its chunk, and a thrown eye of ender is.',
        reference:
            "Java EntityTypes: FISHING_BOBBER's builder calls noSave, EYE_OF_ENDER's does not, which Entity.shouldBeSaved reads",
        subjects: () => entitiesDeclaring('minecraft:transient'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:transient'],
        run: (subject) => {
            const java = !javaNoSave(subject.javaId);
            const server = withWorld(undefined, () => {
                const entity = spawnDeclared(realStack().runtime, subject.bedrock, ORIGIN);
                if (entity === undefined) throw new Error(`the runtime refused to spawn ${subject.bedrock}`);
                return savedWithChunk(entity);
            });
            if (server === java) return undefined;
            return server ? 'the server saves it, where Java never does' : 'the server never saves it, where Java does';
        }
    },
    {
        name: 'spawn-gear',
        java: 'A freshly spawned mob holds and wears what Java gives it: a skeleton its bow, a piglin a crossbow or a golden sword, a zombie a rare iron tool.',
        reference:
            'Java Mob.populateDefaultEquipmentSlots and its overrides in AbstractSkeleton, WitherSkeleton, Zombie, Drowned (and Drowned.finalizeSpawn), ZombifiedPiglin, Piglin (createSpawnWeapon, maybeWearArmor), PiglinBrute, Pillager, Vindicator, Vex and Fox; DifficultyInstance.getSpecialMultiplier',
        subjects: () => entitiesDeclaring('minecraft:equipment'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:equipment'],
        run: compareSpawnGear
    },
    {
        name: 'inventory-size',
        java: "A mob or vehicle that carries items holds as many as Java's container for it: 27 in a chest boat, 8 for a villager or a piglin, 15 in a chested donkey, three per strength in a llama.",
        reference:
            'Java AbstractChestBoat.CONTAINER_SIZE, MinecartChest and MinecartHopper getContainerSize, the SimpleContainer sizes of Allay, Piglin and AbstractVillager, AbstractHorse, AbstractChestedHorse, Llama and AbstractNautilus getInventoryColumns with AbstractMountInventoryMenu.getInventorySize',
        subjects: () => entitiesDeclaring('minecraft:inventory'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:inventory'],
        run: (subject) => {
            const java = subject.bedrock === 'minecraft:chest_boat' ? () => 27 : JAVA_STORAGE.get(subject.javaId);
            if (java === undefined) return `no Java container size is listed for ${subject.javaId}`;
            return withWorld(undefined, () => {
                const entity = spawn(subject.bedrock);
                // A mount's container comes with taming, and Java's chest slots with the chest.
                activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:inventory');
                if (groupsDeclaring(subject.bedrock, 'minecraft:is_chested').length > 0)
                    activateGroupsDeclaring(entity, subject.bedrock, 'minecraft:is_chested');
                if (!entity.instance.hasComponent('minecraft:inventory'))
                    return 'no group that declares minecraft:inventory stays active on it';
                runTicks(1);
                const strength = field(entity.instance.componentParams('minecraft:strength'), 'value');
                const expected = java(typeof strength === 'number' ? strength : 0);
                const storage = entity.body.containerCapacity - equippableSlots(subject.bedrock, entity);
                return storage === expected
                    ? undefined
                    : `it has ${storage} storage slots${typeof strength === 'number' ? ` at strength ${strength}` : ''}, where Java gives it ${expected}`;
            });
        }
    },
    {
        name: 'mount-gear',
        java: "A player puts a saddle on a tamed adult mount that Java's can_equip_saddle tag lists, horse or nautilus armor on the mobs their tags list, and a carpet on a llama, and nothing else on any of them.",
        reference:
            'Java entity type tags can_equip_saddle, can_wear_horse_armor and can_wear_nautilus_armor, Equippable.llamaSwag, and Mob.mobInteract through Equippable.equipOnInteract and AbstractHorse.isEquippableInSlot',
        subjects: () => entitiesDeclaring('minecraft:equippable'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:equippable'],
        run: (subject) => {
            const differences = MOUNT_GEAR.flatMap(({ item, takes }) => {
                const java = takes(subject.javaId);
                const bedrockItem = bedrockItemOf(item);
                const server = serverTakesGear(subject.bedrock, bedrockItem);
                if (server === java) return [];
                return [
                    server
                        ? `it takes ${bedrockItem}, which Java refuses`
                        : `it refuses ${bedrockItem}, which Java puts on it`
                ];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'picks-up-loot',
        java: "A mob picks up an item at its feet only when Java's canPickUpLoot and wantsToPickUp allow it, and wears or holds it where Java puts it: a fresh zombie or skeleton in a fresh region picks up nothing, a piglin takes gold, a villager what it gathers, a sulfur cube swallows a block.",
        reference:
            'Java Mob.aiStep (canPickUpLoot, wantsToPickUp, pickUpItem, ITEM_PICKUP_REACH), SulfurCube.canPickUpLoot, canHoldItem and pickUpItem (#sulfur_cube_swallowable), Zombie.finalizeSpawn and AbstractSkeleton.finalizeSpawn (nextFloat() < 0.55F * getSpecialMultiplier()), the setCanPickUpLoot(true) of Fox, AbstractPiglin and Villager, PiglinAi.wantsToPickup, Villager.wantsToPickUp (villager_picks_up), Fox.canHoldItem and Mob.equipItemIfPossible; issue #3179',
        subjects: () => {
            const seen = new Set<string>();
            return [...entitiesDeclaring('minecraft:shareables'), ...entitiesDeclaring('minecraft:equip_item')].filter(
                (subject) => {
                    if (seen.has(subject.javaId)) return false;
                    seen.add(subject.javaId);
                    return true;
                }
            );
        },
        idOf: (subject) => subject.javaId,
        aspects: (subject) =>
            ['minecraft:shareables', 'minecraft:equip_item'].filter((component) =>
                serverContent().entities.registry.get(subject.bedrock)?.declaredComponents.includes(component)
            ),
        run: comparePickup
    },
    {
        name: 'hopper-minecart-collects',
        java: 'An enabled hopper minecart takes one item entity in reach a tick into its container, the whole stack when it fits, and leaves an item beyond its reach.',
        reference:
            "Java MinecartHopper.suckInItems (the cart's box grown by 0.25 sideways) and HopperBlockEntity.suckInItems, getItemsAtAndAbove (Hopper.SUCK_AABB) and addItem",
        subjects: () => entitiesDeclaring('minecraft:item_hopper'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:item_hopper'],
        run: compareHopperCollecting
    },
    {
        name: 'opens-doors',
        java: "A mob that opens doors plans its path through a closed wooden door in a wall, as Java's WalkNodeEvaluator does for a navigator that can open doors, and a brain mob opens the door on its path and walks through.",
        reference:
            'Java GroundPathNavigation.setCanOpenDoors (Villager, AbstractPiglin), WalkNodeEvaluator.getPathTypeFromState (DOOR_WOOD_CLOSED, WALKABLE_DOOR), per mob in packages/bedrock-data/src/jsp/java/26.3/entity_navigation.json, and InteractWithDoor (MOB_INTERACTABLE_DOORS, closeDoorsThatIHaveOpenedOrPassedThrough); issue #3180',
        subjects: () => entitiesDeclaring('minecraft:annotation.open_door'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:annotation.open_door'],
        run: compareDoorRoute
    },
    {
        name: 'breaks-doors',
        java: 'A mob that breaks doors beats on a closed wooden door that blocks its path to its target and breaks it, both halves and no drops, 240 goal ticks (480 game ticks) after it starts, on a difficulty its Java predicate accepts (hard for a zombie, normal for a vindicator in a raid), and never below it or with mobGriefing off.',
        reference:
            'Java BreakDoorGoal (DEFAULT_DOOR_BREAK_TIME, no requiresUpdateEveryTick, which Mob.serverAiStep ticks every other game tick; canUse with MOB_GRIEFING, tick with removeBlock and level events 1021 and 2001), DoorInteractGoal.canUse (horizontalCollision, the next path nodes), Zombie.DOOR_BREAKING_PREDICATE and setCanBreakDoors, Vindicator.DOOR_BREAKING_PREDICATE and VindicatorBreakDoorGoal.canUse (hasActiveRaid); issue #3180',
        subjects: () => entitiesDeclaring(BREAK_DOOR),
        idOf: (subject) => subject.javaId,
        aspects: () => [BREAK_DOOR],
        run: compareDoorBreaking
    },
    {
        name: 'not-pickable-from-inside',
        java: "Whether a crosshair inside a mob's box picks it is the client's decision; the server takes a blow from a player standing inside the box either way.",
        reference:
            'Java Entity.canBePickedFromInside and SulfurCube.canBePickedFromInside (!hasBodyItem), read only by ProjectileUtil.getEntityHitResult(..., double), whose caller is the client GameRenderer.pick; ServerGamePacketListenerImpl.handleInteract measures reach to the bounding box',
        subjects: () => entitiesDeclaring('minecraft:not_pickable_from_inside'),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:not_pickable_from_inside'],
        classify: (_subject, difference) =>
            difference === CLIENT_PICKING
                ? {
                      kind: 'intentional',
                      reason: `Input handling (category 2 of docs/data-driven/parity.md): which entity a crosshair inside a box picks follows the player's device, not the server. ${difference}.`
                  }
                : undefined,
        run: compareNotPickableFromInside
    }
];
