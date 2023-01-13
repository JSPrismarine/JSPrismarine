import type Chat from '../../chat/Chat.js';
import Event from '../Event.js';

export default class ChatEvent extends Event {
    private readonly chat;

    public constructor(chat: Chat) {
        super();
        this.chat = chat;
    }

    public getChat(): Chat {
        return this.chat;
    }
}
