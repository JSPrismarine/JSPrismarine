import { describe, expect, it } from 'vitest';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';

import type { Entity } from '../Entity';
import { Metadata, MetadataFlag } from '../Metadata';
import { stub } from '../../testing/stub.test.helper';
import { applyActorMetadataProjection, actorMetadataProjection } from './actorMetadata';
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
});
