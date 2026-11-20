import type { CommandInfo } from '@jsprismarine/console-protocol';
import { describe, expect, it } from 'vitest';

import { commandIndex, formsFor, usageFor, usageWords } from './commandUsage';

const teleport: CommandInfo = {
    name: 'teleport',
    description: 'Teleports entities.',
    aliases: ['tp'],
    usage: ['teleport <destination>', 'teleport <targets> <position> [<yaw> <pitch>]']
};
const index = commandIndex([teleport, { name: 'stop', aliases: [], usage: ['stop'] }]);

describe('usageFor', () => {
    it('finds a command by its name or an alias, ignoring case', () => {
        expect(usageFor('teleport', index)?.command).toBe(teleport);
        expect(usageFor('TP filfat', index)?.command).toBe(teleport);
    });

    it('counts the argument being typed, and the next one after a space', () => {
        expect(usageFor('tp', index)?.argument).toBe(-1);
        expect(usageFor('tp ', index)?.argument).toBe(0);
        expect(usageFor('tp fil', index)?.argument).toBe(0);
        expect(usageFor('tp filfat ', index)?.argument).toBe(1);
        expect(usageFor('  tp  filfat   1', index)?.argument).toBe(1);
    });

    it('leaves search lines, empty lines and unknown commands alone', () => {
        expect(usageFor('/tp', index)).toBeUndefined();
        expect(usageFor('   ', index)).toBeUndefined();
        expect(usageFor('nonsense here', index)).toBeUndefined();
    });
});

describe('formsFor', () => {
    const command: CommandInfo = { ...teleport, usage: ['teleport', ...teleport.usage] };

    it('keeps every form while the name is typed', () => {
        expect(formsFor({ command, argument: -1 })).toEqual(command.usage);
    });

    it('drops the forms that end before the argument being typed', () => {
        expect(formsFor({ command, argument: 0 })).toEqual(teleport.usage);
        expect(formsFor({ command, argument: 1 })).toEqual([teleport.usage[1]]);
    });

    it('keeps every form once the line runs past all of them', () => {
        expect(formsFor({ command, argument: 9 })).toEqual(command.usage);
    });
});

describe('usageWords', () => {
    it('marks the word of the argument being typed', () => {
        const words = usageWords('teleport <targets> <position>', 1);
        expect(words.map((word) => word.current)).toEqual([false, false, true]);
    });

    it('marks nothing while the command name is typed or past the last word', () => {
        expect(usageWords('teleport <destination>', -1).some((word) => word.current)).toBe(false);
        expect(usageWords('stop', 3).some((word) => word.current)).toBe(false);
    });
});
