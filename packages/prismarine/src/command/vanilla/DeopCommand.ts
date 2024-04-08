import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';
import { Chat } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command } from '../Command';
import type Player from '../../Player';
import { PlayerArgumentCommand } from '../CommandArguments';

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
                    const target = source
                        .getServer()
                        .getSessionManager()
                        .getPlayerByExactName(context.getArgument('player')); // TODO: by name not exact

                    await source.getServer().getPermissionManager().setOp(context.getArgument('player'), false);

                    if (target) {
                        const event = new ChatEvent(
                            new Chat({
                                sender: source,
                                message: '§eYou are no longer op!',
                                channel: `*.player.${target.getName()}`
                            })
                        );
                        await target.getServer().getEventManager().emit('chat', event);
                    }

                    return `Made ${context.getArgument('player')} no longer a server operator`;
                })
            )
        );
    }
}
