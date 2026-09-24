import { Vec2 } from '../../core/math/vec2.js';
import { CapsuleGeometry } from '../../scene/geometry/capsule-geometry.js';
import { ConeGeometry } from '../../scene/geometry/cone-geometry.js';
import { CylinderGeometry } from '../../scene/geometry/cylinder-geometry.js';
import { TorusGeometry } from '../../scene/geometry/torus-geometry.js';
import { Mesh } from '../../scene/mesh.js';
import { BoxGeometry } from '../../scene/geometry/box-geometry.js';
import { SphereGeometry } from '../../scene/geometry/sphere-geometry.js';
import { PlaneGeometry } from '../../scene/geometry/plane-geometry.js';
import { DeviceCache } from '../../platform/graphics/device-cache.js';

// class used to hold primitives in the device cache
class PrimitivesCache {
    map = new Map();

    // destroy all created primitives when the device is destroyed
    destroy(device) {
        this.map.forEach(primData => primData.mesh.destroy());
    }
}

const _primitivesCache = new DeviceCache();

// returns Primitive data, used by ModelComponent and RenderComponent
const getShapePrimitive = (device, type, coordinateSystem = 'unreal') => {

    if (coordinateSystem !== 'legacy' && coordinateSystem !== 'unreal') {
        throw new RangeError(`Unsupported primitive coordinate system: ${coordinateSystem}`);
    }

    // cache for the device
    const cache = _primitivesCache.get(device, () => {
        return new PrimitivesCache();
    });

    const key = `${coordinateSystem}:${type}`;
    let primData = cache.map.get(key);

    // not in cache, create new
    if (!primData) {

        let geometry, area;
        switch (type) {

            case 'box':
                geometry = new BoxGeometry();
                area = { x: 2, y: 2, z: 2, uv: (2.0 / 3) };
                break;

            case 'capsule':
                geometry = new CapsuleGeometry({ radius: 0.5, height: 2 });
                area = { x: (Math.PI * 2), y: Math.PI, z: (Math.PI * 2), uv: (1.0 / 3 + ((1.0 / 3) / 3) * 2) };
                break;

            case 'cone':
                geometry = new ConeGeometry({ baseRadius: 0.5, peakRadius: 0, height: 1 });
                area = { x: 2.54, y: 2.54, z: 2.54, uv: (1.0 / 3 + (1.0 / 3) / 3) };
                break;

            case 'cylinder':
                geometry = new CylinderGeometry({ radius: 0.5, height: 1 });
                area = { x: Math.PI, y: (0.79 * 2), z: Math.PI, uv: (1.0 / 3 + ((1.0 / 3) / 3) * 2) };
                break;

            case 'plane':
                geometry = new PlaneGeometry({ halfExtents: new Vec2(0.5, 0.5), widthSegments: 1, lengthSegments: 1 });
                area = { x: 0, y: 1, z: 0, uv: 1 };
                break;

            case 'sphere':
                geometry = new SphereGeometry({ radius: 0.5 });
                area = { x: Math.PI, y: Math.PI, z: Math.PI, uv: 1 };
                break;

            case 'torus':
                geometry = new TorusGeometry({ tubeRadius: 0.2, ringRadius: 0.3 });
                area = { x: Math.PI * 0.5 * 0.5 - Math.PI * 0.1 * 0.1, y: 0.4, z: 0.4, uv: 1 };
                break;

            default:
                throw new Error(`Invalid primitive type: ${type}`);
        }

        if (coordinateSystem === 'unreal') {
            geometry.convertToUnrealCoordinates();
            area = { x: area.z, y: area.x, z: area.y, uv: area.uv };
        }
        const mesh = Mesh.fromGeometry(device, geometry);

        // inc reference to keep primitive alive
        mesh.incRefCount();

        primData = { mesh: mesh, area: area };

        cache.map.set(key, primData);

    }

    return primData;
};

export { getShapePrimitive };
