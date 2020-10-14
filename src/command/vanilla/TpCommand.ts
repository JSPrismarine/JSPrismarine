import CommandParameter, { CommandParameterType } from '../../network/type/CommandParameter';
import Player from '../../player';
import Command from '../';
import MovementType from '../../network/type/MovementType';

export default class TpCommand extends Command {
    constructor() {
        super({ namespace: 'minecraft', name: 'tp', description: 'Teleports a player to a specified location' });

        // /tp <x> <y> <z>
        // /tp <player> <x> <y> <z>
        // /tp <player> <player>
        // /tp <player>

        //TODO: Add parameters

        //this.parameters = [];

        
    }


    // /tp -> <x> <y> <z>
    // /tp <player> -> <x> <y> <z>
    // /tp <player> -> <player>
    // /tp -> <player>
    
    public execute(sender: Player, args: Array<string>): void {

        if (typeof args[0] == 'number') {
            // /tp -> <x> <y> <z>
            if (typeof args[1] == 'number' && typeof args[2] == 'number') {

                sender.x = args[0];
                sender.y = args[1];
                sender.z = args[2];
                sender.broadcastMove(sender, MovementType.Teleport);

                sender.sendMessage(`You have been teleported to ${args[0]}, ${args[1]}, ${args[2]}`);
                sender.sendMessage(`Teleported ${sender.name} to ${args[0]}, ${args[1]}, ${args[2]}`);

            } else {
                sender.sendMessage('§cSyntax error: Invalid position!');
            }
        } else if (typeof args[0] == 'string') {
            // /tp <player> -> <x> <y> <z>

            if (typeof args[1] == 'number') {

                if (typeof args[2] == 'number' && typeof args[3] == 'number') {
                    let target = sender.getServer().getPlayerByName(args[0]);
    
                    if (target) {
    
                        target.x = args[1];
                        target.y = args[2];
                        target.z = args[3];
    
                        target.broadcastMove(target, MovementType.Teleport);
    
                        target.sendMessage(`You have been teleported to ${args[1]}, ${args[2]}, ${args[3]}`);
                        sender.sendMessage(`Teleported ${target.name} to ${args[1]}, ${args[2]}, ${args[3]}`);
    
                    } else {
                        sender.sendMessage('§cNo targets matched selector!');
                    }
                } else {
                    sender.sendMessage('§cSyntax error: Invalid position!');
                }

            } else if (typeof args[1] == 'string') {
                // /tp <player> -> <player>

                let targetFrom = sender.getServer().getPlayerByName(args[0]);
                let targetTo = sender.getServer().getPlayerByName(args[0]);

                if (targetFrom && targetTo) {

                    targetFrom.x = targetTo.x;
                    targetFrom.y = targetTo.y;
                    targetFrom.z = targetTo.z;

                    targetFrom.broadcastMove(targetFrom, MovementType.Teleport);

                    targetFrom.sendMessage(`You have been teleported to ${targetTo.name}`);
                    sender.sendMessage(`Teleported ${targetFrom.name} to ${targetTo.name}`);

                } else {
                    sender.sendMessage('§cNo targets matched selector!');
                }

            } else {
                // /tp -> <player>

                let target = sender.getServer().getPlayerByName(args[0]);

                if (target) {

                    sender.x = target.x;
                    sender.y = target.y;
                    sender.z = target.z;
                    sender.broadcastMove(sender, MovementType.Teleport);

                    sender.sendMessage(`You have been teleported to ${target.name}`);
                    sender.sendMessage(`Teleported ${sender.name} to ${target.name}`);

                } else {
                    sender.sendMessage('Player not found!');
                }
            }

        }
        return;
    }
}
