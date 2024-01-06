/*
DONE:
- Running example into ST: load model/animation
- Organize code into clean part
- basic ui enable/disable, show grid, follow cursor, reset scene
- Character/model select
- expression/animation select default/classify message
- model reset settings button
- blinking auto (basic)

TODO:
- mouth movement
- blink smooth
- loader for vrma ?
- group support


*/
import { eventSource, event_types, getCharacters } from "../../../../script.js";
import { extension_settings, getContext, ModuleWorkerWrapper } from "../../../extensions.js";
export { MODULE_NAME };
import { MODULE_NAME, DEBUG_PREFIX, VRM_CANVAS_ID } from "./constants.js";
import {
    loadVRM,
    updateExpression
} from "./vrm.js";
import {
    onEnabledClick,
    onFollowCursorClick,
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
    onAnimationMappingChange
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
    follow_cursor: false,

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
    $('#vrm_follow_cursor_checkbox').prop('checked', extension_settings.vrm.follow_cursor);
    $('#vrm_show_grid_checkbox').prop('checked', extension_settings.vrm.show_grid);

    $('#vrm_character_select').on('change', onCharacterChange);
    $('#vrm_character_refresh_button').on('click', onCharacterRefreshClick);
    $('#vrm_character_remove_button').on('click', onCharacterRemoveClick);

    $('#vrm_model_refresh_button').on('click', onModelRefreshClick);
    $('#vrm_model_select').on('change', onModelChange);
    $('#vrm_model_reset_button').on('click', onModelResetClick);

    $('#vrm_default_expression_select').on('change', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_motion_select').on('change', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_expression_replay').on('click', () => {onAnimationMappingChange('animation_default');});
    $('#vrm_default_motion_replay').on('click', () => {onAnimationMappingChange('animation_default');});

    // Events
    window.addEventListener('resize', () => {loadVRM(); console.debug(DEBUG_PREFIX,'Window resized, reloading VRM');});

    eventSource.on(event_types.CHAT_CHANGED, updateCharactersList);
    eventSource.on(event_types.CHAT_CHANGED, updateCharactersModels);
    eventSource.on(event_types.CHAT_CHANGED, loadVRM);

    eventSource.on(event_types.GROUP_UPDATED, updateCharactersList);
    eventSource.on(event_types.GROUP_UPDATED, updateCharactersModels);

    eventSource.on(event_types.MESSAGE_RECEIVED, (chat_id) => updateExpression(chat_id));

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

async function moduleWorker() {
    
}

//#############################//
//  Extension load             //
//#############################//

// This function is called when the extension is loaded
jQuery(async () => {
    const windowHtml = $(await $.get(`${extensionFolderPath}/window.html`));

    $('#extensions_settings').append(windowHtml);
    loadSettings();

    $('#vrm_enabled_checkbox').on('click', onEnabledClick);
    $('#vrm_follow_cursor_checkbox').on('click', onFollowCursorClick);
    $('#vrm_show_grid_checkbox').on('click', onShowGridClick);

    $('#vrm_reload_button').on('click', () => {loadVRM(); console.debug(DEBUG_PREFIX,'Reset clicked, reloading VRM');});

    /*// Module worker
    const wrapper = new ModuleWorkerWrapper(moduleWorker);
    setInterval(wrapper.update.bind(wrapper), UPDATE_INTERVAL);
    moduleWorker();
    */
});