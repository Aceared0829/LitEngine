import { Mat4 } from '../../core/math/mat4.js';
import { Vec3 } from '../../core/math/vec3.js';
import {
    INDEXFORMAT_UINT8,
    INDEXFORMAT_UINT16,
    INDEXFORMAT_UINT32,
    SEMANTIC_NORMAL,
    SEMANTIC_POSITION,
    SEMANTIC_TANGENT,
    TYPE_FLOAT32
} from '../../platform/graphics/constants.js';
import {
    unrealToLegacyMatrix,
    unrealToLegacyRotation,
    unrealToLegacyScale,
    unrealToLegacyVector
} from '../../core/math/coordinate-conversion.js';

const asBytes = (storage) => {
    if (storage instanceof ArrayBuffer) {
        return new Uint8Array(storage);
    }
    return new Uint8Array(storage.buffer, storage.byteOffset, storage.byteLength);
};

const copyStorage = storage => asBytes(storage).slice();

/**
 * Copies a vertex buffer and converts supported Unreal-space position, normal and tangent data to
 * the legacy Y-up basis expected by glTF consumers. The input buffer is never modified.
 *
 * @param {ArrayBuffer|ArrayBufferView} storage - Source vertex-buffer storage.
 * @param {object} format - Vertex format with element offsets, strides and data types.
 * @param {number} vertexCount - Number of vertices in the buffer.
 * @returns {Uint8Array} Converted copy of the vertex-buffer bytes.
 */
const convertUnrealVertexBufferToGltf = (storage, format, vertexCount) => {
    const result = copyStorage(storage);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    for (const element of format.elements) {
        if (![SEMANTIC_POSITION, SEMANTIC_NORMAL, SEMANTIC_TANGENT].includes(element.name)) continue;
        const expectedComponents = element.name === SEMANTIC_TANGENT ? 4 : 3;
        if (element.dataType !== TYPE_FLOAT32 || element.numComponents !== expectedComponents) {
            throw new Error(`Unreal glTF export requires float32 ${element.name} vertex attributes`);
        }

        const stride = format.interleaved ? (element.stride ?? format.size) : element.size;
        for (let vertex = 0; vertex < vertexCount; vertex++) {
            const offset = (format.interleaved ? vertex * stride : element.offset + vertex * stride) +
                (format.interleaved ? element.offset : 0);
            const converted = unrealToLegacyVector(new Vec3(
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ));
            view.setFloat32(offset, converted.x, true);
            view.setFloat32(offset + 4, converted.y, true);
            view.setFloat32(offset + 8, converted.z, true);
            if (element.name === SEMANTIC_TANGENT) {
                view.setFloat32(offset + 12, -view.getFloat32(offset + 12, true), true);
            }
        }
    }
    return result;
};

/**
 * Copies and reverses each triangle's winding to compensate for the reflected Unreal-to-glTF basis.
 *
 * @param {ArrayBuffer|ArrayBufferView} storage - Source index-buffer storage.
 * @param {number} indexCount - Number of indices in the buffer.
 * @param {number} format - Index format.
 * @returns {Uint8Array} Converted copy of the index-buffer bytes.
 */
const convertUnrealIndexBufferToGltf = (storage, indexCount, format) => {
    if (indexCount % 3 !== 0) {
        throw new Error('Unreal glTF export requires triangle-list index buffers');
    }
    const result = copyStorage(storage);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    let size;
    let read;
    let write;
    switch (format) {
        case INDEXFORMAT_UINT8:
            size = 1;
            read = offset => view.getUint8(offset);
            write = (offset, value) => view.setUint8(offset, value);
            break;
        case INDEXFORMAT_UINT16:
            size = 2;
            read = offset => view.getUint16(offset, true);
            write = (offset, value) => view.setUint16(offset, value, true);
            break;
        case INDEXFORMAT_UINT32:
            size = 4;
            read = offset => view.getUint32(offset, true);
            write = (offset, value) => view.setUint32(offset, value, true);
            break;
        default:
            throw new Error(`Unsupported index format for Unreal glTF export: ${format}`);
    }
    if (indexCount * size > result.byteLength) {
        throw new Error('Invalid index-buffer range for Unreal glTF export');
    }
    for (let index = 0; index < indexCount; index += 3) {
        const secondOffset = (index + 1) * size;
        const thirdOffset = (index + 2) * size;
        const second = read(secondOffset);
        write(secondOffset, read(thirdOffset));
        write(thirdOffset, second);
    }
    return result;
};

/**
 * Copies inverse bind matrices and converts them from Unreal space to the glTF basis.
 *
 * @param {ArrayBuffer|ArrayBufferView} storage - Source MAT4 accessor storage.
 * @returns {Uint8Array} Converted copy of the matrix bytes.
 */
const convertUnrealInverseBindMatricesToGltf = (storage) => {
    const result = copyStorage(storage);
    if (result.byteLength % 64 !== 0) {
        throw new Error('Invalid inverse-bind-matrix buffer for Unreal glTF export');
    }
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    for (let offset = 0; offset < result.byteLength; offset += 64) {
        const source = new Mat4().set(Array.from({ length: 16 }, (_, index) => view.getFloat32(offset + index * 4, true)));
        const converted = unrealToLegacyMatrix(source);
        for (let index = 0; index < 16; index++) {
            view.setFloat32(offset + index * 4, converted.data[index], true);
        }
    }
    return result;
};

const convertUnrealScaleToGltf = scale => unrealToLegacyScale(scale);
const convertUnrealRotationToGltf = rotation => unrealToLegacyRotation(rotation);
const convertUnrealVectorToGltf = vector => unrealToLegacyVector(vector);

export {
    convertUnrealIndexBufferToGltf,
    convertUnrealInverseBindMatricesToGltf,
    convertUnrealRotationToGltf,
    convertUnrealScaleToGltf,
    convertUnrealVectorToGltf,
    convertUnrealVertexBufferToGltf
};
