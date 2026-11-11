import { describe, expect, it } from 'vitest';

import { damageCauseOf, DamageCause } from './DamageCause';

describe('damage causes', () => {
    it('resolves Bedrock damage causes to the server damage model', () => {
        expect(damageCauseOf('entity_attack')).toBe(DamageCause.Attack);
        expect(damageCauseOf('minecraft:fire_tick')).toBe(DamageCause.Fire);
        expect(damageCauseOf('minecraft:sonic_boom')).toBe(DamageCause.SonicBoom);
        expect(damageCauseOf('block_explosion')).toBe(DamageCause.Explosion);
        expect(damageCauseOf('unmodeled')).toBe(DamageCause.Generic);
    });
});
