import { describe, expect, it } from 'vitest';

import { DamageCause } from '../entity/DamageCause';
import { DamageSource } from '../entity/DamageSource';
import { damageSourceOfScript, scriptDamageSource } from './scriptEntityEvents';

describe('the Script API damage sources', () => {
    it("reads a script's cause by its EntityDamageCause name", () => {
        const none = () => undefined;
        expect(damageSourceOfScript({ cause: 'none' }, none).cause).toBe(DamageCause.Generic);
        expect(damageSourceOfScript({ cause: 'fall' }, none).cause).toBe(DamageCause.Fall);
        expect(damageSourceOfScript({ cause: 'entityAttack' }, none).cause).toBe(DamageCause.Attack);
        expect(damageSourceOfScript({ cause: 'selfDestruct' }, none).cause).toBe(DamageCause.SelfDestruct);
        expect(damageSourceOfScript({ cause: 'fireTick' }, none).cause).toBe(DamageCause.Fire);
    });

    it('names each cause as EntityDamageCause does, and every cause the same way back', () => {
        expect(scriptDamageSource(DamageSource.of(DamageCause.Generic))).toEqual({ cause: 'none' });
        for (const cause of Object.values(DamageCause)) {
            const named = scriptDamageSource(DamageSource.of(cause)).cause;
            // The explosion causes share one; every other name reads back as the cause it came from.
            if (cause !== DamageCause.Explosion) {
                expect(damageSourceOfScript({ cause: named }, () => undefined).cause).toBe(cause);
            }
        }
    });

    it('leaves the entities out when the script names none', () => {
        const source = damageSourceOfScript(
            { cause: 'magic', damagingEntity: { id: '9', typeId: 'minecraft:pig' } },
            () => undefined
        );
        expect([source.cause, source.attacker, source.projectile]).toEqual([DamageCause.Magic, null, null]);
    });
});
