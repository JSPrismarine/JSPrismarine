import type SkinImage from './SkinImage';

interface SkinCapeData {
    id: string;
    image: SkinImage;
}

export default class SkinCape {
    private readonly id: string;
    private readonly image: SkinImage;

    public constructor({ id, image }: SkinCapeData) {
        this.id = id;
        this.image = image;
    }

    public getId(): string {
        return this.id;
    }

    public getImage(): SkinImage {
        return this.image;
    }
}
