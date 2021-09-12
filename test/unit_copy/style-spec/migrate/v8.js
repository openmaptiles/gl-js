import {test} from '../../../util/test';
import migrate from '../../../../rollup/build/tsc/style-spec/migrate/v8';

test('split text-font', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {
                "type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": "Helvetica, Arial",
                    "text-field": "{foo}"
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {
                "type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": ["Helvetica", "Arial"],
                    "text-field": "{foo}"
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('rename symbol-min-distance', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {
                "type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "symbol-min-distance": 2
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {
                "type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "symbol-spacing": 2
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('renames urls', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {
                "type": "video", "url": ["foo"],
                coordinates: [[1, 0], [1, 0], [1, 0], [1, 0]]
            }
        },
        "layers": []
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {
                "type": "video", "urls": ["foo"],
                coordinates: [[0, 1], [0, 1], [0, 1], [0, 1]]
            }
        },
        "layers": []
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('not migrate interpolated functions', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {
                "type": "vector",
                "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [{
            "id": "functions",
            "type": "symbol",
            "source": "vector",
            "source-layer": "layer",
            "layout": {
                "line-width": {
                    base: 2,
                    stops: [[1, 2], [3, 6]]
                }
            }
        }]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {
                "type": "vector",
                "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [{
            "id": "functions",
            "type": "symbol",
            "source": "vector",
            "source-layer": "layer",
            "layout": {
                "line-width": {
                    base: 2,
                    stops: [[1, 2], [3, 6]]
                }
            }
        }]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('not migrate piecewise-constant functions', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {
                "type": "vector",
                "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [{
            "id": "functions",
            "type": "symbol",
            "source": "vector",
            "source-layer": "layer",
            "layout": {
                "text-transform": {
                    stops: [[1, "uppercase"], [3, "lowercase"]],
                }
            }
        }]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {
                "type": "vector",
                "url": "mapbox://mapbox.mapbox-streets-v5"
            }
        },
        "layers": [{
            "id": "functions",
            "type": "symbol",
            "source": "vector",
            "source-layer": "layer",
            "layout": {
                "text-transform": {
                    stops: [[1, "uppercase"], [3, "lowercase"]],
                }
            }
        }]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('inline constants', (t) => {
    const input = {
        "version": 7,
        "constants": {
            "@foo": 0.5
        },
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "fill",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "fill-opacity": "@foo"
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "fill",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "fill-opacity": 0.5
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('migrate and inline fontstack constants', (t) => {
    const input = {
        "version": 7,
        "constants": {
            "@foo": "Arial Unicode,Foo Bar"
        },
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": "@foo"
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": ["Arial Unicode", "Foo Bar"]
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('update fontstack function', (t) => {
    const input = {
        "version": 7,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": {
                        "base": 1,
                        "stops": [
                            [
                                0,
                                "Open Sans Regular, Arial Unicode MS Regular"
                            ],
                            [
                                6,
                                "Open Sans Semibold, Arial Unicode MS Regular"
                            ]
                        ]
                    }
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": {
                        "base": 1,
                        "stops": [
                            [0, ["Open Sans Regular", "Arial Unicode MS Regular"]],
                            [6, ["Open Sans Semibold", "Arial Unicode MS Regular"]]
                        ]
                    }
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('inline and migrate fontstack constant function', (t) => {
    const input = {
        "version": 7,
        "constants": {
            "@function": {
                "base": 1,
                "stops": [
                    [
                        0,
                        "Open Sans Regular, Arial Unicode MS Regular"
                    ],
                    [
                        6,
                        "Open Sans Semibold, Arial Unicode MS Regular"
                    ]
                ]
            }
        },
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": "@function"
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": {
                        "base": 1,
                        "stops": [
                            [0, ["Open Sans Regular", "Arial Unicode MS Regular"]],
                            [6, ["Open Sans Semibold", "Arial Unicode MS Regular"]]
                        ]
                    }
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('update fontstack function constant', (t) => {
    const input = {
        "version": 7,
        "constants": {
            "@font-stack-a": "Open Sans Regular, Arial Unicode MS Regular",
            "@font-stack-b": "Open Sans Semibold, Arial Unicode MS Regular"
        },
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": {
                        "base": 1,
                        "stops": [
                            [0, "@font-stack-a"],
                            [6, "@font-stack-b"]
                        ]
                    }
                }
            }
        ]
    };

    const output = {
        "version": 8,
        "sources": {
            "vector": {"type": "vector", "url": "mapbox://mapbox.mapbox-streets-v5"}
        },
        "layers": [
            {
                "id": "minimum",
                "type": "symbol",
                "source": "vector",
                "source-layer": "layer",
                "layout": {
                    "text-font": {
                        "base": 1,
                        "stops": [
                            [0, ["Open Sans Regular", "Arial Unicode MS Regular"]],
                            [6, ["Open Sans Semibold", "Arial Unicode MS Regular"]]
                        ]
                    }
                }
            }
        ]
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('migrate UNversioned fontstack urls', (t) => {
    const input = {
        "version": 7,
        "glyphs": "mapbox://fontstack/{fontstack}/{range}.pbf",
        "layers": []
    };

    const output = {
        "version": 8,
        "glyphs": "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
        "layers": []
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});

test('migrate versioned fontstack urls', (t) => {
    const input = {
        "version": 7,
        "glyphs": "mapbox://fonts/v1/boxmap/{fontstack}/{range}.pbf",
        "layers": []
    };

    const output = {
        "version": 8,
        "glyphs": "mapbox://fonts/boxmap/{fontstack}/{range}.pbf",
        "layers": []
    };

    expect(migrate(input)).toEqual(output);
    t.end();
});
