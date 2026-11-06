import { Vector3 } from '@jsprismarine/math';
import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import type { ServerContent } from '../content/ServerContent';
import { buildContentTags } from '../content/tags';
import { stub } from '../testing/stub.test.helper';
import { DamageCause } from './DamageCause';
import { damageCauseOfType, damageSourceOfType, hasDamageType } from './damageTypes';
import type { Entity } from './Entity';
import { Position } from '../world/Position';
import type { World } from '../world/World';

/** A `damage_type` tag file, as a datapack declares it. */
const tagFile = (tag: string, ...values: string[]): [string, Definition] => [
    `damage_type/minecraft:${tag}`,
    {
        identifier: `damage_type/minecraft:${tag}`,
        registry: 'tags',
        pack: 'test',
        path: `${tag}.json`,
        data: { values }
    }
];

/**
 * The slice of Java 26.3's `damage_type` data these tests read: which types exist and how the
 * vanilla tags sort them.
 */
const content = stub<ServerContent>({
    definitions: stub<ServerContent['definitions']>({
        damageTypes: new Map(
            ['generic', 'in_fire', 'lava', 'fall', 'drown', 'arrow', 'explosion', 'out_of_world', 'generic_kill'].map(
                (name) => [`minecraft:${name}`, stub<Definition>({ identifier: `minecraft:${name}` })]
            )
        )
    }),
    tags: buildContentTags(
        new Map([
            tagFile(
                'bypasses_armor',
                'minecraft:fall',
                'minecraft:drown',
                'minecraft:out_of_world',
                'minecraft:generic'
            ),
            tagFile('bypasses_invulnerability', 'minecraft:out_of_world', 'minecraft:generic_kill'),
            tagFile('is_fire', 'minecraft:in_fire', 'minecraft:lava'),
            tagFile('is_fall', 'minecraft:fall'),
            tagFile('is_drowning', 'minecraft:drown'),
            tagFile('is_projectile', 'minecraft:arrow'),
            tagFile('is_explosion', 'minecraft:explosion'),
            tagFile('no_knockback', 'minecraft:drown', 'minecraft:fall')
        ])
    )
});

const entityAt = (x: number, z: number): Entity =>
    stub<Entity>({ getPosition: () => new Position(x, 64, z, stub<World>({})) });

describe('damage types', () => {
    it('knows the types the loaded packs declare', () => {
        expect(hasDamageType(content, 'minecraft:in_fire')).toBe(true);
        expect(hasDamageType(content, 'minecraft:made_up')).toBe(false);
    });

    it('maps a type to a cause from its tags first and a short table after', () => {
        const causes = (type: string) => damageCauseOfType(type, new Set());
        expect(damageCauseOfType('minecraft:anything', new Set(['minecraft:is_fall']))).toBe(DamageCause.Fall);
        expect(damageCauseOfType('minecraft:anything', new Set(['minecraft:is_drowning']))).toBe(DamageCause.Drowning);
        expect(damageCauseOfType('minecraft:anything', new Set(['minecraft:is_explosion']))).toBe(
            DamageCause.Explosion
        );
        expect(damageCauseOfType('minecraft:anything', new Set(['minecraft:is_projectile']))).toBe(
            DamageCause.Projectile
        );
        expect(damageCauseOfType('minecraft:anything', new Set(['minecraft:is_fire']))).toBe(DamageCause.Fire);
        expect(causes('minecraft:lava')).toBe(DamageCause.Lava);
        expect(causes('minecraft:generic_kill')).toBe(DamageCause.SelfDestruct);
        expect(causes('minecraft:out_of_world')).toBe(DamageCause.Void);
        expect(causes('minecraft:generic')).toBe(DamageCause.Generic);
        expect(causes('mypack:custom')).toBe(DamageCause.Generic);
    });

    it('takes what the blow bypasses from the type tags, not from a fixed list', () => {
        const generic = damageSourceOfType(content, 'minecraft:generic');
        const fire = damageSourceOfType(content, 'minecraft:in_fire');
        const kill = damageSourceOfType(content, 'minecraft:generic_kill');

        // Java tags `generic` as bypassing armor, and a fixed cause list would say it does not.
        expect(generic.bypassesArmor()).toBe(true);
        expect(fire.bypassesArmor()).toBe(false);
        expect(fire.isFire()).toBe(true);
        expect(generic.isFire()).toBe(false);
        expect(kill.bypassesInvulnerability()).toBe(true);
        expect(generic.bypassesInvulnerability()).toBe(false);
        expect(generic.damageType).toBe('minecraft:generic');
    });

    it('has no source entity when no clause names one', () => {
        const source = damageSourceOfType(content, 'minecraft:generic');

        expect(source.attacker).toBeNull();
        expect(source.projectile).toBeNull();
        expect(source.getKnockbackOrigin()).toBeNull();
    });

    it('blames the `by` entity, and the `from` entity behind it', () => {
        const player = entityAt(0, 0);
        const skeleton = entityAt(10, 0);

        const direct = damageSourceOfType(content, 'minecraft:generic', { by: player });
        expect(direct.attacker).toBe(player);
        expect(direct.projectile).toBeNull();

        const indirect = damageSourceOfType(content, 'minecraft:arrow', { by: player, from: skeleton });
        expect(indirect.attacker).toBe(skeleton);
        expect(indirect.projectile).toBe(player);
        expect(indirect.cause).toBe(DamageCause.Projectile);
    });

    it('pushes away from the contact entity, then the culprit, then the `at` point', () => {
        const contact = entityAt(1, 1);
        const culprit = entityAt(5, 5);
        const at = new Vector3(9, 64, 9);

        expect(
            damageSourceOfType(content, 'minecraft:generic', { by: contact, from: culprit }).getKnockbackOrigin()
        ).toEqual(contact.getPosition());
        expect(damageSourceOfType(content, 'minecraft:generic', { by: culprit }).getKnockbackOrigin()).toEqual(
            culprit.getPosition()
        );
        expect(damageSourceOfType(content, 'minecraft:generic', { at }).getKnockbackOrigin()).toEqual(at);
    });

    it('moves nobody for a type the packs tag no_knockback', () => {
        const source = damageSourceOfType(content, 'minecraft:fall', { by: entityAt(1, 1) });

        expect(source.getKnockbackOrigin()).toBeNull();
    });
});
