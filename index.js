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

TODO:
- check talk expression collide
- other kind of camera
- mouth movement
    - tts lip sync
- blink smooth and adapt to current expression?
- group support
- Optimize avoid full reload when not needed
    - model switch
    - only full load at start and on reload button?
- 3D room
- make it work with vrm on top of it
- Model Gallery
- Light control
- Error message for wrong animation files
*/
import { eventSource, event_types, getCharacters } from "../../../../script.js";
import { extension_settings, getContext, ModuleWorkerWrapper } from "../../../extensions.js";
import { registerSlashCommand } from '../../../slash-commands.js';
export { MODULE_NAME };
import { MODULE_NAME, DEBUG_PREFIX, VRM_CANVAS_ID } from "./constants.js";
import {
    loadVRM,
    setExpression,
    setMotion,
    updateExpression,
    talk
} from "./vrm.js";
import {
    onEnabledClick,
    onFollowCameraClick,
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
    animations_files
} from "./ui.js";

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
    camera_type: "default",

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
    if (Object.keys(extension_settings.vrm).length === 0) {
        Object.assign(extension_settings.vrm, defaultSettings);
    }

    $('#vrm_enabled_checkbox').prop('checked', extension_settings.vrm.enabled);
    $('#vrm_follow_camera_checkbox').prop('checked', extension_settings.vrm.follow_camera);
    $('#vrm_show_grid_checkbox').prop('checked', extension_settings.vrm.show_grid);

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

    // Events
    //window.addEventListener('resize', () => {loadVRM(); console.debug(DEBUG_PREFIX,'Window resized, reloading VRM');});

    eventSource.on(event_types.CHAT_CHANGED, updateCharactersList);
    eventSource.on(event_types.CHAT_CHANGED, updateCharactersModels);
    eventSource.on(event_types.CHAT_CHANGED, loadVRM);

    eventSource.on(event_types.GROUP_UPDATED, updateCharactersList);
    eventSource.on(event_types.GROUP_UPDATED, updateCharactersModels);

    eventSource.on(event_types.MESSAGE_RECEIVED, async (chat_id) => {await updateExpression(chat_id); talk(chat_id)});
    eventSource.on(event_types.MESSAGE_EDITED, async (chat_id) => {await updateExpression(chat_id); talk(chat_id)});

    updateCharactersListOnce();
    updateCharactersModels();

    loadVRM();
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

    $('#vrm_enabled_checkbox').on('click', onEnabledClick);
    $('#vrm_follow_camera_checkbox').on('click', onFollowCameraClick);
    $('#vrm_show_grid_checkbox').on('click', onShowGridClick);

    $('#vrm_reload_button').on('click', () => {loadVRM(); console.debug(DEBUG_PREFIX,'Reset clicked, reloading VRM');});

    /*// Module worker
    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    setInterval(wrapper.update.bind(wrapper), UPDATE_INTERVAL);
    moduleWorker();
    */
   
    registerSlashCommand('vrmexpression', setExpressionSlashCommand, [], '<span class="monospace">(expression)</span> – set vrm model expression (example: /vrmexpression happy)', true, true);
    registerSlashCommand('vrmmotion', setMotionSlashCommand, [], '<span class="monospace">(motion)</span> – set vrm model motion (example: /vrmexpression idle)', true, true);
});

async function setExpressionSlashCommand(_, expression) {
    if (!expression) {
        console.log('No expression provided');
        return;
    }

    expression = expression.trim();

    console.debug(DEBUG_PREFIX,'Command expression received for',expression);

    await setExpression(expression);
}

// Example /vrmmotion anger
async function setMotionSlashCommand(args, motion) {
    let loop = false;
    let random = false;
    if (!motion && !args["motion"]) {
        console.log('No motion provided');
        return;
    }

    if (args["motion"])
        motion = args["motion"];

    if (args["loop"])
        loop = args["loop"].toLowerCase() === "true";

    if (args["random"])
        random = args["random"].toLowerCase() === "true";

    motion = motion.trim();
    console.debug(DEBUG_PREFIX,'Command motion received for', motion,"loop=",loop, "random=",random);

    const fuse = new Fuse(animations_files);
    const results = fuse.search(motion);
    const fileItem = results[0]?.item;

    if (fileItem)
    {
        await setMotion(fileItem, loop, true, random);
    }
    else{
        console.debug(DEBUG_PREFIX,'Motion not found in', animations_files);
    }
}