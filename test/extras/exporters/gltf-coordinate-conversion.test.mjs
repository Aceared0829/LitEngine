import { expect } from 'chai';

import { Mat4 } from '../../../src/core/math/mat4.js';
import { Quat } from '../../../src/core/math/quat.js';
import { convertUnrealInverseBindMatricesToGltf } from '../../../src/extras/exporters/gltf-coordinate-conversion.js';
import { GltfExporter } from '../../../src/extras/exporters/gltf-exporter.js';
import { INTERPOLATION_CUBIC, INTERPOLATION_LINEAR, INTERPOLATION_STEP } from '../../../src/framework/anim/constants.js';
import { AnimCurve } from '../../../src/framework/anim/evaluator/anim-curve.js';
import { AnimData } from '../../../src/framework/anim/evaluator/anim-data.js';
import { AnimTrack } from '../../../src/framework/anim/evaluator/anim-track.js';
import { SEMANTIC_TANGENT } from '../../../src/platform/graphics/constants.js';
import { NullGraphicsDevice } from '../../../src/platform/graphics/null/null-graphics-device.js';
import { GraphNode } from '../../../src/scene/graph-node.js';
import { StandardMaterial } from '../../../src/scene/materials/standard-material.js';
import { MeshInstance } from '../../../src/scene/mesh-instance.js';
import { Mesh } from '../../../src/scene/mesh.js';

describe('glTF Unreal-coordinate export', function () {
    let device;

    beforeEach(function () {
        device = new NullGraphicsDevice({ id: 'gltf-unreal-coordinate-export-test' });
    });

    afterEach(function () {
        device.destroy();
    });

    const createScene = () => {
        const root = new GraphNode('Root');
        const node = new GraphNode('Mesh');
        root.addChild(node);

        const mesh = new Mesh(device);
        mesh.setPositions([
            1, 2, 3,
            4, 5, 6,
            7, 8, 9
        ]);
        mesh.setNormals([
            0, 0, 1,
            0, 0, 1,
            0, 0, 1
        ]);
        mesh.setVertexStream(SEMANTIC_TANGENT, [
            1, 0, 0, 1,
            1, 0, 0, 1,
            1, 0, 0, 1
        ], 4);
        mesh.setIndices([0, 1, 2]);
        mesh.update();

        const meshInstance = new MeshInstance(mesh, new StandardMaterial(), node);
        node.render = {
            enabled: true,
            meshInstances: [meshInstance]
        };

        return { root, node, mesh };
    };

    const readGlb = (buffer) => {
        const view = new DataView(buffer);
        const jsonLength = view.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim());
        const binaryOffset = 20 + jsonLength + 8;
        return { json, binaryOffset };
    };

    const readFloatAccessor = (buffer, json, binaryOffset, accessor) => {
        const bufferView = json.bufferViews[accessor.bufferView];
        const components = accessor.type === 'SCALAR' ? 1 : accessor.type === 'VEC4' ? 4 : 3;
        const stride = bufferView.byteStride ?? components * 4;
        const data = new DataView(buffer);
        const values = [];
        for (let vertex = 0; vertex < accessor.count; vertex++) {
            for (let component = 0; component < components; component++) {
                const offset = binaryOffset + bufferView.byteOffset + (accessor.byteOffset ?? 0) +
                    vertex * stride + component * 4;
                values.push(data.getFloat32(offset, true));
            }
        }
        return values;
    };

    const normalizeNegativeZero = values => values.map(value => (Object.is(value, -0) ? 0 : value));

    it('exports Unreal transforms, geometry and winding in the glTF basis without changing source data', async function () {
        const { root, node, mesh } = createScene();
        node.setLocalPosition(1, 2, 3);
        node.setLocalRotation(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
        node.setLocalScale(2, 3, 4);

        const sourcePositions = [];
        mesh.getPositions(sourcePositions);
        const sourceIndices = [];
        mesh.getIndices(sourceIndices);

        const glb = await new GltfExporter().build(root);
        const { json, binaryOffset } = readGlb(glb);
        const nodeIndex = json.nodes.findIndex(item => item.name === 'Mesh');
        const exportedNode = json.nodes[nodeIndex];
        const primitive = json.meshes[exportedNode.mesh].primitives[0];
        const positionAccessor = json.accessors[primitive.attributes.POSITION];
        const positions = readFloatAccessor(glb, json, binaryOffset, positionAccessor);
        const indexAccessor = json.accessors[primitive.indices];
        const indexView = json.bufferViews[indexAccessor.bufferView];
        const indices = Array.from(new Uint16Array(
            glb,
            binaryOffset + indexView.byteOffset,
            indexAccessor.count
        ));
        const readAttribute = semantic => readFloatAccessor(
            glb,
            json,
            binaryOffset,
            json.accessors[primitive.attributes[semantic]]
        );

        expect(exportedNode.translation).to.deep.equal([2, 3, -1]);
        expect(exportedNode.rotation[0]).to.equal(0);
        expect(exportedNode.rotation[1]).to.be.closeTo(-Math.SQRT1_2, 1e-6);
        expect(exportedNode.rotation[2]).to.equal(0);
        expect(exportedNode.rotation[3]).to.be.closeTo(Math.SQRT1_2, 1e-6);
        expect(exportedNode.scale).to.deep.equal([3, 4, 2]);
        expect(positions).to.deep.equal([2, 3, -1, 5, 6, -4, 8, 9, -7]);
        expect(positionAccessor.min).to.deep.equal([2, 3, -7]);
        expect(positionAccessor.max).to.deep.equal([8, 9, -1]);
        expect(normalizeNegativeZero(readAttribute('NORMAL'))).to.deep.equal([0, 1, 0, 0, 1, 0, 0, 1, 0]);
        expect(normalizeNegativeZero(readAttribute('TANGENT'))).to.deep.equal([
            0, 0, -1, -1,
            0, 0, -1, -1,
            0, 0, -1, -1
        ]);
        expect(indices).to.deep.equal([0, 2, 1]);
        const positionsAfterExport = [];
        mesh.getPositions(positionsAfterExport);
        const indicesAfterExport = [];
        mesh.getIndices(indicesAfterExport);
        expect(positionsAfterExport).to.deep.equal(sourcePositions);
        expect(indicesAfterExport).to.deep.equal(sourceIndices);
    });

    it('leaves legacy exports unchanged by default', async function () {
        const { root, node } = createScene();
        root.coordinateSystem = 'legacy';
        node.coordinateSystem = 'legacy';
        const glb = await new GltfExporter().build(root);
        const { json, binaryOffset } = readGlb(glb);
        const primitive = json.meshes[0].primitives[0];
        const positionAccessor = json.accessors[primitive.attributes.POSITION];
        const positions = readFloatAccessor(glb, json, binaryOffset, positionAccessor);

        expect(positions).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(json.accessors[primitive.indices].componentType).to.equal(5123);
        const indexView = json.bufferViews[json.accessors[primitive.indices].bufferView];
        expect(Array.from(new Uint16Array(glb, binaryOffset + indexView.byteOffset, 3))).to.deep.equal([0, 1, 2]);
    });

    it('exports selected Unreal transform tracks and preserves interpolation data', async function () {
        const root = new GraphNode('Root');
        const animated = new GraphNode('Animated');
        root.addChild(animated);

        const input = new AnimData(1, new Float32Array([0, 1]));
        const position = new AnimData(3, new Float32Array([1, 2, 3, 4, 5, 6]));
        const rotation = new AnimData(4, new Float32Array([0.25, 0.5, 0.75, 1, -0.25, -0.5, -0.75, 1]));
        const scale = new AnimData(3, new Float32Array([2, 3, 4, 5, 6, 7]));
        const path = property => ({
            entityPath: ['Root', 'Animated'],
            component: 'graph',
            propertyPath: [property]
        });
        const track = new AnimTrack('Transform', 1, [input], [position, rotation, scale], [
            new AnimCurve([path('localPosition')], 0, 0, INTERPOLATION_LINEAR),
            new AnimCurve([path('localRotation')], 0, 1, INTERPOLATION_LINEAR),
            new AnimCurve([path('localScale')], 0, 2, INTERPOLATION_STEP)
        ]);

        const glb = await new GltfExporter().build(root, { animations: [track] });
        const { json, binaryOffset } = readGlb(glb);
        const animation = json.animations[0];

        expect(animation.name).to.equal('Transform');
        expect(animation.channels.map(channel => channel.target.path)).to.deep.equal([
            'translation', 'rotation', 'scale'
        ]);
        expect(animation.channels.every(channel => channel.target.node === 1)).to.equal(true);
        expect(animation.samplers.map(sampler => sampler.interpolation)).to.deep.equal([
            'LINEAR', 'LINEAR', 'STEP'
        ]);

        const channelValues = animation.channels.map((channel) => {
            const accessor = json.accessors[animation.samplers[channel.sampler].output];
            expect(accessor.componentType).to.equal(5126);
            return readFloatAccessor(glb, json, binaryOffset, accessor);
        });
        expect(channelValues[0]).to.deep.equal([2, 3, -1, 5, 6, -4]);
        expect(channelValues[1]).to.deep.equal([-0.5, -0.75, 0.25, 1, 0.5, 0.75, -0.25, 1]);
        expect(channelValues[2]).to.deep.equal([3, 4, 2, 6, 7, 5]);
        const firstInput = json.accessors[animation.samplers[0].input];
        expect(firstInput.type).to.equal('SCALAR');
        expect(firstInput.min).to.deep.equal([0]);
        expect(firstInput.max).to.deep.equal([1]);
        expect(readFloatAccessor(glb, json, binaryOffset, firstInput)).to.deep.equal([0, 1]);
        expect(position.data).to.deep.equal(new Float32Array([1, 2, 3, 4, 5, 6]));
        expect(rotation.data).to.deep.equal(new Float32Array([0.25, 0.5, 0.75, 1, -0.25, -0.5, -0.75, 1]));
        expect(scale.data).to.deep.equal(new Float32Array([2, 3, 4, 5, 6, 7]));

        const legacyGlb = await new GltfExporter().build(root, { coordinateSystem: 'legacy', animations: [track] });
        const { json: legacyJson, binaryOffset: legacyBinaryOffset } = readGlb(legacyGlb);
        const legacyTranslation = legacyJson.accessors[legacyJson.animations[0].samplers[0].output];
        expect(readFloatAccessor(legacyGlb, legacyJson, legacyBinaryOffset, legacyTranslation)).to.deep.equal([
            1, 2, 3, 4, 5, 6
        ]);
    });

    it('converts CUBICSPLINE values and tangents and rejects unresolved target paths', async function () {
        const root = new GraphNode('Root');
        const animated = new GraphNode('Animated');
        root.addChild(animated);
        const input = new AnimData(1, [0, 1]);
        const cubic = new AnimData(3, [
            1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18
        ]);
        const track = new AnimTrack('Cubic', 1, [input], [cubic], [new AnimCurve([{
            entityPath: ['Root', 'Animated'],
            component: 'graph',
            propertyPath: ['localPosition']
        }], 0, 0, INTERPOLATION_CUBIC)]);

        const glb = await new GltfExporter().build(root, { animations: [track] });
        const { json, binaryOffset } = readGlb(glb);
        const sampler = json.animations[0].samplers[0];
        const accessor = json.accessors[sampler.output];
        expect(sampler.interpolation).to.equal('CUBICSPLINE');
        expect(accessor.count).to.equal(6);
        expect(readFloatAccessor(glb, json, binaryOffset, accessor)).to.deep.equal([
            2, 3, -1, 5, 6, -4, 8, 9, -7,
            11, 12, -10, 14, 15, -13, 17, 18, -16
        ]);

        const unresolved = new AnimTrack('Missing', 1, [input], [new AnimData(3, [0, 0, 0, 1, 1, 1])], [
            new AnimCurve([{
                entityPath: ['Root', 'Missing'],
                component: 'graph',
                propertyPath: ['localPosition']
            }], 0, 0, INTERPOLATION_LINEAR)
        ]);
        let error;
        try {
            await new GltfExporter().build(root, { animations: [unresolved] });
        } catch (caught) {
            error = caught;
        }
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include('resolves to 0 nodes');
    });

    it('converts Unreal inverse-bind matrices without modifying the input', function () {
        const source = new Float32Array(new Mat4().setTranslate(1, 2, 3).data);
        const converted = convertUnrealInverseBindMatricesToGltf(source);
        const matrix = new Float32Array(converted.buffer, converted.byteOffset, 16);

        expect(Array.from(matrix.slice(12, 15))).to.deep.equal([2, 3, -1]);
        expect(Array.from(source.slice(12, 15))).to.deep.equal([1, 2, 3]);
    });
});
