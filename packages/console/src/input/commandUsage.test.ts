import type { CommandInfo } from '@jsprismarine/console-protocol';
import { describe, expect, it } from 'vitest';

import { commandIndex, formsFor, partAt, usageFor, usageWords } from './commandUsage';

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

    it('counts the word being typed, and the next one after a space', () => {
        expect(usageFor('tp', index)?.word).toBe(-1);
        expect(usageFor('tp ', index)?.word).toBe(0);
        expect(usageFor('tp fil', index)?.word).toBe(0);
        expect(usageFor('tp filfat ', index)?.word).toBe(1);
        expect(usageFor('  tp  filfat   1', index)?.word).toBe(1);
    });

    it('finds a command typed with a leading slash, as the console sends it', () => {
        expect(usageFor('/tp filfat', index)?.command).toBe(teleport);
        expect(usageFor('/stop', index)?.command.name).toBe('stop');
    });

    it('leaves search lines, empty lines and unknown commands alone', () => {
        expect(usageFor('/steve joined', index)).toBeUndefined();
        expect(usageFor('/', index)).toBeUndefined();
        expect(usageFor('   ', index)).toBeUndefined();
        expect(usageFor('nonsense here', index)).toBeUndefined();
    });
});

describe('partAt', () => {
    it('steps over the words a multi-word part reads', () => {
        // teleport <targets> <position> [<yaw> <pitch>]
        const words = [1, 3, 1, 1];
        expect([0, 1, 2, 3, 4, 5].map((word) => partAt(words, word))).toEqual([0, 1, 1, 1, 2, 3]);
        expect(partAt(words, 6)).toBeUndefined();
    });

    it('keeps every later word in a part that reads the rest of the line', () => {
        expect(partAt([1, 'rest'], 7)).toBe(1);
    });

    it('has no part while the name is typed', () => {
        expect(partAt([1], -1)).toBeUndefined();
    });
});

describe('formsFor', () => {
    const command: CommandInfo = { ...teleport, usage: ['teleport', ...teleport.usage] };
    const forms = (word: number, info = command) => formsFor({ command: info, word }).map(({ form }) => form);

    it('keeps every form while the name is typed', () => {
        expect(forms(-1)).toEqual(command.usage);
    });

    it('drops the forms that end before the word being typed', () => {
        expect(forms(0)).toEqual(teleport.usage);
        expect(forms(1)).toEqual([teleport.usage[1]]);
    });

    it('keeps every form once the line runs past all of them', () => {
        expect(forms(9)).toEqual(command.usage);
    });

    it('keeps a position current through its three coordinates, as in tp @s 0 64', () => {
        const told: CommandInfo = { ...teleport, usageWords: [[1], [1, 3, 1, 1]] };
        const match = usageFor('tp @s 0 64', commandIndex([told]));
        if (match === undefined) throw new Error('tp is not found');

        const [position] = formsFor(match);
        expect(position?.form).toBe(teleport.usage[1]);
        expect(usageWords(position?.form ?? '', position?.part).find((word) => word.current)?.text).toBe('<position>');
    });

    it('counts one word a part when the server sent no counts or they do not fit the form', () => {
        // Two counts for the rotation form's four parts: they do not fit, so each part reads one.
        const misfit: CommandInfo = { ...teleport, usageWords: [[1], [1, 3]] };
        expect(formsFor({ command: misfit, word: 2 })).toEqual([{ form: teleport.usage[1], part: 2 }]);
        expect(formsFor({ command: teleport, word: 2 })).toEqual([{ form: teleport.usage[1], part: 2 }]);
    });
});

describe('usageWords', () => {
    it('marks the word of the argument being typed', () => {
        const words = usageWords('teleport <targets> <position>', 1);
        expect(words.map((word) => word.current)).toEqual([false, false, true]);
    });

    it('marks nothing while the command name is typed or past the last word', () => {
        expect(usageWords('teleport <destination>', undefined).some((word) => word.current)).toBe(false);
        expect(usageWords('stop', 3).some((word) => word.current)).toBe(false);
    });
});
