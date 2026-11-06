import { describe, expect, it } from 'vitest';
import { ActorDataID } from '@jsprismarine/minecraft/ActorDataID';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { Vector3 } from '@jsprismarine/math';

import type { Entity } from '../Entity';
import { Metadata, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { stub } from '../../testing/stub.test.helper';
import {
    actorMetadataInputs,
    actorMetadataProjection,
    applyActorMetadataProjection,
    sameActorMetadataInputs,
    sameActorMetadataProjection
} from './actorMetadata';
import { referenceActorMetadataProjection } from './actorMetadata.reference.test.helper';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

describe('actor metadata from entity components', () => {
    it('projects a creeper charge event to the powered actor flag', () => {
        const fixture = entityFixture(
            new TestEntityWorld(),
            {},
            {
                'jsprismarine:charged_creeper': {
                    components: { 'minecraft:physics': {} },
                    component_groups: { charged: { 'minecraft:is_charged': {} } },
                    events: {
                        charge: { add: { component_groups: ['charged'] } },
                        discharge: { remove: { component_groups: ['charged'] } }
                    }
                }
            }
        );
        const creeper = fixture.runtime.spawn('jsprismarine:charged_creeper', {
            x: 0.5,
            y: FLOOR_Y + 1,
            z: 0.5
        });
        if (creeper === undefined) throw new Error('the fixture did not declare a charged creeper');

        const metadata = new Metadata();
        const body = stub<Entity>({ metadata });
        const uncharged = actorMetadataProjection(creeper);
        applyActorMetadataProjection(body, uncharged);
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.POWERED))).toBe(false);

        fixture.runtime.trigger(creeper.body, 'charge', 'self');
        fixture.runtime.tick(1);

        expect(creeper.instance.hasComponent('minecraft:is_charged')).toBe(true);
        applyActorMetadataProjection(body, actorMetadataProjection(creeper));
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.POWERED))).toBe(true);

        fixture.runtime.trigger(creeper.body, 'discharge', 'self');
        fixture.runtime.tick(2);

        expect(creeper.instance.hasComponent('minecraft:is_charged')).toBe(false);
        applyActorMetadataProjection(body, actorMetadataProjection(creeper));
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.POWERED))).toBe(false);
    });

    it('projects a primed TNT component group to the ignited actor flag', () => {
        const fixture = entityFixture(
            new TestEntityWorld(),
            {},
            {
                'jsprismarine:primed_tnt': {
                    components: { 'minecraft:physics': {} },
                    component_groups: { primed: { 'minecraft:is_ignited': {} } },
                    events: { prime: { add: { component_groups: ['primed'] } } }
                }
            }
        );
        const tnt = fixture.runtime.spawn('jsprismarine:primed_tnt', {
            x: 0.5,
            y: FLOOR_Y + 1,
            z: 0.5
        });
        if (tnt === undefined) throw new Error('the fixture did not declare primed TNT');

        const metadata = new Metadata();
        const body = stub<Entity>({ metadata });
        applyActorMetadataProjection(body, actorMetadataProjection(tnt));
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.IGNITED))).toBe(false);

        fixture.runtime.trigger(tnt.body, 'prime', 'self');
        fixture.runtime.tick(1);

        expect(tnt.instance.hasComponent('minecraft:is_ignited')).toBe(true);
        applyActorMetadataProjection(body, actorMetadataProjection(tnt));
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.IGNITED))).toBe(true);
    });

    it('projects the beam target and base plate onto the crystal wire data', () => {
        const fixture = entityFixture();
        const crystal = fixture.runtime.spawn(
            'minecraft:cow',
            { x: 0.5, y: FLOOR_Y + 1, z: 0.5 },
            { beamTarget: { x: 0, y: 128, z: 0 }, showBottom: false }
        );
        if (crystal === undefined) throw new Error('the fixture declares no minecraft:cow');

        const metadata = new Metadata();
        const body = stub<Entity>({ metadata });
        applyActorMetadataProjection(body, actorMetadataProjection(crystal));

        expect(metadata.getPropertyValue(ActorDataID.BLOCK_TARGET)).toEqual(new Vector3(0, 128, 0));
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SHOW_BOTTOM))).toBe(false);
    });

    it('shows the base plate and sends no beam key by default', () => {
        const fixture = entityFixture();
        const crystal = fixture.runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (crystal === undefined) throw new Error('the fixture declares no minecraft:cow');

        const metadata = new Metadata();
        const body = stub<Entity>({ metadata });
        applyActorMetadataProjection(body, actorMetadataProjection(crystal));

        expect(metadata.getPropertyValue(ActorDataID.BLOCK_TARGET)).toBeNull();
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.SHOW_BOTTOM))).toBe(true);
    });

    it('reads a moved beam target as a changed projection', () => {
        const fixture = entityFixture();
        const crystal = fixture.runtime.spawn(
            'minecraft:cow',
            { x: 0.5, y: FLOOR_Y + 1, z: 0.5 },
            { beamTarget: { x: 0, y: 128, z: 0 } }
        );
        if (crystal === undefined) throw new Error('the fixture declares no minecraft:cow');

        const before = actorMetadataProjection(crystal);
        expect(sameActorMetadataProjection(before, actorMetadataProjection(crystal))).toBe(true);

        crystal.body.beamTarget = { x: 42, y: 77, z: 0 };
        expect(sameActorMetadataProjection(before, actorMetadataProjection(crystal))).toBe(false);
    });

    it('projects vanilla entity marker components to actor flags', () => {
        const fixture = entityFixture(
            new TestEntityWorld(),
            {},
            {
                'jsprismarine:marker_actor': {
                    components: { 'minecraft:physics': { has_collision: false } },
                    component_groups: {
                        marked: {
                            'minecraft:is_saddled': {},
                            'minecraft:is_chested': {},
                            'minecraft:is_illager_captain': {},
                            'minecraft:is_shaking': {},
                            'minecraft:is_hidden_when_invisible': {},
                            'minecraft:is_stackable': {},
                            'minecraft:is_collidable': {},
                            'minecraft:is_pregnant': {},
                            'minecraft:is_stunned': {},
                            'minecraft:body_rotation_always_follows_head': {},
                            'minecraft:uses_uniform_air_drag': {},
                            'minecraft:renders_when_invisible': {},
                            'minecraft:rotation_axis_aligned': {},
                            'minecraft:rotation_locked_to_vehicle': {},
                            'minecraft:uses_legacy_friction': {}
                        }
                    },
                    events: {
                        mark: { add: { component_groups: ['marked'] } },
                        clear: { remove: { component_groups: ['marked'] } }
                    }
                }
            }
        );
        const actor = fixture.runtime.spawn('jsprismarine:marker_actor', {
            x: 0.5,
            y: FLOOR_Y + 1,
            z: 0.5
        });
        if (actor === undefined) throw new Error('the fixture did not declare a marker actor');

        const metadata = new Metadata();
        const body = stub<Entity>({ metadata });
        const flags = [
            ActorFlags.SADDLED,
            ActorFlags.CHESTED,
            ActorFlags.IS_ILLAGER_CAPTAIN,
            ActorFlags.SHAKING,
            ActorFlags.HIDDEN_WHEN_INVISIBLE,
            ActorFlags.STACKABLE,
            ActorFlags.COLLIDABLE,
            ActorFlags.IS_PREGNANT,
            ActorFlags.STUNNED,
            ActorFlags.BODY_ROTATION_ALWAYS_FOLLOWS_HEAD,
            ActorFlags.USES_UNIFORM_AIR_DRAG,
            ActorFlags.RENDERS_WHEN_INVISIBLE,
            ActorFlags.ROTATION_AXIS_ALIGNED,
            ActorFlags.ROTATION_LOCKED_TO_VEHICLE,
            ActorFlags.USES_LEGACY_FRICTION
        ];
        const expectFlags = (value: boolean): void => {
            for (const flag of flags) {
                // Mojang stores flags 64 and above in the FlagsTwo data item (ID 92).
                const propertyId = flag >= 64 ? 92 : MetadataFlag.INDEX;
                expect(metadata.getDataFlag(propertyId, BigInt(flag % 64)), `actor flag ${flag}`).toBe(value);
            }
        };

        applyActorMetadataProjection(body, actorMetadataProjection(actor));
        expectFlags(false);

        fixture.runtime.trigger(actor.body, 'mark', 'self');
        fixture.runtime.tick(1);

        applyActorMetadataProjection(body, actorMetadataProjection(actor));
        expectFlags(true);
        expect(metadata.getDataFlag(MetadataFlag.INDEX, BigInt(ActorFlags.HAS_COLLISION))).toBe(false);

        fixture.runtime.trigger(actor.body, 'clear', 'self');
        fixture.runtime.tick(2);

        applyActorMetadataProjection(body, actorMetadataProjection(actor));
        expectFlags(false);
    });

    describe('against the projection that read every component each time', () => {
        const marker = {
            'jsprismarine:marked': {
                components: { 'minecraft:physics': {}, 'minecraft:scale': { value: 1 } },
                component_groups: {
                    charged: { 'minecraft:is_charged': {}, 'minecraft:scale': 2 },
                    tame: { 'minecraft:is_tamed': {}, 'minecraft:is_saddled': {}, 'minecraft:variant': { value: 3 } },
                    climber: { 'minecraft:navigation.climb': { can_pass_doors: true } }
                },
                events: {
                    charge: { add: { component_groups: ['charged'] } },
                    discharge: { remove: { component_groups: ['charged'] } },
                    tame: { add: { component_groups: ['tame'] } },
                    climb: { add: { component_groups: ['climber'] } }
                }
            }
        };

        const spawn = () => {
            const fixture = entityFixture(new TestEntityWorld(), {}, marker);
            const actor = fixture.runtime.spawn('jsprismarine:marked', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
            if (actor === undefined) throw new Error('the fixture did not declare a marked actor');
            return { fixture, actor };
        };

        it('projects the same metadata before and after the component set changes', () => {
            const { fixture, actor } = spawn();
            let tick = 1;
            const expectSame = (): void => {
                expect(actorMetadataProjection(actor)).toEqual(referenceActorMetadataProjection(actor));
            };

            expectSame();
            for (const event of ['charge', 'tame', 'climb', 'discharge']) {
                fixture.runtime.trigger(actor.body, event, 'self');
                fixture.runtime.tick(tick++);
                expectSame();
            }
        });

        it('projects the same metadata as the entity state moves', () => {
            const { actor } = spawn();
            const states: Array<() => void> = [
                () => (actor.body.fireTicks = 40),
                () => (actor.body.fuseTicks = 30),
                () => (actor.body.nameTag = 'Bessie'),
                () => (actor.body.color = 7),
                () => (actor.body.showBottom = false),
                () => (actor.body.beamTarget = { x: 3.7, y: 128.2, z: -4.1 }),
                () => (actor.body.fireTicks = 0),
                () => (actor.body.fuseTicks = undefined),
                () => (actor.body.beamTarget = undefined)
            ];

            for (const leash of [undefined, 12]) {
                for (const change of states) {
                    change();
                    expect(actorMetadataProjection(actor, leash)).toEqual(
                        referenceActorMetadataProjection(actor, leash)
                    );
                }
            }
        });

        it('reports the inputs as changed exactly when a projected value can have changed', () => {
            const { fixture, actor } = spawn();
            const before = actorMetadataInputs(actor);

            // A read with nothing different is the same, which is what lets a tick skip the projection.
            expect(sameActorMetadataInputs(before, actorMetadataInputs(actor))).toBe(true);

            const changes: Array<[string, () => void]> = [
                ['fire', () => (actor.body.fireTicks = 5)],
                ['fuse', () => (actor.body.fuseTicks = 5)],
                ['name', () => (actor.body.nameTag = 'Bessie')],
                ['color', () => (actor.body.color = 3)],
                ['base plate', () => (actor.body.showBottom = false)],
                ['beam', () => (actor.body.beamTarget = { x: 1, y: 2, z: 3 })]
            ];
            for (const [name, change] of changes) {
                const reference = actorMetadataInputs(actor);
                change();
                expect(sameActorMetadataInputs(reference, actorMetadataInputs(actor)), name).toBe(false);
            }

            expect(sameActorMetadataInputs(actorMetadataInputs(actor, undefined), actorMetadataInputs(actor, 4))).toBe(
                false
            );

            // A new component set invalidates the cached facts and the inputs together.
            const marked = actorMetadataInputs(actor);
            fixture.runtime.trigger(actor.body, 'charge', 'self');
            fixture.runtime.tick(1);
            expect(sameActorMetadataInputs(marked, actorMetadataInputs(actor))).toBe(false);
        });
    });
});
