import { expect } from 'chai';

import { getShapePrimitive } from '../../../src/framework/graphics/primitive-cache.js';
import { NullGraphicsDevice } from '../../../src/platform/graphics/null/null-graphics-device.js';
import { BoxGeometry } from '../../../src/scene/geometry/box-geometry.js';
import { ConeGeometry } from '../../../src/scene/geometry/cone-geometry.js';
import { Geometry } from '../../../src/scene/geometry/geometry.js';
import { PlaneGeometry } from '../../../src/scene/geometry/plane-geometry.js';

describe('Unreal procedural geometry conversion', function () {
    it('turns a ground plane into the XY plane with +Z normals and preserved front faces', function () {
        const plane = new PlaneGeometry({ widthSegments: 1, lengthSegments: 1, calculateTangents: true });
        const sourcePosition = plane.positions.slice(0, 3);
        const sourceIndices = plane.indices.slice(0, 3);
        const sourceUv = plane.uvs.slice();
        const sourceTangentW = plane.tangents[3];

        expect(plane.convertToUnrealCoordinates()).to.equal(plane);
        expect(plane.coordinateSystem).to.equal('unreal');
        expect(plane.positions.slice(0, 3)).to.deep.equal([-sourcePosition[2], sourcePosition[0], sourcePosition[1]]);
        expect(plane.normals.slice(0, 3).map(value => value || 0)).to.deep.equal([0, 0, 1]);
        expect(plane.indices.slice(0, 3)).to.deep.equal([sourceIndices[0], sourceIndices[2], sourceIndices[1]]);
        expect(plane.tangents[3]).to.equal(-sourceTangentW);
        expect(plane.uvs).to.deep.equal(sourceUv);

        const convertedPosition = plane.positions.slice();
        const convertedIndices = plane.indices.slice();
        plane.convertToUnrealCoordinates();
        expect(plane.positions).to.deep.equal(convertedPosition);
        expect(plane.indices).to.deep.equal(convertedIndices);
    });

    it('reorients tall cone geometry to Z and permutes box dimensions', function () {
        const cone = new ConeGeometry();
        const legacyHeights = cone.positions.filter((value, index) => index % 3 === 1);
        cone.convertToUnrealCoordinates();
        const unrealHeights = cone.positions.filter((value, index) => index % 3 === 2);
        expect(Math.max(...unrealHeights)).to.equal(Math.max(...legacyHeights));
        expect(Math.min(...unrealHeights)).to.equal(Math.min(...legacyHeights));

        const box = new BoxGeometry({ halfExtents: { x: 2, y: 3, z: 4 } });
        box.convertToUnrealCoordinates();
        const axes = [0, 1, 2].map(axis => Math.max(...box.positions.filter((value, index) => index % 3 === axis)));
        expect(axes).to.deep.equal([4, 2, 3]);
    });

    it('converts 2D geometry to the Unreal XZ plane without accepting a second basis conversion', function () {
        const geometry = new Geometry();
        geometry.positions = [0, 0, 0, 2, 0, 0, 0, 3, 0];
        geometry.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
        geometry.tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
        geometry.uvs = [0, 0, 1, 0, 0, 1];
        geometry.indices = [0, 1, 2];

        expect(geometry.convertToUnrealPaper2DCoordinates()).to.equal(geometry);
        expect(geometry.coordinateSystem).to.equal('unreal-paper2d');
        expect(geometry.positions).to.deep.equal([0, 0, 0, 2, 0, 0, 0, 0, 3]);
        expect(geometry.normals).to.deep.equal([0, 1, 0, 0, 1, 0, 0, 1, 0]);
        expect(geometry.tangents).to.deep.equal([1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1]);
        expect(geometry.uvs).to.deep.equal([0, 0, 1, 0, 0, 1]);
        expect(geometry.indices).to.deep.equal([0, 2, 1]);
        const convertedPositions = geometry.positions.slice();
        expect(geometry.convertToUnrealPaper2DCoordinates().positions).to.deep.equal(convertedPositions);
        expect(() => geometry.convertToUnrealCoordinates()).to.throw('Cannot convert unreal-paper2d geometry to unreal');
    });

    it('rejects incomplete triangle data before changing any vertex', function () {
        const geometry = new Geometry();
        geometry.positions = [1, 2, 3];
        geometry.indices = [0, 1];
        expect(() => geometry.convertToUnrealCoordinates()).to.throw(/indexed triangles/);
        expect(geometry.positions).to.deep.equal([1, 2, 3]);
    });

    it('caches legacy and Unreal render primitives separately', function () {
        const device = new NullGraphicsDevice({ width: 1, height: 1 });
        try {
            const unreal = getShapePrimitive(device, 'plane');
            const legacy = getShapePrimitive(device, 'plane', 'legacy');
            expect(legacy.mesh).not.to.equal(unreal.mesh);
            expect(getShapePrimitive(device, 'plane', 'unreal').mesh).to.equal(unreal.mesh);
            expect(legacy.area).to.deep.equal({ x: 0, y: 1, z: 0, uv: 1 });
            expect(unreal.area).to.deep.equal({ x: 0, y: 0, z: 1, uv: 1 });
            const legacyNormals = [];
            const unrealNormals = [];
            legacy.mesh.getNormals(legacyNormals);
            unreal.mesh.getNormals(unrealNormals);
            expect(legacyNormals.slice(0, 3).map(value => value || 0)).to.deep.equal([0, 1, 0]);
            expect(unrealNormals.slice(0, 3).map(value => value || 0)).to.deep.equal([0, 0, 1]);
        } finally {
            device.destroy();
        }
    });
});
