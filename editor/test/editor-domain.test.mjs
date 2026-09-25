import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity } from 'playcanvas';
import { clampDockWidth, normalizeWorkspaceLayout } from '../src/shell/layout-preferences.mjs';
import { isFiniteVector3 } from '../src/domain/editor-reducer.mjs';
import { TransformHistory } from '../src/runtime/transform-history.mjs';

test('clamps and normalizes persisted dock geometry', () => {
    assert.equal(clampDockWidth(Number.NaN, 100, 300), 100);
    assert.equal(clampDockWidth(450, 100, 300), 300);
    const layout = normalizeWorkspaceLayout({ hierarchyWidth: 900, inspectorWidth: -5 }, 900);
    assert.ok(layout.hierarchyWidth <= 440);
    assert.ok(layout.inspectorWidth >= 230);
});

test('validates only finite XYZ transforms', () => {
    assert.equal(isFiniteVector3([0, 1, 2]), true);
    assert.equal(isFiniteVector3([0, Number.NaN, 2]), false);
    assert.equal(isFiniteVector3([0, 1]), false);
});

test('records reversible transform operations', () => {
    const history = new TransformHistory();
    const before = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const after = { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    assert.equal(history.commit({ entityId: 'box', before, after, label: 'Move Box' }), true);
    assert.equal(history.snapshot().canUndo, true);
    assert.equal(history.undo()?.before.position[0], 0);
    assert.equal(history.snapshot().canRedo, true);
    assert.equal(history.redo()?.after.position[0], 1);
});

test('does not record a transform without changes', () => {
    const history = new TransformHistory();
    const transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    assert.equal(history.commit({ entityId: 'box', before: transform, after: transform, label: 'No change' }), false);
    assert.equal(history.snapshot().canUndo, false);
});

test('records duplicate gestures atomically and releases an undone copy when redo is discarded', () => {
    const root = new Entity('Scene');
    const entity = new Entity('Box Copy');
    root.addChild(entity);
    let destroyed = 0;
    entity.on('destroy', () => destroyed++);

    const initialTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const afterTransform = { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const duplicateEntry = {
        type: 'duplicate',
        entityId: 'box-copy-1',
        sourceEntityId: 'box',
        entity,
        parent: root,
        initialTransform,
        before: initialTransform,
        after: afterTransform,
        label: 'Duplicate Move Box Copy'
    };
    const history = new TransformHistory();

    assert.equal(history.commit(duplicateEntry), true);
    assert.equal(history.undo(), duplicateEntry);
    root.removeChild(entity);
    assert.equal(history.redo(), duplicateEntry);
    root.addChild(entity);
    assert.equal(history.snapshot().canUndo, true);
    assert.equal(history.undo(), duplicateEntry);
    root.removeChild(entity);

    assert.equal(history.commit({
        entityId: 'box',
        before: initialTransform,
        after: afterTransform,
        label: 'Move Box'
    }), true);
    assert.equal(destroyed, 1);
});
