import { readFileSync } from 'node:fs';

import { expect } from 'chai';

import {
    legacyToUnrealRotation,
    legacyToUnrealPaper2DRotation,
    unrealEulerToRotation
} from '../../../src/core/math/coordinate-conversion.js';
import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import {
    migrateLegacyAnimationTransforms,
    previewMigratedAnimationTransforms
} from '../../../src/framework/parsers/animation-coordinate-migration.js';
import { JsonAnimationParser } from '../../../src/framework/parsers/json-animation.js';

describe('JSON animation coordinate migration', function () {
    it('converts version 3 key position, rotation and nonuniform scale', function () {
        const source = {
            animation: {
                version: 3,
                name: 'Turn',
                duration: 1,
                nodes: [{ name: 'Actor', keys: [{ time: 0, pos: [2, 3, 4], rot: [23, -41, 67], scale: [2, 3, 4] }] }]
            }
        };
        const migrated = migrateLegacyAnimationTransforms(source);
        const key = migrated.animation.nodes[0].keys[0];
        expect(key.pos).to.deep.equal([-4, 2, 3]);
        expect(key.scale).to.deep.equal([4, 2, 3]);
        const expected = legacyToUnrealRotation(new Quat().setFromEulerAngles(23, -41, 67));
        expect(Math.abs(unrealEulerToRotation(new Vec3(key.rot)).dot(expected))).to.be.closeTo(1, 1e-5);
        expect(previewMigratedAnimationTransforms(migrated).animation.nodes[0].keys[0].scale).to.deep.equal([2, 3, 4]);
        expect(source.animation.nodes[0].keys[0].pos).to.deep.equal([2, 3, 4]);
        expect(migrateLegacyAnimationTransforms(migrated)).to.deep.equal(migrated);
    });

    it('converts version 4 shared defaults and previews through the JSON parser', function (done) {
        const source = JSON.parse(readFileSync(new URL('../../assets/cube/cube.animation.json', import.meta.url), 'utf8'));
        const migrated = migrateLegacyAnimationTransforms(source);
        expect(migrated.animation.nodes[0].keys).to.have.length(source.animation.nodes[0].keys.length);
        const preview = previewMigratedAnimationTransforms(migrated);
        const sourceKey = source.animation.nodes[0].keys[5];
        const previewKey = preview.animation.nodes[0].keys[5];
        expect(Math.abs(new Quat().setFromEulerAngles(new Vec3(previewKey.r)).dot(
            new Quat().setFromEulerAngles(new Vec3(sourceKey.r))))).to.be.closeTo(1, 1e-5);

        const withDefaults = structuredClone(source);
        withDefaults.animation.nodes[0].defaults = { p: [2, 3, 4], r: [0, 45, 0], s: [2, 3, 4] };
        const defaulted = migrateLegacyAnimationTransforms(withDefaults).animation.nodes[0].defaults;
        expect(defaulted.p).to.deep.equal([-4, 2, 3]);
        expect(defaulted.s).to.deep.equal([4, 2, 3]);

        const parser = new JsonAnimationParser();
        parser.handler = {
            app: { coordinateSystem: 'legacy' },
            fetch: (url, type, callback) => callback(null, migrated)
        };
        parser.load('clip.json', (error, animation) => {
            expect(error).to.equal(null);
            expect(animation._nodes[0]._keys).to.have.length(source.animation.nodes[0].keys.length);
            done();
        });
    });

    it('loads tagged keyframes in Unreal mode and rejects unmarked animation assets', function () {
        const source = {
            animation: {
                version: 3,
                name: 'Turn',
                duration: 1,
                nodes: [{ name: 'Actor', keys: [{ time: 0, pos: [2, 3, 4], rot: [23, -41, 67], scale: [2, 3, 4] }] }]
            }
        };
        const tagged = migrateLegacyAnimationTransforms(source);
        const parser = new JsonAnimationParser();
        parser.handler = {
            app: { coordinateSystem: 'unreal' },
            fetch: (url, type, callback) => callback(null, tagged)
        };
        let animation;
        parser.load('turn.json', (error, result) => {
            expect(error).to.equal(null);
            animation = result;
        });

        const sourceKey = tagged.animation.nodes[0].keys[0];
        const key = animation.nodes[0]._keys[0];
        expect(key.position.toArray()).to.deep.equal(sourceKey.pos);
        expect(key.scale.toArray()).to.deep.equal(sourceKey.scale);
        expect(Math.abs(key.rotation.dot(unrealEulerToRotation(new Vec3(sourceKey.rot)))))
        .to.be.closeTo(1, 1e-5);

        parser.handler.fetch = (url, type, callback) => callback(null, source);
        let error;
        parser.load('legacy.json', (parseError) => {
            error = parseError;
        });
        expect(error).to.contain('migrateLegacyAnimationTransforms()');
    });

    it('converts explicitly selected Paper2D nodes while keeping 3D animation nodes unchanged', function () {
        const source = {
            animation: {
                version: 4,
                name: 'Mixed',
                duration: 1,
                nodes: [
                    { name: 'Sprite', defaults: { p: [1, 2, 3], r: [0, 0, 90], s: [1, 2, 3] }, keys: [{ t: 0 }] },
                    { name: 'Mesh', defaults: { p: [1, 2, 3], r: [0, 0, 90], s: [1, 2, 3] }, keys: [{ t: 0 }] }
                ]
            }
        };
        const migrated = migrateLegacyAnimationTransforms(source, { paper2dNodeNames: ['Sprite'] });
        const [sprite, mesh] = migrated.animation.nodes;
        expect(sprite.defaults.p).to.deep.equal([1, 3, 2]);
        expect(sprite.defaults.s).to.deep.equal([1, 3, 2]);
        expect(mesh.defaults.p).to.deep.equal([-3, 1, 2]);
        expect(mesh.defaults.s).to.deep.equal([3, 1, 2]);
        expect(migrated.coordinateMigration.paper2dNodeNames).to.deep.equal(['Sprite']);

        const spriteRotation = unrealEulerToRotation(new Vec3(sprite.defaults.r));
        const expectedRotation = legacyToUnrealPaper2DRotation(new Quat().setFromEulerAngles(0, 0, 90));
        expect(Math.abs(spriteRotation.dot(expectedRotation))).to.be.closeTo(1, 1e-5);
        const preview = previewMigratedAnimationTransforms(migrated);
        expect(preview.animation.nodes[0].defaults.p).to.deep.equal(source.animation.nodes[0].defaults.p);
        expect(preview.animation.nodes[0].defaults.s).to.deep.equal(source.animation.nodes[0].defaults.s);
        expect(migrateLegacyAnimationTransforms(migrated)).to.deep.equal(migrated);
        expect(() => migrateLegacyAnimationTransforms(source, { paper2dNodeNames: ['Missing'] }))
        .to.throw('must match exactly one node');
    });

    it('rejects unknown markers and malformed transform vectors', function () {
        const source = { animation: { version: 3, nodes: [{ keys: [{ pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] }] }] } };
        const marked = migrateLegacyAnimationTransforms(source);
        marked.coordinateMigration.euler = 'other';
        expect(() => migrateLegacyAnimationTransforms(marked)).to.throw('Unsupported animation coordinateMigration marker');
        expect(() => previewMigratedAnimationTransforms(marked)).to.throw('Unsupported animation coordinateMigration marker');
        source.animation.nodes[0].keys[0].scale = [1, 2];
        expect(() => migrateLegacyAnimationTransforms(source)).to.throw('Invalid animation scale');
    });
});
