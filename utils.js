import { getContext, extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import {
    DEBUG_PREFIX,
    DEFAULT_EXPRESSION_MAPPING,
    DEFAULT_MOTION_MAPPING
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

function loadAnimationUi(type, use_default_settings, model_expressions, model_motions, expression_select_id, motion_select_id, expression_select_value, motion_select_value, default_settings=false) {
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
        const name = motion.substring(motion.lastIndexOf('/')+1).replace(".fbx","").replace(".bvh","");
        $(`#${motion_select_id}`).append(new Option(name, motion));
    }

    
    $(`#${expression_select_id}`).val(expression_select_value);
    $(`#${motion_select_id}`).val(motion_select_value);

    if (use_default_settings) {
        if (model_expressions.includes(DEFAULT_EXPRESSION_MAPPING[type])) {
            $(`#${expression_select_id}`).val(DEFAULT_EXPRESSION_MAPPING[type]);
        }
        if (model_motions.includes(DEFAULT_MOTION_MAPPING[type])) {
            $(`#${motion_select_id}`).val(DEFAULT_MOTION_MAPPING[type]);
        }
    }
}