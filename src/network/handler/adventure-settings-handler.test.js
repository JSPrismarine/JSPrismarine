const Handler = require('./adventure-settings-handler')
const Identifiers = require('../identifiers')

describe('network', () => {
    describe('handler', () => {
        describe('adventure-settings-handler', () => {
            const handler = new Handler()

            it.skip('packet id should match', () => {
                expect(handler.NetID).toBe(Identifiers.AdventureSettingsPacket)
            })
        })
    })
})
