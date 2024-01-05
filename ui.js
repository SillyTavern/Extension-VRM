import { saveSettingsDebounced, getRequestHeaders, callPopup } from '../../../../script.js';
import { getContext, extension_settings, renderExtensionTemplate } from '../../../extensions.js';

import {
    DEBUG_PREFIX,
    VRM_MODEL_FOLDER,
} from './constants.js';

import { loadVRM } from "./vrm.js";

import {
    currentChatMembers,
    delay,
    //loadModelParamUi,
    //loadAnimationUi,
} from './utils.js';

export {
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
};

let characters_list = [];
let characters_models = {};

async function onEnabledClick() {
    extension_settings.vrm.enabled = $('#vrm_enabled_checkbox').is(':checked');
    saveSettingsDebounced();

    await loadVRM();
}

async function onFollowCursorClick() {
    extension_settings.vrm.follow_cursor = $('#vrm_follow_cursor_checkbox').is(':checked');
    saveSettingsDebounced();

    await loadVRM();
}

async function onShowGridClick() {
    extension_settings.vrm.show_grid = $('#vrm_show_grid_checkbox').is(':checked');
    saveSettingsDebounced();

    await loadVRM();
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

    let nb_character_models = 0;
    if (extension_settings.vrm.character_models_settings[character] !== undefined)
        nb_character_models = Object.keys(extension_settings.vrm.character_models_settings[character]).length;
    const template = `<div class="m-b-1">Are you sure you want to remove all vrm model settings for character ${character}? (model settings: ${nb_character_models})</div>`;
    const confirmation = await callPopup(template, 'confirm');

    if (confirmation) {
        $('#vrm_model_select').val('none');
        $('#vrm_model_settings').hide();
        delete extension_settings.vrm.character_model_mapping[character];
        delete extension_settings.vrm.character_models_settings[character];
        saveSettingsDebounced();
        await loadVRM();
        console.debug(DEBUG_PREFIX, 'Deleted all settings for', character);
    }
    else {
        console.debug(DEBUG_PREFIX, 'VRM setting delete refused by user');
    }
}

async function onModelRefreshClick() {
    updateCharactersModels(true);
    $('#vrm_model_select').val('none');
    $('#vrm_model_select').trigger('change');
}

async function onModelChange() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());

    if (model_path == 'none') {
        $('#vrm_model_settings').hide();
        delete extension_settings.vrm.character_model_mapping[character];
        saveSettingsDebounced();
        return;
    }

    extension_settings.vrm.character_model_mapping[character] = model_path;
    saveSettingsDebounced();

    await loadModelUi();
    await loadVRM();
}

// TODO
async function loadModelUi() {
    const character = String($('#vrm_character_select').val());
    const model_path = String($('#vrm_model_select').val());
    const expression_ui = $('#vrm_expression_mapping');
    
    $('#vrm_model_settings').show();
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

    console.debug(DEBUG_PREFIX, 'Updated models to:', characters_models);
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