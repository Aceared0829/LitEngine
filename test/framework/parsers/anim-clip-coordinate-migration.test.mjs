import { expect } from 'chai';

import { legacyToUnrealPaper2DRotation } from '../../../src/core/math/coordinate-conversion.js';
import { Quat } from '../../../src/core/math/quat.js';
import {
    migrateLegacyAnimClipTracks,
    previewMigratedAnimClipTracks
} from '../../../src/framework/parsers/anim-clip-coordinate-migration.js';
import { AnimClipParser } from '../../../src/framework/parsers/anim-clip.js';

const path = property => ({ entityPath: ['Root'], component: 'graph', propertyPath: [property] });
const curve = (property, index, interpolation = 1) => ({
    path: path(property), inputIndex: 0, outputIndex: index, interpolation
});

describe('Animclip coordinate migration', function () {
    it('converts position, quaternion rotation, scale, and cubic tangents', function () {
        const source = {
            name: 'Move',
            duration: 1,
            inputs: [[0, 1]],
            outputs: [
                { components: 3, data: [2, 3, 4, 5, 6, 7] },
                { components: 4, data: [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2] },
                { components: 3, data: [2, 3, 4, 3, 4, 5] },
                { components: 3, data: [1, 2, 3, 2, 3, 4, 3, 4, 5] },
                { components: 1, data: [0.2, 0.8] }
            ],
            curves: [curve('localPosition', 0), curve('localRotation', 1), curve('localScale', 2),
                curve('localPosition', 3, 2), { path: { component: 'light', propertyPath: ['intensity'] }, inputIndex: 0, outputIndex: 4, interpolation: 1 }]
        };
        const migrated = migrateLegacyAnimClipTracks(source);
        expect(migrated.outputs[0].data).to.deep.equal([-4, 2, 3, -7, 5, 6]);
        expect(migrated.outputs[2].data).to.deep.equal([4, 2, 3, 5, 3, 4]);
        expect(migrated.outputs[3].data).to.deep.equal([-3, 1, 2, -4, 2, 3, -5, 3, 4]);
        expect(migrated.outputs[4].data).to.deep.equal(source.outputs[4].data);
        const quat = new Quat(...migrated.outputs[1].data.slice(4, 8));
        expect(quat.x).to.equal(0);
        expect(quat.y).to.equal(0);
        expect(quat.z).to.be.closeTo(-Math.SQRT1_2, 1e-12);
        expect(previewMigratedAnimClipTracks(migrated).outputs).to.deep.equal(source.outputs);
        expect(migrateLegacyAnimClipTracks(migrated)).to.deep.equal(migrated);
        const parser = new AnimClipParser();
        parser.handler = { app: { coordinateSystem: 'legacy' } };
        const track = parser.open('move.json', migrated);
        expect(track.outputs[0].data).to.deep.equal(source.outputs[0].data);
        expect(track.outputs[1].data).to.deep.equal(source.outputs[1].data);
    });

    it('loads tagged tracks in Unreal mode and rejects unmarked clips', function () {
        const source = {
            name: 'Move',
            duration: 1,
            inputs: [[0]],
            outputs: [{ components: 3, data: [2, 3, 4] }],
            curves: [curve('localPosition', 0)]
        };
        const migrated = migrateLegacyAnimClipTracks(source);
        const parser = new AnimClipParser();
        parser.handler = { app: { coordinateSystem: 'unreal' } };

        const track = parser.open('move.json', migrated);
        expect(track.outputs[0].data).to.deep.equal(migrated.outputs[0].data);
        expect(track.outputs[0].data).to.deep.equal([-4, 2, 3]);
        expect(() => parser.open('legacy-move.json', source))
        .to.throw('migrateLegacyAnimClipTracks()');
    });

    it('converts only explicitly selected Paper2D entity paths', function () {
        const spritePath = ['Scene', 'Sprite'];
        const meshPath = ['Scene', 'Mesh'];
        const source = {
            inputs: [[0]],
            outputs: [
                { components: 3, data: [2, 3, 4] },
                { components: 3, data: [2, 3, 4] },
                { components: 3, data: [2, 3, 4] },
                { components: 4, data: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
            ],
            curves: [
                { ...curve('localPosition', 0), path: { ...path('localPosition'), entityPath: spritePath } },
                { ...curve('localPosition', 1), path: { ...path('localPosition'), entityPath: meshPath } },
                { ...curve('localScale', 2), path: { ...path('localScale'), entityPath: spritePath } },
                { ...curve('localRotation', 3), path: { ...path('localRotation'), entityPath: spritePath } }
            ]
        };
        const migrated = migrateLegacyAnimClipTracks(source, { paper2dEntityPaths: [spritePath] });
        expect(migrated.outputs[0].data).to.deep.equal([2, 4, 3]);
        expect(migrated.outputs[1].data).to.deep.equal([-4, 2, 3]);
        expect(migrated.outputs[2].data).to.deep.equal([2, 4, 3]);
        const expectedRotation = legacyToUnrealPaper2DRotation(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
        expect(Math.abs(new Quat(...migrated.outputs[3].data).dot(expectedRotation))).to.be.closeTo(1, 1e-5);
        expect(migrated.coordinateMigration.paper2dEntityPaths).to.deep.equal([spritePath]);
        expect(previewMigratedAnimClipTracks(migrated).outputs).to.deep.equal(source.outputs);
        expect(migrateLegacyAnimClipTracks(migrated)).to.deep.equal(migrated);

        expect(() => migrateLegacyAnimClipTracks(source, { paper2dEntityPaths: [['Scene', 'Missing']] }))
        .to.throw('must match at least one graph transform track');
    });

    it('rejects conflicting shared outputs and unknown markers', function () {
        const source = {
            inputs: [[0]],
            outputs: [{ components: 3, data: [1, 2, 3] }],
            curves: [curve('localPosition', 0), curve('localScale', 0)]
        };
        expect(() => migrateLegacyAnimClipTracks(source)).to.throw('incompatible transform tracks');
        source.curves.pop();
        const migrated = migrateLegacyAnimClipTracks(source);
        migrated.coordinateMigration.scope = 'other';
        expect(() => previewMigratedAnimClipTracks(migrated)).to.throw('Unsupported animclip coordinateMigration marker');
        source.outputs[0].data = [1, 2];
        expect(() => migrateLegacyAnimClipTracks(source)).to.throw('Invalid animclip localPosition output');
    });
});
