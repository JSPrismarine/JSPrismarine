import { describe, expect, it } from 'vitest';

import { spawnableEntities } from '../entity/Entities';
import { CommandArgumentCommand, CommandArgumentMob } from './CommandArguments';
import { CommandParameterType } from '../network/type/CommandParameter';

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

    describe('CommandArgumentCommand', () => {
        it('advertises a command root argument with the protocol message-root type', () => {
            const [parameter] = new CommandArgumentCommand().getParameters();

            expect(parameter?.paramType).toBe(CommandParameterType.MessageRoot);
        });
    });
});
