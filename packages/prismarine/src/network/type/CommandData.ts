import CommandParameter from './CommandParameter';

interface CommandData {
    name: string;
    description: string;
    aliases?: string[];
    flags?: number;
    parameters?: Set<CommandParameter>;
    permission?: string;
}

export default CommandData;
