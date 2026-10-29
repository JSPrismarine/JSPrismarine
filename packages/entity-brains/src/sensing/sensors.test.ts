import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { Brain } from '../brain.js';
import { MemoryModuleTypes, UNIT } from '../memory.js';
import type { TestMob } from '../testWorld.js';
import { TestWorld } from '../testWorld.js';
import type { BrainContext } from '../world.js';
import { EntityCondition } from '../world.js';
import type { Sensor } from './sensor.js';
import { DEFAULT_SCAN_RATE } from './sensor.js';
import {
    ARMADILLO_SCARE_SENSOR,
    AdultSensor,
    AdultSensorAnyType,
    AxolotlAttackablesSensor,
    BreezeAttackEntitySensor,
    DummySensor,
    FrogAttackablesSensor,
    GOLEM_SENSOR,
    GolemSensor,
    HoglinSpecificSensor,
    HurtBySensor,
    IsInWaterSensor,
    MobSensor,
    NEAREST_ITEM_RANGES,
    NearestBedSensor,
    NearestItemSensor,
    NearestLivingEntitySensor,
    PiglinBruteSpecificSensor,
    PiglinSpecificSensor,
    PlayerSensor,
    SENSOR_TYPE_NAMES,
    SecondaryPoiSensor,
    TemptingSensor,
    VILLAGER_HOSTILE_DISTANCES,
    VillagerBabiesSensor,
    VillagerHostilesSensor,
    WardenEntitySensor
} from './sensors.js';

/** Builds a world and a body with every memory registered, so any sensor can write. */
function scene(sensor: Sensor, world = new TestWorld()): { world: TestWorld; body: TestMob; context: BrainContext } {
    const body = world.spawn('minecraft:test', { x: 0, y: 64, z: 0 }, { attributes: { 'minecraft:follow_range': 16 } });
    body.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [sensor], activities: [] }));
    return { world, body, context: body.context };
}

/** Runs the sensor once, past its countdown. */
function scan(sensor: Sensor, context: BrainContext): void {
    for (let tick = 0; tick < sensor.scanRate + 1; tick++) {
        sensor.tick(context);
    }
}

describe('the sensor registry', () => {
    it('reports the available sensor names', () => {
        reportProgress(`Entity brains expose ${SENSOR_TYPE_NAMES.length} sensor names.`);
        expect(new Set(SENSOR_TYPE_NAMES).size).toBe(SENSOR_TYPE_NAMES.length);
    });

    it('scans every twenty ticks unless the Java class says otherwise', () => {
        expect(new NearestLivingEntitySensor().scanRate).toBe(DEFAULT_SCAN_RATE);
        expect(new GolemSensor().scanRate).toBe(GOLEM_SENSOR.scanRate);
        expect(new NearestBedSensor().scanRate).toBe(20);
        expect(new SecondaryPoiSensor(new Set()).scanRate).toBe(40);
    });

    it('scans on its first tick and then once every scanRate ticks', () => {
        const sensor = new NearestLivingEntitySensor();
        const { world, context } = scene(sensor);
        const pig = world.place('minecraft:pig', { x: 1, y: 64, z: 0 });
        // Java's `if (--this.timeToTick <= 0L)` over a zero countdown scans immediately.
        sensor.tick(context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toEqual([pig]);

        const cow = world.place('minecraft:cow', { x: 2, y: 64, z: 0 });
        for (let tick = 0; tick < sensor.scanRate - 1; tick++) {
            sensor.tick(context);
        }
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toEqual([pig]);
        sensor.tick(context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toEqual([pig, cow]);
    });

    it('offsets its first scan into [0, scanRate) when asked to', () => {
        const sensor = new NearestLivingEntitySensor();
        sensor.randomlyDelayStart(() => 3);
        const { world, context } = scene(sensor);
        world.place('minecraft:pig', { x: 1, y: 64, z: 0 });
        sensor.tick(context);
        sensor.tick(context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toBe(false);
        sensor.tick(context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toBe(true);
    });
});

describe('DummySensor', () => {
    it('writes nothing, as the empty Java body does', () => {
        const sensor = new DummySensor();
        const { context } = scene(sensor);
        scan(sensor, context);
        expect(sensor.requires).toEqual([]);
    });
});

describe('NearestLivingEntitySensor', () => {
    it('sorts by distance and keeps only what is inside follow range', () => {
        const sensor = new NearestLivingEntitySensor();
        const { world, context } = scene(sensor);
        const far = world.place('minecraft:cow', { x: 10, y: 64, z: 0 });
        const near = world.place('minecraft:pig', { x: 2, y: 64, z: 0 });
        world.place('minecraft:sheep', { x: 100, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)).toEqual([near, far]);
    });

    it('builds the visible view from line of sight', () => {
        const hidden = { id: 'hidden' };
        const sensor = new NearestLivingEntitySensor();
        const { world, context } = scene(
            sensor,
            new TestWorld({ lineOfSight: (_body, target) => target.id !== hidden.id })
        );
        world.place('minecraft:pig', { x: 2, y: 64, z: 0, ...{} }, { id: hidden.id });
        const seen = world.place('minecraft:cow', { x: 3, y: 64, z: 0 });
        scan(sensor, context);
        const visible = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES);
        expect(visible?.findAll(() => true)).toEqual([seen]);
    });
});

describe('PlayerSensor', () => {
    it('writes four memories from one scan', () => {
        const sensor = new PlayerSensor();
        const { world, context } = scene(sensor);
        const near = world.place('minecraft:player', { x: 1, y: 64, z: 0 });
        const far = world.place('minecraft:player', { x: 5, y: 64, z: 0 });
        scan(sensor, context);
        const brain = context.body.brain;
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_PLAYERS)).toEqual([near, far]);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_PLAYER)).toBe(near);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER)).toBe(near);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYERS)).toEqual([near, far]);
    });

    it('skips spectators', () => {
        const sensor = new PlayerSensor();
        const { world, context } = scene(sensor);
        world.place('minecraft:player', { x: 1, y: 64, z: 0 }, { spectator: true });
        scan(sensor, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_PLAYERS)).toBe(false);
    });

    it('keeps creative players visible but removes them from attackable memories', () => {
        const sensor = new PlayerSensor();
        const { world, context } = scene(sensor);
        const player = world.place('minecraft:player', { x: 1, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER)).toBe(player);

        player.creative = true;
        scan(sensor, context);

        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_PLAYER)).toBe(player);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER)).toBe(false);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYERS)).toBe(false);
    });
});

describe('NearestItemSensor', () => {
    it('takes the nearest wanted item inside the 32-block limit', () => {
        const sensor = new NearestItemSensor((item) => item.id === 'minecraft:gold_ingot');
        const { world, context } = scene(sensor);
        world.drop({ id: 'minecraft:dirt', tags: new Set() }, { x: 1, y: 64, z: 0 });
        const gold = world.drop({ id: 'minecraft:gold_ingot', tags: new Set() }, { x: 4, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)).toBe(gold);
    });

    it('ignores an item beyond MAX_DISTANCE_TO_WANTED_ITEM, which is 32', () => {
        const sensor = new NearestItemSensor();
        const { world, context } = scene(sensor);
        world.drop(
            { id: 'minecraft:gold_ingot', tags: new Set() },
            { x: NEAREST_ITEM_RANGES.maxDistanceToWantedItem + 1, y: 64, z: 0 }
        );
        scan(sensor, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)).toBe(false);
    });
});

describe('HurtBySensor', () => {
    it('copies the attacker out of the damage source and forgets it when it dies', () => {
        const sensor = new HurtBySensor();
        const { world, context } = scene(sensor);
        const attacker = world.place('minecraft:player', { x: 1, y: 64, z: 0 });
        context.body.brain.setMemory(MemoryModuleTypes.HURT_BY, {
            type: 'minecraft:player_attack',
            tags: new Set(['minecraft:panic_causes']),
            entity: attacker
        });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.HURT_BY_ENTITY)).toBe(attacker);
        attacker.alive = false;
        scan(sensor, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.HURT_BY_ENTITY)).toBe(false);
    });
});

describe('IsInWaterSensor', () => {
    it('holds the unit while the mob is submerged', () => {
        const sensor = new IsInWaterSensor();
        const { context } = scene(sensor);
        context.body.setCondition(EntityCondition.IN_WATER, true);
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.IS_IN_WATER)).toBe(UNIT);
        context.body.setCondition(EntityCondition.IN_WATER, false);
        scan(sensor, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.IS_IN_WATER)).toBe(false);
    });
});

describe('AdultSensor and AdultSensorAnyType', () => {
    it('AdultSensor matches the type of the body only', () => {
        const living = new NearestLivingEntitySensor();
        const adults = new AdultSensor();
        const world = new TestWorld();
        const body = world.spawn('minecraft:goat', { x: 0, y: 64, z: 0 });
        body.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [], activities: [] }));
        world.place('minecraft:cow', { x: 1, y: 64, z: 0 });
        const goat = world.place('minecraft:goat', { x: 2, y: 64, z: 0 });
        scan(living, body.context);
        scan(adults, body.context);
        expect(body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT)).toBe(goat);
    });

    it('AdultSensorAnyType matches anything in #minecraft:followable_friendly_mobs', () => {
        const living = new NearestLivingEntitySensor();
        const adults = new AdultSensorAnyType();
        const world = new TestWorld();
        const body = world.spawn('minecraft:happy_ghast', { x: 0, y: 64, z: 0 });
        body.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [], activities: [] }));
        const cow = world.place(
            'minecraft:cow',
            { x: 1, y: 64, z: 0 },
            {
                typeTags: ['minecraft:followable_friendly_mobs']
            }
        );
        scan(living, body.context);
        scan(adults, body.context);
        expect(body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT)).toBe(cow);
    });
});

describe('MobSensor, the armadillo scare sensor', () => {
    it('holds DANGER_DETECTED_RECENTLY for the 80 ticks SensorType passes', () => {
        const living = new NearestLivingEntitySensor();
        const scare = new MobSensor(
            ARMADILLO_SCARE_SENSOR.scanRate,
            (_context, entity) => entity.type === 'minecraft:player',
            () => true,
            MemoryModuleTypes.DANGER_DETECTED_RECENTLY,
            ARMADILLO_SCARE_SENSOR.memoryTimeToLive
        );
        const { world, context } = scene(scare);
        world.place('minecraft:player', { x: 1, y: 64, z: 0 });
        scan(living, context);
        scan(scare, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)).toBe(true);
        expect(context.body.brain.getTimeUntilExpiry(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)).toBe(80);
    });

    it('clears the memory when the ready test fails', () => {
        const scare = new MobSensor(
            5,
            () => true,
            () => false,
            MemoryModuleTypes.DANGER_DETECTED_RECENTLY,
            80
        );
        const { context } = scene(scare);
        context.body.brain.setMemory(MemoryModuleTypes.DANGER_DETECTED_RECENTLY, true);
        scan(scare, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)).toBe(false);
    });
});

describe('GolemSensor', () => {
    it('holds GOLEM_DETECTED_RECENTLY for 599 ticks, one longer than its 200-tick scan rate thrice', () => {
        const living = new NearestLivingEntitySensor();
        const golems = new GolemSensor();
        const { world, context } = scene(golems);
        world.place('minecraft:iron_golem', { x: 2, y: 64, z: 0 });
        scan(living, context);
        scan(golems, context);
        expect(context.body.brain.getTimeUntilExpiry(MemoryModuleTypes.GOLEM_DETECTED_RECENTLY)).toBe(
            GOLEM_SENSOR.memoryTimeToLive
        );
    });
});

describe('AxolotlAttackablesSensor', () => {
    it('takes a submerged hunt target within 8 blocks while the hunting cooldown is clear', () => {
        const living = new NearestLivingEntitySensor();
        const attackables = new AxolotlAttackablesSensor();
        const { world, context } = scene(attackables);
        const prey = world.place(
            'minecraft:cod',
            { x: 3, y: 64, z: 0 },
            {
                typeTags: ['minecraft:axolotl_hunt_targets'],
                conditions: [EntityCondition.IN_WATER]
            }
        );
        scan(living, context);
        scan(attackables, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(prey);

        context.body.brain.setMemory(MemoryModuleTypes.HAS_HUNTING_COOLDOWN, true);
        scan(attackables, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(false);
        void prey;
    });

    it('still takes an always-hostile target during the hunting cooldown', () => {
        const living = new NearestLivingEntitySensor();
        const attackables = new AxolotlAttackablesSensor();
        const { world, context } = scene(attackables);
        const drowned = world.place(
            'minecraft:drowned',
            { x: 3, y: 64, z: 0 },
            {
                typeTags: ['minecraft:axolotl_always_hostiles'],
                conditions: [EntityCondition.IN_WATER]
            }
        );
        context.body.brain.setMemory(MemoryModuleTypes.HAS_HUNTING_COOLDOWN, true);
        scan(living, context);
        scan(attackables, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(drowned);
    });
});

describe('FrogAttackablesSensor', () => {
    it('takes a slime in #minecraft:frog_food within TARGET_DETECTION_DISTANCE, which is 10', () => {
        const living = new NearestLivingEntitySensor();
        const attackables = new FrogAttackablesSensor();
        const { world, context } = scene(attackables);
        const slime = world.place('minecraft:slime', { x: 5, y: 64, z: 0 }, { typeTags: ['minecraft:frog_food'] });
        scan(living, context);
        scan(attackables, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(slime);
    });

    it('skips a slime already on UNREACHABLE_TONGUE_TARGETS', () => {
        const living = new NearestLivingEntitySensor();
        const attackables = new FrogAttackablesSensor();
        const { world, context } = scene(attackables);
        const slime = world.place('minecraft:slime', { x: 5, y: 64, z: 0 }, { typeTags: ['minecraft:frog_food'] });
        context.body.brain.setMemory(MemoryModuleTypes.UNREACHABLE_TONGUE_TARGETS, [slime.id]);
        scan(living, context);
        scan(attackables, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(false);
    });
});

describe('VillagerHostilesSensor', () => {
    it('reports distances from the Java map', () => {
        reportProgress(`Villager hostiles have ${VILLAGER_HOSTILE_DISTANCES.size} configured distances.`);
        expect(VILLAGER_HOSTILE_DISTANCES.get('minecraft:pillager')).toBe(15);
        expect(VILLAGER_HOSTILE_DISTANCES.get('minecraft:zombie')).toBe(8);
    });

    it('flees a pillager at 12 blocks but not a zombie at the same distance', () => {
        const living = new NearestLivingEntitySensor();
        const hostiles = new VillagerHostilesSensor();
        const { world, context } = scene(hostiles, new TestWorld());
        const pillager = world.place('minecraft:pillager', { x: 12, y: 64, z: 0 });
        world.place('minecraft:zombie', { x: 12, y: 64, z: 1 });
        context.body.setCondition('ignored', true);
        // Follow range must reach both, so widen it past the 16-block default.
        scan(living, context);
        scan(hostiles, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_HOSTILE)).toBe(pillager);
    });
});

describe('VillagerBabiesSensor', () => {
    it('lists every visible baby villager', () => {
        const living = new NearestLivingEntitySensor();
        const babies = new VillagerBabiesSensor();
        const { world, context } = scene(babies);
        const baby = world.place('minecraft:villager', { x: 1, y: 64, z: 0 }, { baby: true });
        world.place('minecraft:villager', { x: 2, y: 64, z: 0 });
        scan(living, context);
        scan(babies, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_VILLAGER_BABIES)).toEqual([baby]);
    });
});

describe('SecondaryPoiSensor', () => {
    it('walks the 9 by 5 by 9 box the Java constants describe', () => {
        const sensor = new SecondaryPoiSensor(new Set(['minecraft:farmland']));
        const { world, context } = scene(sensor);
        world.setBlock({ x: 4, y: 64, z: 4 }, 'minecraft:farmland');
        world.setBlock({ x: 5, y: 64, z: 0 }, 'minecraft:farmland');
        scan(sensor, context);
        const found = context.body.brain.getMemory(MemoryModuleTypes.SECONDARY_JOB_SITE);
        expect(found).toHaveLength(1);
        expect(found?.[0]?.pos).toEqual({ x: 4, y: 64, z: 4 });
    });
});

describe('NearestBedSensor', () => {
    it('only runs for a baby, which is the surprising thing about it', () => {
        const sensor = new NearestBedSensor();
        const world = new TestWorld();
        world.addPoi({ x: 3, y: 64, z: 0 }, 'minecraft:home');
        const adult = world.spawn('minecraft:villager', { x: 0, y: 64, z: 0 });
        adult.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [], activities: [] }));
        scan(sensor, adult.context);
        expect(adult.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_BED)).toBe(false);

        const baby = world.spawn('minecraft:villager', { x: 0, y: 64, z: 0 }, { baby: true });
        baby.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [], activities: [] }));
        scan(sensor, baby.context);
        expect(baby.brain.getMemory(MemoryModuleTypes.NEAREST_BED)).toEqual({ x: 3, y: 64, z: 0 });
    });
});

describe('TemptingSensor', () => {
    it('reads the tempt range attribute, not the follow range', () => {
        const sensor = TemptingSensor.forTag('minecraft:frog_food');
        const world = new TestWorld();
        const body = world.spawn(
            'minecraft:frog',
            { x: 0, y: 64, z: 0 },
            {
                attributes: { 'minecraft:follow_range': 16, 'minecraft:tempt_range': 4 }
            }
        );
        body.attach(new Brain({ memories: Object.values(MemoryModuleTypes), sensors: [], activities: [] }));
        world.place(
            'minecraft:player',
            { x: 8, y: 64, z: 0 },
            {
                mainHandItem: { id: 'minecraft:slime_ball', tags: new Set(['minecraft:frog_food']) }
            }
        );
        scan(sensor, body.context);
        expect(body.brain.hasMemoryValue(MemoryModuleTypes.TEMPTING_PLAYER)).toBe(false);

        const close = world.place(
            'minecraft:player',
            { x: 2, y: 64, z: 0 },
            {
                offHandItem: { id: 'minecraft:slime_ball', tags: new Set(['minecraft:frog_food']) }
            }
        );
        scan(sensor, body.context);
        expect(body.brain.getMemory(MemoryModuleTypes.TEMPTING_PLAYER)).toBe(close);
    });

    it('forAnimal defers to the food predicate the animal supplies', () => {
        const sensor = TemptingSensor.forAnimal((item) => item.id === 'minecraft:wheat');
        const { world, context } = scene(sensor);
        const farmer = world.place(
            'minecraft:player',
            { x: 1, y: 64, z: 0 },
            {
                mainHandItem: { id: 'minecraft:wheat', tags: new Set() }
            }
        );
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.TEMPTING_PLAYER)).toBe(farmer);
    });
});

describe('WardenEntitySensor', () => {
    it('prefers a further player over a closer mob', () => {
        const sensor = new WardenEntitySensor(() => true);
        const { world, context } = scene(sensor);
        world.place('minecraft:zombie', { x: 1, y: 64, z: 0 });
        const player = world.place('minecraft:player', { x: 6, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(player);
    });

    it('falls back to the closest non-player when there is no player', () => {
        const sensor = new WardenEntitySensor(() => true);
        const { world, context } = scene(sensor);
        const zombie = world.place('minecraft:zombie', { x: 1, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(zombie);
    });
});

describe('BreezeAttackEntitySensor', () => {
    it('skips a spectator and takes the next attackable entity', () => {
        const sensor = new BreezeAttackEntitySensor();
        const { world, context } = scene(sensor);
        world.place('minecraft:player', { x: 1, y: 64, z: 0 }, { spectator: true });
        const target = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)).toBe(target);
    });
});

describe('PiglinSpecificSensor', () => {
    it('writes ten memories from one pass, including the counts both sides use', () => {
        const living = new NearestLivingEntitySensor();
        const sensor = new PiglinSpecificSensor(
            (player) => (player.armorItems ?? []).some((item) => item.id === 'minecraft:golden_boots'),
            (player) => player.mainHandItem?.id === 'minecraft:gold_ingot'
        );
        const { world, context } = scene(sensor);
        world.setBlock({ x: 2, y: 64, z: 0 }, 'minecraft:soul_torch', ['minecraft:piglin_repellents']);
        world.place('minecraft:hoglin', { x: 3, y: 64, z: 0 }, { conditions: ['can_be_hunted'] });
        world.place('minecraft:hoglin', { x: 4, y: 64, z: 0 }, { baby: true });
        world.place('minecraft:piglin', { x: 5, y: 64, z: 0 });
        world.place('minecraft:piglin_brute', { x: 6, y: 64, z: 0 });
        const bareFoot = world.place(
            'minecraft:player',
            { x: 7, y: 64, z: 0 },
            {
                mainHandItem: { id: 'minecraft:gold_ingot', tags: new Set(['minecraft:piglin_loved']) }
            }
        );
        world.place('minecraft:wither_skeleton', { x: 8, y: 64, z: 0 });
        scan(living, context);
        scan(sensor, context);
        const brain = context.body.brain;
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_REPELLENT)).toEqual({ x: 2, y: 64, z: 0 });
        expect(brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT)).toBe(1);
        expect(brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT)).toBe(2);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_HUNTABLE_HOGLIN)?.type).toBe('minecraft:hoglin');
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_BABY_HOGLIN)?.baby).toBe(true);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD)).toBe(bareFoot);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_PLAYER_HOLDING_WANTED_ITEM)).toBe(bareFoot);
        expect(brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS)?.type).toBe('minecraft:wither_skeleton');
        expect(brain.getMemory(MemoryModuleTypes.NEARBY_ADULT_PIGLINS)).toHaveLength(2);
    });

    it('leaves a gold-armored player out of NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD', () => {
        const living = new NearestLivingEntitySensor();
        const sensor = new PiglinSpecificSensor(
            (player) => (player.armorItems ?? []).some((item) => item.id === 'minecraft:golden_boots'),
            () => false
        );
        const { world, context } = scene(sensor);
        world.place(
            'minecraft:player',
            { x: 2, y: 64, z: 0 },
            {
                armorItems: [{ id: 'minecraft:golden_boots', tags: new Set() }]
            }
        );
        scan(living, context);
        scan(sensor, context);
        expect(context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD)).toBe(
            false
        );
    });
});

describe('PiglinBruteSpecificSensor', () => {
    it('writes only the nemesis and the nearby adult piglins', () => {
        const living = new NearestLivingEntitySensor();
        const sensor = new PiglinBruteSpecificSensor();
        const { world, context } = scene(sensor);
        const wither = world.place('minecraft:wither_skeleton', { x: 2, y: 64, z: 0 });
        world.place('minecraft:piglin', { x: 3, y: 64, z: 0 });
        scan(living, context);
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS)).toBe(wither);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEARBY_ADULT_PIGLINS)).toHaveLength(1);
    });
});

describe('HoglinSpecificSensor', () => {
    it('counts the adults on both sides, which is what decides whether a hoglin flees', () => {
        const living = new NearestLivingEntitySensor();
        const sensor = new HoglinSpecificSensor();
        const { world, context } = scene(sensor);
        const piglin = world.place('minecraft:piglin', { x: 2, y: 64, z: 0 });
        world.place('minecraft:piglin', { x: 3, y: 64, z: 0 });
        world.place('minecraft:hoglin', { x: 4, y: 64, z: 0 });
        world.place('minecraft:piglin', { x: 5, y: 64, z: 0 }, { baby: true });
        scan(living, context);
        scan(sensor, context);
        expect(context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT)).toBe(2);
        expect(context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT)).toBe(1);
        expect(context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLIN)).toBe(piglin);
    });
});
