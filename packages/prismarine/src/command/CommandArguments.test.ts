import { describe, expect, it } from 'vitest';

import { spawnableEntities } from '../entity/Entities';
import { CommandArgumentMob } from './CommandArguments';

describe('command', () => {
    describe('CommandArgumentMob', () => {
        it('lists every summonable entity in the EntityType enum', () => {
            // The enum went out empty, so the client had nothing to complete after `/summon `.
            const [parameter] = new CommandArgumentMob().getParameters();

            const values = parameter?.enum?.values ?? [];
            expect(parameter?.enum?.name).toBe('EntityType');
            expect(values).toHaveLength(spawnableEntities().length);
            expect(values).toContain('zombie');
            expect(values).toContain('cat');
            // What a player types, and what the command's parser prefixes `minecraft:` onto.
            expect(values.filter((value) => value.startsWith('minecraft:'))).toEqual([]);
        });
    });
});
