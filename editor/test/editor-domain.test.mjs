import assert from 'node:assert/strict';
import test from 'node:test';

import { Entity } from 'playcanvas';
import { activatePanel, clampDockWidth, closeFloatingWindow, containsPanel, DEFAULT_LAYOUT, dockPanel, externalizeFloatingWindow, externalizePanel, floatPanel, hidePanel, normalizeWorkspaceLayout, readWorkspaceLayout, resizeFloatingBounds, resizeSplit, restoreExternalGroup, restoreExternalPanel, showPanel, writeWorkspaceLayout } from '../src/shell/layout-preferences.mjs';
import { dropPositionAt } from '../src/shell/WorkspacePanels.mjs';
import { isFiniteVector3 } from '../src/domain/editor-reducer.mjs';
import { TransformHistory } from '../src/runtime/transform-history.mjs';

test('clamps and normalizes nested splits and floating geometry', () => {
    assert.equal(clampDockWidth(Number.NaN, 100, 300), 100);
    assert.equal(clampDockWidth(450, 100, 300), 300);
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT, 900, 700);
    const resized = resizeSplit(initial, null, [], 9);
    assert.equal(normalizeWorkspaceLayout(resized).root.ratio, 0.88);
    const floating = normalizeWorkspaceLayout(floatPanel(initial, 'inspector', { x: 9999, y: 9999 }), 900, 700);
    assert.ok(floating.floats[0].x + floating.floats[0].width <= 900);
    assert.ok(floating.floats[0].y + floating.floats[0].height <= 700);
});

test('any panel splits or groups relative to another panel, including the viewport', () => {
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT, 1100, 700);
    const top = dockPanel(initial, 'viewport', 'inspector', 'top');
    assert.equal(top.root.second.axis, 'column');
    assert.ok(containsPanel(top.root.second.first, 'viewport'));
    assert.ok(containsPanel(top.root.second.second, 'inspector'));

    const grouped = dockPanel(top, 'inspector', 'hierarchy', 'center');
    assert.deepEqual(grouped.root.first.ids, ['hierarchy', 'inspector']);
    assert.equal(grouped.root.first.active, 'inspector');
    assert.equal(activatePanel(grouped, 'hierarchy').root.first.active, 'hierarchy');

    const floating = floatPanel(grouped, 'inspector', { x: 100, y: 100 });
    const nestedFloat = dockPanel(floating, 'hierarchy', 'inspector', 'bottom');
    assert.equal(nestedFloat.floats[0].root.axis, 'column');
    assert.ok(containsPanel(nestedFloat.floats[0].root.second, 'hierarchy'));

    assert.equal(hidePanel(nestedFloat, 'viewport'), nestedFloat);
    const hidden = hidePanel(nestedFloat, 'hierarchy');
    assert.ok(hidden.hidden.includes('hierarchy'));
    const reopened = showPanel(hidden, 'hierarchy');
    assert.ok(containsPanel(reopened.root, 'hierarchy'));
    assert.ok(!reopened.hidden.includes('hierarchy'));
});

test('drop position uses the whole panel edge or center, with its title as tab target', () => {
    const rect = { left: 100, right: 500, top: 50, bottom: 450, width: 400, height: 400 };
    assert.equal(dropPositionAt(rect, 300, 60), 'center');
    assert.equal(dropPositionAt(rect, 105, 250), 'left');
    assert.equal(dropPositionAt(rect, 495, 250), 'right');
    assert.equal(dropPositionAt(rect, 300, 100), 'top');
    assert.equal(dropPositionAt(rect, 300, 445), 'bottom');
    assert.equal(dropPositionAt(rect, 300, 250), 'center');
});

test('floating window resizes from every edge without moving the opposite edge', () => {
    const window = { x: 100, y: 80, width: 400, height: 300 };
    assert.deepEqual(resizeFloatingBounds(window, 'nw', 50, 25, 900, 700), { x: 150, y: 105, width: 350, height: 275 });
    assert.deepEqual(resizeFloatingBounds(window, 'se', 30, 40, 900, 700), { x: 100, y: 80, width: 430, height: 340 });
    assert.deepEqual(resizeFloatingBounds(window, 'w', 999, 0, 900, 700), { x: 260, y: 80, width: 240, height: 300 });
    assert.deepEqual(resizeFloatingBounds(window, 'n', 0, -999, 900, 700), { x: 100, y: 0, width: 400, height: 380 });
    assert.deepEqual(resizeFloatingBounds(window, 'e', 999, 0, 900, 700), { x: 100, y: 80, width: 800, height: 300 });
    assert.deepEqual(resizeFloatingBounds(window, 's', 0, 999, 900, 700), { x: 100, y: 80, width: 400, height: 620 });
});

test('floating window states survive normalization and closing hides every tool tab', () => {
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT);
    const floating = floatPanel(initial, 'inspector');
    const grouped = dockPanel(floating, 'hierarchy', 'inspector', 'center');
    const minimized = normalizeWorkspaceLayout({
        ...grouped,
        floats: grouped.floats.map(item => ({ ...item, minimized: true, maximized: true }))
    });
    assert.equal(minimized.floats[0].minimized, true);
    assert.equal(minimized.floats[0].maximized, false);
    const closed = closeFloatingWindow(minimized, minimized.floats[0].id);
    assert.equal(closed.floats.length, 0);
    assert.deepEqual([...closed.hidden].sort(), ['hierarchy', 'inspector']);
    assert.equal(containsPanel(closed.root, 'viewport'), true);
});

test('splitting a floating group assigns each floating surface a distinct identity', () => {
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT);
    const grouped = dockPanel(floatPanel(initial, 'hierarchy'), 'inspector', 'hierarchy', 'right');
    const separated = floatPanel(grouped, 'hierarchy');
    assert.deepEqual(separated.floats.map(item => item.id), ['float-hierarchy', 'float-hierarchy-2']);
    assert.ok(containsPanel(separated.floats[0].root, 'inspector'));
    assert.ok(containsPanel(separated.floats[1].root, 'hierarchy'));

    const external = externalizeFloatingWindow(separated, 'float-hierarchy-2', { screenX: 100, screenY: 100 });
    assert.equal(external.floats.length, 1);
    assert.equal(external.floats[0].id, 'float-hierarchy');
    assert.equal(external.externalGroups[0].id, 'float-hierarchy-2');
});

test('normalization repairs duplicate floating surface identities from saved layouts', () => {
    const layout = normalizeWorkspaceLayout({
        root: { type: 'tabs', ids: ['viewport'], active: 'viewport' },
        floats: [
            { id: 'shared', root: { type: 'tabs', ids: ['hierarchy'], active: 'hierarchy' }, x: 0, y: 0, width: 340, height: 420 },
            { id: 'shared', root: { type: 'tabs', ids: ['inspector'], active: 'inspector' }, x: 0, y: 0, width: 340, height: 420 }
        ],
        externalGroups: []
    });
    assert.deepEqual(layout.floats.map(item => item.id), ['shared', 'shared-2']);
});

test('a complete floating group leaves for a native window and returns intact', () => {
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT, 1200, 800);
    const floating = floatPanel(initial, 'hierarchy', { x: 150, y: 100, width: 600, height: 450 });
    const grouped = dockPanel(floating, 'inspector', 'hierarchy', 'right');
    const external = normalizeWorkspaceLayout(externalizeFloatingWindow(grouped, grouped.floats[0].id, { screenX: -1200, screenY: 200 }), 1200, 800);
    assert.equal(external.floats.length, 0);
    assert.equal(external.externalGroups.length, 1);
    assert.equal(external.externalGroups[0].screenX, -1200);
    assert.equal(external.externalGroups[0].root.axis, 'row');
    assert.deepEqual(external.hidden, []);
    assert.ok(containsPanel(external.root, 'viewport'));
    const restored = normalizeWorkspaceLayout(restoreExternalGroup(external, external.externalGroups[0].id), 1200, 800);
    assert.equal(restored.externalGroups.length, 0);
    assert.equal(restored.floats[0].root.axis, 'row');
    assert.ok(containsPanel(restored.floats[0].root.first, 'hierarchy'));
    assert.ok(containsPanel(restored.floats[0].root.second, 'inspector'));
});

test('viewport cannot close or float, while tool panels can leave and return from native windows', () => {
    const initial = normalizeWorkspaceLayout(DEFAULT_LAYOUT);
    assert.equal(hidePanel(initial, 'viewport'), initial);
    assert.equal(floatPanel(initial, 'viewport'), initial);
    const external = externalizePanel(initial, 'inspector');
    assert.deepEqual(external.external, ['inspector']);
    assert.equal(containsPanel(external.root, 'inspector'), false);
    assert.equal(containsPanel(external.root, 'viewport'), true);
    const restored = restoreExternalPanel(external, 'inspector');
    assert.deepEqual(restored.external, []);
    assert.equal(containsPanel(restored.root, 'inspector'), true);

    const damaged = normalizeWorkspaceLayout({ root: { type: 'tabs', ids: ['hierarchy'], active: 'hierarchy' }, floats: [], external: [] });
    assert.equal(containsPanel(damaged.root, 'viewport'), true);
    assert.equal(damaged.hidden.includes('viewport'), false);
    const invalidFloat = normalizeWorkspaceLayout({ root: null, floats: [{ id: 'bad', root: { type: 'tabs', ids: ['viewport'], active: 'viewport' }, x: 0, y: 0, width: 300, height: 300 }] });
    assert.ok(containsPanel(invalidFloat.root, 'viewport'));
    assert.equal(invalidFloat.floats.length, 0);
});

test('workspace preferences migrate legacy collapsed panels and persist the new layout', (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map([['lit-engine-editor.workspace.v1', JSON.stringify({ hierarchyWidth: 290, inspectorWidth: 350, inspectorCollapsed: true })]]);
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
    });
    t.after(() => {
        if (previous) {
            Object.defineProperty(globalThis, 'localStorage', previous);
        } else {
            delete globalThis.localStorage;
        }
    });
    const migrated = readWorkspaceLayout();
    assert.ok(containsPanel(migrated.root, 'viewport'));
    assert.ok(migrated.hidden.includes('inspector'));
    writeWorkspaceLayout(migrated);
    assert.deepEqual(readWorkspaceLayout(), migrated);
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
