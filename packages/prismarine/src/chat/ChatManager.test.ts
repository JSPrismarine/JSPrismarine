import { TextPacketType } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type { CommandExecutor } from '../command/CommandExecutor';
import type ChatEvent from '../events/chat/ChatEvent';
import { EventEmitter } from '../events/EventEmitter';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { Chat, ChatType } from './Chat';
import { ChatManager } from './ChatManager';
import type { ChatDelivery, ChatRecipient } from './ChatManager';

/** The server's real bus, counting how many listener calls each `chat` event makes. */
const countingBus = () => {
    const bus = new EventEmitter();
    const counted = { calls: 0 };
    // A listener that runs first and counts the calls made after it, itself included.
    const listeners = { size: 0 };
    const on = bus.on.bind(bus);
    const removeListener = bus.removeListener.bind(bus);
    const wrapped = new Map<unknown, (event: ChatEvent) => unknown>();
    const chatBus = {
        on: (id: 'chat', callback: (event: ChatEvent) => void) => {
            const counting = (event: ChatEvent) => {
                counted.calls++;
                return callback(event);
            };
            wrapped.set(callback, counting);
            listeners.size++;
            on(id, counting);
            return bus;
        },
        removeListener: (id: 'chat', callback: (event: ChatEvent) => void) => {
            const counting = wrapped.get(callback);
            if (counting !== undefined) {
                wrapped.delete(callback);
                listeners.size--;
                removeListener(id, counting);
            }
            return bus;
        },
        emit: bus.emit.bind(bus)
    } satisfies Pick<EventEmitter, 'on' | 'removeListener' | 'emit'>;
    return { bus: chatBus, counted, listeners };
};

const recipient = (name: string, { op = false, xuid = '' } = {}) => {
    const received: ChatDelivery[] = [];
    const player: ChatRecipient = {
        key: xuid || name,
        getName: () => name,
        isOp: () => op,
        receive: async (delivery) => void received.push(delivery)
    };
    return { player, received };
};

const sender = (name: string, xuid?: string): CommandExecutor => {
    const executor = {
        sendMessage: () => {},
        getName: () => name,
        getFormattedUsername: () => `<${name}>`,
        getServer: () => stub<Server>({})
    };
    return xuid === undefined ? executor : { ...executor, getXUID: () => xuid };
};

const CONSOLE = sender('CONSOLE');

describe('chat fan-out', () => {
    it('reaches every connected player through one listener call', async () => {
        const { bus, counted } = countingBus();
        const chat = new ChatManager(bus);
        const players = Array.from({ length: 5 }, (_, i) => recipient(`P${i}`));
        for (const { player } of players) chat.join(player);

        await chat.send(new Chat({ sender: CONSOLE, message: 'hello' }));

        // Five players used to be five listeners, each deciding for itself.
        expect(counted.calls).toBe(1);
        expect(players.map(({ received }) => received.length)).toEqual([1, 1, 1, 1, 1]);
    });

    it('listens only while somebody is connected', async () => {
        const { bus, listeners } = countingBus();
        const chat = new ChatManager(bus);
        const a = recipient('A');
        const b = recipient('B');

        chat.join(a.player);
        chat.join(b.player);
        expect(listeners.size).toBe(1);

        chat.leave(a.player);
        expect(listeners.size).toBe(1);
        chat.leave(b.player);
        expect(listeners.size).toBe(0);
    });

    it('keeps a successor with the same key when the replaced player leaves', async () => {
        const chat = new ChatManager(new EventEmitter());
        const old = recipient('Steve');
        const successor = recipient('Steve');
        chat.join(old.player);
        chat.join(successor.player);

        chat.leave(old.player);

        expect(await chat.deliver(new Chat({ sender: CONSOLE, message: 'still here' }))).toBe(1);
        expect(old.received).toHaveLength(0);
        expect(successor.received).toHaveLength(1);
    });

    it('sends `*.ops` to operators and `*.player.<name>` to that player only', async () => {
        const chat = new ChatManager(new EventEmitter());
        const op = recipient('Op', { op: true });
        const steve = recipient('Steve');
        chat.join(op.player);
        chat.join(steve.player);

        await chat.send(new Chat({ sender: CONSOLE, message: 'ops only', channel: '*.ops' }));
        await chat.send(new Chat({ sender: CONSOLE, message: 'whisper', channel: '*.player.Steve' }));
        await chat.send(new Chat({ sender: CONSOLE, message: 'elsewhere', channel: 'plugin.channel' }));

        expect(op.received.map(({ message }) => message)).toEqual(['ops only']);
        expect(steve.received.map(({ message }) => message)).toEqual(['whisper']);
    });

    it('delivers nothing a listener before it canceled', async () => {
        const bus = new EventEmitter();
        // A plugin's listener, added at startup before anybody joined.
        bus.on('chat', (event) => event.preventDefault());
        const chat = new ChatManager(bus);
        const steve = recipient('Steve');
        chat.join(steve.player);

        await chat.send(new Chat({ sender: CONSOLE, message: 'muted' }));

        expect(steve.received).toHaveLength(0);
    });

    it("names a player's own chat by its author, and sends every other type as written", async () => {
        const chat = new ChatManager(new EventEmitter());
        const steve = recipient('Steve');
        chat.join(steve.player);

        await chat.send(new Chat({ sender: sender('Alex', '2535'), message: 'hi', type: ChatType.CHAT }));
        await chat.send(new Chat({ sender: CONSOLE, message: 'typed', type: ChatType.CHAT }));
        await chat.send(
            new Chat({
                sender: sender('Alex', '2535'),
                message: '%multiplayer.player.joined',
                parameters: ['Alex'],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );

        expect(steve.received).toEqual([
            {
                message: 'hi',
                type: TextPacketType.Chat,
                parameters: [],
                needsTranslation: false,
                sourceName: 'Alex',
                xuid: '2535'
            },
            {
                message: 'typed',
                type: TextPacketType.Chat,
                parameters: [],
                needsTranslation: false,
                sourceName: 'CONSOLE',
                xuid: ''
            },
            {
                message: '%multiplayer.player.joined',
                type: TextPacketType.Translate,
                parameters: ['Alex'],
                needsTranslation: true
            }
        ]);
    });
});
