import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Command from '../Command';
import Player from '../../player/Player';

export default class OpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:op',
            description: 'Grant player op status.',
            permission: 'minecraft.command.op'
        } as any);

        this.parameters = [new Set()];

        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: true
            })
        );
    }

    public async execute(sender: Player, args: any[]) {
        if (args.length <= 0) {
            const event = new ChatEvent(
                new Chat(
                    sender,
                    '§cYou need to specify a player',
                    `*.player.${sender.getUsername()}`
                )
            );
            await sender.getServer().getEventManager().emit('chat', event);
            return;
        }

        const target = sender.getServer().getPlayerByName(args[0]);
        await sender
            .getServer()
            .getPermissionManager()
            .setOp(target?.getUsername() ?? args[0], true);

        if (target) {
            const event = new ChatEvent(
                new Chat(
                    sender,
                    '§eYou are now op!',
                    `*.player.${target.getUsername()}`
                )
            );
            await sender.getServer().getEventManager().emit('chat', event);
        }

        return `Made ${args[0] || sender.getUsername()} a server operator`;
    }
}
