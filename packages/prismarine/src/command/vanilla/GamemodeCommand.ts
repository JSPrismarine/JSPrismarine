import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';
import { getGametypeId } from '@jsprismarine/minecraft';
import type Player from '../../Player';
import { Chat } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command } from '../Command';
import { CommandArgumentEntity, CommandArgumentGamemode } from '../CommandArguments';

/**
 * Manage a player's {@link Gametype} (gamemode).
 * @remarks the `/gamemode` command.
 */
export default class GamemodeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamemode',
            description: 'Changes gamemode for a player.',
            permission: 'minecraft.command.gamemode'
        });
    }

    private async setGamemode(source: Player, target: Player, gamemode: string) {
        if (!(target as any)) {
            const event = new ChatEvent(
                new Chat({
                    sender: source,
                    message: `Player is not online!`,
                    channel: `*.player.${source.getName()}`
                })
            );
            await source.getServer().emit('chat', event);
            return;
        }

        if (!target.isPlayer()) {
            const event = new ChatEvent(
                new Chat({
                    sender: source,
                    message: `Can't set ${source.getFormattedUsername()} to ${gamemode}`,

                    channel: `*.player.${source.getName()}`
                })
            );
            await source.getServer().emit('chat', event);
            return;
        }

        await target.setGamemode(getGametypeId(gamemode));
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

                                await Promise.all(
                                    targets.map(async (target) => await this.setGamemode(source, target, gamemode))
                                );
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
