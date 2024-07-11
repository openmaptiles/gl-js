import {mat4} from 'gl-matrix';
import {OverscaledTileID} from '../source/tile_id';
import {SourceCache} from '../source/source_cache';
import {Tile} from '../source/tile';
import {Painter} from './painter';
import {Program} from './program';
import type {ZoomHistory} from '../style/zoom_history';
import type {Map} from '../ui/map';
import {ITransform} from '../geo/transform_interface';
import type {EvaluationParameters} from '../style/evaluation_parameters';
import type {FillLayerSpecification} from '@maplibre/maplibre-gl-style-spec';
import {Style} from '../style/style';
import {FillStyleLayer} from '../style/style_layer/fill_style_layer';
import {drawFill} from './draw_fill';
import {FillBucket} from '../data/bucket/fill_bucket';
import {ProgramConfiguration, ProgramConfigurationSet} from '../data/program_configuration';

jest.mock('./painter');
jest.mock('./program');
jest.mock('../source/source_cache');
jest.mock('../source/tile');
jest.mock('../data/bucket/symbol_bucket');
jest.mock('../symbol/projection');

describe('drawFill', () => {
    test('should call programConfiguration.setConstantPatternPositions for transitioning fill-pattern', () => {

        const painterMock: Painter = constructMockPainter();
        const layer: FillStyleLayer = constructMockLayer();

        const programMock = new Program(null as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
        (painterMock.useProgram as jest.Mock).mockReturnValue(programMock);

        const mockTile = constructMockTile(layer);

        const sourceCacheMock = new SourceCache(null as any, null as any, null as any);
        (sourceCacheMock.getTile as jest.Mock).mockReturnValue(mockTile);
        sourceCacheMock.map = {showCollisionBoxes: false} as any as Map;

        drawFill(painterMock, sourceCacheMock, layer, [mockTile.tileID]);

        // twice: first for fill, second for stroke
        expect(programMock.draw).toHaveBeenCalledTimes(2);

        const bucket: FillBucket = (mockTile.getBucket(layer) as any);
        const programConfiguration = bucket.programConfigurations.get(layer.id);

        expect(programConfiguration.setConstantPatternPositions).toHaveBeenCalled();
    });

    function constructMockLayer(): FillStyleLayer {
        const layerSpec = {
            id: 'mock-layer',
            source: 'empty-source',
            type: 'fill',
            layout: {},
            'paint': {
                'fill-pattern': 'pattern0'
            }
        } as FillLayerSpecification;
        const layer = new FillStyleLayer(layerSpec);
        layer.getCrossfadeParameters = () => ({} as any);
        layer.recalculate({zoom: 0, zoomHistory: {} as ZoomHistory} as EvaluationParameters, []);

        // Important: this setup is on purpose -- to NOT match layerspec
        // 'fill-pattern': 'pattern0'
        // so tile.imageAtlas.patternPositions['pattern0'] would return nothing
        // mimicing the transitioning fill-pattern value
        layer.getPaintProperty = () => {
            return 'pattern1';
        };

        return layer;
    }

    function constructMockPainter(): Painter {
        const painterMock = new Painter(null as any, null as any);
        painterMock.context = {
            gl: {},
            activeTexture: {
                set: () => {}
            }
        } as any;
        painterMock.renderPass = 'translucent';
        painterMock.transform = {
            pitch: 0,
            labelPlaneMatrix: mat4.create(),
            zoom: 0,
            angle: 0,
            getProjectionData(_canonical, fallback) {
                return {
                    'u_projection_matrix': fallback,
                    'u_projection_tile_mercator_coords': [0, 0, 1, 1],
                    'u_projection_clipping_plane': [0, 0, 0, 0],
                    'u_projection_transition': 0.0,
                    'u_projection_fallback_matrix': fallback,
                };
            },
        } as any as ITransform;
        painterMock.options = {} as any;
        painterMock.style = {
            map: {
                projection: {}
            }
        } as any as Style;

        return painterMock;
    }

    function constructMockTile(layer: FillStyleLayer): Tile {
        const tileId = new OverscaledTileID(1, 0, 1, 0, 0);
        tileId.terrainRttPosMatrix = mat4.create();

        const tile = new Tile(tileId, 256);
        tile.tileID = tileId;

        // Important: this setup is on purpose -- to NOT match layerspec
        // 'fill-pattern': 'pattern0'
        // so tile.imageAtlas.patternPositions['pattern0'] would return nothing
        // mimicing the transitioning fill-pattern value
        tile.imageAtlas = {
            patternPositions: {
                'pattern1': {}
            }
        } as any;
        tile.imageAtlasTexture = {
            bind: () => {}
        } as any;

        const bucketMock = constructMockBucket(layer);

        (tile.getBucket as jest.Mock).mockReturnValue(bucketMock);
        (tile.patternsLoaded as jest.Mock).mockReturnValue(true);
        return tile;
    }

    function constructMockBucket(layer: FillStyleLayer) {
        const bucketMock = new FillBucket({
            layers: [layer]
        } as any);

        const mockProgramConfigurations: ProgramConfigurationSet<FillStyleLayer> = {} as any;
        const mockProgramConfiguration: ProgramConfiguration = {} as any;
        mockProgramConfiguration.updatePaintBuffers = () => {};
        mockProgramConfiguration.setConstantPatternPositions = jest.fn();

        mockProgramConfigurations.get = () => mockProgramConfiguration;

        bucketMock.programConfigurations = mockProgramConfigurations;

        return bucketMock;
    }
});
