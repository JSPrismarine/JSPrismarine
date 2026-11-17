import type { CommandSource } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import type { GameTestCommand } from '@jsprismarine/script-host/host/WorldScripts';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { LevelScripts } from '../scripting/LevelScripts';
import { stub } from '../testing/stub.test.helper';
import { registerGametestCommand } from './gametestCommand';

/** The subcommands `/gametest` handed the scripts, and what each run printed. */
const setUp = (scripts = true) => {
    const commands: GameTestCommand[] = [];
    const server = stub<Server>({
        getScripts: () =>
            scripts
                ? stub<LevelScripts>({
                      gametest: (command) => {
                          commands.push(command);
                          return command.kind === 'runset' && command.tag === undefined
                              ? { ok: false, message: "No tests found for tag 'suite:default'" }
                              : { ok: true, message: 'ran' };
                      }
                  })
                : undefined
    });
    const registry = new CommandRegistry<CommandSource>();
    registerGametestCommand(registry, server);
    const feedback: string[] = [];
    const errors: string[] = [];
    const run = (line: string): void => {
        const source = createCommandSource({
            host: testCommandHost(),
            permissionLevel: CommandPermissionLevel.INTERNAL,
            onFeedback: (message) => void feedback.push(message),
            onError: (message) => void errors.push(message)
        });
        registry.getDispatcher().execute(line, source);
    };
    return { commands, feedback, errors, run };
};

describe('/gametest', () => {
    it("takes BDS's subcommands and hands each to the level's GameTests", () => {
        const { commands, feedback, run } = setUp();

        run('gametest run jsp:chat');
        run('gametest runset jsp');
        run('gametest stopall');
        run('gametest clearall');

        expect(commands).toEqual([
            { kind: 'run', name: 'jsp:chat' },
            { kind: 'runset', tag: 'jsp' },
            { kind: 'stopall' },
            { kind: 'clearall' }
        ]);
        expect(feedback).toEqual(['ran', 'ran', 'ran', 'ran']);
    });

    it('prints a refusal as an error', () => {
        const { errors, run } = setUp();

        run('gametest runset');

        expect(errors).toEqual(["No tests found for tag 'suite:default'"]);
    });

    it('says why there are no tests on a server that runs no scripts', () => {
        const { errors, run } = setUp(false);

        run('gametest runset jsp');

        expect(errors).toEqual(['No behavior pack scripts are running, so there are no GameTests']);
    });
});
