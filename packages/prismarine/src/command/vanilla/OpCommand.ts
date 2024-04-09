import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command } from '../Command';
import type Player from '../../Player';
import { PlayerArgumentCommand } from '../CommandArguments';

export default class OpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:op',
            description: 'Grant player op status.',
            permission: 'minecraft.command.op'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('op').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(async (context) => {
                    const source = context.getSource() as Player;
                    const target = source
                        .getServer()
                        .getPlayerManager()
                        .getPlayerByExactName(context.getArgument('player')); // TODO: by name not exact

                    await source.getServer().getPermissionManager().setOp(context.getArgument('player'), true);

                    if (target) {
                        const event = new ChatEvent(
                            new Chat(source, '§eYou are now op!', [], false, `*.player.${target.getName()}`)
                        );
                        await target.getServer().getEventManager().emit('chat', event);
                    }

                    return `Made ${context.getArgument('player')} a server operator`;
                })
            )
        );
    }
}
