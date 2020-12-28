import CommandParameter from './CommandParameter';

interface CommandData {
    id: string;
    name: string;
    description: string;
    aliases: string[];
    flags: number;
    parameters: Set<CommandParameter>;
    permission: string;
}

export default CommandData;
