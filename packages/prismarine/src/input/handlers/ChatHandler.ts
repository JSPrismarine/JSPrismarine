import { Chat, ChatType } from '../../chat/Chat';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player said something in chat.
 *
 * The decoder already cut the message to what a chat box could have produced. The chat manager
 * calls the plugins' chat listeners in this input's unit; what an asynchronous listener does
 * after its first wait is the step's to finish.
 */
export default class ChatHandler implements IntentHandler<'chat'> {
    public static readonly Kind = 'chat';

    /** Sends the message on under the sender and hands the step its delivery. */
    public handle({ message }: Intent<'chat'>, { session, services, step }: InputContext): undefined {
        const chat = new Chat({ sender: session, message, type: ChatType.CHAT });
        step.output(services.chat.send(chat));
    }
}
