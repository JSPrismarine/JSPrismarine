/**
 * What a joined player sees of the server's answers to chat, commands and the console: the
 * client e2e scenarios `chat`, `title`, `teleport`, `damage`, `command-syntax-error` and `kick`,
 * played over a loopback pipe against a server stepped by hand.
 */
import AvailableCommandsPacket from '@jsprismarine/protocol/bedrock/packet/AvailableCommandsPacket';
import { CommandDataFlags } from '@jsprismarine/protocol/bedrock/wire/structures/CommandData';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({ name: 'session-scenarios' });
}, 300_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

describe('xbox-achievements', () => {
    it('joins a world with achievements on and cheats off, where every command may still be sent', async () => {
        const { player, joined } = jsp.connect('Achiever');
        const registry = player.client.getRegistry();
        if (!registry.has(new AvailableCommandsPacket().getId())) registry.register(AvailableCommandsPacket);
        const lists: AvailableCommandsPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof AvailableCommandsPacket) lists.push(packet);
        });
        let done = false;
        void joined.finally(() => {
            done = true;
        });
        await jsp.until(() => done, 'Achiever never joined', 120);
        await joined;
        await jsp.until(() => lists.length > 0, 'Achiever was never sent the command list');

        expect(player.client.getStartGame()).toMatchObject({ achievementsDisabled: false, commandsEnabled: false });
        // A client told cheats are off refuses a command without NOT_CHEAT before sending it.
        const commands = lists.at(-1)!.commandData;
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.filter((command) => (command.flags & CommandDataFlags.NOT_CHEAT) === 0)).toEqual([]);
        player.leave();
        await jsp.tick();
    });
});

describe('chat', () => {
    it("reaches another player as the sender's line", async () => {
        const sender = await jsp.join('Talker');
        const listener = await jsp.join('Listener');

        await sender.chat('hello from the loopback');
        await jsp.tick();

        const lines = listener.world.chat().map((text) => text.message);
        expect(lines.some((line) => line.includes('hello from the loopback'))).toBe(true);
        sender.leave();
        listener.leave();
        await jsp.tick();
    });
});

describe('title', () => {
    it('shows a title and subtitle the console sends', async () => {
        const player = await jsp.join('Titled');

        await jsp.command('title Titled times 0 100 0');
        await jsp.command('title Titled subtitle sub-marker');
        await jsp.command('title Titled title marker');

        expect(player.world.titles()).toMatchObject({ title: 'marker', subtitle: 'sub-marker' });
        player.leave();
        await jsp.tick();
    });
});

describe('teleport', () => {
    it('moves the player to the target of a console teleport', async () => {
        const player = await jsp.join('Teleported');
        await jsp.command('fill 23 -61 23 25 -61 25 minecraft:stone');

        await jsp.command('teleport Teleported 24 -60 24');
        await jsp.until(() => player.world.getTeleportCount() > 0, 'the client was never sent the teleport');
        await player.input();
        await jsp.tick();

        const position = player.world.getPosition();
        expect(position?.x).toBeCloseTo(24, 0);
        expect(position?.z).toBeCloseTo(24, 0);
        const server = player.session()?.getPlayer().getPosition();
        expect(server?.getX()).toBeCloseTo(24, 0);
        expect(server?.getZ()).toBeCloseTo(24, 0);
        player.leave();
        await jsp.tick();
    });
});

describe('damage', () => {
    it('lowers the health the client is sent', async () => {
        const player = await jsp.join('Hurt');
        await jsp.until(() => player.world.health() !== undefined, 'the client never learned its health');
        const before = player.world.health()!;

        await jsp.command('damage Hurt 6');
        await jsp.until(() => player.world.health()! <= before - 5, 'the client never took the damage');
        player.leave();
        await jsp.tick();
    });
});

describe('command-syntax-error', () => {
    it("answers a command line with a syntax error with the error Bedrock's server shows", async () => {
        const player = await jsp.join('Mistyped');
        await jsp.command('op Mistyped');
        await jsp.tick();

        await player.runCommand('/time set 1.5');
        await jsp.tick();

        // What Bedrock Dedicated Server 1.26.60.6 answers `/time set 1.5` with.
        const lines = player.world.chat().map((text) => text.message);
        expect(lines).toContain('§cSyntax error: Unexpected "1.5": at "/time set >>1.5<<"');
        player.leave();
        await jsp.tick();
    });
});

describe('kick', () => {
    it('tells the kicked client the reason the server gave', async () => {
        const player = await jsp.join('Kicked');

        await jsp.command('kick Kicked Kicked-for-the-loopback');
        await jsp.until(() => !player.client.isConnected(), 'the client was never disconnected');

        expect(player.world.getDisconnectReason()).toContain('Kicked-for-the-loopback');
        expect(player.client.isConnected()).toBe(false);
    });
});
