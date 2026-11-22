import { CommandSyntaxException } from '@jsprismarine/brigadier';
import type { CommandHost } from '@jsprismarine/commands/host';
import { createCommandSource, registerVanillaCommands } from '@jsprismarine/commands';
import { testCommandHost } from '@jsprismarine/commands/testing';
import { bedrockSyntaxError } from '@jsprismarine/commands/syntaxError';
import { expect, it } from 'vitest';

import { measureScenarios, scenarioGroup } from './behaviorScenarios.ts';
import type { BehaviorScenario } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import type { CommandAnswer } from './goldens.ts';
import { loadCommandAnswers } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * How the console answers a command line, against the pinned Bedrock Dedicated Server.
 *
 * The `commands` capture pass typed each probe line at the server's console and recorded the one
 * line it answered with. Each row runs the same line through this server's command tree as the
 * console does and compares the answer: a refused line must be refused with the same syntax error,
 * pointing at the same word, and an accepted line must run and report what BDS reported.
 *
 * The lines run in the capture's order against one host, as they did on one server, so a line
 * that depends on an earlier one, such as adding a name to the allow list twice, answers the same.
 * Row ids are `console-answer:<line>`, with `#<n>` after a line's second and later repeats.
 */

/** What this server answers a console line with, in the shape the capture records. */
const answerOf = (host: CommandHost, command: string): Omit<CommandAnswer, 'command'> => {
    const feedback: string[] = [];
    const errors: string[] = [];
    const source = createCommandSource({
        host,
        permissionLevel: 4,
        onFeedback: (message) => feedback.push(message),
        // A command that parsed and then refused to run answers through `sendError`, which the
        // console logs at the error level, as it does a syntax error.
        onError: (message) => errors.push(message)
    });
    try {
        registerVanillaCommands().getDispatcher().execute(command, source);
    } catch (error) {
        if (!(error instanceof CommandSyntaxException)) throw error;
        return { level: 'ERROR', message: bedrockSyntaxError(error) ?? error.getMessage() };
    }
    if (errors.length > 0) return { level: 'ERROR', message: errors[0]! };
    return { level: 'INFO', message: feedback[0] ?? '' };
};

describeFamily(FAMILIES.commandsAnswers, [REFERENCES.bedrockCommandAnswers], () => {
    const { server, answers } = loadCommandAnswers();
    // Every line's answer, run in order on one host.
    const host = testCommandHost();
    const seen = new Map<string, number>();
    const rows = answers.map((expected) => {
        const repeat = (seen.get(expected.command) ?? 0) + 1;
        seen.set(expected.command, repeat);
        return {
            id: repeat === 1 ? expected.command : `${expected.command}#${repeat}`,
            expected,
            actual: answerOf(host, expected.command)
        };
    });

    const consoleAnswer: BehaviorScenario<(typeof rows)[number]> = {
        name: 'console-answer',
        java: `Bedrock Dedicated Server ${server} answers the line at its console with the captured line.`,
        reference: 'packages/bedrock-data/src/jsp/v<protocol>/command_answers.json; issue #3239',
        subjects: () => rows,
        idOf: (row) => row.id,
        covers: () => undefined,
        run: ({ expected, actual }) => {
            if (actual.level === expected.level && actual.message === expected.message) return undefined;
            return `${actual.level} ${JSON.stringify(actual.message)} where BDS answers ${expected.level} ${JSON.stringify(expected.message)}`;
        }
    };

    it('answers each captured console line as BDS does, or records the difference', () => {
        const rows = measureScenarios(FAMILIES.commandsAnswers, import.meta.filename, scenarioGroup([consoleAnswer]));
        expect(rows.length).toBe(answers.length);
    });
});
