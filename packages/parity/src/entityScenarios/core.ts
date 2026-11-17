import { fallsUnderGravity } from '@jsprismarine/prismarine/entity/data/gravity';
import { breathe } from '@jsprismarine/prismarine/entity/playerBreath';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import { land, trackFall } from '@jsprismarine/prismarine/entity/playerFall';
import { playerAbilityNames } from '@jsprismarine/prismarine/entity/playerAbilities';
import { EXHAUSTION } from '@jsprismarine/prismarine/entity/playerHunger';
import type { SurvivalPlayer } from '@jsprismarine/prismarine/entity/survivalPlayer';
import type { EntityPosition } from '@jsprismarine/entities';
import type { FilterEntityView } from '@jsprismarine/entities/filterContext';
import { Gametype } from '@jsprismarine/minecraft';
import { AIR_STATE } from '@jsprismarine/entities/components/hazards';
import { FLOOR_Y } from '@jsprismarine/prismarine/entity/data/testing';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { loadJavaEntityAttributes } from '../goldens.ts';
import { serverContent } from '../serverStack.ts';
import { loadVanillaEntityTypes } from '../vanillaEntities.ts';
import type { StagedEntity } from './stage.ts';
import { STAGE_PLAYER_ID, stage, tickStage, withEntity } from './stage.ts';
import type { EntitySubject } from './subjects.ts';
import {
    componentValues,
    entitiesDeclaring,
    field,
    javaEntityIds,
    mappedEntity,
    stringList,
    withNamespace
} from './subjects.ts';

/** The golden foods Java's `AbstractHorse.handleEating` puts a tamed adult horse or donkey in love with. */
const HORSE_BREEDING_FOOD = ['minecraft:golden_carrot', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple'];

/**
 * What breeds each breedable Java animal: the food tag `Animal.isFood` reads, or the items that
 * a horse's or a llama's `handleEating` puts it in love with, where the tag only heals it.
 */
const BREEDING_FOOD: ReadonlyMap<string, string | readonly string[]> = new Map<string, string | readonly string[]>([
    ['minecraft:armadillo', 'minecraft:armadillo_food'],
    ['minecraft:axolotl', 'minecraft:axolotl_food'],
    ['minecraft:bee', 'minecraft:bee_food'],
    ['minecraft:camel', 'minecraft:camel_food'],
    ['minecraft:cat', 'minecraft:cat_food'],
    ['minecraft:chicken', 'minecraft:chicken_food'],
    ['minecraft:cow', 'minecraft:cow_food'],
    ['minecraft:donkey', HORSE_BREEDING_FOOD],
    ['minecraft:fox', 'minecraft:fox_food'],
    ['minecraft:frog', 'minecraft:frog_food'],
    ['minecraft:goat', 'minecraft:goat_food'],
    ['minecraft:hoglin', 'minecraft:hoglin_food'],
    ['minecraft:horse', HORSE_BREEDING_FOOD],
    ['minecraft:llama', ['minecraft:hay_block']],
    // `MushroomCow` extends `AbstractCow`, which reads the cow's tag.
    ['minecraft:mooshroom', 'minecraft:cow_food'],
    ['minecraft:nautilus', 'minecraft:nautilus_food'],
    ['minecraft:ocelot', 'minecraft:ocelot_food'],
    ['minecraft:panda', 'minecraft:panda_food'],
    ['minecraft:pig', 'minecraft:pig_food'],
    ['minecraft:rabbit', 'minecraft:rabbit_food'],
    ['minecraft:sheep', 'minecraft:sheep_food'],
    ['minecraft:sniffer', 'minecraft:sniffer_food'],
    ['minecraft:strider', 'minecraft:strider_food'],
    // `TraderLlama` extends `Llama` and keeps its `handleEating`.
    ['minecraft:trader_llama', ['minecraft:hay_block']],
    ['minecraft:turtle', 'minecraft:turtle_food'],
    ['minecraft:wolf', 'minecraft:wolf_food']
]);

/** A Java item as the Bedrock item a player would hold, or undefined when it has none. */
const bedrockItem = (javaItem: string): string | undefined => {
    const mapped = javaItemToBedrock(javaItem);
    return mapped.kind === 'unknown' ? undefined : mapped.bedrock.identifier;
};

/**
 * A player as the server's filters read it: the shipped player's own view, which answers its
 * families, with the abilities the server gives a player in that game mode.
 */
const playerView = (gamemode: Gametype): FilterEntityView => {
    const own = serverContent().entities.types.spawn('minecraft:player').filterContext().self;
    return {
        ...own,
        names: (name) => (name === 'has_ability' ? playerAbilityNames(gamemode) : own.names?.(name))
    };
};

/**
 * Brings a shipped pufferfish to its full puff by the event `/summon` uses, ticks it once with a
 * player in reach, or with nobody when `player` is undefined, and returns the status effects it
 * applied, or why it could not run.
 */
const touchPoisons = (bedrock: string, player: FilterEntityView | undefined): readonly string[] | string => {
    const applied: string[] = [];
    const pufferfish = serverContent().entities.types.spawn(bedrock, {
        environment: {
            entitySensorCandidates: () => (player === undefined ? [] : [{ view: player }]),
            effects: { applyStatusEffect: (_entity, _target, effect) => applied.push(effect.id) > 0 }
        }
    });
    pufferfish.fire('minecraft:to_full_puff');
    pufferfish.applyQueuedEvents();
    if (!pufferfish.activeComponentGroups().includes('minecraft:full_puff'))
        return `minecraft:to_full_puff leaves ${bedrock} without minecraft:full_puff`;
    pufferfish.tick(false);
    return applied;
};

/** The Bedrock items Java breeds one animal with. */
const javaBreedingFood = (javaId: string): readonly string[] => {
    const food = BREEDING_FOOD.get(javaId) ?? [];
    const javaItems = typeof food === 'string' ? serverContent().tags.members('item', food) : food;
    return [...new Set(javaItems.flatMap((item) => bedrockItem(item) ?? []))];
};

/** The items a server definition's `minecraft:breedable` names, written as strings or as `{item}`. */
const declaredBreedingItems = (bedrock: string): readonly string[] =>
    componentValues(bedrock, 'minecraft:breedable').flatMap((value) => {
        const items = field(value, 'breed_items');
        return (Array.isArray(items) ? items : [items]).flatMap((entry) => {
            const item = typeof entry === 'string' ? entry : field(entry, 'item');
            return typeof item === 'string' ? [withNamespace(item)] : [];
        });
    });

/** The events a definition's taming or trusting component fires once the mob is tamed or trusts. */
const tameEventsOf = (bedrock: string): readonly string[] =>
    [
        ['minecraft:tameable', 'tame_event'],
        ['minecraft:tamemount', 'tame_event'],
        ['minecraft:trusting', 'trust_event']
    ].flatMap(([component, key]) =>
        componentValues(bedrock, component ?? '').flatMap((value) => {
            const event = field(field(value, key ?? ''), 'event');
            return typeof event === 'string' ? [event] : [];
        })
    );

/**
 * The Java entity types that are fire immune, from `EntityType.Builder.fireImmune` in
 * `EntityType`, among the ones a daylight check can reach. `Entity.isOnFire` is false for each.
 */
const JAVA_FIRE_IMMUNE: ReadonlySet<string> = new Set(['minecraft:magma_cube', 'minecraft:wither_skeleton']);

/** How many ticks a mob stands in open sunlight before the daylight check gives up on it catching fire. */
const SUNLIGHT_TICKS = 200;

/**
 * Java's air for a living entity: `Entity.getMaxAirSupply` (300 ticks) unless the class
 * overrides it, and whether it loses air underwater at all.
 */
const JAVA_MAX_AIR: ReadonlyMap<string, number> = new Map([
    ['minecraft:dolphin', 4800],
    ['minecraft:axolotl', 6000]
]);

/** Java's default `Entity.getMaxAirSupply`. */
const DEFAULT_MAX_AIR = 300;

/**
 * Living entities that keep their air underwater outside the can_breathe_under_water tag:
 * `IronGolem.decreaseAirSupply` returns the supply unchanged. A happy ghast breathes underwater
 * only as a baby and a sulfur cube only with an item in its body, so as the adults the scenario
 * spawns both drown.
 */
const JAVA_KEEPS_AIR: ReadonlySet<string> = new Set(['minecraft:iron_golem']);

/**
 * The mobs `isSensitiveToWater` hurts in water from the first tick, 1 at a time, as often as the
 * 10 ticks of hurt invulnerability let it: `LivingEntity.aiStep` hurts them with the drowning
 * damage type every tick they are wet.
 */
const JAVA_WATER_SENSITIVE: ReadonlySet<string> = new Set([
    'minecraft:blaze',
    'minecraft:enderman',
    'minecraft:snow_golem',
    'minecraft:strider'
]);

/** Java's water damage to a water-sensitive mob: a blow of 1 on the first wet tick, then every 10 ticks. */
const WATER_SENSITIVITY = { first: 1, interval: 10, damage: 1 } as const;

/** The `WaterAnimal` subclasses, whose `handleAirSupply` spends air out of water and drowns them on land. */
const JAVA_WATER_ANIMALS: ReadonlySet<string> = new Set([
    'minecraft:cod',
    'minecraft:salmon',
    'minecraft:pufferfish',
    'minecraft:tropical_fish',
    'minecraft:squid',
    'minecraft:glow_squid',
    'minecraft:tadpole'
]);

/** Java's drowning: the first blow lands 20 ticks after the air runs out, then every 20 ticks, for 2. */
const DROWNING = { delay: 20, interval: 20, damage: 2 } as const;

/** A water pool on the stage, deep enough to hold any mob under. */
const POOL = { x: 3000, y: FLOOR_Y + 1, z: 0, size: 6, depth: 8 } as const;

let poolFilled = false;

/** The middle of the stage's water pool, filling it on first use. */
const underwater = (): EntityPosition => {
    if (!poolFilled) {
        const { world } = stage();
        for (let x = POOL.x - POOL.size; x <= POOL.x + POOL.size; x += 1)
            for (let z = POOL.z - POOL.size; z <= POOL.z + POOL.size; z += 1)
                for (let y = POOL.y; y < POOL.y + POOL.depth; y += 1) world.setBlock({ x, y, z }, 'minecraft:water');
        poolFilled = true;
    }
    return { x: POOL.x + 0.5, y: POOL.y + 1, z: POOL.z + 0.5 };
};

/** A spot on the stage's dry, sunlit floor, away from the pool. */
const DRY_LAND: EntityPosition = { x: 3100.5, y: FLOOR_Y + 1, z: 0.5 };

/** One drowning blow the stage saw: the tick it landed on, what it took, and whether it killed. */
interface Blow {
    readonly tick: number;
    readonly taken: number;
    readonly died: boolean;
}

/**
 * Holds an entity still where it is and ticks the stage until it takes `blows` drowning
 * blows or `ticks` pass, and returns the tick of each blow and what it took.
 */
const drowningBlows = (entity: StagedEntity, ticks: number, blows: number): readonly Blow[] => {
    const { world } = stage();
    const at = entity.position;
    const seen: Blow[] = [];
    let read = world.commits.length;
    for (let tick = 1; tick <= ticks && seen.length < blows && seen.at(-1)?.died !== true; tick += 1) {
        entity.body.position = at;
        entity.body.velocity = { x: 0, y: 0, z: 0 };
        tickStage();
        for (const commit of world.commits.slice(read))
            if (commit.target.id === entity.id && commit.intent.cause === 'drowning')
                seen.push({ tick, taken: commit.taken, died: commit.died });
        read = world.commits.length;
    }
    return seen;
};

/** When Java's blows land and what each takes: the first blow's tick, the ticks between blows and the damage. */
interface JavaBlows {
    readonly first: number;
    readonly interval: number;
    readonly damage: number;
}

/** Compares a run of blows with Java's, which `java` leaves out for an entity Java's water never hurts. */
const blowsDifference = (blows: readonly Blow[], java: JavaBlows | undefined, where: string): string | undefined => {
    if (java === undefined) return blows.length === 0 ? undefined : `it drowns ${where}, where Java's never does`;
    const [first, second] = blows;
    if (first === undefined) return `it never drowns ${where}, where Java's does`;
    const differences: string[] = [];
    if (first.tick !== java.first)
        differences.push(`the first blow ${where} lands ${first.tick} ticks in, where Java's lands ${java.first} in`);
    if (first.taken !== java.damage && !first.died)
        differences.push(`a blow takes ${first.taken}, where Java's takes ${java.damage}`);
    if (second !== undefined && second.tick - first.tick !== java.interval)
        differences.push(
            `blows land ${second.tick - first.tick} ticks apart, where Java's land ${java.interval} apart`
        );
    return differences.length === 0 ? undefined : differences.join('; ');
};

/** How many ticks past the first blow a run waits for the second. */
const SECOND_BLOW_SLACK = DROWNING.interval + 5;

/**
 * Runs one entity's breath where it stands and compares it with Java's: its air supply, that it
 * spends it a tick at a time, and the blows once it runs out.
 *
 * Waiting out 300 ticks of air for every mob would make the family too slow to run, so once the
 * first tick shows the entity spending air, its supply is set to one tick and the real component
 * runs the rest, which is the part that differs between the editions anyway.
 *
 * @param air - Java's air supply for an entity that loses it here, or undefined for one that keeps it.
 */
const breathDifference = (entity: StagedEntity, air: number | undefined, where: string): string | undefined => {
    const supply = entity.instance.componentState.get(AIR_STATE)?.remaining;
    if (air !== undefined && supply === undefined)
        return `it never drowns ${where}, since the server gives it no air to lose`;
    if (air !== undefined && supply !== air)
        return `it holds ${String(supply)} ticks of air, where Java's holds ${air}`;

    drowningBlows(entity, 1, 1);
    const state = entity.instance.componentState.get(AIR_STATE);
    if (air !== undefined && supply !== undefined && state?.remaining !== supply - 1)
        return `a tick ${where} leaves it ${String(state?.remaining)} of its ${supply} ticks of air, where Java's spends one`;
    if (state !== undefined) entity.instance.componentState.set(AIR_STATE, { ...state, remaining: 1 });

    if (air === undefined)
        // One tick past where a drowning mob's first blow would land, which is all it takes to see one.
        return blowsDifference(drowningBlows(entity, DROWNING.delay + 2, 1), undefined, where);
    const java = { first: 1 + DROWNING.delay, interval: DROWNING.interval, damage: DROWNING.damage };
    return blowsDifference(drowningBlows(entity, 1 + DROWNING.delay + SECOND_BLOW_SLACK, 2), java, where);
};

/** The Java entity-type tags that name a mob family Bedrock expresses as `minecraft:type_family`. */
const FAMILY_BY_TAG: readonly (readonly [string, string])[] = [
    ['minecraft:undead', 'undead'],
    ['minecraft:arthropod', 'arthropod'],
    ['minecraft:illager', 'illager']
];

/** A fresh survival player as the shared survival rules read one, with 20 of 20 health. */
const survivalPlayer = (): SurvivalPlayer => ({
    components: new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => undefined),
    vulnerable: () => true,
    alive: () => true,
    health: () => 20,
    maxHealth: () => 20
});

/** The fall damage the shared rule deals for a drop of `blocks`, landing on stone. */
const fallDamageFor = (blocks: number): number => {
    const player = survivalPlayer();
    trackFall(player, blocks, 0, { onGround: false, flying: false });
    return land(player, true, () => false) ?? 0;
};

/** The ticks from empty lungs to the first drowning blow, and its damage, under the shared rule. */
const firstDrowning = (): { readonly ticks: number; readonly damage: number } => {
    const player = survivalPlayer();
    player.components.set('vitals.air', 0);
    for (let tick = 1; tick <= 100; tick += 1) {
        const damage = breathe(player, 'minecraft:water', true);
        if (damage !== undefined) return { ticks: tick, damage };
    }
    return { ticks: Number.POSITIVE_INFINITY, damage: 0 };
};

/** The scenarios that compare one rule each against a hand-picked or tag-derived set of entities. */
export const coreScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'breeding-food',
        java: 'An adult, tamed where it must be, falls in love when fed exactly the items Java breeds it with.',
        reference:
            'Java Animal.isFood and the data/minecraft/tags/item/*_food tags, AbstractHorse.handleEating (golden carrot, golden apple, enchanted golden apple) and Llama.handleEating (hay block); issue #2911',
        subjects: () => [...BREEDING_FOOD.keys()].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:breedable'],
        run: (subject) => {
            const java = new Set(javaBreedingFood(subject.javaId));
            const candidates = [...new Set([...java, ...declaredBreedingItems(subject.bedrock)])].sort();
            const outcome = withEntity(subject.bedrock, DRY_LAND, (animal) => {
                const { runtime } = stage();
                // Tamed, or trusting, the way its own taming would leave it, since Java breeds a horse,
                // a llama, a wolf or a cat only once tamed, and an ocelot only once it trusts.
                animal.body.owner = STAGE_PLAYER_ID;
                for (const event of tameEventsOf(subject.bedrock)) animal.instance.fire(event);
                animal.instance.applyQueuedEvents();
                return candidates.filter((item) => {
                    const health = animal.instance.attributes.get('health');
                    if (health !== undefined) animal.instance.attributes.set('health', health.max);
                    animal.body.loveTicks = 0;
                    animal.body.breedCooldown = 0;
                    runtime.interactWithItem(animal.id, STAGE_PLAYER_ID, item);
                    return animal.body.loveTicks > 0;
                });
            });
            if (typeof outcome === 'string') return outcome;
            const server = new Set(outcome);
            const missing = [...java].filter((item) => !server.has(item));
            const extra = [...server].filter((item) => !java.has(item));
            if (missing.length === 0 && extra.length === 0) return undefined;
            return `the server breeds it with ${[...server].sort().join(', ') || 'nothing'}; Java accepts ${[...java].sort().join(', ')}`;
        }
    },
    {
        name: 'mob-family',
        java: 'A mob in a Java family tag (undead, arthropod, illager) carries the matching family on the server.',
        reference:
            'Java entity type tags undead, arthropod and illager, which Smite, Bane of Arthropods and the raid logic read',
        subjects: () =>
            FAMILY_BY_TAG.flatMap(([tag]) =>
                serverContent()
                    .tags.members('entity_type', tag)
                    .flatMap((javaId) => mappedEntity(javaId, tag) ?? [])
            ),
        idOf: (subject) => `${subject.tag}/${subject.javaId}`,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:type_family'],
        run: (subject) => {
            const family = FAMILY_BY_TAG.find(([tag]) => tag === subject.tag)?.[1] ?? '';
            const families = componentValues(subject.bedrock, 'minecraft:type_family').flatMap((value) =>
                stringList(field(value, 'family'))
            );
            return families.includes(family) ? undefined : `it is not in the ${family} family on the server`;
        }
    },
    {
        name: 'burns-in-daylight',
        java: "A mob in Java's burn_in_daylight tag catches fire in open sunlight unless it is immune to fire, and no other mob does.",
        reference:
            'Java entity type tag burn_in_daylight, Mob.isSunBurnTick, and Entity.isOnFire, which is false for a type built with EntityType.Builder.fireImmune',
        subjects: () => {
            const tagged = new Set(serverContent().tags.members('entity_type', 'minecraft:burn_in_daylight'));
            const declaring = new Set(
                entitiesDeclaring('minecraft:burns_in_daylight').map((subject) => subject.javaId)
            );
            return javaEntityIds()
                .filter((javaId) => tagged.has(javaId) || declaring.has(javaId))
                .flatMap(
                    (javaId) =>
                        mappedEntity(javaId, tagged.has(javaId) && !JAVA_FIRE_IMMUNE.has(javaId) ? 'burns' : 'safe') ??
                        []
                );
        },
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:burns_in_daylight'],
        run: (subject) => {
            const { world } = stage();
            // Back to sunrise, so the whole run is in daylight.
            world.advance(24000 - (world.world.level.dayTime() % 24000));
            const burned = withEntity(subject.bedrock, DRY_LAND, (mob) => {
                const at = mob.position;
                // Bare-headed, since a helmet shades a mob from the sun in both editions.
                mob.body.setEquipment({});
                for (let tick = 0; tick < SUNLIGHT_TICKS; tick += 1) {
                    mob.body.position = at;
                    mob.body.velocity = { x: 0, y: 0, z: 0 };
                    tickStage();
                    if (mob.body.conditions.has('on_fire')) return true;
                }
                return false;
            });
            if (typeof burned === 'string') return burned;
            if (subject.tag === 'burns' && !burned) return 'Java sets it on fire in daylight; the server does not';
            if (subject.tag === 'safe' && burned) return 'the server sets it on fire in daylight; Java does not';
            return undefined;
        }
    },
    {
        name: 'breathes-underwater',
        java: "A living mob held underwater drowns once its air runs out, 2 at a time every second, unless Java's can_breathe_under_water tag or its class keeps its air; a water-sensitive mob is hurt from the first wet tick.",
        reference:
            'Java LivingEntity.baseTick (a blow of 2 when the air reaches -20), Entity.getMaxAirSupply (300) with the Dolphin (4800) and Axolotl (6000) overrides, the can_breathe_under_water tag, IronGolem.decreaseAirSupply, HappyGhast and SulfurCube.canBreatheUnderwater, LivingEntity.aiStep for isSensitiveToWater, ',
        subjects: () => {
            const gills = new Set(serverContent().tags.members('entity_type', 'minecraft:can_breathe_under_water'));
            const declaring = new Set(entitiesDeclaring('minecraft:breathable').map((subject) => subject.javaId));
            const living = new Set(Object.keys(loadJavaEntityAttributes()));
            const fate = (javaId: string): string =>
                JAVA_WATER_SENSITIVE.has(javaId)
                    ? 'scalds'
                    : !living.has(javaId) || gills.has(javaId) || JAVA_KEEPS_AIR.has(javaId)
                      ? 'breathes'
                      : 'drowns';
            return javaEntityIds()
                .filter((javaId) => javaId !== 'minecraft:player' && (gills.has(javaId) || declaring.has(javaId)))
                .flatMap((javaId) => mappedEntity(javaId, fate(javaId)) ?? []);
        },
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:breathable'],
        run: (subject) =>
            withEntity(subject.bedrock, underwater(), (mob) =>
                subject.tag === 'scalds'
                    ? blowsDifference(drowningBlows(mob, SECOND_BLOW_SLACK, 2), WATER_SENSITIVITY, 'underwater')
                    : breathDifference(
                          mob,
                          subject.tag === 'drowns' ? (JAVA_MAX_AIR.get(subject.javaId) ?? DEFAULT_MAX_AIR) : undefined,
                          'underwater'
                      )
            )
    },
    {
        name: 'suffocates-on-land',
        java: "A fish or squid out of water loses its air and drowns like a mob held underwater; Java's other water breathers keep theirs on land.",
        reference:
            "Java WaterAnimal.handleAirSupply (air spent out of water, a blow of 2 at -20, refilled to 300 in water), which Turtle, Frog, Guardian and the can_breathe_under_water tag's land mobs do not run",
        subjects: () =>
            serverContent()
                .tags.members('entity_type', 'minecraft:can_breathe_under_water')
                // The axolotl dries out instead, by its own clock; the nautilus has its own air handling.
                .filter((javaId) => javaId !== 'minecraft:axolotl' && javaId !== 'minecraft:nautilus')
                .flatMap(
                    (javaId) => mappedEntity(javaId, JAVA_WATER_ANIMALS.has(javaId) ? 'suffocates' : 'breathes') ?? []
                )
                .filter((subject) => componentValues(subject.bedrock, 'minecraft:breathable').length > 0),
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:breathable'],
        run: (subject) => {
            const air = subject.tag === 'suffocates' ? DEFAULT_MAX_AIR : undefined;
            return withEntity(subject.bedrock, DRY_LAND, (mob) => breathDifference(mob, air, 'on land'));
        }
    },
    {
        name: 'player-health',
        java: "A player has Java's 20 health, which Bedrock gives it in code and its shipped player file leaves out.",
        reference: 'Java LivingEntity.createLivingAttributes (MAX_HEALTH 20), which Player.createAttributes keeps',
        subjects: () => ['minecraft:player'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:health'],
        run: (subject) => {
            // The resolved type, because the overlay applies when types resolve and leaves the
            // pack's file as it shipped.
            const type = serverContent().entities.registry.get(subject.bedrock);
            if (type === undefined) return `the server declares no ${subject.bedrock}`;
            const health = type.entity.components.get('minecraft:health');
            const value = field(health, 'value');
            const max = field(health, 'max');
            return value === 20 && max === 20
                ? undefined
                : `the server gives the player health ${String(value)} of ${String(max)}, where Java has 20 of 20`;
        }
    },
    {
        name: 'player-survival',
        java: "A player's breath, drowning, fall damage and exhaustion follow Java's constants and the shipped player file.",
        reference:
            'Java LivingEntity.getMaxAirSupply (300) and baseTick (2 damage once air reaches -20), LivingEntity.calculateFallDamage (ceil of the distance past 3), and FoodConstants (sprint 0.1, jump 0.05, sprint jump 0.2, attack 0.1, heal 6); Bedrock entities/player.json minecraft:breathable and minecraft:exhaustion_values',
        subjects: () => ['minecraft:player'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:breathable', 'minecraft:exhaustion_values', 'fall-damage'],
        run: (subject) => {
            const differences: string[] = [];

            const [breathable] = componentValues(subject.bedrock, 'minecraft:breathable');
            const supply = field(breathable, 'total_supply');
            const maxAir = survivalPlayer().components.maxAir();
            if (typeof supply !== 'number' || supply * 20 !== maxAir || maxAir !== 300)
                differences.push(
                    `a lungful is ${maxAir} ticks, where Java has 300 and the shipped file ${String(supply)} seconds`
                );

            const drowning = firstDrowning();
            if (drowning.ticks !== 20 || drowning.damage !== 2)
                differences.push(
                    `empty lungs hurt ${drowning.damage} after ${drowning.ticks} ticks, where Java hurts 2 after 20`
                );

            for (let blocks = 0; blocks <= 23; blocks += 1) {
                const java = Math.max(0, Math.ceil(blocks - 3));
                const server = fallDamageFor(blocks);
                if (server !== java)
                    differences.push(`a ${blocks} block fall costs ${server}, where Java's costs ${java}`);
            }

            // Bedrock's walk cost is 0 and the server charges walking, so only the shared keys are compared.
            const [exhaustion] = componentValues(subject.bedrock, 'minecraft:exhaustion_values');
            const costs: readonly [string, number, number][] = [
                ['sprint', EXHAUSTION.sprinting, 0.1],
                ['jump', EXHAUSTION.jumping, 0.05],
                ['sprint_jump', EXHAUSTION.sprintJumping, 0.2],
                ['attack', EXHAUSTION.attacking, 0.1],
                ['heal', EXHAUSTION.regeneration, 6]
            ];
            for (const [key, server, java] of costs) {
                const shipped = field(exhaustion, key);
                if (server !== java || shipped !== java)
                    differences.push(
                        `${key} costs ${server}, where Java has ${java} and the shipped file ${String(shipped)}`
                    );
            }

            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'touch-poison',
        java: 'A puffed-up pufferfish poisons a survival player that touches it, and nobody else when no player is in reach.',
        reference:
            'Java Pufferfish.playerTouch, which adds MobEffects.POISON to a player its hurtServer damaged, so never to a creative one',
        subjects: () => ['minecraft:pufferfish'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect'],
        run: (subject) => {
            const cases: readonly { readonly who: string; readonly player?: Gametype; readonly java: string }[] = [
                { who: 'a survival player', player: Gametype.SURVIVAL, java: 'poison' },
                { who: 'a creative player', player: Gametype.CREATIVE, java: '' },
                { who: 'nobody', java: '' }
            ];
            const differences: string[] = [];
            for (const { who, player, java } of cases) {
                const applied = touchPoisons(subject.bedrock, player === undefined ? undefined : playerView(player));
                if (typeof applied === 'string') return applied;
                if (applied.join(', ') !== java)
                    differences.push(
                        `puffed up with ${who} in reach it applies ${applied.join(', ') || 'nothing'}, where Java applies ${java || 'nothing'}`
                    );
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'flying-gravity',
        java: 'A flying mob that hovers in place stays in the air, and a parrot flutters down when it stops flying.',
        reference:
            "Java FlyingMob.travel (ghast, phantom), Bat.aiStep, and FlyingMoveControl's hoversInPlace (true for the bee, allay and wither, false for the parrot); issue #2643",
        subjects: () =>
            [
                'minecraft:ghast',
                'minecraft:happy_ghast',
                'minecraft:phantom',
                'minecraft:bat',
                'minecraft:bee',
                'minecraft:allay',
                'minecraft:wither',
                'minecraft:parrot'
            ].flatMap((javaId) => mappedEntity(javaId, javaId === 'minecraft:parrot' ? 'falls' : 'hovers') ?? []),
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        run: (subject) => {
            const falls = fallsUnderGravity(loadVanillaEntityTypes().spawn(subject.bedrock));
            if (falls === (subject.tag === 'falls')) return undefined;
            return falls ? 'gravity pulls it down while it hovers' : 'it hangs in the air where Java lets it fall';
        }
    },
    {
        name: 'built-in-motion',
        java: "A dropped item and a thrown eye of ender move, wait, despawn and shatter by Java's ItemEntity and EyeOfEnder constants.",
        reference:
            'Java ItemEntity (gravity 0.04, drag 0.98, ground friction 0.6, LIFETIME 6000, pickup delays 10 and 40, merge within 0.5) and EyeOfEnder (life 80, survives random.nextInt(5) > 0)',
        subjects: () => ['minecraft:item', 'minecraft:eye_of_ender'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: (subject) => [
            subject.javaId === 'minecraft:item' ? 'jsprismarine:item' : 'jsprismarine:eye_of_ender_signal'
        ],
        run: (subject) => {
            const component =
                subject.javaId === 'minecraft:item' ? 'jsprismarine:item' : 'jsprismarine:eye_of_ender_signal';
            const java: Readonly<Record<string, number>> =
                subject.javaId === 'minecraft:item'
                    ? {
                          gravity: 0.04,
                          air_drag: 0.98,
                          ground_drag: 0.6 * 0.98,
                          despawn_age: 6000,
                          pickup_delay: 10,
                          thrown_pickup_delay: 40,
                          merge_range: 0.5
                      }
                    : { lifetime: 80, shatter_rolls: 5, too_far_distance: 12, too_far_signal_height: 8 };
            const [declared] = componentValues(subject.bedrock, component);
            if (declared === undefined) return `the server declares no ${component} for ${subject.bedrock}`;
            const differences = Object.entries(java).flatMap(([key, value]) => {
                const server = field(declared, key);
                return typeof server === 'number' && Math.abs(server - value) < 1e-9
                    ? []
                    : [`${key} ${String(server)} where Java has ${value}`];
            });
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
