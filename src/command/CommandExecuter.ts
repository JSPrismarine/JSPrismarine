import Prismarine from '../Prismarine';

export default interface CommandExecuter {
    getServer(): Prismarine;
    sendMessage(message: string, xuid?: string, needTranslation?: string): void;
    getUsername(): string;
    getFormattedUsername(): string;
}
