import { fallsUnderGravity } from '@jsprismarine/prismarine/entity/data/gravity';
import { breathe } from '@jsprismarine/prismarine/entity/playerBreath';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import { land, trackFall } from '@jsprismarine/prismarine/entity/playerFall';
import { EXHAUSTION } from '@jsprismarine/prismarine/entity/playerHunger';
import type { SurvivalPlayer } from '@jsprismarine/prismarine/entity/survivalPlayer';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { entitiesTable } from '@jsprismarine/mapping/tables';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { serverContent } from '../serverStack.ts';
import { loadVanillaEntityTypes } from '../vanillaEntities.ts';
import type { EntitySubject } from './subjects.ts';
import { componentValues, field, mappedEntity, stringList, withNamespace } from './subjects.ts';

/** The Java food tag each breedable Java animal reads, which is the item set `Animal.isFood` accepts. */
const BREEDING_FOOD: readonly (readonly [string, string])[] = [
    ['minecraft:armadillo', 'minecraft:armadillo_food'],
    ['minecraft:axolotl', 'minecraft:axolotl_food'],
    ['minecraft:bee', 'minecraft:bee_food'],
    ['minecraft:camel', 'minecraft:camel_food'],
    ['minecraft:cat', 'minecraft:cat_food'],
    ['minecraft:chicken', 'minecraft:chicken_food'],
    ['minecraft:cow', 'minecraft:cow_food'],
    ['minecraft:fox', 'minecraft:fox_food'],
    ['minecraft:frog', 'minecraft:frog_food'],
    ['minecraft:goat', 'minecraft:goat_food'],
    ['minecraft:hoglin', 'minecraft:hoglin_food'],
    ['minecraft:ocelot', 'minecraft:ocelot_food'],
    ['minecraft:panda', 'minecraft:panda_food'],
    ['minecraft:pig', 'minecraft:pig_food'],
    ['minecraft:rabbit', 'minecraft:rabbit_food'],
    ['minecraft:sheep', 'minecraft:sheep_food'],
    ['minecraft:sniffer', 'minecraft:sniffer_food'],
    ['minecraft:strider', 'minecraft:strider_food'],
    ['minecraft:turtle', 'minecraft:turtle_food'],
    ['minecraft:wolf', 'minecraft:wolf_food']
];

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
        java: 'An animal breeds with exactly the items in its Java food tag.',
        reference: 'Java Animal.isFood and the data/minecraft/tags/item/*_food tags; issue #2911',
        subjects: () => BREEDING_FOOD.flatMap(([javaId, tag]) => mappedEntity(javaId, tag) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:breedable'],
        run: (subject) => {
            const content = serverContent();
            const java = new Set(
                content.tags.members('item', subject.tag ?? '').flatMap((javaItem) => {
                    const mapped = javaItemToBedrock(javaItem);
                    return mapped.kind === 'unknown' ? [] : [mapped.bedrock.identifier];
                })
            );
            const server = new Set(
                componentValues(subject.bedrock, 'minecraft:breedable').flatMap((value) =>
                    stringList(field(value, 'breed_items')).map(withNamespace)
                )
            );
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
        java: "A mob in Java's burn_in_daylight tag catches fire in sunlight, and no other mob does.",
        reference: 'Java entity type tag burn_in_daylight and Mob.isSunBurnTick',
        subjects: () => {
            const burning = new Set(serverContent().tags.members('entity_type', 'minecraft:burn_in_daylight'));
            return Object.keys(entitiesTable.entities).flatMap(
                (javaId) => mappedEntity(javaId, burning.has(javaId) ? 'burns' : 'safe') ?? []
            );
        },
        idOf: (subject) => subject.javaId,
        // The other mobs are checked for a wrong burn, but only the tagged ones count as covered for sunlight behavior.
        guard: true,
        covers: (subject) => (subject.tag === 'burns' ? subject.javaId : undefined),
        aspects: () => ['minecraft:burns_in_daylight'],
        run: (subject) => {
            const burns = componentValues(subject.bedrock, 'minecraft:burns_in_daylight').length > 0;
            if (subject.tag === 'burns' && !burns) return 'Java burns it in daylight; the server does not';
            if (subject.tag === 'safe' && burns) return 'the server burns it in daylight; Java does not';
            return undefined;
        }
    },
    {
        name: 'breathes-underwater',
        java: "A mob in Java's can_breathe_under_water tag does not drown, and every other mob that breathes air does.",
        reference: 'Java entity type tag can_breathe_under_water and LivingEntity.canBreatheUnderwater',
        subjects: () => {
            const gills = new Set(serverContent().tags.members('entity_type', 'minecraft:can_breathe_under_water'));
            return [...gills].flatMap((javaId) => mappedEntity(javaId, 'gills') ?? []);
        },
        idOf: (subject) => subject.javaId,
        covers: (subject) => subject.javaId,
        aspects: () => ['minecraft:breathable'],
        run: (subject) => {
            const breathable = componentValues(subject.bedrock, 'minecraft:breathable');
            const underwater = breathable.some(
                (value) => field(value, 'breathes_water') === true || field(value, 'breathes_air') === false
            );
            return underwater ? undefined : 'the server drowns it, though Java lets it breathe underwater';
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
        java: 'A puffed-up pufferfish poisons a player that touches it.',
        reference: 'Java Pufferfish.touch, which adds MobEffects.POISON to the player',
        subjects: () => ['minecraft:pufferfish'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect'],
        run: (subject) => {
            const effects = componentValues(subject.bedrock, 'minecraft:mob_effect').map((value) =>
                field(value, 'mob_effect')
            );
            if (!effects.includes('poison')) return `${subject.bedrock} declares no minecraft:mob_effect of poison`;
            // A component the registry holds as data only is kept for its values and never runs.
            const hooks = serverContent().entities.components.hooksOf('minecraft:mob_effect');
            return hooks.has('onTick')
                ? undefined
                : 'the server never runs minecraft:mob_effect, so nothing is poisoned';
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
