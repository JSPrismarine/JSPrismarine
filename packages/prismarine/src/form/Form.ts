import type IForm from './IForm';
import type Player from '../Player';

export default abstract class Form implements IForm {
    private title: string;
    private handler: (player: Player, data: any) => Promise<void>;

    public constructor(title: string, handler: (player: Player, data: any) => Promise<void>) {
        this.title = title;
        this.handler = handler;
    }

    /**
     * Replaces the Form's title.
     *
     * @param title - new title
     */
    public setTitle(title: string): void {
        this.title = title;
    }

    /**
     * Returns the Form's title.
     */
    public getTitle(): string {
        return this.title;
    }

    /**
     * Internal use only, form type defined serialization.
     */
    protected abstract serializeContent(): object;

    /**
     * Returns the Form's type.
     */
    protected abstract getType(): string;

    public async handleResponse(player: Player, data: object): Promise<void> {
        await this.handler(player, data);
    }

    public jsonSerialize(): string {
        return JSON.stringify({
            title: this.title,
            type: this.getType(),
            ...this.serializeContent()
        });
    }
}
