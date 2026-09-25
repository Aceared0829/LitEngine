import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity } from 'playcanvas';

import { SceneAdapter } from '../src/runtime/scene-adapter.mjs';

test('duplicates an entity hierarchy as a sibling and restores it with stable editor identity', () => {
    const app = { _entityIndex: {}, coordinateSystem: 'unreal' };
    const root = new Entity('Scene', app);
    const source = new Entity('Box', app);
    const sourceChild = new Entity('Box Mesh', app);
    root.addChild(source);
    source.addChild(sourceChild);
    source.setLocalPosition(2, -3, 4);
    source.setLocalScale(1.5, 2, 2.5);

    const scene = new SceneAdapter();
    scene.register(source, 'box');
    scene.setInitialTransform('box', scene.getTransform('box'));

    const duplicate = scene.duplicate('box', 'box-copy-1', 'Box Copy');
    assert.ok(duplicate);
    assert.notEqual(duplicate.entity, source);
    assert.equal(duplicate.enabled, source.enabled);
    assert.equal(duplicate.entity.enabled, false, 'a provisional clone remains hidden until its drag is committed');
    assert.equal(duplicate.entity.parent, root);
    assert.equal(duplicate.entity.children[0].name, sourceChild.name);
    assert.notEqual(duplicate.entity.children[0], sourceChild);
    assert.deepEqual(scene.getTransform('box-copy-1'), scene.getTransform('box'));
    assert.deepEqual(scene.snapshot().entities.map(entity => entity.id), ['box', 'box-copy-1']);

    const detached = scene.remove('box-copy-1');
    assert.equal(detached, duplicate.entity);
    assert.equal(detached.parent, null);
    assert.deepEqual(scene.snapshot().entities.map(entity => entity.id), ['box']);

    assert.equal(scene.restore(detached, 'box-copy-1', duplicate.parent, duplicate.initialTransform), true);
    assert.equal(detached.parent, root);
    assert.deepEqual(scene.getInitialTransform('box-copy-1'), duplicate.initialTransform);
    assert.equal(scene.restore(detached, 'box-copy-1', duplicate.parent, duplicate.initialTransform), false);
});
