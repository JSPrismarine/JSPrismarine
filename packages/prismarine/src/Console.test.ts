import { describe, expect, it } from 'vitest';
import Console from './Console';
import type Server from './Server';

describe('Console', () => {
    describe('complete', () => {
        it('should return completions for commands', async () => {
            const serverMock = {
                getCommandManager: () => ({
                    getCommands: () =>
                        new Map([
                            ['command1', { name: 'command1' }],
                            ['command2', { name: 'command2' }],
                            ['command3', { name: 'command3' }]
                        ])
                }),
                getWorldManager: () => ({
                    getDefaultWorld: () => ({
                        getName: () => 'world'
                    })
                })
            } as Server;
            const consoleInstance = new Console(serverMock) as any;
            consoleInstance['history'] = [];

            const line = 'co';
            const expectedCompletions = ['command1', 'command2', 'command3'];

            const result = await new Promise((resolve, reject) => {
                consoleInstance.complete(line, (err: Error | null, result: string[]) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            expect(result).toEqual([expectedCompletions, line]);
        });
    });
});
