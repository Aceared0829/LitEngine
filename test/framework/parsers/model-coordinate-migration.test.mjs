import { readFileSync } from 'node:fs';

import { expect } from 'chai';

import {
    legacyToUnrealMatrix,
    legacyToUnrealPaper2DMatrix,
    legacyToUnrealPaper2DRotation,
    legacyToUnrealRotation,
    unrealEulerToRotation
} from '../../../src/core/math/coordinate-conversion.js';
import { Mat4 } from '../../../src/core/math/mat4.js';
import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { JsonModelParser } from '../../../src/framework/parsers/json-model.js';
import {
    migrateLegacyModel,
    migrateLegacyPaper2DModel,
    previewMigratedModel
} from '../../../src/framework/parsers/model-coordinate-migration.js';
import { NullGraphicsDevice } from '../../../src/platform/graphics/null/null-graphics-device.js';
import { StandardMaterial } from '../../../src/scene/materials/standard-material.js';
import { setProgramLibrary } from '../../../src/scene/shader-lib/get-program-library.js';
import { shaderChunksGLSL } from '../../../src/scene/shader-lib/glsl/collections/shader-chunks-glsl.js';
import { ProgramLibrary } from '../../../src/scene/shader-lib/program-library.js';
import { ShaderChunks } from '../../../src/scene/shader-lib/shader-chunks.js';
import { jsdomSetup, jsdomTeardown } from '../../jsdom.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../../assets/${name}/${name}.json`, import.meta.url), 'utf8'));

describe('JSON model coordinate migration', function () {
    it('converts plane vertices, normals, bounds and triangle winding', function () {
        const source = fixture('plane');
        const original = structuredClone(source);
        const migrated = migrateLegacyModel(source);
        expect(source).to.deep.equal(original);
        expect(migrated.model.vertices[0].position.data.slice(0, 3)).to.deep.equal([-0.5, 0.5, 0]);
        expect(migrated.model.vertices[0].normal.data.slice(0, 3).map(value => value || 0)).to.deep.equal([0, 0, 1]);
        expect(migrated.model.meshes[0].indices).to.deep.equal([0, 2, 1, 2, 3, 1]);
        expect(migrated.model.meshes[0].aabb.min.map(value => value || 0)).to.deep.equal([-0.5, -0.5, 0]);
        expect(migrated.model.meshes[0].aabb.max.map(value => value || 0)).to.deep.equal([0.5, 0.5, 0]);
        const preview = previewMigratedModel(migrated);
        expect(preview.model.meshes[0].indices).to.deep.equal(source.model.meshes[0].indices);
        expect(preview.model.vertices[0].position.data.map(value => value || 0)).to.deep.equal(source.model.vertices[0].position.data);
        expect(migrateLegacyModel(migrated)).to.deep.equal(migrated);
    });

    it('converts mixed node rotation, XYZ scale, tangents, skin matrices and morph deltas', function () {
        const source = fixture('plane');
        const model = source.model;
        model.nodes[1].position = [2, 3, 4];
        model.nodes[1].rotation = [23, -41, 67];
        model.nodes[1].scale = [2, 3, 4];
        model.vertices[0].tangent = { type: 'float32', components: 4, data: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1] };
        const inverseBind = new Mat4().setTRS(new Vec3(2, 3, 4), new Quat().setFromEulerAngles(23, -41, 67), new Vec3(2, 3, 4));
        model.skins = [{ boneNames: ['RootNode'], inverseBindMatrices: [Array.from(inverseBind.data)] }];
        model.morphs = [{ targets: [{
            aabb: { min: [-1, -2, -3], max: [1, 2, 3] },
            deltaPositions: [2, 3, 4],
            deltaNormals: [0, 1, 0]
        }] }];
        const migrated = migrateLegacyModel(source);
        expect(migrated.model.nodes[1].position).to.deep.equal([-4, 2, 3]);
        expect(migrated.model.nodes[1].scale).to.deep.equal([4, 2, 3]);
        const actual = unrealEulerToRotation(new Vec3(migrated.model.nodes[1].rotation));
        expect(Math.abs(actual.dot(legacyToUnrealRotation(new Quat().setFromEulerAngles(23, -41, 67))))).to.be.closeTo(1, 1e-5);
        const legacyMatrix = new Mat4().setTRS(new Vec3(2, 3, 4), new Quat().setFromEulerAngles(23, -41, 67), new Vec3(2, 3, 4));
        const migratedMatrix = new Mat4().setTRS(new Vec3(migrated.model.nodes[1].position), actual, new Vec3(migrated.model.nodes[1].scale));
        const expectedMatrix = legacyToUnrealMatrix(legacyMatrix);
        expect(Array.from(migratedMatrix.data).every((value, index) => Math.abs(value - expectedMatrix.data[index]) < 1e-5)).to.be.true;
        expect(migrated.model.vertices[0].tangent.data.slice(0, 4).map(value => value || 0)).to.deep.equal([0, 1, 0, -1]);
        expect(migrated.model.morphs[0].targets[0].deltaPositions).to.deep.equal([-4, 2, 3]);
        expect(migrated.model.morphs[0].targets[0].deltaNormals.map(value => value || 0)).to.deep.equal([0, 0, 1]);
        expect(migrated.model.morphs[0].targets[0].aabb.min).to.deep.equal([-3, -1, -2]);
        const expected = legacyToUnrealMatrix(inverseBind);
        const matrix = migrated.model.skins[0].inverseBindMatrices[0];
        expect(matrix.every((value, index) => Math.abs(value - expected.data[index]) < 1e-5)).to.be.true;
        const preview = previewMigratedModel(migrated);
        expect(preview.model.nodes[1].scale).to.deep.equal([2, 3, 4]);
        expect(preview.model.vertices[0].tangent.data.slice(0, 4).map(value => value || 0)).to.deep.equal([1, 0, 0, 1]);
    });

    it('converts Paper2D node transforms, XY geometry, winding, skins, and morphs to XZ', function () {
        const source = fixture('plane');
        source.model.vertices[0].position.data = [
            0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0
        ];
        source.model.vertices[0].normal.data = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
        source.model.meshes[0].aabb = { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] };
        source.model.nodes[1].position = [2, 3, 4];
        source.model.nodes[1].rotation = [23, -41, 67];
        source.model.nodes[1].scale = [2, 3, 4];
        source.model.vertices[0].tangent = {
            type: 'float32',
            components: 4,
            data: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]
        };
        const inverseBind = new Mat4().setTRS(
            new Vec3(2, 3, 4), new Quat().setFromEulerAngles(23, -41, 67), new Vec3(2, 3, 4));
        source.model.skins = [{ boneNames: ['RootNode'], inverseBindMatrices: [Array.from(inverseBind.data)] }];
        source.model.morphs = [{ targets: [{
            aabb: { min: [-1, -2, -3], max: [1, 2, 3] },
            deltaPositions: [2, 3, 4],
            deltaNormals: [0, 0, 1]
        }] }];
        const original = structuredClone(source);

        const migrated = migrateLegacyPaper2DModel(source);
        expect(source).to.deep.equal(original);
        expect(migrated.model.nodes[1].position).to.deep.equal([2, 4, 3]);
        expect(migrated.model.nodes[1].scale).to.deep.equal([2, 4, 3]);
        const actual = unrealEulerToRotation(new Vec3(migrated.model.nodes[1].rotation));
        expect(Math.abs(actual.dot(legacyToUnrealPaper2DRotation(
            new Quat().setFromEulerAngles(23, -41, 67))))).to.be.closeTo(1, 1e-5);
        expect(migrated.model.vertices[0].position.data.slice(0, 3)).to.deep.equal([0.5, 0, 0.5]);
        expect(migrated.model.vertices[0].normal.data.slice(0, 3)).to.deep.equal([0, 1, 0]);
        expect(migrated.model.vertices[0].tangent.data.slice(0, 4)).to.deep.equal([1, 0, 0, -1]);
        expect(migrated.model.meshes[0].indices).to.deep.equal([0, 2, 1, 2, 3, 1]);
        expect(migrated.model.meshes[0].aabb).to.deep.equal({ min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] });
        expect(migrated.model.morphs[0].targets[0].deltaPositions).to.deep.equal([2, 4, 3]);
        expect(migrated.model.morphs[0].targets[0].deltaNormals).to.deep.equal([0, 1, 0]);

        const expectedBind = legacyToUnrealPaper2DMatrix(inverseBind);
        const actualBind = migrated.model.skins[0].inverseBindMatrices[0];
        expect(actualBind.every((value, index) => Math.abs(value - expectedBind.data[index]) < 1e-5)).to.be.true;
        const preview = previewMigratedModel(migrated);
        expect(preview.model.vertices[0].position.data).to.deep.equal(source.model.vertices[0].position.data);
        expect(preview.model.meshes[0].indices).to.deep.equal(source.model.meshes[0].indices);
        expect(preview.model.nodes[1].position).to.deep.equal(source.model.nodes[1].position);
        expect(preview.model.nodes[1].scale).to.deep.equal(source.model.nodes[1].scale);
        const previewRotation = new Quat().setFromEulerAngles(new Vec3(preview.model.nodes[1].rotation));
        expect(Math.abs(previewRotation.dot(new Quat().setFromEulerAngles(23, -41, 67)))).to.be.closeTo(1, 1e-5);
        expect(migrateLegacyPaper2DModel(migrated)).to.deep.equal(migrated);
        expect(() => migrateLegacyModel(migrated)).not.to.throw();
        expect(() => migrateLegacyPaper2DModel(migrateLegacyModel(source)))
        .to.throw('Unsupported Paper2D model coordinateMigration marker');
    });

    it('previews a tagged model before the current JSON model parser builds meshes', function () {
        const source = fixture('cube');
        const tagged = migrateLegacyModel(source);
        jsdomSetup();
        const device = new NullGraphicsDevice(document.createElement('canvas'));
        setProgramLibrary(device, new ProgramLibrary(device));
        ShaderChunks.get(device).add(shaderChunksGLSL);
        try {
            const parser = new JsonModelParser({ app: { coordinateSystem: 'legacy' }, device, defaultMaterial: new StandardMaterial() });
            let model;
            parser.parse(tagged, (error, result) => {
                expect(error).to.equal(null);
                model = result;
            });
            expect(model.meshInstances).to.have.length(1);
            expect(model.graph.children[0].getLocalScale().toArray()).to.deep.equal(source.model.nodes[1].scale);
            expect(model.meshInstances[0].mesh.primitive[0].count).to.equal(source.model.meshes[0].count);
            model.destroy();
        } finally {
            device.destroy();
            jsdomTeardown();
        }
    });

    it('loads tagged model geometry and UE Euler data directly in Unreal mode', function () {
        const source = fixture('cube');
        source.model.nodes[1].position = [2, 3, 4];
        source.model.nodes[1].rotation = [23, -41, 67];
        source.model.nodes[1].scale = [2, 3, 4];
        const tagged = migrateLegacyModel(source);
        jsdomSetup();
        const device = new NullGraphicsDevice(document.createElement('canvas'));
        setProgramLibrary(device, new ProgramLibrary(device));
        ShaderChunks.get(device).add(shaderChunksGLSL);
        try {
            const parser = new JsonModelParser({
                app: { coordinateSystem: 'unreal' },
                device,
                defaultMaterial: new StandardMaterial()
            });
            let model;
            parser.parse(tagged, (error, result) => {
                expect(error).to.equal(null);
                model = result;
            });

            const node = model.graph.children[0];
            expect(node.coordinateSystem).to.equal('unreal');
            expect(node.getLocalPosition().toArray()).to.deep.equal(tagged.model.nodes[1].position);
            expect(node.getLocalScale().toArray()).to.deep.equal(tagged.model.nodes[1].scale);
            expect(Math.abs(node.getLocalRotation().dot(unrealEulerToRotation(new Vec3(tagged.model.nodes[1].rotation)))))
            .to.be.closeTo(1, 1e-5);
            const positions = [];
            model.meshInstances[0].mesh.getPositions(positions);
            expect(positions.slice(0, 3)).to.deep.equal(tagged.model.vertices[0].position.data.slice(0, 3));
            model.destroy();

            let error;
            parser.parse(source, (parseError) => {
                error = parseError;
            });
            expect(error).to.contain('migrated with migrateLegacyModel()');
        } finally {
            device.destroy();
            jsdomTeardown();
        }
    });

    it('loads tagged Paper2D geometry in Unreal mode and previews it in legacy mode', function () {
        const source = fixture('plane');
        const tagged = migrateLegacyPaper2DModel(source);
        jsdomSetup();
        const device = new NullGraphicsDevice(document.createElement('canvas'));
        setProgramLibrary(device, new ProgramLibrary(device));
        ShaderChunks.get(device).add(shaderChunksGLSL);
        try {
            const unrealParser = new JsonModelParser({
                app: { coordinateSystem: 'unreal' },
                device,
                defaultMaterial: new StandardMaterial()
            });
            let unrealModel;
            unrealParser.parse(tagged, (error, result) => {
                expect(error).to.equal(null);
                unrealModel = result;
            });
            expect(unrealModel.graph.children[0].coordinateSystem).to.equal('unreal');
            const unrealPositions = [];
            unrealModel.meshInstances[0].mesh.getPositions(unrealPositions);
            expect(unrealPositions.slice(0, 3)).to.deep.equal(tagged.model.vertices[0].position.data.slice(0, 3));
            unrealModel.destroy();

            const legacyParser = new JsonModelParser({ app: { coordinateSystem: 'legacy' }, device, defaultMaterial: new StandardMaterial() });
            let legacyModel;
            legacyParser.parse(tagged, (error, result) => {
                expect(error).to.equal(null);
                legacyModel = result;
            });
            const legacyPositions = [];
            legacyModel.meshInstances[0].mesh.getPositions(legacyPositions);
            expect(legacyPositions.slice(0, 3)).to.deep.equal(source.model.vertices[0].position.data.slice(0, 3));
            legacyModel.destroy();
        } finally {
            device.destroy();
            jsdomTeardown();
        }
    });

    it('previews tagged skin and sparse morph data through the model parser', function () {
        const source = fixture('plane');
        source.model.skins = [{ boneNames: ['RootNode'], inverseBindMatrices: [Array.from(new Mat4().data)] }];
        source.model.morphs = [{ targets: [{
            name: 'Raised',
            aabb: { min: [0, 0, 0], max: [0, 1, 0] },
            indices: [0],
            deltaPositions: [0, 1, 0],
            deltaNormals: [0, 0, 0]
        }] }];
        source.model.meshes[0].skin = 0;
        source.model.meshes[0].morph = 0;
        const tagged = migrateLegacyModel(source);
        jsdomSetup();
        const device = new NullGraphicsDevice(document.createElement('canvas'));
        setProgramLibrary(device, new ProgramLibrary(device));
        ShaderChunks.get(device).add(shaderChunksGLSL);
        try {
            const parser = new JsonModelParser({ app: { coordinateSystem: 'legacy' }, device, defaultMaterial: new StandardMaterial() });
            let model;
            parser.parse(tagged, (error, result) => {
                expect(error).to.equal(null);
                model = result;
            });
            expect(model.skinInstances).to.have.length(1);
            expect(model.morphInstances).to.have.length(1);
            expect(model.skinInstances[0].skin.inverseBindPose[0].data[0]).to.equal(1);
            expect(model.morphInstances[0].morph.targets[0].deltaPositions[1]).to.equal(1);
            model.destroy();
        } finally {
            device.destroy();
            jsdomTeardown();
        }
    });

    it('rejects unsupported topology and unknown markers without modifying inputs', function () {
        const source = fixture('plane');
        source.model.meshes[0].type = 'trianglestrip';
        expect(() => migrateLegacyModel(source)).to.throw('requires triangle expansion');
        expect(source.model.vertices[0].position.data.slice(0, 3)).to.deep.equal([0.5, 0, 0.5]);
        source.model.meshes[0].type = 'triangles';
        const tagged = migrateLegacyModel(source);
        tagged.coordinateMigration.basis = 'other';
        expect(() => previewMigratedModel(tagged)).to.throw('Unsupported model coordinateMigration marker');
    });
});
