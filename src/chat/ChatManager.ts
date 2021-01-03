import ChatEvent from '../events/chat/ChatEvent';
import type Server from '../Server';
import Chat from './Chat';

export default class ChatManager {
    private readonly server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    public async send(chat: Chat) {
        const event = new ChatEvent(chat);
        await this.server.getEventManager().emit('chat', event);
    }
}
