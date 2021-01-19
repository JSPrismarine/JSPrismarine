import Argument from './Argument';
import type CommandExecuter from '../CommandExecuter';
import { CommandParameterType } from '../../network/type/CommandParameter';
import Gamemode from '../../world/Gamemode';

export default class GamemodeArgument extends Argument<number> {
    public constructor() {
        super(
            'gamemode',
            false,
            CommandParameterType.String & CommandParameterType.Int
        );
    }
    public parse(executer: CommandExecuter, arg: string) {
        const validgm = /^(c(reative)?|s(urvival)?|spec(tator)?|a(dventure)?|[0-3])/gi; // haha filfat loves this

        if (validgm.test(arg)) {
            switch (arg.match(validgm)?.[0]!) {
                case '0':
                case 's':
                case 'survival':
                    return Gamemode.Survival;
                case '1':
                case 'c':
                case 'creative':
                    return Gamemode.Creative;
                case '2':
                case 'a':
                case 'adventure':
                    return Gamemode.Adventure;
                case '3':
                case 'spec':
                case 'spectator':
                    return Gamemode.Spectator;
                default:
                    return null;
            }
        }

        return null;
    }
}
