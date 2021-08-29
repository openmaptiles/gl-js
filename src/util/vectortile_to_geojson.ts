class Feature {
    type: "Feature";
    _geometry: GeoJSON.Geometry | undefined | null;
    properties: {};
    id: number | string | void;

    _vectorTileFeature: VectorTileFeature;

    constructor(vectorTileFeature: VectorTileFeature, z: number, x: number, y: number, id: string | number | void) {
        this.type = 'Feature';

        this._vectorTileFeature = vectorTileFeature;
        (vectorTileFeature as any)._z = z;
        (vectorTileFeature as any)._x = x;
        (vectorTileFeature as any)._y = y;

        this.properties = vectorTileFeature.properties;
        this.id = id;
    }

    get geometry(): GeoJSON.Geometry | undefined | null {
        if (this._geometry === undefined) {
            this._geometry = this._vectorTileFeature.toGeoJSON(
                (this._vectorTileFeature as any)._x,
                (this._vectorTileFeature as any)._y,
                (this._vectorTileFeature as any)._z).geometry;
        }
        return this._geometry;
    }

    set geometry(g: GeoJSON.Geometry | undefined | null) {
        this._geometry = g;
    }

    toJSON() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {_geometry, _vectorTileFeature, ...json} = this;
        json.geometry = this.geometry;
        return json;
    }
}

export default Feature;
