import Command from './Command';

describe('command', () => {
    describe('Command', () => {
        const command = new Command({
            id: 'test:test-plugin'
        });

        it('name & namespace should be set correctly', () => {
            expect(command.id).toBe('test:test-plugin');
        });

        it('execute should return void', async (done) => {
            expect(
                await command.execute(null as any, null as any)
            ).toBeUndefined();
            done();
        });
    });
});
