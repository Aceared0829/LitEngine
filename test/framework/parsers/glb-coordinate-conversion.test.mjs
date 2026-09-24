import { readFileSync } from 'node:fs';

import { expect } from 'chai';

import { legacyToUnrealMatrix, legacyToUnrealRotation, legacyToUnrealScale, legacyToUnrealVector } from '../../../src/core/math/coordinate-conversion.js';
import { Mat4 } from '../../../src/core/math/mat4.js';
import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { GltfExporter } from '../../../src/extras/exporters/gltf-exporter.js';
import { INTERPOLATION_CUBIC, INTERPOLATION_LINEAR } from '../../../src/framework/anim/constants.js';
import { AnimCurve } from '../../../src/framework/anim/evaluator/anim-curve.js';
import { AnimData } from '../../../src/framework/anim/evaluator/anim-data.js';
import { AnimTrack } from '../../../src/framework/anim/evaluator/anim-track.js';
import { Asset } from '../../../src/framework/asset/asset.js';
import { GltfAccessor } from '../../../src/framework/parsers/glb/gltf-accessor.js';
import { GlbContainerResource } from '../../../src/framework/parsers/glb-container-resource.js';
import { convertGltfToUnreal } from '../../../src/framework/parsers/glb-coordinate-conversion.js';
import { GlbParser } from '../../../src/framework/parsers/glb-parser.js';
import { GraphNode } from '../../../src/scene/graph-node.js';
import { createApp } from '../../app.mjs';
import { jsdomSetup, jsdomTeardown } from '../../jsdom.mjs';

const fixture = (name) => {
    const binary = readFileSync(new URL(`../../assets/${name}`, import.meta.url));
    const jsonLength = binary.readUInt32LE(12);
    const gltf = JSON.parse(binary.subarray(20, 20 + jsonLength).toString());
    const payload = 20 + jsonLength + 8;
    const views = (gltf.bufferViews ?? []).map((view) => {
        const bytes = Uint8Array.from(binary.subarray(payload + (view.byteOffset ?? 0), payload + (view.byteOffset ?? 0) + view.byteLength));
        if (view.byteStride) bytes.byteStride = view.byteStride;
        return bytes;
    });
    return { binary, gltf, views };
};

const values = (gltf, views, index) => Array.from(GltfAccessor.getData(gltf.accessors[index], views, true));
const near = (actual, expected) => {
    expect(actual).to.have.length(expected.length);
    actual.forEach((value, index) => expect(value).to.be.closeTo(expected[index], 0.00001));
};

const createGlb = (gltf) => {
    const json = Buffer.from(JSON.stringify(gltf));
    const jsonLength = (json.byteLength + 3) & ~3;
    const glb = Buffer.alloc(20 + jsonLength);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.byteLength, 8);
    glb.writeUInt32LE(jsonLength, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    glb.fill(0x20, 20);
    json.copy(glb, 20);
    return glb;
};

const parseGlb = (binary, app, options) => new Promise((resolve, reject) => {
    GlbParser.parse('coordinate-basis.glb', '', binary, app.graphicsDevice, app.assets, options, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
    });
});

describe('glTF Unreal coordinate import', function () {
    it('converts indexed mesh data and node transforms without changing the source GLB', function () {
        const { binary, gltf, views } = fixture('test.glb');
        const source = Buffer.from(binary);
        const primitive = gltf.meshes[0].primitives[0];
        const oldPosition = values(gltf, views, primitive.attributes.POSITION);
        const oldNormal = values(gltf, views, primitive.attributes.NORMAL);
        const oldIndices = values(gltf, views, primitive.indices);
        const oldMatrix = gltf.nodes.find(node => node.matrix)?.matrix;

        convertGltfToUnreal(gltf, views);

        near(values(gltf, views, primitive.attributes.POSITION).slice(0, 3), legacyToUnrealVector(new Vec3(oldPosition.slice(0, 3))).toArray());
        near(values(gltf, views, primitive.attributes.NORMAL).slice(0, 3), legacyToUnrealVector(new Vec3(oldNormal.slice(0, 3))).toArray());
        const indices = values(gltf, views, primitive.indices);
        expect(indices.slice(0, 3)).to.deep.equal([oldIndices[0], oldIndices[2], oldIndices[1]]);
        if (oldMatrix) {
            near(gltf.nodes.find(node => node.matrix).matrix, Array.from(legacyToUnrealMatrix(new Mat4().set(oldMatrix)).data));
        }
        expect(binary.equals(source)).to.equal(true);
    });

    it('converts translation, quaternion and nonuniform scale animation tracks', function () {
        const { gltf, views } = fixture('cube/cube.animation.glb');
        const animation = gltf.animations[0];
        const originals = animation.channels.map((channel) => {
            const index = animation.samplers[channel.sampler].output;
            return values(gltf, views, index);
        });
        convertGltfToUnreal(gltf, views);
        animation.channels.forEach((channel, channelIndex) => {
            const index = animation.samplers[channel.sampler].output;
            const actual = values(gltf, views, index);
            const original = originals[channelIndex];
            const path = channel.target.path;
            const size = path === 'rotation' ? 4 : 3;
            for (let offset = 0; offset < original.length; offset += size) {
                const sample = original.slice(offset, offset + size);
                let expected;
                if (path === 'rotation') {
                    const q = legacyToUnrealRotation(new Quat(...sample));
                    expected = [q.x, q.y, q.z, q.w];
                } else {
                    expected = (path === 'scale' ? legacyToUnrealScale : legacyToUnrealVector)(new Vec3(sample)).toArray();
                }
                near(actual.slice(offset, offset + size), expected);
            }
        });
    });

    it('converts tangent handedness, morph deltas and inverse bind matrices', function () {
        const sourceMatrix = new Mat4().setTRS(new Vec3(2, 3, 4), new Quat().setFromEulerAngles(15, 35, -20), new Vec3(2, 3, 4));
        const gltf = {
            nodes: [],
            meshes: [{ primitives: [{ mode: 4, indices: 0, attributes: { TANGENT: 1 }, targets: [{ POSITION: 2 }] }] }],
            skins: [{ inverseBindMatrices: 3 }],
            accessors: [
                { bufferView: 0, componentType: 5121, type: 'SCALAR', count: 3 },
                { bufferView: 1, componentType: 5126, type: 'VEC4', count: 1 },
                { bufferView: 2, componentType: 5126, type: 'VEC3', count: 1, min: [2, 3, 4], max: [2, 3, 4] },
                { bufferView: 3, componentType: 5126, type: 'MAT4', count: 1 }
            ]
        };
        const views = [
            Uint8Array.from([0, 1, 2]),
            new Uint8Array(new Float32Array([1, 0, 0, 1]).buffer),
            new Uint8Array(new Float32Array([2, 3, 4]).buffer),
            new Uint8Array(new Float32Array(sourceMatrix.data).buffer)
        ];

        convertGltfToUnreal(gltf, views);

        expect(values(gltf, views, 0)).to.deep.equal([0, 2, 1]);
        near(values(gltf, views, 1), [0, 1, 0, -1]);
        near(values(gltf, views, 2), [-4, 2, 3]);
        expect(gltf.accessors[2].min).to.deep.equal([-4, 2, 3]);
        near(values(gltf, views, 3), Array.from(legacyToUnrealMatrix(sourceMatrix).data));
    });

    it('rejects sparse spatial data, triangle strips and incompatible shared accessors', function () {
        const sparse = fixture('test.glb');
        const primitive = sparse.gltf.meshes[0].primitives[0];
        sparse.gltf.accessors[primitive.attributes.POSITION].sparse = { count: 1 };
        expect(() => convertGltfToUnreal(sparse.gltf, sparse.views)).to.throw(/dense/);

        const strip = fixture('test.glb');
        strip.gltf.meshes[0].primitives[0].mode = 5;
        expect(() => convertGltfToUnreal(strip.gltf, strip.views)).to.throw(/triangle list/);

        const shared = fixture('test.glb');
        shared.gltf.meshes[0].primitives[0].attributes.TEXCOORD_0 = shared.gltf.meshes[0].primitives[0].attributes.POSITION;
        expect(() => convertGltfToUnreal(shared.gltf, shared.views)).to.throw(/shared/);
    });

    it('uses the application coordinate mode by default and supports an explicit override', async function () {
        jsdomSetup();
        const app = createApp({ coordinateSystem: 'unreal' });
        let container;
        let root;
        try {
            const { binary } = fixture('test.glb');
            const resources = await parseGlb(binary, app);
            expect(resources.nodes).to.have.length.greaterThan(0);
            expect(resources.nodes.every(node => node.coordinateSystem === 'unreal')).to.equal(true);
            expect(resources.scenes.every(scene => scene.coordinateSystem === 'unreal')).to.equal(true);
            expect(resources.renders).to.have.length.greaterThan(0);

            container = new GlbContainerResource(
                resources,
                new Asset('Default GLB', 'container', { url: 'coordinate-basis.glb' }),
                app.assets,
                GlbParser.createDefaultMaterial()
            );
            root = container.instantiateRenderEntity();
            expect(root.coordinateSystem).to.equal('unreal');
            expect(root.children.every(child => child.coordinateSystem === 'unreal')).to.equal(true);

            const legacyResources = await parseGlb(binary, app, { coordinateSystem: 'legacy' });
            expect(legacyResources.nodes.every(node => node.coordinateSystem === 'legacy')).to.equal(true);
            expect(legacyResources.scenes.every(scene => scene.coordinateSystem === 'legacy')).to.equal(true);
        } finally {
            root?.destroy();
            container?.destroy();
            app.destroy();
            jsdomTeardown();
        }
    });

    it('keeps imported cameras, punctual lights and instantiated roots in the selected coordinate basis', async function () {
        jsdomSetup();
        const app = createApp();
        let unrealContainer;
        let legacyContainer;
        let unrealRoot;
        let legacyRoot;
        try {
            const binary = createGlb({
                asset: { version: '2.0' },
                scene: 0,
                scenes: [
                    { name: 'Camera and light', nodes: [0] },
                    { name: 'Second scene', nodes: [1] }
                ],
                nodes: [
                    { name: 'Camera and light node', camera: 0, extensions: { KHR_lights_punctual: { light: 0 } } },
                    { name: 'Second root' }
                ],
                cameras: [{ type: 'perspective', perspective: { yfov: 1, znear: 0.1, zfar: 100 } }],
                extensionsUsed: ['KHR_lights_punctual'],
                extensions: { KHR_lights_punctual: { lights: [{ type: 'directional' }] } }
            });

            const unrealData = await parseGlb(binary, app, { coordinateSystem: 'unreal' });
            unrealContainer = new GlbContainerResource(
                unrealData,
                new Asset('Unreal GLB', 'container', { url: 'coordinate-basis.glb' }, null, { coordinateSystem: 'unreal' }),
                app.assets,
                GlbParser.createDefaultMaterial()
            );
            unrealRoot = unrealContainer.instantiateRenderEntity();
            expect(unrealRoot.coordinateSystem).to.equal('unreal');
            expect(unrealRoot.children.every(child => child.coordinateSystem === 'unreal')).to.equal(true);
            const unrealCamera = unrealRoot.findComponents('camera')[0];
            expect(unrealCamera).to.exist;
            expect(unrealCamera.coordinateSystem).to.equal('unreal');
            expect(unrealCamera.camera.coordinateSystem).to.equal('unreal');
            const unrealLightEntity = unrealRoot.findComponents('light')[0]?.entity;
            expect(unrealLightEntity).to.exist;
            expect(unrealLightEntity.coordinateSystem).to.equal('unreal');
            expect(unrealLightEntity.getLocalRotation().equals(new Quat())).to.equal(true);
            expect(unrealContainer.model.resource.graph.coordinateSystem).to.equal('unreal');

            const legacyData = await parseGlb(binary, app, { coordinateSystem: 'legacy' });
            legacyContainer = new GlbContainerResource(
                legacyData,
                new Asset('Legacy GLB', 'container', { url: 'coordinate-basis.glb' }, null, { coordinateSystem: 'legacy' }),
                app.assets,
                GlbParser.createDefaultMaterial()
            );
            legacyRoot = legacyContainer.instantiateRenderEntity();
            expect(legacyRoot.coordinateSystem).to.equal('legacy');
            expect(legacyRoot.findComponents('camera')[0].camera.coordinateSystem).to.equal('legacy');
            const legacyLightEntity = legacyRoot.findComponents('light')[0]?.entity;
            expect(legacyLightEntity).to.exist;
            expect(legacyLightEntity.coordinateSystem).to.equal('legacy');
            expect(legacyLightEntity.getLocalRotation().equals(new Quat().setFromEulerAngles(90, 0, 0))).to.equal(true);
        } finally {
            unrealRoot?.destroy();
            legacyRoot?.destroy();
            unrealContainer?.destroy();
            legacyContainer?.destroy();
            app.destroy();
            jsdomTeardown();
        }
    });

    it('creates converted animation track data through the opt-in parser', async function () {
        jsdomSetup();
        const app = createApp();
        try {
            const { binary, gltf, views } = fixture('cube/cube.animation.glb');
            const animation = gltf.animations[0];
            const translation = animation.channels.find(channel => channel.target.path === 'translation');
            const source = values(gltf, views, animation.samplers[translation.sampler].output);
            const expected = legacyToUnrealVector(new Vec3(source.slice(0, 3))).toArray();
            const resources = await new Promise((resolve, reject) => {
                GlbParser.parse('cube.animation.glb', '', binary, app.graphicsDevice, app.assets, { coordinateSystem: 'unreal' }, [], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            expect(resources.animations).to.have.length(1);
            expect(resources.animations[0].outputs.some((output) => {
                return output.components === 3 && output.data.length >= 3 &&
                    output.data.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) < 0.00001);
            })).to.equal(true);
        } finally {
            app.destroy();
            jsdomTeardown();
        }
    });

    it('round-trips exported Unreal transform animation through the GLB parser', async function () {
        jsdomSetup();
        const app = createApp({ coordinateSystem: 'unreal' });
        try {
            const root = new GraphNode('Root');
            const animated = new GraphNode('Animated');
            const cubicAnimated = new GraphNode('CubicAnimated');
            root.addChild(animated);
            root.addChild(cubicAnimated);

            const input = new AnimData(1, new Float32Array([0, 1]));
            const position = new AnimData(3, new Float32Array([1, 2, 3, 4, 5, 6]));
            const rotation = new AnimData(4, new Float32Array([0, 0, 0, 1, 0, 0.5, 0, 0.5]));
            const scale = new AnimData(3, new Float32Array([2, 3, 4, 5, 6, 7]));
            const cubicPosition = new AnimData(3, new Float32Array([
                1, 2, 3, 4, 5, 6, 7, 8, 9,
                10, 11, 12, 13, 14, 15, 16, 17, 18
            ]));
            const path = (property, nodeName = 'Animated') => ({
                entityPath: ['Root', nodeName],
                component: 'graph',
                propertyPath: [property]
            });
            const track = new AnimTrack('Round trip', 1, [input], [position, rotation, scale, cubicPosition], [
                new AnimCurve([path('localPosition')], 0, 0, INTERPOLATION_LINEAR),
                new AnimCurve([path('localRotation')], 0, 1, INTERPOLATION_LINEAR),
                new AnimCurve([path('localScale')], 0, 2, INTERPOLATION_LINEAR),
                new AnimCurve([path('localPosition', 'CubicAnimated')], 0, 3, INTERPOLATION_CUBIC)
            ]);

            const glb = await new GltfExporter().build(root, { animations: [track] });
            const resources = await parseGlb(glb, app);
            const parsedTrack = resources.animations[0];
            expect(parsedTrack.name).to.equal('Round trip');

            const getOutput = (property, interpolation = INTERPOLATION_LINEAR) => {
                const curve = parsedTrack.curves.find((candidate) => {
                    return candidate.interpolation === interpolation &&
                        candidate.paths[0].propertyPath[0] === property;
                });
                expect(curve).to.exist;
                return parsedTrack.outputs[curve.output].data;
            };
            near(Array.from(getOutput('localPosition')), Array.from(position.data));
            near(Array.from(getOutput('localRotation')), Array.from(rotation.data));
            near(Array.from(getOutput('localScale')), Array.from(scale.data));
            near(Array.from(getOutput('localPosition', INTERPOLATION_CUBIC)), Array.from(cubicPosition.data));
        } finally {
            app.destroy();
            jsdomTeardown();
        }
    });
});
