import type SkinImage from './SkinImage';

interface SkinCapeData {
    id: string;
    image: SkinImage;
}

class SkinCape {
    public id: string;
    public image: SkinImage;

    constructor(options: SkinCapeData) {
        this.id = options.id;
        this.image = options.image;
    }
}

module.exports = SkinCape;
