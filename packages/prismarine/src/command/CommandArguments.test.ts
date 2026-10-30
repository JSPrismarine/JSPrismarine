import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import { testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { CommandArgumentCommand, CommandArgumentMob } from './CommandArguments';
import { CommandParameterType } from '@jsprismarine/protocol/wire/structures/CommandParameter';

describe('command', () => {
    describe('CommandArgumentMob', () => {
        it('lists only the pack stack types it declares summonable', () => {
            // The enum went out empty, so the client had nothing to complete after `/summon `.
            // The fixture stack declares one summonable entity, the cow.
            const server = stub<Server>({ getContent: () => testContent() });
            const [parameter] = new CommandArgumentMob().getParameters(server);

            const values = parameter?.enum?.values ?? [];
            expect(parameter?.enum?.name).toBe('EntityType');
            expect(values).toContain('cow');
            expect(values).not.toContain('tnt');
            expect(values).not.toContain('arrow');
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
