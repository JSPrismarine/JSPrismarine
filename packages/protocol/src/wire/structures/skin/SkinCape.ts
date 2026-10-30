import type SkinImage from './SkinImage';

interface SkinCapeData {
    id: string;
    image: SkinImage;
}

/** Cape identifier and pixel image carried inside a serialized player skin. */
export default class SkinCape {
    private readonly id: string;
    private readonly image: SkinImage;

    public constructor({ id, image }: SkinCapeData) {
        this.id = id;
        this.image = image;
    }

    /** Returns the cape's content identifier. */
    public getId(): string {
        return this.id;
    }

    /** Returns the cape image. */
    public getImage(): SkinImage {
        return this.image;
    }
}
