import Argument from './Argument';
import type CommandExecuter from '../CommandExecuter';
import { CommandParameterType } from '../../network/type/CommandParameter';
import type Player from '../../player/Player';

export default class OnlinePlayerArgument extends Argument<Player> {
    public constructor() {
        super('player', false, CommandParameterType.Target);
    }

    public parse(executer: CommandExecuter, arg: string) {
        return executer.getServer().getPlayerManager().getPlayerByName(arg) || null;
    }
}
