import { CommandArgumentEntity, CommandArgumentGamemode } from '../CommandArguments';
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Command from '../Command';
import Gamemode from '../../world/Gamemode';
import Player from '../../Player';

export default class GamemodeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamemode',
            description: 'Changes gamemode for a player.',
            permission: 'minecraft.command.gamemode'
        });
    }

    private async setGamemode(source: Player, target: Player, gamemode: string) {
        if (!target) {
            const event = new ChatEvent(
                new Chat(source, `Player is not online!`, [], false, `*.player.${source.getName()}`)
            );
            await source.getServer().getEventManager().emit('chat', event);
            return;
        }

        if (!target.isPlayer()) {
            const event = new ChatEvent(
                new Chat(
                    source,
                    `Can't set ${source.getFormattedUsername()} to ${gamemode}`,
                    [],
                    false,
                    `*.player.${source.getName()}`
                )
            );
            await source.getServer().getEventManager().emit('chat', event);
            return;
        }

        await target.setGamemode(Gamemode.getGamemodeId(gamemode));
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('gamemode').then(
                argument('gamemode', new CommandArgumentGamemode())
                    .then(
                        argument('player', new CommandArgumentEntity({ name: 'player', optional: true })).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const targets = context.getArgument('player') as Player[];

                                const gamemode = context.getArgument('gamemode') as string;

                                if (!targets.length) throw new Error(`Cannot find player`);

                                targets.forEach(async (target) => this.setGamemode(source, target, gamemode));
                            }
                        )
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        const gamemode = context.getArgument('gamemode') as string;

                        await this.setGamemode(source, source, gamemode);
                    })
            )
        );
    }
}
