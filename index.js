/*
DONE:
- Running example into ST: load model/animation
- Organize code into clean part
- basic ui enable/disable, show grid, follow cursor, reset scene
- Character/model select
- expression/animation select default/classify message
- model reset settings button
- blinking auto (basic)
- transparent background
- slash command expression/motion
- default setting using expression name
- Efficient resize handling
- basic bvh loader
- mouth movement
    - basic text based
- Basic model control move/rotate/scale
    - dragging keep offset with mouse cursor
    - should not work through ui
- Save model settings pos/rotate/scale
- Fix animation chaining / crossfading / default loop
- loop option for animations command
- Consider animation as group Idle.bvh/Idle1.bvh/Idle2.bvh appear as "Idle" group, play one randomly
- Command by default play requested animation not the group
- group support
- Better text talk function
- only full load at start and on reload button
- Error message for wrong animation files
- cache animation files
- tts lip sync
    - xtts compatible (not streaming mode)
    - RVC compatible
    - created and delete on tts_audio play/pause/end
- animation cache
    - optional
    - model specific
    - when loading a model all its animation group are cached
    - playing a non cached animation will cached it
- vrm cache
    - optional
    - keep vrm model previously loaded for instant switch between models
    - no duplicate model possible if on
- Control box follow animation
- Hit boxes
    - click detection
    - expression/motion/message mapping ui
    - default to no change if set to none
    - disabled by default, enable checkbox in ui
- Light control
- lock model menu option


TODO:
    v1.0:
        - Change default map from happy to relaxed
    v2.0:
        - custom color picker
        - blink smooth and adapt to current expression?
            - The expression define the blink blend can't do much for now
        - click interaction
        - other kind of camera
        - 3D room
        - make it work with live2d on top of it
        - Model Gallery

*/
import { eventSource, event_types, getCharacters, saveSettings, saveSettingsDebounced } from "../../../../script.js";
import { extension_settings, getContext, ModuleWorkerWrapper } from "../../../extensions.js";
import { registerSlashCommand } from '../../../slash-commands.js';
export { MODULE_NAME };
import { 
    MODULE_NAME,
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    DEFAULT_LIGHT_COLOR,
    DEFAULT_LIGHT_INTENSITY
} from "./constants.js";
import {
    loadScene,
    loadAllModels,
    setExpression,
    setMotion,
    updateExpression,
    talk,
    setModel,
    setLight
} from "./vrm.js";
import {
    onEnabledClick,
    onFollowCameraClick,
    onBlinkClick,
    onTtsLipsSyncClick,
    onAutoSendHitboxMessageClick,
    onLockModelsClick,
    onHitboxesClick,
    onModelCacheClick,
    onAnimationCacheClick,
    onLightChange,
    onLightColorResetClick,
    onLightIntensityResetClick,
    onShowGridClick,
    onCharacterChange,
    onCharacterRefreshClick,
    onCharacterRemoveClick,
    updateCharactersList,
    updateCharactersListOnce,
    updateCharactersModels,
    onModelRefreshClick,
    onModelChange,
    onModelResetClick,
    onModelScaleChange,
    onModelPositionChange,
    onModelRotationChange,
    onAnimationMappingChange,
    animations_files,
    models_files
} from "./ui.js";
import "./controls.js";

import { currentChatMembers } from "./utils.js";

const UPDATE_INTERVAL = 100;
const extensionFolderPath = `scripts/extensions/third-party/Extension-VRM`;

//#############################//
//  Extension UI and Settings  //
//#############################//

const defaultSettings = {
    // Global settings
    enabled: false,
    follow_camera: false,
    tts_lips_sync: false,
    blink: false,
    auto_send_hitbox_message: false,
    lock_models: false,

    // Performances
    hitboxes: false,
    models_cache: false,
    animations_cache: false,

    // Scene
    light_color: DEFAULT_LIGHT_COLOR,
    light_intensity: DEFAULT_LIGHT_INTENSITY,

    // Debug
    show_grid: false,

    // Character model mapping
    character_model_mapping: {},
    model_settings: {},
}

//'assets/vrm/VRM1_Constraint_Twist_Sample.vrm'

function loadSettings() {
    if (extension_settings.vrm === undefined)
        extension_settings.vrm = {};

    // Ensure good format
    for (const key of Object.keys(extension_settings.vrm)) {
        // delete spurious keys
        if (!Object.keys(defaultSettings).includes(key))
            delete extension_settings.vrm[key];
    }
    for (const key of Object.keys(defaultSettings)) {
        // add missing keys
        if (!Object.keys(extension_settings.vrm).includes(key))
            extension_settings.vrm[key] = defaultSettings[key];
    }
    saveSettingsDebounced();

    $('#vrm_enabled_checkbox').prop('checked', extension_settings.vrm.enabled);
    $('#vrm_follow_camera_checkbox').prop('checked', extension_settings.vrm.follow_camera);
    $('#vrm_blink_checkbox').prop('checked', extension_settings.vrm.blink);
    $('#vrm_tts_lips_sync_checkbox').prop('checked', extension_settings.vrm.tts_lips_sync);
    $('#vrm_auto_send_hitbox_message_checkbox').prop('checked', extension_settings.vrm.auto_send_hitbox_message);
    $('#vrm_lock_models_checkbox').prop('checked', extension_settings.vrm.lock_models);
    $('#vrm_hitboxes_checkbox').prop('checked', extension_settings.vrm.hitboxes);
    $('#vrm_models_cache_checkbox').prop('checked', extension_settings.vrm.models_cache);
    $('#vrm_animations_cache_checkbox').prop('checked', extension_settings.vrm.animations_cache);
    $('#vrm_show_grid_checkbox').prop('checked', extension_settings.vrm.show_grid);

    $('#vrm_light_color').val(extension_settings.vrm.light_color);
    $('#vrm_light_intensity').val(extension_settings.vrm.light_intensity);
    $('#vrm_light_intensity_value').text(extension_settings.vrm.light_intensity);

    $('#vrm_enabled_checkbox').on('click', onEnabledClick);
    $('#vrm_follow_camera_checkbox').on('click', onFollowCameraClick);
    $('#vrm_blink_checkbox').on('click', onBlinkClick);
    $('#vrm_tts_lips_sync_checkbox').on('click', onTtsLipsSyncClick);
    $('#vrm_auto_send_hitbox_message_checkbox').on('click', onAutoSendHitboxMessageClick);
    $('#vrm_lock_models_checkbox').on('click', onLockModelsClick);
    $('#vrm_hitboxes_checkbox').on('click', onHitboxesClick);
    $('#vrm_models_cache_checkbox').on('click', onModelCacheClick);
    $('#vrm_animations_cache_checkbox').on('click', onAnimationCacheClick);
    $('#vrm_show_grid_checkbox').on('click', onShowGridClick);
    
    $('#vrm_light_color').on('input', onLightChange);
    $('#vrm_light_intensity').on('input', onLightChange);
    $('#vrm_light_color_reset_button').on('click', onLightColorResetClick);
    $('#vrm_light_intensity_reset_button').on('click', onLightIntensityResetClick);
    $('#vrm_character_select').on('change', onCharacterChange);
    $('#vrm_character_refresh_button').on('click', onCharacterRefreshClick);
    $('#vrm_character_remove_button').on('click', onCharacterRemoveClick);

    $('#vrm_model_refresh_button').on('click', onModelRefreshClick);
    $('#vrm_model_select').on('change', onModelChange);
    $('#vrm_model_reset_button').on('click', onModelResetClick);
    
    $('#vrm_model_scale').on('input', onModelScaleChange);
    $('#vrm_model_position_x').on('input', onModelPositionChange);
    $('#vrm_model_position_y').on('input', onModelPositionChange);
    $('#vrm_model_rotation_x').on('input', onModelRotationChange);
    $('#vrm_model_rotation_y').on('input', onModelRotationChange);

    $('#vrm_default_expression_select').on('change', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_motion_select').on('change', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_expression_replay').on('click', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_motion_replay').on('click', () => {onAnimationMappingChange('animation_default');});

    $('#vrm_reload_button').on('click', async () => {
        await loadScene();
        await loadAllModels(currentChatMembers());
        console.debug(DEBUG_PREFIX,'Reset clicked, reloading VRM');
    });

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        updateCharactersList();
        updateCharactersModels();
        loadAllModels(currentChatMembers());
    });

    eventSource.on(event_types.GROUP_UPDATED, async () => {
        updateCharactersList();
        updateCharactersModels();
        loadAllModels(currentChatMembers());
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, async (chat_id) => {
        updateExpression(chat_id);
        talk(chat_id);
    });

    eventSource.on(event_types.MESSAGE_EDITED, async (chat_id) => {
        updateExpression(chat_id);
        talk(chat_id);
    });

    updateCharactersListOnce();
    updateCharactersModels();

    loadScene();
}

//#############################//
//  Methods                    //
//#############################//

//#############################//
//  Module Worker              //
//#############################//

/*
async function moduleWorker() {
    
}
*/

//#############################//
//  Extension load             //
//#############################//

// This function is called when the extension is loaded
jQuery(async () => {
    const windowHtml = $(await $.get(`${extensionFolderPath}/window.html`));

    $('#extensions_settings').append(windowHtml);
    loadSettings();

    
    /*// Module worker
    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    setInterval(wrapper.update.bind(wrapper), UPDATE_INTERVAL);
    moduleWorker();
    */
    registerSlashCommand('vrmlightcolor', setLightColorSlashCommand, [], '<span class="monospace">(expression)</span> – set vrm scene light color (example: "/vrmlightcolor white" or "/vrmlightcolor purple")', true, true);
    registerSlashCommand('vrmlightintensity', setLightIntensitySlashCommand, [], '<span class="monospace">(expression)</span> – set vrm scene light intensity in percent (example: "/vrmlightintensity 0" or "/vrmlightintensity 100")', true, true);
    registerSlashCommand('vrmmodel', setModelSlashCommand, [], '<span class="monospace">(expression)</span> – set vrm model (example: "/vrmmodel Seraphina.vrm" or "/vrmmodel character=Seraphina model=Seraphina.vrm")', true, true);
    registerSlashCommand('vrmexpression', setExpressionSlashCommand, [], '<span class="monospace">(expression)</span> – set vrm model expression (example: "/vrmexpression happy" or "/vrmexpression character=Seraphina expression=happy")', true, true);
    registerSlashCommand('vrmmotion', setMotionSlashCommand, [], '<span class="monospace">(motion)</span> – set vrm model motion (example: "/vrmmotion idle" or "/vrmmotion character=Seraphina motion=idle loop=true random=false")', true, true);
});

async function setLightColorSlashCommand(_, color) {
    if (!color) {
        console.log('No color provided');
        return;
    }

    setLight(color,extension_settings.vrm.light_intensity);
}

async function setLightIntensitySlashCommand(_, intensity) {
    if (!intensity) {
        console.log('No intensity provided');
        return;
    }

    setLight(extension_settings.vrm.light_color,intensity);
}

// Example /vrmmotion anger
async function setModelSlashCommand(args, model) {
    let character = undefined;
    if (!model && !args["model"]) {
        console.log('No model provided');
        return;
    }

    if (args["character"])
        character = args["character"];

    if (args["model"])
        motion = args["model"];

    if (character === undefined) {
        const characters = currentChatMembers();
        if(characters.length == 0) {
            console.log('No character provided and none detected in current chat');
            return;
        }
        character = characters[0];
    }

    model = model.trim();
    console.debug(DEBUG_PREFIX,'Command vrmmodel received for character=',character,"model=", model);

    const fuse = new Fuse(models_files);
    const results = fuse.search(model);
    const fileItem = results[0]?.item;

    if (fileItem)
    {
        $('#vrm_character_select').val(character)
        $('#vrm_model_select').val(fileItem)
        onModelChange();
    }
    else{
        console.debug(DEBUG_PREFIX,'Model not found in', models_files);
    }
}

async function setExpressionSlashCommand(args, expression) {
    let character = undefined;
    if (!expression) {
        console.log('No expression provided');
        return;
    }

    if (args["character"])
        character = args["character"];

    if (args["expression"])
        character = args["expression"];

    if (character === undefined) {
        const characters = currentChatMembers();
        if(characters.length == 0) {
            console.log('No character provided and none detected in current chat');
            return;
        }
        character = characters[0];
    }

    expression = expression.trim();

    console.debug(DEBUG_PREFIX,'Command expression received for character=',character,"expression=",expression);

    await setExpression(character,expression);
}

// Example /vrmmotion anger
async function setMotionSlashCommand(args, motion) {
    let character = undefined;
    let loop = false;
    let random = false;
    if (!motion && !args["motion"]) {
        console.log('No motion provided');
        return;
    }

    if (args["character"])
        character = args["character"];

    if (args["motion"])
        motion = args["motion"];

    if (args["loop"])
        loop = args["loop"].toLowerCase() === "true";

    if (args["random"])
        random = args["random"].toLowerCase() === "true";

    if (character === undefined) {
        const characters = currentChatMembers();
        if(characters.length == 0) {
            console.log('No character provided and none detected in current chat');
            return;
        }
        character = characters[0];
    }

    motion = motion.trim();
    console.debug(DEBUG_PREFIX,'Command motion received for character=',character,"motion=", motion,"loop=",loop, "random=",random);
    
    const fuse = new Fuse(animations_files);
    const results = fuse.search(motion);
    const fileItem = results[0]?.item;

    if (fileItem)
    {
        setMotion(character, fileItem, loop, true, random);
    }
    else{
        console.debug(DEBUG_PREFIX,'Motion not found in', animations_files);
    }
}