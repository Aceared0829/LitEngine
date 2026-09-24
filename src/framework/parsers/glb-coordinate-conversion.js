import { Mat4 } from '../../core/math/mat4.js';
import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import {
    legacyToUnrealMatrix,
    legacyToUnrealRotation,
    legacyToUnrealScale,
    legacyToUnrealVector
} from '../../core/math/coordinate-conversion.js';

const SAFE_EXTENSIONS = new Set([
    'KHR_lights_punctual', 'KHR_materials_variants', 'KHR_texture_basisu', 'EXT_texture_webp',
    'EXT_texture_avif', 'KHR_texture_transform'
]);

const convertBounds = (accessor, convertVector) => {
    if (!accessor.min || !accessor.max) {
        return;
    }
    const min = convertVector(new Vec3(accessor.min));
    const max = convertVector(new Vec3(accessor.max));
    accessor.min = [Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)];
    accessor.max = [Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)];
};

const readView = (accessor, views, components, componentType = 5126) => {
    if (!accessor || accessor.componentType !== componentType || accessor.type !== ({ 3: 'VEC3', 4: 'VEC4', 16: 'MAT4', 1: 'SCALAR' })[components] ||
        !Number.isInteger(accessor.count) || accessor.count < 0 || !Number.isInteger(accessor.bufferView) || accessor.sparse || accessor.normalized) {
        throw new Error('Unreal glTF conversion requires dense, unnormalized spatial accessors of the expected type');
    }
    const bytes = views[accessor.bufferView];
    const elementSize = components * (componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4);
    const stride = bytes?.byteStride ?? elementSize;
    const offset = accessor.byteOffset ?? 0;
    if (!bytes || !Number.isInteger(offset) || offset < 0 || stride < elementSize ||
        offset + (accessor.count ? (accessor.count - 1) * stride + elementSize : 0) > bytes.byteLength) {
        throw new Error('Invalid spatial glTF accessor range');
    }
    return { data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset, stride };
};

const convertFloatAccessor = (accessor, views, role) => {
    const components = role === 'quaternion' || role === 'tangent' ? 4 : role === 'matrix' ? 16 : 3;
    const { data, offset, stride } = readView(accessor, views, components);
    for (let index = 0; index < accessor.count; index++) {
        const at = offset + index * stride;
        if (role === 'matrix') {
            const values = Array.from({ length: 16 }, (_, component) => data.getFloat32(at + component * 4, true));
            const result = legacyToUnrealMatrix(new Mat4().set(values)).data;
            for (let component = 0; component < 16; component++) {
                data.setFloat32(at + component * 4, result[component], true);
            }
        } else if (role === 'quaternion') {
            const x = data.getFloat32(at, true);
            const y = data.getFloat32(at + 4, true);
            const z = data.getFloat32(at + 8, true);
            data.setFloat32(at, z, true);
            data.setFloat32(at + 4, -x, true);
            data.setFloat32(at + 8, -y, true);
        } else {
            const x = data.getFloat32(at, true);
            const y = data.getFloat32(at + 4, true);
            const z = data.getFloat32(at + 8, true);
            const converted = role === 'scale' ? legacyToUnrealScale(new Vec3(x, y, z)) :
                legacyToUnrealVector(new Vec3(x, y, z));
            data.setFloat32(at, converted.x, true);
            data.setFloat32(at + 4, converted.y, true);
            data.setFloat32(at + 8, converted.z, true);
            if (role === 'tangent') {
                data.setFloat32(at + 12, -data.getFloat32(at + 12, true), true);
            }
        }
    }
    if (['position', 'translation'].includes(role)) {
        convertBounds(accessor, legacyToUnrealVector);
    } else if (role === 'scale') {
        convertBounds(accessor, legacyToUnrealScale);
    }
};

const convertIndices = (accessor, views) => {
    if (!accessor || ![5121, 5123, 5125].includes(accessor.componentType) || accessor.count % 3 !== 0) {
        throw new Error('Unreal glTF conversion requires triangle indices');
    }
    const { data, offset, stride } = readView(accessor, views, 1, accessor.componentType);
    const size = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
    const read = (at) => {
        return size === 1 ? data.getUint8(at) : size === 2 ? data.getUint16(at, true) : data.getUint32(at, true);
    };
    const write = (at, value) => {
        if (size === 1) data.setUint8(at, value);
        else if (size === 2) data.setUint16(at, value, true);
        else data.setUint32(at, value, true);
    };
    for (let index = 0; index < accessor.count; index += 3) {
        const second = offset + (index + 1) * stride;
        const third = offset + (index + 2) * stride;
        const value = read(second);
        write(second, read(third));
        write(third, value);
    }
};

/**
 * Converts a parsed glTF document and private buffer-view copies to Unreal coordinates before
 * creating engine nodes, meshes, skins and animation tracks. The caller must clone buffer views
 * because accessor conversion changes their bytes. Unsupported compressed and sparse spatial
 * data fails explicitly rather than producing a partly converted model.
 *
 * @param {object} gltf - Parsed glTF JSON document.
 * @param {Uint8Array[]} views - Private buffer-view copies.
 */
const convertGltfToUnreal = (gltf, views) => {
    for (const extension of gltf.extensionsUsed ?? []) {
        if (!SAFE_EXTENSIONS.has(extension) && !extension.startsWith('KHR_materials_')) {
            throw new Error(`Unreal glTF conversion does not support extension ${extension}`);
        }
    }

    const roles = new Map();
    const register = (index, role) => {
        if (!Number.isInteger(index) || index < 0 || index >= (gltf.accessors?.length ?? 0)) {
            throw new TypeError(`Invalid glTF accessor index ${index}`);
        }
        if (roles.has(index) && roles.get(index) !== role) {
            throw new Error(`glTF accessor ${index} is shared by incompatible spatial channels`);
        }
        roles.set(index, role);
    };

    for (const mesh of gltf.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
            if (primitive.extensions?.KHR_draco_mesh_compression) {
                throw new Error('Unreal glTF conversion requires decompressed mesh attributes');
            }
            const mode = primitive.mode ?? 4;
            if ([5, 6].includes(mode)) {
                throw new Error('Unreal glTF conversion requires triangle list topology');
            }
            if (primitive.indices !== undefined) {
                register(primitive.indices, mode === 4 ? 'indices' : 'other');
            }
            if (mode === 4) {
                if (primitive.indices === undefined) {
                    throw new Error('Unreal glTF conversion requires indexed triangles');
                }
            }
            for (const [field, index] of Object.entries(primitive.attributes ?? {})) {
                if (!['POSITION', 'NORMAL', 'TANGENT'].includes(field)) register(index, 'other');
            }
            for (const [field, role] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TANGENT', 'tangent']]) {
                if (primitive.attributes?.[field] !== undefined) register(primitive.attributes[field], role);
            }
            for (const target of primitive.targets ?? []) {
                for (const [field, index] of Object.entries(target)) {
                    if (!['POSITION', 'NORMAL', 'TANGENT'].includes(field)) register(index, 'other');
                }
                for (const [field, role] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TANGENT', 'normal']]) {
                    if (target[field] !== undefined) register(target[field], role);
                }
            }
        }
    }
    for (const skin of gltf.skins ?? []) {
        if (skin.inverseBindMatrices !== undefined) register(skin.inverseBindMatrices, 'matrix');
    }
    for (const animation of gltf.animations ?? []) {
        for (const sampler of animation.samplers ?? []) {
            register(sampler.input, 'other');
        }
        for (const channel of animation.channels ?? []) {
            const path = channel.target?.path;
            const role = { translation: 'translation', rotation: 'quaternion', scale: 'scale' }[path];
            register(animation.samplers?.[channel.sampler]?.output, role ?? 'other');
        }
    }

    for (const node of gltf.nodes ?? []) {
        if (node.extensions?.EXT_mesh_gpu_instancing) {
            throw new Error('Unreal glTF conversion does not support GPU instancing');
        }
        if (node.matrix) {
            if (!Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) {
                throw new TypeError('Invalid glTF node matrix');
            }
            node.matrix = Array.from(legacyToUnrealMatrix(new Mat4().set(node.matrix)).data);
        }
        if (node.translation) {
            if (!Array.isArray(node.translation) || node.translation.length !== 3 || !node.translation.every(Number.isFinite)) {
                throw new TypeError('Invalid glTF node translation');
            }
            node.translation = legacyToUnrealVector(new Vec3(node.translation)).toArray();
        }
        if (node.rotation) {
            if (!Array.isArray(node.rotation) || node.rotation.length !== 4 || !node.rotation.every(Number.isFinite)) {
                throw new TypeError('Invalid glTF node rotation');
            }
            const [x, y, z, w] = node.rotation;
            const result = legacyToUnrealRotation(new Quat(x, y, z, w));
            node.rotation = [result.x, result.y, result.z, result.w];
        }
        if (node.scale) {
            if (!Array.isArray(node.scale) || node.scale.length !== 3 || !node.scale.every(Number.isFinite)) {
                throw new TypeError('Invalid glTF node scale');
            }
            node.scale = legacyToUnrealScale(new Vec3(node.scale)).toArray();
        }
    }

    for (const [index, role] of roles) {
        const accessor = gltf.accessors[index];
        if (role === 'indices') convertIndices(accessor, views);
        else if (role !== 'other') convertFloatAccessor(accessor, views, role);
    }
};

export { convertGltfToUnreal };
