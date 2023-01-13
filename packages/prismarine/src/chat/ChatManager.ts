import Chat from './Chat.js';
import ChatEvent from '../events/chat/ChatEvent.js';
import type Server from '../Server.js';

export default class ChatManager {
    private readonly server: Server;

    public constructor(server: Server) {
        this.server = server;
    }

    public async send(chat: Chat) {
        const event = new ChatEvent(chat);
        await this.server.getEventManager().emit('chat', event);
    }
}
