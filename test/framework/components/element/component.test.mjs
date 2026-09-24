import { expect } from 'chai';

import { Vec3 } from '../../../../src/core/math/vec3.js';
import { Entity } from '../../../../src/framework/entity.js';
import { ElementInput } from '../../../../src/framework/input/element-input.js';
import { LAYERID_UI } from '../../../../src/scene/constants.js';
import { createApp } from '../../../app.mjs';
import { jsdomSetup, jsdomTeardown } from '../../../jsdom.mjs';

describe('ElementComponent', function () {
    let app;

    beforeEach(function () {
        jsdomSetup();
        app = createApp();
    });

    afterEach(function () {
        app?.destroy();
        app = null;
        jsdomTeardown();
    });

    describe('#constructor', function () {

        it('creates a default element component', function () {
            const e = new Entity();
            e.addComponent('element');

            expect(e.element.alignment).to.equal(null);
            expect(e.element.anchor.x).to.equal(0);
            expect(e.element.anchor.y).to.equal(0);
            expect(e.element.anchor.z).to.equal(0);
            expect(e.element.anchor.w).to.equal(0);
            expect(e.element.autoFitHeight).to.equal(null);
            expect(e.element.autoFitWidth).to.equal(null);
            expect(e.element.autoHeight).to.equal(null);
            expect(e.element.autoWidth).to.equal(null);
            expect(e.element.batchGroupId).to.equal(-1);
            expect(e.element.bottom).to.equal(0);
            expect(e.element.calculatedHeight).to.equal(32);
            expect(e.element.calculatedWidth).to.equal(32);
            expect(e.element.canvasCorners[0].x).to.equal(0);
            expect(e.element.canvasCorners[0].y).to.equal(0);
            expect(e.element.canvasCorners[1].x).to.equal(0);
            expect(e.element.canvasCorners[1].y).to.equal(0);
            expect(e.element.canvasCorners[2].x).to.equal(0);
            expect(e.element.canvasCorners[2].y).to.equal(0);
            expect(e.element.canvasCorners[3].x).to.equal(0);
            expect(e.element.canvasCorners[3].y).to.equal(0);
            expect(e.element.color).to.equal(null);
            expect(e.element.drawOrder).to.equal(0);
            expect(e.element.enableMarkup).to.equal(null);
            expect(e.element.font).to.equal(null);
            expect(e.element.fontAsset).to.equal(null);
            expect(e.element.fontSize).to.equal(null);
            expect(e.element.height).to.equal(32);
            expect(e.element.layers).to.contain(LAYERID_UI);
            expect(e.element.left).to.equal(0);
            expect(e.element.lineHeight).to.equal(null);
            expect(e.element.margin.x).to.equal(0);
            expect(e.element.margin.y).to.equal(0);
            expect(e.element.margin.z).to.equal(-32);
            expect(e.element.margin.w).to.equal(-32);
            expect(e.element.mask).to.equal(null);
            expect(e.element.material).to.equal(null);
            expect(e.element.materialAsset).to.equal(null);
            expect(e.element.maxFontSize).to.equal(null);
            expect(e.element.maxLines).to.equal(null);
            expect(e.element.minFontSize).to.equal(null);
            expect(e.element.opacity).to.equal(null);
            expect(e.element.outlineColor).to.equal(null);
            expect(e.element.outlineThickness).to.equal(null);
            expect(e.element.pivot.x).to.equal(0);
            expect(e.element.pivot.y).to.equal(0);
            expect(e.element.pixelsPerUnit).to.equal(null);
            expect(e.element.rangeEnd).to.equal(null);
            expect(e.element.rangeStart).to.equal(null);
            expect(e.element.rect).to.equal(null);
            expect(e.element.right).to.equal(-32);
            expect(e.element.rtlReorder).to.equal(null);
            expect(e.element.screen).to.equal(null);
            expect(e.element.screenCorners[0].x).to.equal(0);
            expect(e.element.screenCorners[0].y).to.equal(0);
            expect(e.element.screenCorners[0].z).to.equal(0);
            expect(e.element.screenCorners[1].x).to.equal(0);
            expect(e.element.screenCorners[1].y).to.equal(0);
            expect(e.element.screenCorners[1].z).to.equal(0);
            expect(e.element.screenCorners[2].x).to.equal(0);
            expect(e.element.screenCorners[2].y).to.equal(0);
            expect(e.element.screenCorners[2].z).to.equal(0);
            expect(e.element.screenCorners[3].x).to.equal(0);
            expect(e.element.screenCorners[3].y).to.equal(0);
            expect(e.element.screenCorners[3].z).to.equal(0);
            expect(e.element.shadowColor).to.equal(null);
            expect(e.element.shadowOffset).to.equal(null);
            expect(e.element.spacing).to.equal(null);
            expect(e.element.sprite).to.equal(null);
            expect(e.element.spriteAsset).to.equal(null);
            expect(e.element.spriteFrame).to.equal(null);
            expect(e.element.text).to.equal(null);
            expect(e.element.textHeight).to.equal(0);
            expect(e.element.textWidth).to.equal(0);
            expect(e.element.texture).to.equal(null);
            expect(e.element.textureAsset).to.equal(null);
            expect(e.element.top).to.equal(-32);
            expect(e.element.type).to.equal('group');
            expect(e.element.unicodeConverter).to.equal(null);
            expect(e.element.useInput).to.equal(false);
            expect(e.element.width).to.equal(32);
            expect(e.element.worldCorners[0].x).to.equal(0);
            expect(e.element.worldCorners[0].y).to.equal(0);
            expect(e.element.worldCorners[0].z).to.equal(0);
            expect(e.element.worldCorners[1].x).to.equal(32);
            expect(e.element.worldCorners[1].y).to.equal(0);
            expect(e.element.worldCorners[1].z).to.equal(0);
            expect(e.element.worldCorners[2].x).to.equal(32);
            expect(e.element.worldCorners[2].y).to.equal(32);
            expect(e.element.worldCorners[2].z).to.equal(0);
            expect(e.element.worldCorners[3].x).to.equal(0);
            expect(e.element.worldCorners[3].y).to.equal(32);
            expect(e.element.worldCorners[3].z).to.equal(0);
            expect(e.element.wrapLines).to.equal(null);
        });

    });

    it('uses top-left UI coordinates while preserving the same rendered bounds in Unreal mode', function () {
        const sampleCorners = (testApp) => {
            const unrealUi = testApp.coordinateSystem === 'unreal';
            const screen = new Entity();
            screen.addComponent('screen', { screenSpace: true });
            testApp.root.addChild(screen);

            const panel = new Entity();
            panel.addComponent('element', {
                anchor: unrealUi ? [0.1, 0.1, 0.8, 0.8] : [0.1, 0.2, 0.8, 0.9],
                pivot: unrealUi ? [0.3, 0.3] : [0.3, 0.7],
                margin: unrealUi ? [12, -48, -34, 24] : [12, 24, -34, -48],
                width: 180,
                height: 90
            });
            screen.addChild(panel);

            const child = new Entity();
            child.addComponent('element', {
                anchor: [0, 0, 1, 1],
                pivot: unrealUi ? [0, 1] : [0, 0],
                margin: unrealUi ? [5, 8, 7, 6] : [5, 6, 7, 8],
                width: 60,
                height: 30
            });
            panel.addChild(child);
            child.setLocalEulerAngles(0, 0, unrealUi ? -15 : 15);
            child.getWorldTransform();

            const corners = child.element.screenCorners.map((corner) => {
                const y = unrealUi ? corner.y : testApp.graphicsDevice.height - corner.y;
                return [corner.x, y];
            });
            const screenProjectionY = screen.screen._screenMatrix.data[5];
            screen.destroy();
            return { corners, screenProjectionY };
        };

        const legacy = sampleCorners(app);
        const unrealApp = createApp({ coordinateSystem: 'unreal' });
        let unreal;
        try {
            unreal = sampleCorners(unrealApp);
        } finally {
            unrealApp.destroy();
        }
        const sortCorners = corners => corners.map(([x, y]) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const expected = sortCorners(legacy.corners);
        const actual = sortCorners(unreal.corners);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i][0]).to.be.closeTo(expected[i][0], 1e-4);
            expect(actual[i][1]).to.be.closeTo(expected[i][1], 1e-4);
        }
        expect(legacy.screenProjectionY).to.be.greaterThan(0);
        expect(unreal.screenProjectionY).to.be.lessThan(0);
    });

    it('maps Unreal world-space Screen UI onto the YZ plane with a top-left origin', function () {
        const unrealApp = createApp({ coordinateSystem: 'unreal' });
        try {
            const screen = new Entity('world screen', unrealApp);
            screen.addComponent('screen', { screenSpace: false });
            unrealApp.root.addChild(screen);
            screen.screen.resolution = { x: 200, y: 100 };

            const toWorld = (x, y, z) => screen.screen._screenMatrix.transformPoint(
                new Vec3(x, y, z), new Vec3()
            );
            expect(toWorld(0, 0, 0).toArray()).to.deep.equal([0, -100, 50]);
            expect(toWorld(200, 100, 0).toArray()).to.deep.equal([0, 100, -50]);
            expect(toWorld(0, 0, 4).toArray()).to.deep.equal([4, -100, 50]);

            const panel = new Entity('panel', unrealApp);
            panel.addComponent('element', {
                type: 'image', width: 40, height: 20, anchor: [0, 0, 0, 0], pivot: [0, 1]
            });
            screen.addChild(panel);
            panel.element.top = 7;
            panel.element.bottom = 9;
            panel.getWorldTransform();
            expect(panel.element._isUnrealScreenUi()).to.be.true;
            expect(panel.element._isUnrealScreenSpace()).to.be.false;
            expect(panel.element.top).to.equal(7);
            expect(panel.element.bottom).to.equal(9);

            const corners = panel.element.worldCorners;
            const screenCorners = panel.element.screenCorners;
            for (let i = 0; i < corners.length; i++) {
                const expected = screen.screen._screenMatrix.transformPoint(screenCorners[i], new Vec3());
                expect(corners[i].x).to.be.closeTo(expected.x, 1e-5);
                expect(corners[i].y).to.be.closeTo(expected.y, 1e-5);
                expect(corners[i].z).to.be.closeTo(expected.z, 1e-5);
            }
            expect(corners.every(corner => Math.abs(corner.x) < 1e-5)).to.be.true;
            expect(Math.min(...corners.map(corner => corner.y))).to.be.lessThan(-50);
            expect(Math.max(...corners.map(corner => corner.y))).to.be.lessThan(0);
            expect(Math.max(...corners.map(corner => corner.z))).to.be.greaterThan(30);

            const renderable = panel.element._image._renderable;
            const vertexData = new Float32Array(renderable.mesh.vertexBuffer.lock());
            const renderedCorners = [];
            const worldTransform = renderable.node.getWorldTransform();
            for (let i = 0; i < 4; i++) {
                const offset = i * 8;
                const vertex = new Vec3(vertexData[offset], vertexData[offset + 1], vertexData[offset + 2]);
                renderedCorners.push(worldTransform.transformPoint(vertex, new Vec3()));
            }
            renderable.mesh.vertexBuffer.unlock();
            const remainingCorners = corners.map(corner => corner.clone());
            for (const renderedCorner of renderedCorners) {
                const matchingIndex = remainingCorners.findIndex(corner => corner.distance(renderedCorner) < 1e-5);
                expect(matchingIndex).to.be.greaterThan(-1);
                remainingCorners.splice(matchingIndex, 1);
            }

            const center = corners.reduce((sum, corner) => sum.add(corner), new Vec3()).mulScalar(1 / corners.length);
            const elementInput = new ElementInput(unrealApp.graphicsDevice.canvas, {
                useMouse: false, useTouch: false, useXr: false
            });
            const ray = {
                origin: new Vec3(center.x - 1, center.y, center.z),
                end: new Vec3(center.x + 1, center.y, center.z)
            };
            try {
                expect(elementInput._checkElement(ray, panel.element, false)).to.be.greaterThan(-1);
            } finally {
                elementInput.detach();
            }
            screen.destroy();
        } finally {
            unrealApp.destroy();
        }
    });

    it('expands button hit padding toward the correct screen-space edges', function () {
        const samplePadding = (testApp) => {
            const unrealUi = testApp.coordinateSystem === 'unreal';
            const screen = new Entity('screen', testApp);
            screen.addComponent('screen', { screenSpace: true });
            testApp.root.addChild(screen);

            const button = new Entity('button', testApp);
            button.addComponent('element', { width: 20, height: 20 });
            button.addComponent('button', { hitPadding: unrealUi ? [0, 10, 0, 5] : [0, 5, 0, 10] });
            screen.addChild(button);
            button.getWorldTransform();

            const element = button.element;
            const original = element.screenCorners.map(corner => corner.toArray());
            const expanded = ElementInput.buildHitCorners(element, element.screenCorners, new Vec3(1, 1, 1))
            .map(corner => corner.toArray());
            screen.destroy();
            return { unrealUi, original, expanded };
        };

        const legacy = samplePadding(app);
        const unrealApp = createApp({ coordinateSystem: 'unreal' });
        let unreal;
        try {
            unreal = samplePadding(unrealApp);
        } finally {
            unrealApp.destroy();
        }

        expect(legacy.expanded[3][1]).to.be.greaterThan(legacy.original[3][1]);
        expect(legacy.expanded[0][1]).to.be.lessThan(legacy.original[0][1]);
        expect(unreal.expanded[3][1]).to.be.lessThan(unreal.original[3][1]);
        expect(unreal.expanded[0][1]).to.be.greaterThan(unreal.original[0][1]);
    });

    it('unbinds screen component on reparent', function () {
        const screen = new Entity();
        screen.addComponent('screen');
        app.root.addChild(screen);

        const e = new Entity();
        e.addComponent('element');

        screen.addChild(e);

        expect(screen.screen._elements).to.include(e.element);

        e.reparent(app.root);

        expect(screen.screen._elements).to.not.include(e.element);
    });

    it('unbinds screen component on destroy', function () {
        const screen = new Entity();
        screen.addComponent('screen');
        app.root.addChild(screen);

        const e = new Entity();
        e.addComponent('element');

        screen.addChild(e);

        expect(screen.screen._elements).to.include(e.element);

        e.destroy();

        expect(screen.screen._elements).to.not.include(e.element);
    });

    it('can be reparented after its screen has been destroyed (#1151)', function () {
        const screen = new Entity();
        screen.addComponent('screen');
        app.root.addChild(screen);

        const e = new Entity();
        e.addComponent('element');
        screen.addChild(e);

        // detach the element for later reuse, then destroy its screen (e.g. on scene unload)
        e.reparent(null);
        screen.destroy();

        // the dangling screen reference should have been cleared
        expect(e.element.screen).to.equal(null);

        // reparenting the element again should not throw
        const newParent = new Entity();
        app.root.addChild(newParent);
        expect(() => newParent.addChild(e)).to.not.throw();
    });

    describe('#type', function () {

        it('adds model to layers when type is set to image after entity is in hierarchy', function () {
            // This tests the fix for: https://github.com/playcanvas/engine/issues/1989
            // When entity is added to hierarchy before element type is set, the image should still render
            const e = new Entity();
            app.root.addChild(e);

            e.addComponent('element');
            e.element.type = 'image';

            // Verify that the image element's model has been added to the layers
            const uiLayer = app.scene.layers.getLayerById(LAYERID_UI);
            expect(uiLayer).to.not.be.null;
            expect(e.element._image).to.not.be.null;
            expect(e.element._image._renderable.model).to.not.be.null;
            expect(e.element._addedModels).to.include(e.element._image._renderable.model);
        });

        it('adds model to layers when type is set to text after entity is in hierarchy', function () {
            const e = new Entity();
            app.root.addChild(e);

            e.addComponent('element');
            e.element.type = 'text';

            // Verify that the text element's model has been added to the layers
            expect(e.element._text).to.not.be.null;
            expect(e.element._text._model).to.not.be.null;
            expect(e.element._addedModels).to.include(e.element._text._model);
        });

        it('does not accumulate graph nodes when the type changes (#4333)', function () {
            const e = new Entity();
            app.root.addChild(e);

            e.addComponent('element', { type: 'text' });
            expect(e.children.length).to.equal(1);

            e.element.type = 'image';
            expect(e.children.length).to.equal(1);

            e.element.type = 'text';
            expect(e.children.length).to.equal(1);

            e.element.type = 'group';
            expect(e.children.length).to.equal(0);
        });

    });

    describe('#onBeforeRemove', function () {

        it('removes the text element graph node from the entity (#4333)', function () {
            const e = new Entity();
            app.root.addChild(e);

            e.addComponent('element', { type: 'text' });
            e.removeComponent('element');

            expect(e.children.length).to.equal(0);
        });

        it('removes the image element graph node from the entity (#4333)', function () {
            const e = new Entity();
            app.root.addChild(e);

            e.addComponent('element', { type: 'image' });
            e.removeComponent('element');

            expect(e.children.length).to.equal(0);
        });

    });
});
