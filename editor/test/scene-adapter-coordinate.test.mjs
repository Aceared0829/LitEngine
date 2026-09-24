import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity, Vec3, unrealEulerToRotation } from 'playcanvas';
import { SceneAdapter } from '../src/runtime/scene-adapter.mjs';

test('Inspector edits Unreal Roll/Pitch/Yaw and nonuniform XYZ scale', () => {
    const adapter = new SceneAdapter();
    const entity = new Entity('Cone');
    entity.coordinateSystem = 'unreal';
    adapter.register(entity, 'cone');

    const transform = {
        position: [2, -3, 4],
        rotation: [23, -41, 67],
        scale: [1.5, 1.5, 2.25]
    };
    const result = adapter.setTransform('cone', transform);
    assert.deepEqual(result.position, transform.position);
    assert.deepEqual(result.scale, transform.scale);
    const expected = unrealEulerToRotation(new Vec3(transform.rotation));
    assert.ok(Math.abs(entity.getLocalRotation().dot(expected)) > 1 - 1e-6);
    assert.ok(result.rotation.every((value, index) => Math.abs(value - transform.rotation[index]) < 1e-5));
    assert.equal(adapter.snapshot().entities[0].transform.scale[2], 2.25);
});
