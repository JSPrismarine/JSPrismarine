import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';

/** The names of the packets a fake player's client was sent, in order. */
const names = (sent: readonly { getName(): string }[]): string[] => sent.map((packet) => packet.getName());

/**
 * The owner's view: a session's writes and the packets to its own client are made before the
 * method returns, so a handler can run it in its input's unit and hand the promise to the step's
 * outputs. Asserted on the order and the count of the packets queued, with nothing awaited.
 */
describe("PlayerSession's sends to its own client", () => {
    it('changes the game mode and queues every packet before setGamemode returns', async () => {
        const { session, player, sent } = fakePlayer();
        player.gamemode = Gametype.SURVIVAL;

        const sends = session.setGamemode(Gametype.CREATIVE);

        expect(player.gamemode).toBe(Gametype.CREATIVE);
        const queued = names(sent);
        expect(queued).toEqual([
            'SetPlayerGameTypePacket',
            'UpdatePlayerGameTypePacket',
            'SetPlayerGameTypePacket',
            'UpdateAdventureSettingsPacket',
            'UpdateAbilitiesPacket',
            'SetPlayerGameTypePacket',
            'SetActorDataPacket',
            'UpdateAbilitiesPacket'
        ]);

        // Waiting adds nothing: the promise only says the transport framed what was queued.
        await sends;
        expect(names(sent)).toEqual(queued);
    });

    it('lands a flying player whose new game mode may not fly before setGamemode returns', () => {
        const { session, player, sent } = fakePlayer();
        player.gamemode = Gametype.CREATIVE;
        session.inputs().setPlayerFlying(player, true);

        void session.setGamemode(Gametype.SURVIVAL);

        expect(player.isFlying()).toBe(false);
        expect(names(sent).filter((name) => name === 'UpdateAdventureSettingsPacket')).toHaveLength(2);
    });
});
