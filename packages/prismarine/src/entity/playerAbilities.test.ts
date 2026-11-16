import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { playerAbilityNames } from './playerAbilities';

describe('playerAbilityNames', () => {
    it('makes a creative or spectator player invulnerable and leaves a survival or adventure one without abilities', () => {
        expect(playerAbilityNames(Gametype.CREATIVE)).toContain('invulnerable');
        expect(playerAbilityNames(Gametype.CREATIVE)).toContain('instabuild');
        expect(playerAbilityNames(Gametype.SPECTATOR)).toContain('invulnerable');
        expect(playerAbilityNames(Gametype.SPECTATOR)).not.toContain('instabuild');
        expect(playerAbilityNames(Gametype.SURVIVAL)).toEqual([]);
        expect(playerAbilityNames(Gametype.ADVENTURE)).toEqual([]);
    });
});
