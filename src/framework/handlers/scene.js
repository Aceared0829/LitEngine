import { SceneUtils } from './scene-utils.js';
import { SceneParser } from '../parsers/scene.js';
import { migrateLegacySceneTransforms, previewMigratedSceneTransforms } from '../parsers/scene-coordinate-migration.js';
import { ResourceHandler } from './handler.js';

/**
 * @import { AppBase } from '../app-base.js'
 */

/**
 * Resource handler for the `scene` asset type. Loads a PlayCanvas scene JSON file, instantiates
 * its entity hierarchy as the root of {@link AppBase#scene} and applies the scene's settings.
 *
 * @category Asset
 */
class SceneHandler extends ResourceHandler {
    /**
     * Create a new SceneHandler instance.
     *
     * @param {AppBase} app - The running {@link AppBase}.
     * @ignore
     */
    constructor(app) {
        super(app, 'scene');
    }

    load(url, callback) {
        SceneUtils.load(url, this.maxRetries, callback);
    }

    open(url, data) {
        if (this._app.coordinateSystem === 'unreal') {
            if (!data || !Object.hasOwn(data, 'coordinateMigration')) {
                throw new Error('Unreal coordinate mode requires scene data migrated with migrateLegacySceneTransforms()');
            }
            data = migrateLegacySceneTransforms(data);
        } else if (data && Object.hasOwn(data, 'coordinateMigration')) {
            data = previewMigratedSceneTransforms(data);
        }

        // prevent script initialization until entire scene is open
        this._app.systems.script.preloading = true;

        const parser = new SceneParser(this._app, false);
        const parent = parser.parse(data);

        // set scene root
        const scene = this._app.scene;
        scene.root = parent;

        this._app.applySceneSettings(data.settings);

        // re-enable script initialization
        this._app.systems.script.preloading = false;

        return scene;
    }
}

export { SceneHandler };
