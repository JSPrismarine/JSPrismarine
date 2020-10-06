const Command = require('./gamemode-command')

describe('command', () => {
    describe('vanilla', () => {
        describe('gamemode-command', () => {
            const command = new Command()

            it('name & namespace should be set correctly', () => {
                expect(command.namespace === 'minecraft')
                expect(command.name === 'gamemode')
            })

            it('gamemode command should fail without argument', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message === 'You have to specify a gamemode.')
                        done()
                    }
                }, [])
            })

            it('gamemode command should fail with invalid gamemode', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message === 'Invalid gamemode specified.')
                        done()
                    }
                }, ['test'])
            })

            it('gamemode command should fail when using one argument from console', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message === 'You have to run this command in-game!')
                        done()
                    }
                }, ['creative'])
            })

            it('gamemode command should fail when using offline player', (done) => {
                command.execute({
                    getServer: () => ({
                        getPlayerByName: (name) => null,
                    }),
                    sendMessage: (message) => {
                        expect(message === 'Target player is not online!')
                        done()
                    }
                }, ['creative', 'test-user'])
            })

            it('gamemode command should work when running from console', (done) => {
                let gm = null;

                command.execute({
                    getServer: () => ({
                        getPlayerByName: (name) => ({
                            name: name,
                            setGamemode: (gamemode) => {
                                gm = gamemode
                            },
                            setCreativeContents: () => null,
                            sendMessage: (message) => {
                                expect(message === 'Your game mode has been updated to Creative')
                                done()
                            }
                        }),
                    })
                }, ['creative', 'test-user'])
            })
        })
    })
})
