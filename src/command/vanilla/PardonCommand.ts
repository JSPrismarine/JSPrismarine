import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

import Command from '../Command';
import Player from '../../player/Player';

export default class PardonCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:pardon',
            description: 'Pardon a player.',
            permission: 'minecraft.command.pardon'
        } as any);

        this.parameters = [new Set()];

        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: false
            })
        );
    }

    public async execute(sender: Player, args: any[]) {
        if (args.length <= 0) {
            await sender.sendMessage('§cYou have to specify a target.');
            return;
        }

        await sender.getServer().getBanManager().setUnbanned(args[0]);
        return `Unbanned ${args[0] || sender.getUsername()}`;
    }
}
