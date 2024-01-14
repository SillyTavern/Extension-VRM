import { saveSettingsDebounced, getRequestHeaders, callPopup } from '../../../../script.js';
import { getContext, extension_settings, renderExtensionTemplate } from '../../../extensions.js';

import {
    DEBUG_PREFIX,
    VRM_MODEL_FOLDER,
    CLASSIFY_EXPRESSIONS
} from './constants.js';

import {
    loadScene,
    loadModel,
    getVRM,
    setExpression,
    setMotion,
    updateModel
} from "./vrm.js";

import {
    currentChatMembers,
    delay,
    loadAnimationUi,
} from './utils.js';
import { exp } from './lib/jsm/nodes/Nodes.js';

export {
    onEnabledClick,
    onFollowCameraClick,
    onTtsLipsSyncClick,
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
};

let characters_list = [];
let characters_models = {};
let animations_files = [];
let animations_groups = [];

async function onEnabledClick() {
    extension_settings.vrm.enabled = $('#vrm_enabled_checkbox').is(':checked');
    saveSettingsDebounced();

    await loadScene();
}

async function onFollowCameraClick() {
    extension_settings.vrm.follow_camera = $('#vrm_follow_camera_checkbox').is(':checked');
    saveSettingsDebounced();
}

async function onTtsLipsSyncClick() {
    extension_settings.vrm.tts_lips_sync = $('#vrm_tts_lips_sync_checkbox').is(':checked');
    saveSettingsDebounced();
}

async function onShowGridClick() {
    extension_settings.vrm.show_grid = $('#vrm_show_grid_checkbox').is(':checked');
    saveSettingsDebounced();
}

async function onCharacterChange() {
    const character = String($('#vrm_character_select').val());

    $('#vrm_model_div').hide();
    $('#vrm_model_settings').hide();

    if (character == 'none') {
        return;
    }

    $('#vrm_model_select')
        .find('option')
        .remove()
        .end()
        .append('<option value="none">None</option>')
        .val('none');

    if (characters_models[character] !== undefined) {
        for (const i of characters_models[character]) {
            //console.debug(DEBUG_PREFIX,"DEBUG",i)
            const model_folder = i[0];
            const model_settings_path = i[1];
            $('#vrm_model_select').append(new Option(model_folder, model_settings_path));
        }
    }

    if (extension_settings.vrm.character_model_mapping[character] !== undefined) {
        $('#vrm_model_select').val(extension_settings.vrm.character_model_mapping[character]);
        $('#vrm_model_settings').show();
        loadModelUi();
    }

    $('#vrm_model_div').show();
}

async function onCharacterRefreshClick() {
    updateCharactersList();
    $('#vrm_character_select').val('none');
    $('#vrm_character_select').trigger('change');
}

async function onCharacterRemoveClick() {
    const character = String($('#vrm_character_select').val());

    if (character == 'none')
        return;

    $('#vrm_model_select').val('none');
    $('#vrm_model_settings').hide();
    delete extension_settings.vrm.character_model_mapping[character];
    saveSettingsDebounced();
    await loadModel(character,null);
    console.debug(DEBUG_PREFIX, 'Deleted all settings for', character);
}

async function onModelRefreshClick() {
    updateCharactersModels(true);
    $('#vrm_model_select').val('none');
    $('#vrm_model_select').trigger('change');
}

async function onModelResetClick() {
    const model_path = String($('#vrm_model_select').val());

    if (model_path == "none")
        return;

    const template = `<div class="m-b-1">Are you sure you want to reset all settings of this VRM model?</div>`;
    const confirmation = await callPopup(template, 'confirm');

    if (confirmation) {
        delete extension_settings.vrm.model_settings[model_path];
        $('#vrm_model_select').trigger('change');   
    }
    else {
        console.debug(DEBUG_PREFIX, 'Confirmation refused by user');
    }
}

async function onModelChange() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    let use_default_settings = false;

    $('#vrm_model_settings').hide();

    if (model_path == 'none') {
        delete extension_settings.vrm.character_model_mapping[character];
        saveSettingsDebounced();
        await loadModel(character,null);
        return;
    }

    $('#vrm_model_loading').show();

    extension_settings.vrm.character_model_mapping[character] = model_path;
    saveSettingsDebounced();

    // Initialize new model
    if (extension_settings.vrm.model_settings[model_path] === undefined) {
        use_default_settings = true;
        extension_settings.vrm.model_settings[model_path] = {
            'scale': 3.0,
            'x': 0.0,
            'y': 0.0,
            'rx': 0.0,
            'ry': 0.0,
            'animation_default': { 'expression': 'none', 'motion': 'none' },
            //'animation_click': { 'expression': 'none', 'motion': 'none', 'message': '' },
            'classify_mapping': {},
        };

        for (const expression of CLASSIFY_EXPRESSIONS) {
            extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression] = { 'expression': 'none', 'motion': 'none' };
        }

        saveSettingsDebounced();
    }

    //await loadScene();
    await loadModel(character,model_path);
    await loadModelUi(use_default_settings);
    
    // Load default expression/motion
    const expression = extension_settings.vrm.model_settings[model_path]['animation_default']['expression'];
    const motion =  extension_settings.vrm.model_settings[model_path]['animation_default']['motion'];

    if (expression !== undefined && expression != "none") {
        console.debug(DEBUG_PREFIX,"Set default expression to",expression);
        setExpression(character, expression);
    }
    if (motion !== undefined && motion != "none") {
        console.debug(DEBUG_PREFIX,"Set default motion to",motion);
        setMotion(character, motion, true);
    }
    
    $('#vrm_model_settings').show();
    $('#vrm_model_loading').hide();
}

async function onModelScaleChange() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    extension_settings.vrm.model_settings[model_path]['scale'] = Number($('#vrm_model_scale').val());
    $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[model_path]['scale']);
    saveSettingsDebounced();
    updateModel(character);
}

async function onModelPositionChange() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    extension_settings.vrm.model_settings[model_path]['x'] = Number($('#vrm_model_position_x').val());
    extension_settings.vrm.model_settings[model_path]['y'] = Number($('#vrm_model_position_y').val());
    $('#vrm_model_position_x_value').text(extension_settings.vrm.model_settings[model_path]['x']);
    $('#vrm_model_position_y_value').text(extension_settings.vrm.model_settings[model_path]['y']);
    saveSettingsDebounced();
    updateModel(character,);
}

async function onModelRotationChange() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    extension_settings.vrm.model_settings[model_path]['rx'] = Number($('#vrm_model_rotation_x').val());
    extension_settings.vrm.model_settings[model_path]['ry'] = Number($('#vrm_model_rotation_y').val());
    $('#vrm_model_rotation_x_value').text(extension_settings.vrm.model_settings[model_path]['rx']);
    $('#vrm_model_rotation_y_value').text(extension_settings.vrm.model_settings[model_path]['ry']);
    saveSettingsDebounced();
    updateModel(character);
}

async function onAnimationMappingChange(type) {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    let expression;
    let motion;

    switch (type) {
        case 'animation_default':
            expression = $('#vrm_default_expression_select').val();
            motion = $('#vrm_default_motion_select').val();

            extension_settings.vrm.model_settings[model_path]['animation_default']['expression'] = expression;
            extension_settings.vrm.model_settings[model_path]['animation_default']['motion'] = motion;
            console.debug(DEBUG_PREFIX,'Updated animation_default of',character,':',extension_settings.vrm.model_settings[model_path]['animation_default']);
            break;
        default:
            console.error(DEBUG_PREFIX,'Unexpected type:',type);
    }

    saveSettingsDebounced();

    setExpression(character, expression);
    setMotion(character, motion, true);
}

async function loadModelUi(use_default_settings) {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    const expression_ui = $('#vrm_expression_mapping');

    expression_ui.empty();

    if (model_path == "none")
        return;

    let model = getVRM(character);

    while (model === undefined) { // TODO wait cleaner way
        model = getVRM(character);
        await delay(500);
    }

    console.debug(DEBUG_PREFIX, 'loading settings of model:', model_path);

    let model_expressions = [];
    let model_motions = animations_groups;

    for (const i of Object.keys(model.expressionManager.expressionMap) ?? []) {
        if (!model.expressionManager.blinkExpressionNames.includes(i) && !model.expressionManager.mouthExpressionNames.includes(i) && !model.expressionManager.lookAtExpressionNames.includes(i))
            model_expressions.push(i.toLowerCase());
    }

    model_expressions.sort();
    model_motions.sort();

    console.debug(DEBUG_PREFIX, 'expressions:', model_expressions);
    console.debug(DEBUG_PREFIX, 'motions:', model_motions);

    // Model settings
    $('#vrm_model_scale').val(extension_settings.vrm.model_settings[model_path]['scale']);
    $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[model_path]['scale']);

    $('#vrm_model_position_x').val(extension_settings.vrm.model_settings[model_path]['x']);
    $('#vrm_model_position_x_value').text(extension_settings.vrm.model_settings[model_path]['x']);
    $('#vrm_model_position_y').val(extension_settings.vrm.model_settings[model_path]['y']);
    $('#vrm_model_position_y_value').text(extension_settings.vrm.model_settings[model_path]['y']);

    $('#vrm_model_rotation_x').val(extension_settings.vrm.model_settings[model_path]['rx']);
    $('#vrm_model_rotation_x_value').text(extension_settings.vrm.model_settings[model_path]['rx']);
    $('#vrm_model_rotation_y').val(extension_settings.vrm.model_settings[model_path]['ry']);
    $('#vrm_model_rotation_y_value').text(extension_settings.vrm.model_settings[model_path]['ry']);

	// TODO: MouthAnimations

    // Default expression/motion
    loadAnimationUi(
        "default",
        use_default_settings,
        model_expressions,
        model_motions,
        'vrm_default_expression_select',
        'vrm_default_motion_select',
        extension_settings.vrm.model_settings[model_path]['animation_default']['expression'],
        extension_settings.vrm.model_settings[model_path]['animation_default']['motion']);

    // Default loaded
    if (extension_settings.vrm.model_settings[model_path]['animation_default']['expression'] != $(`#vrm_default_expression_select`).val()) {
        extension_settings.vrm.model_settings[model_path]['animation_default']['expression'] = $(`#vrm_default_expression_select`).val();
        saveSettingsDebounced();
    }
    
    if (extension_settings.vrm.model_settings[model_path]['animation_default']['motion'] != $(`#vrm_default_motion_select`).val()) {
        extension_settings.vrm.model_settings[model_path]['animation_default']['motion'] = $(`#vrm_default_motion_select`).val();
        saveSettingsDebounced();
    }

    // Classify expressions mapping
    for (const expression of CLASSIFY_EXPRESSIONS) {
        expression_ui.append(`
        <div class="vrm-parameter">
            <div class="vrm-parameter-title">
                <label for="vrm_expression_${expression}">
                ${expression}
                </label>
            </div>
            <div>
                <div class="vrm-select-div">
                    <select id="vrm_expression_select_${expression}">
                    </select>
                    <div id="vrm_expression_replay_${expression}" class="vrm_replay_button menu_button">
                        <i class="fa-solid fa-arrow-rotate-left"></i>
                    </div>
                </div>
                <div class="vrm-select-div">
                    <select id="vrm_motion_select_${expression}">
                    </select>
                    <div id="vrm_motion_replay_${expression}" class="vrm_replay_button menu_button">
                        <i class="fa-solid fa-arrow-rotate-left"></i>
                    </div>
                </div>
            </div>
        </div>
        `);

        loadAnimationUi(
            expression,
            use_default_settings,
            model_expressions,
            model_motions,
            `vrm_expression_select_${expression}`,
            `vrm_motion_select_${expression}`,
            extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['expression'],
            extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['motion']);

        $(`#vrm_expression_select_${expression}`).on('change', function () { updateExpressionMapping(expression); });
        $(`#vrm_motion_select_${expression}`).on('change', function () { updateExpressionMapping(expression); });
        $(`#vrm_expression_replay_${expression}`).on('click', function () { updateExpressionMapping(expression); });
        $(`#vrm_motion_replay_${expression}`).on('click', function () { updateExpressionMapping(expression); });

        // Default loaded
        if (extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['expression'] != $(`#vrm_expression_select_${expression}`).val()) {
            extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['expression'] = $(`#vrm_expression_select_${expression}`).val();
            saveSettingsDebounced();
        }
        
        if (extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['motion'] != $(`#vrm_motion_select_${expression}`).val()) {
            extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['motion'] = $(`#vrm_motion_select_${expression}`).val();
            saveSettingsDebounced();
        }
    }
}

async function updateExpressionMapping(expression) {
    const character = String($('#vrm_character_select').val());
    const model = String($('#vrm_model_select').val());
    const model_expression = $(`#vrm_expression_select_${expression}`).val();
    const model_motion = $(`#vrm_motion_select_${expression}`).val();

    extension_settings.vrm.model_settings[model]['classify_mapping'][expression] = { 'expression': model_expression, 'motion': model_motion };
    saveSettingsDebounced();

    setExpression(character, model_expression);

    setMotion(character, model_motion, true, true, true);
    console.debug(DEBUG_PREFIX, 'Updated expression mapping:', expression, extension_settings.vrm.model_settings[model]['classify_mapping'][expression]);
}

function updateCharactersList() {
    let current_characters = new Set();
    const context = getContext();
    for (const i of context.characters) {
        current_characters.add(i.name);
    }

    current_characters = Array.from(current_characters);

    if (current_characters.length == 0)
        return;

    let chat_members = currentChatMembers();
    console.debug(DEBUG_PREFIX, 'Chat members', chat_members);

    // Sort group character on top
    for (const i of chat_members) {
        let index = current_characters.indexOf(i);
        if (index != -1) {
            console.debug(DEBUG_PREFIX, 'Moving to top', i);
            current_characters.splice(index, 1);
        }
    }

    current_characters = chat_members;

    if (JSON.stringify(characters_list) !== JSON.stringify(current_characters)) {
        characters_list = current_characters;

        $('#vrm_character_select')
            .find('option')
            .remove()
            .end()
            .append('<option value="none">Select Character</option>')
            .val('none');

        for (const charName of characters_list) {
            $('#vrm_character_select').append(new Option(charName, charName));
        }

        console.debug(DEBUG_PREFIX, 'Updated character list to:', characters_list);
    }
}

async function updateCharactersModels(refreshButton = false) {
    const context = getContext();
    let chat_members = currentChatMembers();

    console.debug(DEBUG_PREFIX, 'Updating models mapping');

    // Assets folder models
    const assets = await getAssetsVRMFiles();

    console.debug(DEBUG_PREFIX, 'Models from assets folder:',assets['vrm']['model']);

    for (const character of chat_members) {
        if (refreshButton || characters_models[character] === undefined) {
            characters_models[character] = [];
            for (const entry of assets['vrm']['model']) {
                let label = entry.replaceAll('\\', '/').replace(".vrm","");
                label = label.substring(label.lastIndexOf('/')+1);
                characters_models[character].push([label,entry]);
            }
            console.debug(DEBUG_PREFIX, 'Updated models of', character);
        }
    }

    animations_files = assets['vrm']['animation'];
    for(const i in animations_files) {
        animations_files[i] = animations_files[i].toLowerCase();
        const animation_group_name = animations_files[i].replace(/\.[^/.]+$/, "").replace(/\d+$/, "");
        if (!animations_groups.includes(animation_group_name))
            animations_groups.push(animation_group_name);
    }

    console.debug(DEBUG_PREFIX, 'Updated models to:', characters_models, animations_files);
    $('#vrm_character_select').trigger('change');
}

async function updateCharactersListOnce() {
    console.debug(DEBUG_PREFIX, 'UDPATING char list', characters_list);
    while (characters_list.length == 0) {
        console.debug(DEBUG_PREFIX, 'UDPATING char list');
        updateCharactersList();
        await delay(1000);
    }
}

//#############################//
//  API Calls                  //
//#############################//

async function getAssetsVRMFiles() {
    console.debug(DEBUG_PREFIX, 'getting vrm model json file from assets folder');

    try {
        const result = await fetch('/api/assets/get', {
            method: 'POST',
            headers: getRequestHeaders(),
        });
        let files = result.ok ? (await result.json()) : [];
        return files;
    }
    catch (err) {
        console.log(err);
        return [];
    }
}