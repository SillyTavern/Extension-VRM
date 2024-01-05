import { getContext, extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import {
    DEBUG_PREFIX,
} from './constants.js';

export {
    delay,
    currentChatMembers,
    loadAnimationUi,
};

const delay = ms => new Promise(res => setTimeout(res, ms));

function currentChatMembers() {
    const context = getContext();
    const group_id = context.groupId;
    let chat_members = [context.name2];

    if (group_id !== null) {
        chat_members = [];
        for(const i of context.groups) {
            if (i.id == context.groupId) {
                for(const j of i.members) {
                    let char_name = j.replace(/\.[^/.]+$/, '');
                    if (char_name.includes('default_'))
                        char_name = char_name.substring('default_'.length);

                    chat_members.push(char_name);
                }
            }
        }
    }

    chat_members.sort();

    return chat_members;
}

function loadAnimationUi(model_expressions, model_motions, expression_select_id, motion_select_id, expression_select_value, motion_select_value) {
    $(`#${expression_select_id}`)
        .find('option')
        .remove()
        .end()
        .append('<option value="none">Select expression</option>');

    $(`#${motion_select_id}`)
        .find('option')
        .remove()
        .end()
        .append('<option value="none">Select motion</option>');

    for (const expression of model_expressions) {
        $(`#${expression_select_id}`).append(new Option(expression, expression));
    }

    for (const motion of model_motions) {
        const name = motion.substring(motion.lastIndexOf('/')+1).replace(".fbx","");
        $(`#${motion_select_id}`).append(new Option(name, motion));
    }

    $(`#${expression_select_id}`).val(expression_select_value);
    $(`#${motion_select_id}`).val(motion_select_value);
}