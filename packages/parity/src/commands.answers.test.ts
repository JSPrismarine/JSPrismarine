import { CommandSyntaxException } from '@jsprismarine/brigadier';
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
 * Row ids are `console-answer:<line>`.
 */

/** What this server answers a console line with, in the shape the capture records. */
const answerOf = (command: string): Omit<CommandAnswer, 'command'> => {
    const feedback: string[] = [];
    const source = createCommandSource({
        host: testCommandHost(),
        permissionLevel: 4,
        onFeedback: (message) => feedback.push(message)
    });
    try {
        registerVanillaCommands().getDispatcher().execute(command, source);
    } catch (error) {
        if (!(error instanceof CommandSyntaxException)) throw error;
        return { level: 'ERROR', message: bedrockSyntaxError(error) ?? error.getMessage() };
    }
    return { level: 'INFO', message: feedback[0] ?? '' };
};

describeFamily(FAMILIES.commandsAnswers, [REFERENCES.bedrockCommandAnswers], () => {
    const { server, answers } = loadCommandAnswers();

    const consoleAnswer: BehaviorScenario<CommandAnswer> = {
        name: 'console-answer',
        java: `Bedrock Dedicated Server ${server} answers the line at its console with the captured line.`,
        reference: 'packages/bedrock-data/src/jsp/v<protocol>/command_answers.json; issue #3239',
        subjects: () => answers,
        idOf: (answer) => answer.command,
        covers: () => undefined,
        run: (expected) => {
            const actual = answerOf(expected.command);
            if (actual.level === expected.level && actual.message === expected.message) return undefined;
            return `${actual.level} ${JSON.stringify(actual.message)} where BDS answers ${expected.level} ${JSON.stringify(expected.message)}`;
        }
    };

    it('answers each captured console line as BDS does, or records the difference', () => {
        const rows = measureScenarios(FAMILIES.commandsAnswers, import.meta.filename, scenarioGroup([consoleAnswer]));
        expect(rows.length).toBe(answers.length);
    });
});
