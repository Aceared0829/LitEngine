import { readFileSync } from 'node:fs';

import { expect } from 'chai';

import {
    legacyToUnrealPaper2DRotation,
    legacyToUnrealRotation,
    legacyToUnrealVector,
    unrealEulerToRotation,
    unrealRotationToEuler
} from '../../../src/core/math/coordinate-conversion.js';
import { Quat } from '../../../src/core/math/quat.js';
import { Vec3 } from '../../../src/core/math/vec3.js';
import { SceneHandler } from '../../../src/framework/handlers/scene.js';
import {
    migrateLegacySceneTransforms,
    previewMigratedSceneTransforms
} from '../../../src/framework/parsers/scene-coordinate-migration.js';
import { SceneParser } from '../../../src/framework/parsers/scene.js';
import { Template } from '../../../src/framework/template.js';

const createLegacyScene = () => ({
    name: 'scene',
    settings: {
        physics: { gravity: [0, -9.81, 0] },
        render: {
            skyboxRotation: [15, 25, 35],
            skyMeshPosition: [2, 3, 4],
            skyMeshRotation: [10, 20, 30],
            skyMeshScale: [2, 3, 4],
            skyCenter: [0, 1, 0],
            lightingCells: [8, 2, 4]
        }
    },
    entities: {
        root: {
            resource_id: 'root',
            name: 'Root',
            parent: null,
            children: ['child'],
            position: [2, 3, 4],
            rotation: [23, -41, 67],
            scale: [2, 3, 4],
            components: { render: { type: 'box' } }
        },
        child: {
            resource_id: 'child',
            name: 'Child',
            parent: 'root',
            children: [],
            position: [-3, 0, 2],
            rotation: [0, 45, 0],
            scale: [1, 1, 2],
            components: {}
        }
    }
});

const expectQuaternionEquivalent = (angles, expected) => {
    const actual = new Quat().setFromEulerAngles(new Vec3(angles));
    expect(Math.abs(actual.dot(expected))).to.be.closeTo(1, 1e-5);
};

const expectUnrealQuaternionEquivalent = (angles, expected) => {
    const actual = unrealEulerToRotation(new Vec3(angles));
    expect(Math.abs(actual.dot(expected))).to.be.closeTo(1, 1e-5);
};

describe('Scene coordinate migration', function () {
    it('converts local PRS and world-space settings without touching source or components', function () {
        const source = createLegacyScene();
        const original = structuredClone(source);
        const migrated = migrateLegacySceneTransforms(source);
        expect(source).to.deep.equal(original);
        expect(migrated).not.to.equal(source);
        expect(migrated.coordinateMigration).to.deep.equal({
            version: 11, scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-screen-ui-top-left-y-down', basis: 'ue-x-forward-y-right-z-up', euler: 'unreal-roll-pitch-yaw-xyz-degrees', screenSpaceUiDefaultFields: []
        });
        expect(migrated.entities.root.position).to.deep.equal([-4, 2, 3]);
        expect(migrated.entities.root.scale).to.deep.equal([4, 2, 3]);
        expectUnrealQuaternionEquivalent(migrated.entities.root.rotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(23, -41, 67)));
        expect(migrated.entities.child.position).to.deep.equal([-2, -3, 0]);
        expect(migrated.entities.root.children).to.deep.equal(['child']);
        expect(migrated.entities.root.components).to.deep.equal(original.entities.root.components);
        expect(new Vec3(migrated.settings.physics.gravity).equals(new Vec3(0, 0, -9.81))).to.be.true;
        expect(migrated.settings.render.skyMeshPosition).to.deep.equal([-4, 2, 3]);
        expect(migrated.settings.render.skyMeshScale).to.deep.equal([4, 2, 3]);
        expect(new Vec3(migrated.settings.render.skyCenter).equals(new Vec3(0, 0, 1))).to.be.true;
        expect(migrated.settings.render.lightingCells).to.deep.equal([4, 8, 2]);
        expect(previewMigratedSceneTransforms(migrated).settings.render.lightingCells).to.deep.equal([8, 2, 4]);
        expectUnrealQuaternionEquivalent(migrated.settings.render.skyboxRotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(15, 25, 35)));
        expectUnrealQuaternionEquivalent(migrated.settings.render.skyMeshRotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(10, 20, 30)));
        expect(migrated.entities.root.components).not.to.equal(source.entities.root.components);
    });

    it('is idempotent and rejects unsupported markers and 2D components', function () {
        const migrated = migrateLegacySceneTransforms(createLegacyScene());
        expect(migrateLegacySceneTransforms(migrated)).to.deep.equal(migrated);
        expect(migrateLegacySceneTransforms(migrated)).not.to.equal(migrated);
        const emptyRoot = createLegacyScene();
        emptyRoot.entities = {};
        expect(migrateLegacySceneTransforms(emptyRoot).entities).to.deep.equal({});
        const badSource = { entities: { root: { position: [0, 0, Infinity], rotation: [0, 0, 0], scale: [1, 1, 1] } } };
        expect(() => migrateLegacySceneTransforms(badSource)).to.throw('Invalid position');
        expect(() => migrateLegacySceneTransforms({ entities: [] })).to.throw('entities map');
        const unknown = structuredClone(migrated);
        unknown.coordinateMigration.version = 6;
        expect(() => migrateLegacySceneTransforms(unknown)).to.throw('Unsupported scene coordinateMigration marker');
        expect(() => previewMigratedSceneTransforms(unknown)).to.throw('Unsupported scene coordinateMigration marker');
        const unsupportedCompressed = structuredClone(migrated);
        unsupportedCompressed.compressedFormat = { singleVecs: [] };
        expect(() => migrateLegacySceneTransforms(unsupportedCompressed)).to.throw('must be uncompressed');
        expect(() => previewMigratedSceneTransforms(unsupportedCompressed)).to.throw('must be uncompressed');
        const twoD = createLegacyScene();
        twoD.entities.child.components.sprite = { enabled: true };
        expect(() => migrateLegacySceneTransforms(twoD)).to.throw('separate migration');
        const uiControl = createLegacyScene();
        uiControl.entities.child.components.scrollview = {};
        expect(() => migrateLegacySceneTransforms(uiControl)).to.throw('UI components outside a screen hierarchy');
        const screenParticles = createLegacyScene();
        screenParticles.entities.child.components.particlesystem = { screenSpace: true };
        expect(() => migrateLegacySceneTransforms(screenParticles)).to.throw('screen-space particles');
        const collision = createLegacyScene();
        collision.entities.child.components.collision = { halfExtents: [1, 2, 3] };
        const taggedCollision = migrateLegacySceneTransforms(collision);
        expect(taggedCollision.entities.child.components.collision.halfExtents).to.deep.equal([3, 1, 2]);
        expect(previewMigratedSceneTransforms(taggedCollision).entities.child.components.collision).to.deep.equal(collision.entities.child.components.collision);
    });

    it('migrates explicitly selected Paper2D hierarchies and restores them for legacy preview', function () {
        const source = createLegacyScene();
        source.entities.root.components = {};
        source.entities.child.components = {
            sprite: { enabled: true },
            collision: {
                type: 'capsule',
                halfExtents: [1, 2, 3],
                linearOffset: [2, 3, 4],
                angularOffset: [23, -41, 67],
                axis: 1
            },
            rigidbody: { linearFactor: [1, 0, 1], angularFactor: [0, 1, 1] },
            model: { asset: 23, aabbCenter: [1, 2, 3], aabbHalfExtents: [4, 5, 6] }
        };
        const original = structuredClone(source);
        const migrated = migrateLegacySceneTransforms(source, { paper2dEntityIds: ['child', 'root'] });

        expect(source).to.deep.equal(original);
        expect(migrated.coordinateMigration).to.deep.equal({
            version: 12,
            scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-screen-ui-top-left-y-down',
            basis: 'ue-x-forward-y-right-z-up',
            euler: 'unreal-roll-pitch-yaw-xyz-degrees',
            screenSpaceUiDefaultFields: [],
            paper2dEntities: ['child', 'root']
        });
        expect(migrated.entities.root.position).to.deep.equal([2, 4, 3]);
        expect(migrated.entities.root.scale).to.deep.equal([2, 4, 3]);
        expect(migrated.entities.child.position).to.deep.equal([-3, 2, 0]);
        expectUnrealQuaternionEquivalent(migrated.entities.child.rotation,
            legacyToUnrealPaper2DRotation(new Quat().setFromEulerAngles(0, 45, 0)));
        expect(migrated.entities.child.components.collision.halfExtents).to.deep.equal([1, 3, 2]);
        expect(migrated.entities.child.components.collision.linearOffset).to.deep.equal([2, 4, 3]);
        expect(migrated.entities.child.components.collision.axis).to.equal(2);
        expect(migrated.entities.child.components.rigidbody.linearFactor).to.deep.equal([1, 1, 0]);
        expect(migrated.entities.child.components.model.aabbCenter).to.deep.equal([1, 3, 2]);
        expect(migrated.entities.child.components.model.aabbHalfExtents).to.deep.equal([4, 6, 5]);

        const preview = previewMigratedSceneTransforms(migrated);
        expect(preview.entities.root.position).to.deep.equal(original.entities.root.position);
        expect(preview.entities.root.scale).to.deep.equal(original.entities.root.scale);
        expect(preview.entities.child.position).to.deep.equal(original.entities.child.position);
        expect(preview.entities.child.scale).to.deep.equal(original.entities.child.scale);
        expectQuaternionEquivalent(preview.entities.child.rotation, new Quat().setFromEulerAngles(0, 45, 0));
        expect(preview.entities.child.components.collision.halfExtents).to.deep.equal([1, 2, 3]);
        expect(preview.entities.child.components.collision.linearOffset).to.deep.equal([2, 3, 4]);
        expect(preview.entities.child.components.collision.axis).to.equal(1);
        expect(preview.entities.child.components.rigidbody).to.deep.equal(original.entities.child.components.rigidbody);
        expect(preview.entities.child.components.model).to.deep.equal(original.entities.child.components.model);
        expect(migrateLegacySceneTransforms(migrated)).to.deep.equal(migrated);
        expect(() => migrateLegacySceneTransforms(source, { paper2dEntityIds: ['missing'] })).to.throw('Unknown Paper2D scene entity');
        const legacySceneRoot = new SceneParser({ _entityIndex: {}, systems: { list: [] } }, false).parse(migrated);
        expect(legacySceneRoot.getLocalPosition().toArray()).to.deep.equal(original.entities.root.position);
        expect(legacySceneRoot.children[0].getLocalPosition().toArray()).to.deep.equal(original.entities.child.position);
        const unrealSceneRoot = new SceneParser({ coordinateSystem: 'unreal', _entityIndex: {}, systems: { list: [] } }, false).parse(migrated);
        expect(unrealSceneRoot.getLocalPosition().toArray()).to.deep.equal(migrated.entities.root.position);
        expect(unrealSceneRoot.children[0].getLocalPosition().toArray()).to.deep.equal(migrated.entities.child.position);
    });

    it('preserves screen-space UI subtrees while migrating adjacent world objects', function () {
        const source = createLegacyScene();
        source.entities.root.components = { screen: { screenSpace: true, resolution: [1280, 720] } };
        source.entities.child.components = {
            element: {
                anchor: [0, 0, 1, 1],
                pivot: [0.5, 0.5],
                margin: [12, 24, 36, 48],
                width: 300,
                height: 100,
                alignment: [0.25, 0.8]
            },
            layoutchild: { minWidth: 100, minHeight: 40 },
            layoutgroup: { alignment: [0.2, 0.7], padding: [1, 2, 3, 4], reverseY: true },
            button: { hitPadding: [1, 2, 3, 4] },
            scrollbar: { orientation: 1, value: 0.2 }
        };
        source.entities.world = {
            resource_id: 'world',
            name: 'World Object',
            parent: null,
            children: [],
            position: [4, 5, 6],
            rotation: [10, 20, 30],
            scale: [2, 3, 4],
            components: { render: { type: 'box' } }
        };
        const original = structuredClone(source);

        const migrated = migrateLegacySceneTransforms(source);
        expect(migrated.coordinateMigration.version).to.equal(11);
        expect(migrated.entities.root.position).to.deep.equal(original.entities.root.position);
        expect(migrated.entities.child.position).to.deep.equal(original.entities.child.position);
        expect(migrated.entities.root.components.screen).to.deep.equal(original.entities.root.components.screen);
        const migratedAnchor = migrated.entities.child.components.element.anchor;
        expect(migratedAnchor[0]).to.equal(0);
        expect(migratedAnchor[1]).to.equal(0);
        expect(migratedAnchor[2]).to.equal(1);
        expect(migratedAnchor[3]).to.equal(1);
        expect(migrated.entities.child.components.element.pivot).to.deep.equal([0.5, 0.5]);
        expect(migrated.entities.child.components.element.margin).to.deep.equal([12, 48, 36, 24]);
        expect(migrated.entities.child.components.element.alignment[0]).to.equal(0.25);
        expect(migrated.entities.child.components.element.alignment[1]).to.be.closeTo(0.2, 1e-12);
        expect(migrated.entities.child.components.layoutgroup.alignment[0]).to.equal(0.2);
        expect(migrated.entities.child.components.layoutgroup.alignment[1]).to.be.closeTo(0.3, 1e-12);
        expect(migrated.entities.child.components.layoutgroup.padding).to.deep.equal([1, 4, 3, 2]);
        expect(migrated.entities.child.components.layoutgroup.reverseY).to.be.false;
        expect(migrated.entities.child.components.button.hitPadding).to.deep.equal([1, 4, 3, 2]);
        expect(migrated.entities.child.components.scrollbar.value).to.equal(0.8);
        const sourceUiRotation = new Quat().setFromEulerAngles(new Vec3(original.entities.child.rotation));
        expectUnrealQuaternionEquivalent(migrated.entities.child.rotation,
            new Quat(-sourceUiRotation.x, sourceUiRotation.y, -sourceUiRotation.z, sourceUiRotation.w));
        expect(migrated.entities.world.position).to.deep.equal([-6, 4, 5]);

        const preview = previewMigratedSceneTransforms(migrated);
        expect(preview.entities.root.position).to.deep.equal(original.entities.root.position);
        expect(preview.entities.child.position).to.deep.equal(original.entities.child.position);
        expect(preview.entities.child.components.element).to.deep.equal(original.entities.child.components.element);
        expect(preview.entities.child.components.layoutgroup).to.deep.equal(original.entities.child.components.layoutgroup);
        expect(preview.entities.child.components.button).to.deep.equal(original.entities.child.components.button);
        expect(preview.entities.child.components.scrollbar.orientation).to.equal(original.entities.child.components.scrollbar.orientation);
        expect(preview.entities.child.components.scrollbar.value).to.be.closeTo(original.entities.child.components.scrollbar.value, 1e-12);
        expectQuaternionEquivalent(preview.entities.child.rotation,
            new Quat().setFromEulerAngles(new Vec3(original.entities.child.rotation)));
        expect(preview.entities.world.position).to.deep.equal(original.entities.world.position);

        const uiOnly = structuredClone(migrated);
        delete uiOnly.entities.world;
        const parsed = new SceneParser({ coordinateSystem: 'unreal', _entityIndex: {}, systems: { list: [] } }, false).parse(uiOnly);
        expect(parsed.getLocalPosition().toArray()).to.deep.equal(original.entities.root.position);
        expect(parsed.children[0].getLocalPosition().toArray()).to.deep.equal(original.entities.child.position);

        const worldScreen = createLegacyScene();
        worldScreen.entities.root.components = { screen: { screenSpace: false } };
        const worldScreenMigration = migrateLegacySceneTransforms(worldScreen);
        expect(worldScreenMigration.coordinateMigration.version).to.equal(13);
        expect(worldScreenMigration.coordinateMigration.worldSpaceScreenEntities).to.deep.equal(['root']);
        expect(worldScreenMigration.entities.root.position).to.deep.equal([-4, 2, 3]);
        expect(worldScreenMigration.entities.child.position).to.deep.equal(worldScreen.entities.child.position);

        const mismatchedWorldScreenMarker = structuredClone(worldScreenMigration);
        mismatchedWorldScreenMarker.coordinateMigration.worldSpaceScreenEntities = [];
        expect(() => migrateLegacySceneTransforms(mismatchedWorldScreenMarker))
        .to.throw('World-space screen entity IDs do not match the scene migration marker');
        expect(() => previewMigratedSceneTransforms(mismatchedWorldScreenMarker))
        .to.throw('World-space screen entity IDs do not match the scene migration marker');
        expect(() => migrateLegacySceneTransforms(worldScreen, { paper2dEntityIds: ['child'] }))
        .to.throw('cannot belong to both Paper2D and screen UI migrations');

        const previouslyTaggedWorldScreen = structuredClone(worldScreen);
        previouslyTaggedWorldScreen.coordinateMigration = {
            version: 12,
            scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-screen-ui-top-left-y-down',
            basis: 'ue-x-forward-y-right-z-up',
            euler: 'unreal-roll-pitch-yaw-xyz-degrees',
            screenSpaceUiDefaultFields: [],
            paper2dEntities: []
        };
        expect(() => migrateLegacySceneTransforms(previouslyTaggedWorldScreen))
        .to.throw('world-space screen requiring a separate UI migration');

        const worldSpatialChild = structuredClone(source);
        worldSpatialChild.entities.child.components.collision = { halfExtents: [1, 2, 3] };
        expect(() => migrateLegacySceneTransforms(worldSpatialChild)).to.throw('collision components requiring a separate UI migration');
    });

    it('migrates world-space Screen transforms and reversible top-left UI descendants', function () {
        const source = createLegacyScene();
        source.entities.root.components = { screen: { screenSpace: false, resolution: [800, 600] } };
        source.entities.child.components = {
            element: { anchor: [0.1, 0.2, 0.8, 0.9], pivot: [0.25, 0.7], margin: [12, 24, 36, 48] },
            button: { hitPadding: [1, 2, 3, 4] },
            scrollbar: { orientation: 1, value: 0.2 }
        };
        const original = structuredClone(source);

        const migrated = migrateLegacySceneTransforms(source);
        expect(migrated.coordinateMigration.version).to.equal(13);
        expect(migrated.coordinateMigration.paper2dEntities).to.deep.equal([]);
        expect(migrated.coordinateMigration.worldSpaceScreenEntities).to.deep.equal(['root']);
        expect(migrated.entities.root.position).to.deep.equal([-4, 2, 3]);
        expect(migrated.entities.root.scale).to.deep.equal([4, 2, 3]);
        expectUnrealQuaternionEquivalent(migrated.entities.root.rotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(new Vec3(original.entities.root.rotation))));
        expect(migrated.entities.child.position).to.deep.equal(original.entities.child.position);
        expect(migrated.entities.child.scale).to.deep.equal(original.entities.child.scale);
        const sourceUiRotation = new Quat().setFromEulerAngles(new Vec3(original.entities.child.rotation));
        expectUnrealQuaternionEquivalent(migrated.entities.child.rotation,
            new Quat(-sourceUiRotation.x, sourceUiRotation.y, -sourceUiRotation.z, sourceUiRotation.w));
        expect(migrated.entities.child.components.element.anchor[0]).to.equal(0.1);
        expect(migrated.entities.child.components.element.anchor[1]).to.be.closeTo(0.1, 1e-12);
        expect(migrated.entities.child.components.element.anchor[2]).to.equal(0.8);
        expect(migrated.entities.child.components.element.anchor[3]).to.equal(0.8);
        expect(migrated.entities.child.components.element.pivot[0]).to.equal(0.25);
        expect(migrated.entities.child.components.element.pivot[1]).to.be.closeTo(0.3, 1e-12);
        expect(migrated.entities.child.components.element.margin).to.deep.equal([12, 48, 36, 24]);
        expect(migrated.entities.child.components.button.hitPadding).to.deep.equal([1, 4, 3, 2]);
        expect(migrated.entities.child.components.scrollbar.value).to.equal(0.8);
        expect(migrateLegacySceneTransforms(migrated)).to.deep.equal(migrated);

        const preview = previewMigratedSceneTransforms(migrated);
        expect(preview.entities.root.position).to.deep.equal(original.entities.root.position);
        expect(preview.entities.root.scale).to.deep.equal(original.entities.root.scale);
        expectQuaternionEquivalent(preview.entities.root.rotation,
            new Quat().setFromEulerAngles(new Vec3(original.entities.root.rotation)));
        expect(preview.entities.child.position).to.deep.equal(original.entities.child.position);
        expect(preview.entities.child.scale).to.deep.equal(original.entities.child.scale);
        expectQuaternionEquivalent(preview.entities.child.rotation,
            new Quat().setFromEulerAngles(new Vec3(original.entities.child.rotation)));
        for (const field of ['anchor', 'pivot']) {
            const actual = preview.entities.child.components.element[field];
            const expected = original.entities.child.components.element[field];
            for (let i = 0; i < expected.length; i++) expect(actual[i]).to.be.closeTo(expected[i], 1e-12);
        }
        expect(preview.entities.child.components.element.margin)
        .to.deep.equal(original.entities.child.components.element.margin);
        expect(preview.entities.child.components.button).to.deep.equal(original.entities.child.components.button);
        expect(preview.entities.child.components.scrollbar.orientation)
        .to.equal(original.entities.child.components.scrollbar.orientation);
        expect(preview.entities.child.components.scrollbar.value)
        .to.be.closeTo(original.entities.child.components.scrollbar.value, 1e-12);
        expect(preview.entities.root.components.screen).to.deep.equal(original.entities.root.components.screen);

        const legacySceneRoot = new SceneParser({ _entityIndex: {}, systems: { list: [] } }, false).parse(migrated);
        expect(legacySceneRoot.getLocalPosition().toArray()).to.deep.equal(original.entities.root.position);
        expect(legacySceneRoot.children[0].getLocalPosition().toArray()).to.deep.equal(original.entities.child.position);
        const unrealSceneRoot = new SceneParser({ coordinateSystem: 'unreal', _entityIndex: {}, systems: { list: [] } }, false).parse(migrated);
        expect(unrealSceneRoot.getLocalPosition().toArray()).to.deep.equal(migrated.entities.root.position);
        expect(unrealSceneRoot.children[0].getLocalPosition().toArray()).to.deep.equal(original.entities.child.position);
    });

    it('records implicit legacy screen UI defaults so migration and preview are reversible', function () {
        const source = createLegacyScene();
        source.entities.root.components = { screen: { screenSpace: true } };
        source.entities.child.components = {
            element: {},
            scrollbar: { orientation: 1 }
        };

        const migrated = migrateLegacySceneTransforms(source);
        expect(migrated.entities.child.components.element.anchor).to.deep.equal([0, 1, 0, 1]);
        expect(migrated.entities.child.components.element.pivot).to.deep.equal([0, 1]);
        expect(migrated.entities.child.components.scrollbar.value).to.equal(1);
        expect(migrated.coordinateMigration.screenSpaceUiDefaultFields).to.deep.equal([{
            id: 'child', fields: ['element.anchor', 'element.pivot', 'scrollbar.value']
        }]);
        expect(migrateLegacySceneTransforms(migrated)).to.deep.equal(migrated);
        const preview = previewMigratedSceneTransforms(migrated);
        expect(preview.entities.child.components).to.deep.equal(source.entities.child.components);
        expect(preview.entities.child.position).to.deep.equal(source.entities.child.position);
        expect(preview.entities.root.components).to.deep.equal(source.entities.root.components);
        expect(preview.coordinateMigration).to.equal(undefined);
    });

    it('upgrades screen UI transforms from versions 9 and 10 without changing their legacy rotation', function () {
        const source = createLegacyScene();
        source.entities.root.components = { screen: { screenSpace: true } };
        source.entities.child.components = { element: {} };
        const original = structuredClone(source);
        const oldMarkers = [
            {
                version: 9,
                scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-screen-ui-preserved',
                basis: 'ue-x-forward-y-right-z-up',
                euler: 'unreal-roll-pitch-yaw-xyz-degrees'
            },
            {
                version: 10,
                scope: 'entity-local-prs-settings-physics-light-particles-zones-bounds-joints-paper2d-screen-ui-preserved',
                basis: 'ue-x-forward-y-right-z-up',
                euler: 'unreal-roll-pitch-yaw-xyz-degrees',
                paper2dEntities: []
            }
        ];

        for (const marker of oldMarkers) {
            const tagged = migrateLegacySceneTransforms(source);
            tagged.coordinateMigration = marker;
            for (const id of ['root', 'child']) {
                tagged.entities[id].position = original.entities[id].position.slice();
                tagged.entities[id].rotation = original.entities[id].rotation.slice();
                tagged.entities[id].scale = original.entities[id].scale.slice();
            }

            const upgraded = migrateLegacySceneTransforms(tagged);
            for (const id of ['root', 'child']) {
                const legacyRotation = new Quat().setFromEulerAngles(new Vec3(original.entities[id].rotation));
                const expected = new Quat(-legacyRotation.x, legacyRotation.y, -legacyRotation.z, legacyRotation.w);
                expectUnrealQuaternionEquivalent(upgraded.entities[id].rotation, expected);
                expect(upgraded.entities[id].position).to.deep.equal(original.entities[id].position);
                expect(upgraded.entities[id].scale).to.deep.equal(original.entities[id].scale);
            }
            expect(upgraded.coordinateMigration.version).to.equal(marker.version === 9 ? 11 : 12);
            const preview = previewMigratedSceneTransforms(upgraded);
            for (const id of ['root', 'child']) {
                expectQuaternionEquivalent(preview.entities[id].rotation,
                    new Quat().setFromEulerAngles(new Vec3(original.entities[id].rotation)));
            }
        }
    });

    it('upgrades version 1 data by converting settings exactly once', function () {
        const source = createLegacyScene();
        const oldTagged = migrateLegacySceneTransforms(source);
        for (const entity of Object.values(oldTagged.entities)) {
            entity.rotation = unrealEulerToRotation(new Vec3(entity.rotation)).getEulerAngles().toArray();
        }
        oldTagged.coordinateMigration = {
            version: 1, scope: 'entity-local-prs', basis: 'ue-x-forward-y-right-z-up', euler: 'intrinsic-xyz-degrees'
        };
        oldTagged.settings = structuredClone(source.settings);
        const upgraded = migrateLegacySceneTransforms(oldTagged);
        expect(upgraded.coordinateMigration.version).to.equal(11);
        expect(upgraded.entities.root.position).to.deep.equal(oldTagged.entities.root.position);
        expect(new Vec3(upgraded.settings.physics.gravity).equals(new Vec3(0, 0, -9.81))).to.be.true;
        expect(previewMigratedSceneTransforms(oldTagged).settings).to.deep.equal(source.settings);
        expect(previewMigratedSceneTransforms(upgraded).settings.physics.gravity).to.deep.equal(source.settings.physics.gravity);
    });

    it('converts collision offsets, primitive axis and rigidbody factors with legacy preview', function () {
        const source = createLegacyScene();
        const collision = {
            type: 'capsule',
            halfExtents: [1, 2, 3],
            linearOffset: [2, 3, 4],
            angularOffset: [23, -41, 67]
        };
        source.entities.child.components.collision = collision;
        source.entities.child.components.rigidbody = { linearFactor: [1, 0, 1], angularFactor: [0, 1, 1] };
        const migrated = migrateLegacySceneTransforms(source);
        const converted = migrated.entities.child.components;
        expect(converted.collision.halfExtents).to.deep.equal([3, 1, 2]);
        expect(converted.collision.linearOffset).to.deep.equal([-4, 2, 3]);
        expect(converted.collision.axis).to.equal(2);
        expectUnrealQuaternionEquivalent(converted.collision.angularOffset,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(23, -41, 67)));
        expect(converted.rigidbody.linearFactor).to.deep.equal([1, 1, 0]);
        expect(converted.rigidbody.angularFactor).to.deep.equal([1, 0, 1]);
        const preview = previewMigratedSceneTransforms(migrated).entities.child.components;
        expect(preview.collision.halfExtents).to.deep.equal(collision.halfExtents);
        expect(preview.collision.linearOffset).to.deep.equal(collision.linearOffset);
        expect(preview.collision.axis).to.equal(1);
        expectQuaternionEquivalent(preview.collision.angularOffset, new Quat().setFromEulerAngles(23, -41, 67));
        expect(preview.rigidbody).to.deep.equal(source.entities.child.components.rigidbody);

        const applied = {};
        const systems = ['collision', 'rigidbody'].map(id => ({
            id,
            addComponent: (entity, data) => {
                if (entity.guid === 'child') {
                    applied[id] = structuredClone(data);
                }
            }
        }));
        new SceneParser({ _entityIndex: {}, systems: { list: systems } }, false).parse(migrated);
        expect(applied.collision.halfExtents).to.deep.equal(collision.halfExtents);
        expect(applied.collision.axis).to.equal(1);
        expect(applied.rigidbody).to.deep.equal(source.entities.child.components.rigidbody);

        const withQuat = structuredClone(source);
        withQuat.entities.child.components.collision.angularOffset = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
        const convertedQuat = migrateLegacySceneTransforms(withQuat).entities.child.components.collision.angularOffset;
        expect(convertedQuat).to.have.length(4);
        expect(convertedQuat[2]).to.be.closeTo(-Math.SQRT1_2, 1e-12);
    });

    it('converts particle vectors, zone dimensions and custom render bounds with legacy preview', function () {
        const source = createLegacyScene();
        source.entities.child.components = {
            particlesystem: {
                emitterExtents: [1, 2, 3],
                emitterExtentsInner: [4, 5, 6],
                wrapBounds: [7, 8, 9],
                particleNormal: [1, 2, 3],
                velocityGraph: {
                    type: 0,
                    keys: [[0, 1, 1, 2], [0, 3, 1, 4], [0, 5, 1, 6]]
                }
            },
            zone: { size: [2, 3, 4] },
            model: { aabbCenter: [1, 2, 3], aabbHalfExtents: [4, 5, 6] },
            render: { aabbCenter: [-1, -2, -3], aabbHalfExtents: [7, 8, 9] },
            gsplat: { aabbCenter: [4, 5, 6], aabbHalfExtents: [1, 2, 3] }
        };

        const migrated = migrateLegacySceneTransforms(source);
        const components = migrated.entities.child.components;
        expect(components.particlesystem.emitterExtents).to.deep.equal([3, 1, 2]);
        expect(components.particlesystem.emitterExtentsInner).to.deep.equal([6, 4, 5]);
        expect(components.particlesystem.wrapBounds).to.deep.equal([9, 7, 8]);
        expect(components.particlesystem.particleNormal).to.deep.equal([-3, 1, 2]);
        expect(components.particlesystem.velocityGraph.keys).to.deep.equal([
            [0, -5, 1, -6], [0, 1, 1, 2], [0, 3, 1, 4]
        ]);
        expect(components.zone.size).to.deep.equal([4, 2, 3]);
        expect(components.model.aabbCenter).to.deep.equal([-3, 1, 2]);
        expect(components.model.aabbHalfExtents).to.deep.equal([6, 4, 5]);
        expect(components.render.aabbCenter).to.deep.equal([3, -1, -2]);
        expect(components.gsplat.aabbHalfExtents).to.deep.equal([3, 1, 2]);

        const preview = previewMigratedSceneTransforms(migrated).entities.child.components;
        expect(preview).to.deep.equal(source.entities.child.components);
        expect(migrateLegacySceneTransforms(migrated)).to.deep.equal(migrated);
    });

    it('migrates hinge and 6dof constraint axes, signed limits and spring data', function () {
        const source = createLegacyScene();
        source.entities.child.components.joint = {
            type: 'hinge',
            limits: [-20, 70],
            motorSpeed: 12
        };
        source.entities.root.components.joint = {
            type: '6dof',
            linearMotionX: 'free',
            linearMotionY: 'limited',
            linearMotionZ: 'locked',
            linearLimitsX: [1, 2],
            linearLimitsY: [3, 4],
            linearLimitsZ: [5, 6],
            linearStiffness: [1, 2, 3],
            linearDamping: [4, 5, 6],
            linearEquilibrium: [7, 8, 9],
            angularMotionX: 'limited',
            angularMotionY: 'free',
            angularMotionZ: 'locked',
            angularLimitsX: [1, 2],
            angularLimitsY: [3, 4],
            angularLimitsZ: [5, 6],
            angularStiffness: [7, 8, 9],
            angularDamping: [10, 11, 12],
            angularEquilibrium: [13, 14, 15]
        };

        const migrated = migrateLegacySceneTransforms(source);
        expect(migrated.entities.child.components.joint.limits).to.deep.equal([-70, 20]);
        expect(migrated.entities.child.components.joint.motorSpeed).to.equal(-12);
        expectUnrealQuaternionEquivalent(migrated.entities.child.rotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(new Vec3(source.entities.child.rotation)))
            .mul(new Quat().setFromAxisAngle(new Vec3(0, 0, 1), 90)));

        const joint = migrated.entities.root.components.joint;
        expect([joint.linearMotionX, joint.linearMotionY, joint.linearMotionZ]).to.deep.equal(['locked', 'free', 'limited']);
        expect([joint.linearLimitsX, joint.linearLimitsY, joint.linearLimitsZ]).to.deep.equal([[-6, -5], [1, 2], [3, 4]]);
        expect(joint.linearStiffness).to.deep.equal([3, 1, 2]);
        expect(joint.linearDamping).to.deep.equal([6, 4, 5]);
        expect(joint.linearEquilibrium).to.deep.equal([-9, 7, 8]);
        expect([joint.angularMotionX, joint.angularMotionY, joint.angularMotionZ]).to.deep.equal(['locked', 'limited', 'free']);
        expect([joint.angularLimitsX, joint.angularLimitsY, joint.angularLimitsZ]).to.deep.equal([[5, 6], [-2, -1], [-4, -3]]);
        expect(joint.angularStiffness).to.deep.equal([9, 7, 8]);
        expect(joint.angularDamping).to.deep.equal([12, 10, 11]);
        expect(joint.angularEquilibrium).to.deep.equal([15, -13, -14]);

        const preview = previewMigratedSceneTransforms(migrated);
        expectQuaternionEquivalent(preview.entities.child.rotation, new Quat().setFromEulerAngles(new Vec3(source.entities.child.rotation)));
        expect(preview.entities.child.components.joint).to.deep.equal(source.entities.child.components.joint);
        expect(preview.entities.root.components.joint).to.deep.equal(source.entities.root.components.joint);
    });

    it('upgrades version 5 scenes with newly converted component data exactly once', function () {
        const source = createLegacyScene();
        source.entities.child.components.joint = { type: 'hinge', limits: [-10, 40] };
        source.entities.child.components.zone = { size: [1, 2, 3] };
        const upgradedFrom = migrateLegacySceneTransforms(source);
        upgradedFrom.coordinateMigration = {
            version: 5,
            scope: 'entity-local-prs-settings-physics-components-light-directions',
            basis: 'ue-x-forward-y-right-z-up',
            euler: 'unreal-roll-pitch-yaw-xyz-degrees'
        };
        upgradedFrom.settings.render.lightingCells = source.settings.render.lightingCells.slice();
        upgradedFrom.entities.child.rotation = unrealRotationToEuler(
            legacyToUnrealRotation(new Quat().setFromEulerAngles(new Vec3(source.entities.child.rotation)))).toArray();
        upgradedFrom.entities.child.components.joint = structuredClone(source.entities.child.components.joint);
        upgradedFrom.entities.child.components.zone = structuredClone(source.entities.child.components.zone);

        const upgraded = migrateLegacySceneTransforms(upgradedFrom);
        expect(upgraded.coordinateMigration.version).to.equal(11);
        expect(upgraded.entities.child.position).to.deep.equal([-2, -3, 0]);
        expect(upgraded.entities.child.components.zone.size).to.deep.equal([3, 1, 2]);
        expect(upgraded.entities.child.components.joint.limits).to.deep.equal([-40, 10]);
        expectUnrealQuaternionEquivalent(upgraded.entities.child.rotation,
            legacyToUnrealRotation(new Quat().setFromEulerAngles(new Vec3(source.entities.child.rotation)))
            .mul(new Quat().setFromAxisAngle(new Vec3(0, 0, 1), 90)));
        expect(migrateLegacySceneTransforms(upgraded)).to.deep.equal(upgraded);
    });

    it('upgrades version 6 Paper2D markers without converting their transforms twice', function () {
        const source = createLegacyScene();
        source.entities.root.components = { zone: { size: [3, 4, 5] } };
        source.entities.child.components = { sprite: { enabled: true } };
        const migrated = migrateLegacySceneTransforms(source, { paper2dEntityIds: ['root', 'child'] });
        const oldMarker = structuredClone(migrated);
        oldMarker.coordinateMigration = {
            version: 6,
            scope: 'entity-local-prs-settings-physics-components-light-directions-paper2d',
            basis: 'ue-x-forward-y-right-z-up',
            euler: 'unreal-roll-pitch-yaw-xyz-degrees',
            paper2dEntities: ['child', 'root']
        };
        oldMarker.settings.render.lightingCells = source.settings.render.lightingCells.slice();
        oldMarker.entities.root.components.zone.size = [3, 4, 5];

        const upgraded = migrateLegacySceneTransforms(oldMarker, { paper2dEntityIds: ['child', 'root'] });
        expect(upgraded.coordinateMigration.version).to.equal(12);
        expect(upgraded.entities.root.position).to.deep.equal(migrated.entities.root.position);
        expect(upgraded.entities.root.components.zone.size).to.deep.equal([3, 5, 4]);
        expect(previewMigratedSceneTransforms(upgraded).entities.root.components.zone.size).to.deep.equal([3, 4, 5]);
        expect(migrateLegacySceneTransforms(upgraded)).to.deep.equal(upgraded);
    });

    it('upgrades version 3 scene data by converting physics components only once', function () {
        const source = createLegacyScene();
        source.entities.child.components.collision = { type: 'cylinder', halfExtents: [1, 2, 3], axis: 0 };
        const latest = migrateLegacySceneTransforms(source);
        const v3 = structuredClone(latest);
        v3.coordinateMigration = {
            version: 3, scope: 'entity-local-prs-and-settings', basis: 'ue-x-forward-y-right-z-up', euler: 'unreal-roll-pitch-yaw-xyz-degrees'
        };
        v3.settings.render.lightingCells = source.settings.render.lightingCells.slice();
        v3.entities.child.components.collision = structuredClone(source.entities.child.components.collision);
        const upgraded = migrateLegacySceneTransforms(v3);
        expect(upgraded.entities.child.position).to.deep.equal(latest.entities.child.position);
        expect(upgraded.entities.child.scale).to.deep.equal(latest.entities.child.scale);
        expect(upgraded.entities.child.components.collision).to.deep.equal(latest.entities.child.components.collision);
        expect(upgraded.coordinateMigration).to.deep.equal(latest.coordinateMigration);
    });

    it('upgrades old light directions and preserves them through legacy preview', function () {
        const source = createLegacyScene();
        const oldRotation = new Quat().setFromEulerAngles(new Vec3(source.entities.root.rotation));
        const oldDirection = oldRotation.transformVector(new Vec3(0, -1, 0));
        const expectedUnrealDirection = legacyToUnrealVector(oldDirection);
        const taggedV4 = migrateLegacySceneTransforms(createLegacyScene());
        taggedV4.entities.root.components.light = { type: 'directional' };
        taggedV4.coordinateMigration = {
            version: 4,
            scope: 'entity-local-prs-settings-physics-components',
            basis: 'ue-x-forward-y-right-z-up',
            euler: 'unreal-roll-pitch-yaw-xyz-degrees'
        };
        taggedV4.settings.render.lightingCells = source.settings.render.lightingCells.slice();
        const upgraded = migrateLegacySceneTransforms(taggedV4);
        const unrealDirection = unrealEulerToRotation(new Vec3(upgraded.entities.root.rotation))
        .transformVector(Vec3.RIGHT.clone());
        const legacyPreview = previewMigratedSceneTransforms(upgraded);
        const previewRotation = new Quat().setFromEulerAngles(new Vec3(legacyPreview.entities.root.rotation));
        const previewDirection = previewRotation.transformVector(new Vec3(0, -1, 0));

        expect(unrealDirection.equalsApprox(expectedUnrealDirection, 1e-5)).to.be.true;
        expect(previewDirection.equalsApprox(oldDirection, 1e-5)).to.be.true;
        expect(upgraded.coordinateMigration.version).to.equal(11);
    });

    it('upgrades version 2 Euler data and nonuniform scale without changing orientation', function () {
        const v3 = migrateLegacySceneTransforms(createLegacyScene());
        const v2 = structuredClone(v3);
        v2.coordinateMigration = {
            version: 2, scope: 'entity-local-prs-and-settings', basis: 'ue-x-forward-y-right-z-up', euler: 'intrinsic-xyz-degrees'
        };
        v2.settings.render.lightingCells = [8, 2, 4];
        for (const entity of Object.values(v2.entities)) {
            entity.rotation = unrealEulerToRotation(new Vec3(entity.rotation)).getEulerAngles().toArray();
        }
        for (const field of ['skyboxRotation', 'skyMeshRotation']) {
            v2.settings.render[field] = unrealEulerToRotation(new Vec3(v2.settings.render[field])).getEulerAngles().toArray();
        }
        const upgraded = migrateLegacySceneTransforms(v2);
        expect(upgraded.coordinateMigration).to.deep.equal(v3.coordinateMigration);
        expect(upgraded.entities.root.scale).to.deep.equal([4, 2, 3]);
        expectUnrealQuaternionEquivalent(upgraded.entities.root.rotation, unrealEulerToRotation(new Vec3(v3.entities.root.rotation)));
        expect(previewMigratedSceneTransforms(upgraded).entities.root.scale).to.deep.equal([2, 3, 4]);
    });

    it('expands field-compressed entities with both PRS index encodings', function () {
        const source = {
            compressedFormat: {
                fieldFirstCode: 65,
                fieldCodeBase: 64,
                fieldArray: ['resource_id', 'parent', 'children', 'components', 'name'],
                singleVecs: [2, 3, 4, 23, -41, 67, 2, 3, 4, -3, 0, 2, 0, 45, 0, 1, 1, 2],
                tripleVecs: [9, 12, 15]
            },
            entities: {
                root: { A: 'root', B: null, C: ['child'], D: {}, E: 'Root', ___1: [0, 3, 6] },
                child: { A: 'child', B: 'root', C: [], D: {}, E: 'Child', ___2: 0 }
            }
        };
        const original = structuredClone(source);
        const migrated = migrateLegacySceneTransforms(source);
        expect(source).to.deep.equal(original);
        expect(migrated).not.to.have.property('compressedFormat');
        expect(migrated.entities.root).not.to.have.property('___1');
        expect(migrated.entities.child).not.to.have.property('___2');
        expect(migrated.entities.root.position).to.deep.equal([-4, 2, 3]);
        expect(migrated.entities.child.position).to.deep.equal([-2, -3, 0]);
        expect(migrated.entities.child.children).to.deep.equal([]);
        expect(previewMigratedSceneTransforms(migrated).entities.root.position).to.deep.equal([2, 3, 4]);
        const cached = structuredClone(source);
        cached.entDecompressed = true;
        cached.entities = { root: original.entities.root };
        cached.entities.root = { resource_id: 'root', parent: null, children: [], components: {}, ___1: [0, 3, 6] };
        expect(migrateLegacySceneTransforms(cached).entities.root.position).to.deep.equal([-4, 2, 3]);
        const partial = structuredClone(source);
        partial.entDecompressed = true;
        partial.entities = {
            root: { resource_id: 'root', parent: null, children: [], components: {}, position: [2, 3, 4], rotation: [23, -41, 67], scale: [2, 3, 4] }
        };
        expect(migrateLegacySceneTransforms(partial).entities.root.position).to.deep.equal([-4, 2, 3]);
    });

    it('previews marked scene through shared SceneParser and template without changing source', function () {
        const source = createLegacyScene();
        source.entities.root.components = {};
        const tagged = migrateLegacySceneTransforms(source);
        const original = structuredClone(tagged);
        const app = { _entityIndex: {}, systems: { list: [] } };
        const parser = new SceneParser(app, false);
        const first = parser.parse(tagged);
        const again = parser.parse(tagged);
        const legacy = parser.parse(source);
        expect(first.getLocalPosition().equalsApprox(new Vec3(tagged.entities.root.position))).to.be.false;
        expect(first.getLocalPosition().equalsApprox(new Vec3(source.entities.root.position))).to.be.true;
        expectQuaternionEquivalent(first.getLocalEulerAngles().toArray(), new Quat().setFromEulerAngles(23, -41, 67));
        expect(first.getLocalScale().equalsApprox(new Vec3(source.entities.root.scale))).to.be.true;
        expect(again.getLocalPosition().equalsApprox(first.getLocalPosition())).to.be.true;
        expect(first.children[0].getLocalPosition().equalsApprox(new Vec3(source.entities.child.position))).to.be.true;
        expect(legacy.getLocalPosition().equalsApprox(first.getLocalPosition())).to.be.true;
        expect(tagged).to.deep.equal(original);
        expect(previewMigratedSceneTransforms(tagged).settings.physics.gravity).to.deep.equal(source.settings.physics.gravity);
        const template = new Template(app, tagged);
        const instance = template.instantiate();
        expect(instance.getLocalPosition().equalsApprox(first.getLocalPosition())).to.be.true;
        template.data = migrateLegacySceneTransforms({ ...source, entities: { ...source.entities, root: { ...source.entities.root, position: [5, 0, 0] } } });
        expect(template.instantiate().getLocalPosition().x).to.equal(5);
    });

    it('loads tagged scenes in Unreal mode without previewing the migrated basis', function () {
        const source = createLegacyScene();
        source.entities.root.components = {};
        const tagged = migrateLegacySceneTransforms(source);
        const parser = new SceneParser({ coordinateSystem: 'unreal', _entityIndex: {}, systems: { list: [] } }, false);
        const root = parser.parse(tagged);

        expect(root.coordinateSystem).to.equal('unreal');
        expect(root.getLocalPosition().equalsApprox(new Vec3(tagged.entities.root.position))).to.be.true;
        expect(root.getLocalScale().equalsApprox(new Vec3(tagged.entities.root.scale))).to.be.true;
        expectQuaternionEquivalent(root.getLocalEulerAngles().toArray(), new Quat().setFromEulerAngles(...tagged.entities.root.rotation));
        expect(() => parser.parse(source)).to.throw('requires scene data migrated with migrateLegacySceneTransforms()');
    });

    it('migrates a checked-in scene fixture and previews its original placement', function () {
        const source = JSON.parse(readFileSync(new URL('../../assets/scene.json', import.meta.url), 'utf8'));
        const original = structuredClone(source);
        const migrated = migrateLegacySceneTransforms(source);
        const preview = previewMigratedSceneTransforms(migrated);
        expect(Object.keys(migrated.entities)).to.have.length(5);
        for (const [id, entity] of Object.entries(source.entities)) {
            expect(new Vec3(preview.entities[id].position).equalsApprox(new Vec3(entity.position))).to.be.true;
            expect(new Vec3(preview.entities[id].scale).equalsApprox(new Vec3(entity.scale))).to.be.true;
            expectQuaternionEquivalent(preview.entities[id].rotation, new Quat().setFromEulerAngles(new Vec3(entity.rotation)));
            expect(migrated.entities[id].components).to.deep.equal(entity.components);
        }
        expect(source).to.deep.equal(original);
        expect(new Vec3(migrated.settings.physics.gravity).equals(new Vec3(0, 0, -9.8))).to.be.true;
        expect(new Vec3(migrated.settings.render.skyCenter).equals(new Vec3(0, 0, 1))).to.be.true;
        expect(preview.settings.physics.gravity).to.deep.equal(source.settings.physics.gravity);
        expect(new Vec3(preview.settings.render.skyCenter).equals(new Vec3(0, 1, 0))).to.be.true;
        expectQuaternionEquivalent(preview.settings.render.skyboxRotation,
            new Quat().setFromEulerAngles(new Vec3(source.settings.render.skyboxRotation)));
        expect(preview.settings.render.skyMeshRotation).to.equal(undefined);
    });

    it('previews migrated settings before SceneHandler applies them', function () {
        const source = createLegacyScene();
        source.entities.root.components = {};
        let appliedSettings;
        const app = {
            _entityIndex: {},
            systems: { list: [], script: { preloading: false } },
            scene: {},
            applySceneSettings: (value) => {
                appliedSettings = value;
            }
        };
        const tagged = migrateLegacySceneTransforms(source);
        const handler = new SceneHandler(app);
        const result = handler.open('test-scene', tagged);
        expect(result.root.getLocalPosition().equalsApprox(new Vec3(source.entities.root.position))).to.be.true;
        expect(new Vec3(appliedSettings.physics.gravity).equals(new Vec3(source.settings.physics.gravity))).to.be.true;
        expect(new Vec3(appliedSettings.render.skyMeshPosition).equals(new Vec3(source.settings.render.skyMeshPosition))).to.be.true;
        expect(new Vec3(appliedSettings.render.skyMeshScale).equals(new Vec3(source.settings.render.skyMeshScale))).to.be.true;
        expectQuaternionEquivalent(appliedSettings.render.skyboxRotation,
            new Quat().setFromEulerAngles(new Vec3(source.settings.render.skyboxRotation)));
        expectQuaternionEquivalent(appliedSettings.render.skyMeshRotation,
            new Quat().setFromEulerAngles(new Vec3(source.settings.render.skyMeshRotation)));
        expect(new Vec3(tagged.settings.physics.gravity).equals(new Vec3(0, 0, -9.81))).to.be.true;
    });

    it('applies tagged scene settings directly in Unreal mode', function () {
        const source = createLegacyScene();
        source.entities.root.components = {};
        const tagged = migrateLegacySceneTransforms(source);
        let appliedSettings;
        const app = {
            coordinateSystem: 'unreal',
            _entityIndex: {},
            systems: { list: [], script: { preloading: false } },
            scene: {},
            applySceneSettings: (value) => {
                appliedSettings = value;
            }
        };
        const handler = new SceneHandler(app);
        const result = handler.open('test-scene', tagged);

        expect(result.root.coordinateSystem).to.equal('unreal');
        expect(result.root.getLocalPosition().equalsApprox(new Vec3(tagged.entities.root.position))).to.be.true;
        expect(new Vec3(appliedSettings.physics.gravity).equals(new Vec3(0, 0, -9.81))).to.be.true;
        expect(appliedSettings).to.deep.equal(tagged.settings);
        expect(() => handler.open('legacy-scene', source)).to.throw('requires scene data migrated with migrateLegacySceneTransforms()');
    });

    it('rejects malformed compressed PRS indices before producing tagged data', function () {
        const compressed = {
            compressedFormat: {
                fieldFirstCode: 65,
                fieldCodeBase: 64,
                fieldArray: ['resource_id', 'parent', 'children', 'components'],
                singleVecs: [0, 0, 0, 0, 0, 0, 1, 1, 1],
                tripleVecs: [0, 3, 6]
            },
            entities: {
                root: { A: 'root', B: null, C: [], D: {}, ___2: 0 }
            }
        };
        const malformed = structuredClone(compressed);
        malformed.entities.root.___2 = -1;
        expect(() => migrateLegacySceneTransforms(malformed)).to.throw('Invalid compressed transform');
        malformed.entities.root.___2 = 0;
        malformed.entities.root.___1 = [0, 3, 6];
        expect(() => migrateLegacySceneTransforms(malformed)).to.throw('Invalid compressed transform');
        malformed.entities.root.___1 = [0, 3, 7];
        delete malformed.entities.root.___2;
        expect(() => migrateLegacySceneTransforms(malformed)).to.throw('Invalid scale');
    });

    it('rejects unknown marked scenes instead of silently interpreting their axes', function () {
        const tagged = migrateLegacySceneTransforms(createLegacyScene());
        tagged.coordinateMigration.basis = 'other';
        expect(() => new SceneParser({ systems: { list: [] } }, false).parse(tagged)).to.throw('Unsupported scene coordinateMigration marker');
        expect(() => previewMigratedSceneTransforms(createLegacyScene())).to.throw('Unsupported scene coordinateMigration marker');
    });
});
