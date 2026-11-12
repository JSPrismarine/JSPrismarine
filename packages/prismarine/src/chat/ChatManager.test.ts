import { KernelEventBus } from '@jsprismarine/kernel';
import { TextPacketType } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type { CommandExecutor } from '../command/CommandExecutor';
import type { ServerEvents } from '../events/ServerEvents';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { Chat, ChatType } from './Chat';
import { ChatManager, chatRecipientOf } from './ChatManager';
import type { ChatDelivery, ChatRecipient, ChatRecipientServer } from './ChatManager';

/** A recipient keyed by its name, as a player with no XUID is, that records each line it is sent. */
const recipient = (name: string, { op = false } = {}) => {
    const lines: ChatDelivery[] = [];
    const player: ChatRecipient = {
        key: name,
        getName: () => name,
        isOp: () => op,
        receive: async (line) => void lines.push(line)
    };
    return { player, lines };
};

/** A command executor, with an XUID as a player's has one. */
const sender = (name: string, xuid?: string): CommandExecutor => {
    const executor = {
        sendMessage: () => {},
        getName: () => name,
        getFormattedUsername: () => `<${name}>`,
        getServer: () => stub<Server>({})
    };
    if (xuid === undefined) return executor;
    const player: CommandExecutor & { getXUID(): string } = { ...executor, getXUID: () => xuid };
    return player;
};

const consoleSender = sender('CONSOLE');

const say = (message: string, options: Partial<ConstructorParameters<typeof Chat>[0]> = {}) =>
    new Chat({ sender: consoleSender, message, ...options });

describe('ChatManager', () => {
    it('sends a message to every joined player', async () => {
        const chat = new ChatManager(new KernelEventBus<ServerEvents>());
        const steve = recipient('Steve');
        const alex = recipient('Alex');
        chat.join(steve.player);
        chat.join(alex.player);

        await chat.send(
            say('%multiplayer.player.joined', {
                parameters: ['Steve'],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );

        const line = {
            message: '%multiplayer.player.joined',
            type: TextPacketType.Translate,
            parameters: ['Steve'],
            needsTranslation: true
        };
        expect(steve.lines).toEqual([line]);
        expect(alex.lines).toEqual([line]);
    });

    it("names a player's own chat by its author's name and XUID", async () => {
        const chat = new ChatManager(new KernelEventBus<ServerEvents>());
        const alex = recipient('Alex');
        chat.join(alex.player);
        const author = sender('Steve', '2535');

        await chat.send(new Chat({ sender: author, message: 'hi', type: ChatType.CHAT }));
        await chat.send(new Chat({ sender: consoleSender, message: 'from the consoleSender', type: ChatType.CHAT }));

        expect(alex.lines).toEqual([
            {
                message: 'hi',
                type: TextPacketType.Chat,
                parameters: [],
                needsTranslation: false,
                sourceName: 'Steve',
                xuid: '2535'
            },
            {
                message: 'from the consoleSender',
                type: TextPacketType.Chat,
                parameters: [],
                needsTranslation: false,
                sourceName: 'CONSOLE',
                xuid: ''
            }
        ]);
    });

    it('reaches only the operators on `*.ops` and only the named player on `*.player.<name>`', async () => {
        const chat = new ChatManager(new KernelEventBus<ServerEvents>());
        const op = recipient('Op', { op: true });
        const steve = recipient('Steve');
        chat.join(op.player);
        chat.join(steve.player);

        await chat.send(say('for ops', { channel: '*.ops' }));
        await chat.send(say('for steve', { channel: '*.player.Steve' }));
        await chat.send(say('for nobody', { channel: 'somewhere.else' }));

        expect(op.lines.map(({ message }) => message)).toEqual(['for ops']);
        expect(steve.lines.map(({ message }) => message)).toEqual(['for steve']);
    });

    it('posts one `chat` event and reaches every player in one pass after its listeners', async () => {
        const bus = new KernelEventBus<ServerEvents>();
        const chat = new ChatManager(bus);
        const order: string[] = [];
        const steve: ChatRecipient = { ...recipient('Steve').player, receive: async () => void order.push('Steve') };
        chat.join(steve);
        bus.on('chat', () => void order.push('first listener'));
        const alex: ChatRecipient = { ...recipient('Alex').player, receive: async () => void order.push('Alex') };
        chat.join(alex);
        bus.on('chat', () => void order.push('second listener'));

        await chat.send(say('hello'));

        expect(order).toEqual(['first listener', 'second listener', 'Steve', 'Alex']);
    });

    it('stops every player when a listener cancels, whenever they joined', async () => {
        const bus = new KernelEventBus<ServerEvents>();
        const chat = new ChatManager(bus);
        const early = recipient('Early');
        const late = recipient('Late');
        chat.join(early.player);
        bus.on('chat', (event) => event.preventDefault());
        chat.join(late.player);
        const later: boolean[] = [];
        bus.on('chat', (event) => void later.push(event.isCanceled()));

        await chat.send(say('hello'));

        expect(early.lines).toEqual([]);
        expect(late.lines).toEqual([]);
        // The listeners after the one that canceled still run, and see the cancel.
        expect(later).toEqual([true]);
    });

    it('delivers when a listener cancels only after its first wait', async () => {
        const bus = new KernelEventBus<ServerEvents>();
        const chat = new ChatManager(bus);
        const steve = recipient('Steve');
        chat.join(steve.player);
        bus.on('chat', async (event) => {
            await Promise.resolve();
            event.preventDefault();
        });

        await chat.send(say('hello'));

        expect(steve.lines).toHaveLength(1);
    });

    it('reports a listener that throws and still delivers', async () => {
        const failures: unknown[] = [];
        const bus = new KernelEventBus<ServerEvents>({ onListenerError: (error) => failures.push(error) });
        const chat = new ChatManager(bus);
        const steve = recipient('Steve');
        chat.join(steve.player);
        bus.on('chat', () => {
            throw new Error('broken plugin');
        });

        await chat.send(say('hello'));

        expect(failures).toHaveLength(1);
        expect(steve.lines).toHaveLength(1);
    });

    it('sends nothing to a player that left', async () => {
        const bus = new KernelEventBus<ServerEvents>();
        const chat = new ChatManager(bus);
        const steve = recipient('Steve');
        chat.join(steve.player);
        chat.leave(steve.player);

        await chat.send(say('hello'));

        expect(steve.lines).toEqual([]);
        expect(chat.hasJoined('Steve')).toBe(false);
    });

    it('keeps the player holding a key when the player it replaced leaves', async () => {
        const bus = new KernelEventBus<ServerEvents>();
        const chat = new ChatManager(bus);
        const first = recipient('Steve');
        const second = recipient('Steve');
        chat.join(first.player);
        chat.join(second.player);
        chat.leave(first.player);

        await chat.send(say('hello'));

        expect(first.lines).toEqual([]);
        expect(second.lines).toHaveLength(1);
        expect(chat.hasJoined('Steve')).toBe(true);
    });
});

describe('chatRecipientOf', () => {
    /** A registry holding one client under an entity id, which records each line it is sent. */
    const registry = (id: bigint) => {
        const lines: ChatDelivery[] = [];
        const sessions = new Map([[id, { sendMessage: async (line: ChatDelivery) => void lines.push(line) }]]);
        const server: ChatRecipientServer = {
            getSessionManager: () => ({ sessionOf: (wanted) => sessions.get(wanted) ?? null }),
            getPermissionManager: () => ({ isOp: (uuid) => uuid === 'op-uuid' })
        };
        return { server, lines, leave: () => sessions.delete(id) };
    };

    it('keys the recipient by XUID and reads the name and operator list from the identity', () => {
        const { server } = registry(7n);
        const steve = chatRecipientOf(
            { runtimeId: 7n, identity: { name: 'Steve', xuid: '123', uuid: 'op-uuid' } },
            server
        );
        const alex = chatRecipientOf(
            { runtimeId: 8n, identity: { name: 'Alex', xuid: '', uuid: 'alex-uuid' } },
            server
        );

        expect([steve.key, steve.getName(), steve.isOp()]).toEqual(['123', 'Steve', true]);
        expect([alex.key, alex.isOp()]).toEqual(['Alex', false]);
    });

    it('sends each line to the session the registry files under the entity id', async () => {
        const { server, lines, leave } = registry(7n);
        const chat = new ChatManager(new KernelEventBus<ServerEvents>());
        const steve = chatRecipientOf({ runtimeId: 7n, identity: { name: 'Steve', xuid: '', uuid: 'u' } }, server);
        chat.join(steve);

        await chat.send(say('hello'));
        leave();
        await chat.send(say('gone'));

        expect(lines.map(({ message }) => message)).toEqual(['hello']);
    });
});
