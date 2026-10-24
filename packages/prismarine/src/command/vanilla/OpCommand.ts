import type { CommandDispatcher } from '@jsprismarine/brigadier';

import { PlayerNotFoundError } from '@jsprismarine/errors';
import { Chat } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command, argument, literal } from '../Command';
import { PlayerArgumentCommand, getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class OpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:op',
            description: 'Grant player op status.',
            permission: 'minecraft.command.op'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('op').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(async (context) => {
                    const source = context.getSource();
                    const username = getString(context, 'player');

                    const target = source.getServer().getSessionManager().getPlayerByExactName(username); // TODO: by name not exact
                    if (!target) throw new PlayerNotFoundError(username);

                    await source.getServer().getPermissionManager().setOp(username, true);

                    const event = new ChatEvent(
                        new Chat({
                            sender: source,
                            message: '§eYou are now op!',
                            channel: `*.player.${target.getName()}`
                        })
                    );
                    await target.getServer().emit('chat', event);

                    return `Made ${username} a server operator`;
                })
            )
        );
    }
}
