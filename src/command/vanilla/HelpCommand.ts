import { CommandDispatcher, literal } from '@jsprismarine/brigadier';
import Command from '../Command';
import type Player from '../../player/Player';

export default class HelpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:help',
            description: 'Get helpful information about commands.',
            aliases: ['?']
        } as any);
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        const execute = async (context: any) => {
            const source: Player = context.getSource();

            const commands: string[] = [];
            source
                .getServer()
                .getCommandManager()
                .getCommands()
                .forEach((command) => {
                    commands.push(
                        `§e${command.id.split(':')[1]}§r: §7${
                            command.description
                        }`
                    );
                });

            await source.sendMessage(commands.join('\n'));
        };

        dispatcher.register(literal('help').executes(execute as any));
    }
}
