import type { Chat } from './Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Server from '../Server';

export class ChatManager {
    private readonly server: Server;

    public constructor(server: Server) {
        this.server = server;
    }

    public async send(chat: Chat) {
        const event = new ChatEvent(chat);
        await this.server.emit('chat', event);
    }
}
