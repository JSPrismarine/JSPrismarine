import Argument from './Argument';
import type CommandExecuter from '../CommandExecuter';
import { CommandParameterType } from '../../network/type/CommandParameter';
import type Entity from '../../entity/entity';

export default class EntityArgument extends Argument<Entity[]> {
    public constructor() {
        super(
            'entity',
            false,
            CommandParameterType.String & CommandParameterType.Int
        );
    }

    public parse(executer: CommandExecuter, arg: string) {
        const validgm = /^@?(\w|_|[0-9]| |){0,}$/gi; // more regex for filfat :)

        if (validgm.test(arg)) {
            if (arg.startsWith('@')) {
                throw new Error('Entity Argument Not fully implemented');
            } else {
                return [
                    executer.getServer().getPlayerManager().getPlayerByName(arg)
                ];
            }
        }

        return null;
    }
}
