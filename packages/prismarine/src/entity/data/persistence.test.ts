import { vanillaItemDefinitions } from '@jsprismarine/items';
import { AIR_STATE } from '@jsprismarine/entities';
import { DROWNING_INTERVAL_TICKS } from '@jsprismarine/entities/components/hazards';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { DATA_ENTITY_TAG, dataEntityRecordIn, dataEntityRecordOf, writeDataEntityRecord } from './persistence';
import { entityFixture, FLOOR_Y } from './testing';
import { containerOf, equip, equipmentOf, setContainerSlot } from '../../testing/mobSlots.test-utils';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A compound carrying one entity's record, the way a saved actor does. */
const written = (record: ReturnType<typeof dataEntityRecordOf>): NBTTagCompound => {
    const nbt = new NBTTagCompound('');
    nbt.addValue('UniqueID', new Types.LongVal(7n));
    writeDataEntityRecord(nbt, record);
    return nbt;
};

describe('the data entity record', () => {
    it('keeps who cured a villager', () => {
        const { runtime } = entityFixture();
        const hatchling = runtime.spawn('jsprismarine:hatchling', GROUND);
        if (hatchling === undefined) throw new Error('the fixture declares no jsprismarine:hatchling');
        hatchling.body.curedBy = 'player-xuid';

        const back = dataEntityRecordIn(written(dataEntityRecordOf(hatchling, undefined)));

        expect(back?.curedBy).toBe('player-xuid');
    });

    it('carries the component groups, properties, attributes and body state', () => {
        const { runtime } = entityFixture();
        const hatchling = runtime.spawn('jsprismarine:hatchling', GROUND);
        if (hatchling === undefined) throw new Error('the fixture declares no jsprismarine:hatchling');

        hatchling.instance.attributes.set('health', 1);
        equip(hatchling.body, { mainhand: { identifier: 'minecraft:wheat', count: 1 } }, runtime.content());
        hatchling.body.sitting = true;
        hatchling.body.loveTicks = 300;
        hatchling.body.fuseTicks = 41;

        const record = dataEntityRecordOf(hatchling, 'animal');

        expect(record).toMatchObject({
            identifier: 'jsprismarine:hatchling',
            pool: 'animal',
            componentGroups: ['hatched'],
            attributes: { health: 1 },
            equipment: { mainhand: { identifier: 'minecraft:wheat', count: 1 } },
            sitting: true,
            loveTicks: 300,
            fuseTicks: 41
        });
    });

    it('preserves entity inventory and its projected equipment across a restore', () => {
        const { runtime } = entityFixture(
            undefined,
            {},
            {
                'jsprismarine:inventory_mount': {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:inventory': { container_type: 'horse', inventory_size: 2 }
                    }
                }
            }
        );
        const mount = runtime.spawn('jsprismarine:inventory_mount', GROUND);
        if (mount === undefined) throw new Error('the fixture declares no inventory mount');
        // Horse armor has no durability, so the stack carries no damage to keep.
        const armor = {
            identifier: 'minecraft:iron_horse_armor',
            count: 1,
            meta: 2,
            customName: 'Saved armor',
            enchantments: { 'minecraft:protection': 2 },
            contents: [{ identifier: 'minecraft:diamond', count: 1 }]
        };
        setContainerSlot(mount.body, 1, armor, runtime.content());
        mount.body.equipmentInventorySlots.set('body', 1);

        const saved = dataEntityRecordOf(mount, undefined);
        // The record keeps the shape it had when the armor sat in both places.
        expect(saved.containerSlots).toEqual([null, armor]);
        expect(saved.equipment).toEqual({ body: armor });
        expect(saved.equipmentInventorySlots).toEqual({ body: 1 });

        const record = dataEntityRecordIn(written(saved));
        if (record === undefined) throw new Error('the inventory mount record could not be read');
        const restored = runtime.restore(record, GROUND);
        if (restored === undefined) throw new Error('the inventory mount did not restore');

        expect(containerOf(restored.body)).toEqual([undefined, armor]);
        expect(equipmentOf(restored.body).body).toEqual(armor);
        expect(restored.body.inventory.equipmentAddress('body')).toEqual({ container: 'inventory', slot: 1 });
        // One stack in one slot: the body slot reads the container, and its own slot is empty.
        expect(restored.body.inventory.container('body').get(0)).toBeNull();
        expect(restored.body.containerCapacity).toBe(2);
    });

    it('loads a record saved before mobs had an inventory', () => {
        const { runtime } = entityFixture(
            undefined,
            { itemDefinitions: vanillaItemDefinitions() },
            {
                'jsprismarine:legacy_villager': {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:inventory': { inventory_size: 8, private: true }
                    }
                }
            }
        );
        // As the server wrote it before: the held item as `carried`, what the mob gathered as a
        // flat identifier list, an empty `equipment` and container slots beside it.
        const legacy = new NBTTagCompound('');
        legacy.addValue(
            DATA_ENTITY_TAG,
            new Types.StringVal(
                JSON.stringify({
                    identifier: 'jsprismarine:legacy_villager',
                    persistentIdentity: '00000000-0000-0000-0000-000000000007',
                    componentGroups: [],
                    properties: {},
                    attributes: {},
                    yaw: 0,
                    pitch: 0,
                    carried: 'minecraft:emerald',
                    inventory: ['minecraft:wheat', 'minecraft:wheat', 'jsprismarine:unknown_seed'],
                    equipment: { head: { identifier: 'minecraft:iron_helmet', count: 1, damage: 4 } },
                    containerSlots: [null, { identifier: 'minecraft:bread', count: 3 }],
                    sitting: false,
                    sleeping: false,
                    loveTicks: 0,
                    breedCooldown: 0
                })
            )
        );

        const record = dataEntityRecordIn(legacy);
        if (record === undefined) throw new Error('the legacy record could not be read');
        const restored = runtime.restore(record, GROUND);
        if (restored === undefined) throw new Error('the legacy record did not restore');

        expect(equipmentOf(restored.body)).toEqual({
            mainhand: { identifier: 'minecraft:emerald', count: 1 },
            head: { identifier: 'minecraft:iron_helmet', count: 1, damage: 4 }
        });
        // The identifiers fill the container after its saved slots, an item the content does not
        // know included.
        expect(containerOf(restored.body)).toEqual([
            { identifier: 'minecraft:wheat', count: 2 },
            { identifier: 'minecraft:bread', count: 3 },
            { identifier: 'jsprismarine:unknown_seed', count: 1 },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        ]);

        // And it saves in the current form, with no legacy keys left.
        const resaved = dataEntityRecordOf(restored, undefined);
        expect(resaved.carried).toBeUndefined();
        expect(resaved.inventory).toBeUndefined();
        expect(resaved.equipment?.mainhand).toEqual({ identifier: 'minecraft:emerald', count: 1 });
    });

    it('keeps a saved equipment main hand over a legacy carried identifier', () => {
        const { runtime } = entityFixture();
        const legacy = new NBTTagCompound('');
        legacy.addValue(
            DATA_ENTITY_TAG,
            new Types.StringVal(
                JSON.stringify({
                    identifier: 'minecraft:cow',
                    carried: 'minecraft:wheat',
                    equipment: { mainhand: { identifier: 'minecraft:bow', count: 1 } }
                })
            )
        );

        const record = dataEntityRecordIn(legacy);
        if (record === undefined) throw new Error('the legacy record could not be read');
        const restored = runtime.restore(record, GROUND);

        expect(restored?.body.inventory.equipment('mainhand')?.getName()).toBe('minecraft:bow');
    });

    it('preserves a stable owner identity instead of a session runtime id', () => {
        const { runtime } = entityFixture();
        const pet = runtime.spawn('minecraft:cow', GROUND);
        if (pet === undefined) throw new Error('the fixture declares no minecraft:cow');
        Object.assign(pet.body, { ownerIdentity: '00000000-0000-0000-0000-000000000042' });

        const record = dataEntityRecordOf(pet, undefined);
        const restored = dataEntityRecordIn(written(record));

        expect(restored).toMatchObject({ ownerIdentity: '00000000-0000-0000-0000-000000000042' });
    });

    it('reads back what it wrote, leaving the actor’s other tags alone', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        cow.instance.attributes.set('health', 6);

        const nbt = written(dataEntityRecordOf(cow, 'animal'));

        expect(dataEntityRecordIn(nbt)).toEqual(dataEntityRecordOf(cow, 'animal'));
        expect(nbt.getLong('UniqueID', 0n)).toBe(7n);
    });

    it('round-trips the beam target, base plate and invulnerable state', () => {
        const { runtime } = entityFixture();
        const crystal = runtime.spawn('minecraft:cow', GROUND, {
            beamTarget: { x: 0, y: 128, z: 0 },
            showBottom: false,
            invulnerable: true
        });
        if (crystal === undefined) throw new Error('the fixture declares no minecraft:cow');

        const record = dataEntityRecordIn(written(dataEntityRecordOf(crystal, undefined)));
        if (record === undefined) throw new Error('the crystal record could not be read back');
        const restored = runtime.restore(record, GROUND);

        expect(restored?.body.beamTarget).toEqual({ x: 0, y: 128, z: 0 });
        expect(restored?.body.showBottom).toBe(false);
        expect(restored?.body.invulnerable).toBe(true);
    });

    it('restores entity-specific spawn data from the saved record', () => {
        const { runtime } = entityFixture();
        const data = { variant: 'warm', fuse: 37 };
        const original = runtime.spawn('minecraft:cow', GROUND, { data });
        if (original === undefined) throw new Error('the fixture declares no minecraft:cow');
        const record = dataEntityRecordIn(written(dataEntityRecordOf(original, undefined)));
        if (record === undefined) throw new Error('the cow record could not be read back');

        const restored = runtime.restore(record, GROUND);

        expect(restored?.spawnData).toEqual(data);
    });

    it('reports no record for an actor the written classes saved', () => {
        const nbt = new NBTTagCompound('');
        nbt.addValue('identifier', new Types.StringVal('minecraft:item'));

        expect(dataEntityRecordIn(nbt)).toBeUndefined();
    });

    it('refuses a tag that is not this server’s record rather than throwing', () => {
        const unparseable = new NBTTagCompound('');
        unparseable.addValue(DATA_ENTITY_TAG, new Types.StringVal('{not json'));

        const nameless = new NBTTagCompound('');
        nameless.addValue(DATA_ENTITY_TAG, new Types.StringVal('{"yaw":90}'));

        expect(dataEntityRecordIn(unparseable)).toBeUndefined();
        expect(dataEntityRecordIn(nameless)).toBeUndefined();
    });

    it('fills in a default for every field an older record left out', () => {
        const partial = new NBTTagCompound('');
        partial.addValue(DATA_ENTITY_TAG, new Types.StringVal('{"identifier":"minecraft:cow"}'));

        const restored = dataEntityRecordIn(partial);

        expect(restored).toMatchObject({
            identifier: 'minecraft:cow',
            componentGroups: [],
            properties: {},
            attributes: {},
            yaw: 0,
            pitch: 0,
            sitting: false,
            sleeping: false,
            loveTicks: 0,
            breedCooldown: 0
        });
        expect(restored?.persistentIdentity).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
    });

    describe('component state', () => {
        /** A fish out of water whose timer swaps it to a calm group after two seconds. */
        const extra = {
            'jsprismarine:stranded': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:breathable': { total_supply: 3, breathes_air: false, breathes_water: true }
                },
                component_groups: {
                    waiting: {
                        'minecraft:timer': {
                            looping: false,
                            time: 2,
                            time_down_event: { event: 'jsprismarine:calm', target: 'self' }
                        }
                    },
                    calm: {}
                },
                events: {
                    'minecraft:entity_spawned': { add: { component_groups: ['waiting'] } },
                    'jsprismarine:calm': {
                        add: { component_groups: ['calm'] },
                        remove: { component_groups: ['waiting'] }
                    }
                }
            }
        };

        /** Spawns the fish in one world, ticks it, and restores its saved record into a fresh world. */
        const savedAfter = (ticks: number, record = (written: ReturnType<typeof dataEntityRecordOf>) => written) => {
            const first = entityFixture(undefined, {}, extra);
            const fish = first.runtime.spawn('jsprismarine:stranded', GROUND);
            if (fish === undefined) throw new Error('the fixture declares no jsprismarine:stranded');
            for (let tick = 1; tick <= ticks; tick += 1) first.runtime.tick(tick);

            const back = dataEntityRecordIn(written(record(dataEntityRecordOf(fish, undefined))));
            if (back === undefined) throw new Error('the record could not be read');
            const second = entityFixture(undefined, {}, extra);
            const restored = second.runtime.restore(back, GROUND);
            if (restored === undefined) throw new Error('the record did not restore');
            return { fish, restored, runtime: second.runtime, reports: second.reports };
        };

        const tickFrom = (runtime: ReturnType<typeof entityFixture>['runtime'], first: number, count: number) => {
            for (let tick = first; tick < first + count; tick += 1) runtime.tick(tick);
        };

        it('saves the air supply and the timer as plain data', () => {
            const { fish, restored } = savedAfter(30);

            expect(dataEntityRecordOf(fish, undefined).componentState).toMatchObject({
                'minecraft:breathable': { remaining: 30, untilHurt: DROWNING_INTERVAL_TICKS },
                'minecraft:timer': { remaining: 10 }
            });
            expect(restored.instance.componentState.snapshot()).toEqual(fish.instance.componentState.snapshot());
        });

        it('resumes a timer where the save left it', () => {
            const { restored, runtime } = savedAfter(30);
            tickFrom(runtime, 31, 9);

            expect(restored.instance.activeComponentGroups()).toEqual(['waiting']);

            tickFrom(runtime, 40, 2);

            expect(restored.instance.activeComponentGroups()).toEqual(['calm']);
        });

        it('resumes the air supply where the save left it', () => {
            const { restored, runtime } = savedAfter(50);
            expect(restored.instance.componentState.get(AIR_STATE)).toEqual({
                remaining: 10,
                untilHurt: DROWNING_INTERVAL_TICKS
            });

            // The last 10 ticks of air, then the drowning interval before the first hurt.
            tickFrom(runtime, 51, 10 + DROWNING_INTERVAL_TICKS - 1);
            expect(restored.instance.attributes.value('health')).toBe(20);

            tickFrom(runtime, 60 + DROWNING_INTERVAL_TICKS, 1);
            expect(restored.instance.attributes.value('health')).toBeLessThan(20);
        });

        it('starts a record written before component state was saved from the initial state', () => {
            const { restored } = savedAfter(30, ({ componentState: _dropped, ...older }) => older);

            expect(restored.instance.componentState.get(AIR_STATE)).toEqual({
                remaining: 60,
                untilHurt: DROWNING_INTERVAL_TICKS
            });
            expect(restored.instance.componentState.snapshot()['minecraft:timer']).toEqual({ remaining: 40 });
        });

        it('keeps the initial state of a component whose saved state is malformed, and says so', () => {
            const { restored, reports } = savedAfter(50, (record) => ({
                ...record,
                componentState: { ...record.componentState, 'minecraft:breathable': { remaining: 'lots' } }
            }));

            expect(restored.instance.componentState.get(AIR_STATE)).toEqual({
                remaining: 60,
                untilHurt: DROWNING_INTERVAL_TICKS
            });
            expect(reports.some((line) => line.includes('minecraft:breathable'))).toBe(true);
        });

        it('says so for saved state that is not a record at all', () => {
            const { restored, reports } = savedAfter(50, (record) => ({
                ...record,
                componentState: { ...record.componentState, 'minecraft:breathable': [10, 10] }
            }));

            expect(restored.instance.componentState.get(AIR_STATE)).toEqual({
                remaining: 60,
                untilHurt: DROWNING_INTERVAL_TICKS
            });
            expect(reports.some((line) => line.includes('minecraft:breathable'))).toBe(true);
        });
    });
});
