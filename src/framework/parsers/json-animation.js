import { Quat } from '../../core/math/quat.js';
import { Vec3 } from '../../core/math/vec3.js';
import { unrealEulerToRotation } from '../../core/math/coordinate-conversion.js';
import { Http } from '../../platform/net/http.js';
import { Animation, AnimationKey, AnimationNode } from '../../scene/animation/animation.js';
import { migrateLegacyAnimationTransforms, previewMigratedAnimationTransforms } from './animation-coordinate-migration.js';

/**
 * Parser for PlayCanvas JSON {@link Animation} resources. Acts as the catch-all (non-glb) animation
 * parser.
 *
 * @ignore
 */
class JsonAnimationParser {
    canParse() {
        return true;
    }

    load(url, callback, asset) {
        const original = typeof url === 'string' ? url : url.original;
        this.handler.fetch(url, Http.ResponseType.JSON, (err, response) => {
            if (err) {
                callback(`Error loading animation resource: ${original} [${err}]`);
            } else {
                const coordinateSystem = this.handler?.app?.coordinateSystem ?? 'unreal';
                let data = response;
                if (coordinateSystem === 'unreal') {
                    if (!Object.hasOwn(data, 'coordinateMigration')) {
                        callback('Unreal coordinate mode requires JSON animation data migrated with migrateLegacyAnimationTransforms()');
                        return;
                    }
                    data = migrateLegacyAnimationTransforms(data);
                } else if (Object.hasOwn(data, 'coordinateMigration')) {
                    data = previewMigratedAnimationTransforms(data);
                }
                callback(null, this[`_parseAnimationV${data.animation.version}`](data, coordinateSystem));
            }
        }, asset);
    }

    _parseAnimationV3(data, coordinateSystem = 'unreal') {
        const animData = data.animation;

        const anim = new Animation();
        anim.name = animData.name;
        anim.duration = animData.duration;

        for (let i = 0; i < animData.nodes.length; i++) {
            const node = new AnimationNode();

            const n = animData.nodes[i];
            node._name = n.name;

            for (let j = 0; j < n.keys.length; j++) {
                const k = n.keys[j];

                const t = k.time;
                const p = k.pos;
                const r = k.rot;
                const s = k.scale;
                const pos = new Vec3(p[0], p[1], p[2]);
                const rot = coordinateSystem === 'unreal' ? unrealEulerToRotation(new Vec3(r)) :
                    new Quat().setFromEulerAngles(r[0], r[1], r[2]);
                const scl = new Vec3(s[0], s[1], s[2]);

                const key = new AnimationKey(t, pos, rot, scl);

                node._keys.push(key);
            }

            anim.addNode(node);
        }

        return anim;
    }

    _parseAnimationV4(data, coordinateSystem = 'unreal') {
        const animData = data.animation;

        const anim = new Animation();
        anim.name = animData.name;
        anim.duration = animData.duration;

        for (let i = 0; i < animData.nodes.length; i++) {
            const node = new AnimationNode();

            const n = animData.nodes[i];
            node._name = n.name;

            const defPos = n.defaults.p;
            const defRot = n.defaults.r;
            const defScl = n.defaults.s;

            for (let j = 0; j < n.keys.length; j++) {
                const k = n.keys[j];

                const t = k.t;
                const p = defPos ? defPos : k.p;
                const r = defRot ? defRot : k.r;
                const s = defScl ? defScl : k.s;
                const pos = new Vec3(p[0], p[1], p[2]);
                const rot = coordinateSystem === 'unreal' ? unrealEulerToRotation(new Vec3(r)) :
                    new Quat().setFromEulerAngles(r[0], r[1], r[2]);
                const scl = new Vec3(s[0], s[1], s[2]);

                const key = new AnimationKey(t, pos, rot, scl);

                node._keys.push(key);
            }

            anim.addNode(node);
        }

        return anim;
    }
}

export { JsonAnimationParser };
