import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { Chat } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command, argument, asyncCommand, literal } from '../Command';
import { PlayerArgumentCommand, getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class DeopCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:deop',
            description: `Remove a player's op status.`,
            permission: 'minecraft.command.deop'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('deop').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(
                    asyncCommand(async (context) => {
                        const source = context.getSource();
                        const username = getString(context, 'player');
                        const target = source.getServer().getSessionManager().getPlayerByExactName(username); // TODO: by name not exact

                        await source.getServer().getPermissionManager().setOp(username, false);

                        if (target) {
                            const event = new ChatEvent(
                                new Chat({
                                    sender: source,
                                    message: '§eYou are no longer op!',
                                    channel: `*.player.${target.getName()}`
                                })
                            );
                            await target.getServer().emit('chat', event);
                        }

                        return `Made ${username} no longer a server operator`;
                    })
                )
            )
        );
    }
}
