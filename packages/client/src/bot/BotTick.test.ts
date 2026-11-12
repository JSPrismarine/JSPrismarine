import { Logger } from '@jsprismarine/logger';
import { PlayerAuthInputData, PlayerAuthInputPacket } from '@jsprismarine/protocol';
import type { NetworkPacket } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import { LoopbackNetwork } from '../testing/loopback.test.helper';
import Bot from './Bot';
import type { Behavior } from './behavior/Behavior';
import Random from './Random';

/** A bot that is never connected for real: its client says it is, and its sends are kept. */
const offlineBot = (behaviors: Behavior[]) => {
    const bot = new Bot({
        host: '127.0.0.1',
        port: 0,
        transport: new LoopbackNetwork().client(),
        displayName: 'Ticking',
        behaviors,
        random: new Random(7),
        logger: new Logger('error'),
        viewDistance: 2
    });
    const sent: NetworkPacket<unknown>[] = [];
    vi.spyOn(bot.getClient(), 'isConnected').mockReturnValue(true);
    const send = vi.spyOn(bot.getClient().getSession(), 'send').mockImplementation(async (packet) => {
        sent.push(packet);
    });
    return { bot, sent, send };
};

/** The tick numbers and the teleport flag of the inputs a bot sent. */
const inputsOf = (sent: readonly NetworkPacket<unknown>[]) =>
    sent.flatMap((packet) => {
        if (!(packet instanceof PlayerAuthInputPacket)) return [];
        const data = packet.getPacketData();
        return data === null
            ? []
            : [{ tick: data.tick, handled: data.inputData.has(PlayerAuthInputData.HANDLED_TELEPORT) }];
    });

describe('a bot tick', () => {
    it('runs one at a time, so a tick asked for while one waits starts none of its own', async () => {
        let release: () => void = () => {};
        const ticks: number[] = [];
        const slow: Behavior = {
            name: 'slow',
            tick: async (context) => {
                ticks.push(context.tick);
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
                context.input();
            }
        };
        const { bot, sent } = offlineBot([slow]);

        const first = bot.tick();
        const second = bot.tick();
        expect(second).toBe(first);
        release();
        await first;
        const third = bot.tick();
        await Promise.resolve();
        release();
        await third;

        expect(ticks).toEqual([0, 1]);
        expect(inputsOf(sent).map(({ tick }) => tick)).toEqual([0n, 1n]);
    });

    it('carries a teleport acknowledgment the failed send lost to the next input', async () => {
        const walking: Behavior = { name: 'walk', tick: (context) => context.input() };
        const { bot, sent, send } = offlineBot([walking]);
        Reflect.set(bot, 'handledTeleport', true);

        send.mockRejectedValueOnce(new Error('the transport refused it'));
        await bot.tick();
        await bot.tick();

        expect(inputsOf(sent)).toEqual([{ tick: 1n, handled: true }]);
    });
});
