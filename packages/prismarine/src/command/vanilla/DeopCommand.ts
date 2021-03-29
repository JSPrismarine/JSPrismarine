/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';
import { PlayerArgumentCommand } from '../CommandArguments';

import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Command from '../Command';
import Player from '../../player/Player';

export default class DeopCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:deop',
            description: `Remove a player's op status.`,
            permission: 'minecraft.command.deop'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('deop').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(async (context) => {
                    const source = context.getSource() as Player;
                    const target = source.getServer().getPlayerManager().getPlayerByName(context.getArgument('player'));

                    await source.getServer().getPermissionManager().setOp(context.getArgument('player'), false);

                    if (target) {
                        const event = new ChatEvent(
                            new Chat(source, '§eYou are no longer op!', `*.player.${target.getName()}`)
                        );
                        await target.getServer().getEventManager().emit('chat', event);
                    }

                    return `Made ${context.getArgument('player')} no longer a server operator`;
                })
            )
        );
    }
}
