import { getContext, extension_settings, getApiUrl, doExtrasFetch, modules } from '../../../extensions.js';
import { getRequestHeaders, saveSettings, saveSettingsDebounced } from '../../../../script.js';
import {
    trimToEndSentence,
    trimToStartSentence } from '../../../utils.js';
import {
    DEBUG_PREFIX,
    DEFAULT_EXPRESSION_MAPPING,
    DEFAULT_MOTION_MAPPING,
    FALLBACK_EXPRESSION,
} from './constants.js';
export {
    delay,
    currentChatMembers,
    loadAnimationUi,
    getExpressionLabel
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


async function getExpressionLabel(text) {
    // Return if text is undefined, saving a costly fetch request
    if ((!modules.includes('classify') && !extension_settings.expressions.local) || !text) {
        return FALLBACK_EXPRESSION;
    }

    text = sampleClassifyText(text);

    try {
        if (extension_settings.expressions.local) {
            // Local transformers pipeline
            const apiResult = await fetch('/api/extra/classify', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ text: text }),
            });

            if (apiResult.ok) {
                const data = await apiResult.json();
                return data.classification[0].label;
            }
        } else {
            // Extras
            const url = new URL(getApiUrl());
            url.pathname = '/api/classify';

            const apiResult = await doExtrasFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Bypass-Tunnel-Reminder': 'bypass',
                },
                body: JSON.stringify({ text: text }),
            });

            if (apiResult.ok) {
                const data = await apiResult.json();
                return data.classification[0].label;
            }
        }
    } catch (error) {
        console.log(error);
        return FALLBACK_EXPRESSION;
    }
}

/**
 * Processes the classification text to reduce the amount of text sent to the API.
 * Quotes and asterisks are to be removed. If the text is less than 300 characters, it is returned as is.
 * If the text is more than 300 characters, the first and last 150 characters are returned.
 * The result is trimmed to the end of sentence.
 * @param {string} text The text to process.
 * @returns {string}
 */
function sampleClassifyText(text) {
    if (!text) {
        return text;
    }

    // Remove asterisks and quotes
    let result = text.replace(/[\*\"]/g, '');

    const SAMPLE_THRESHOLD = 300;
    const HALF_SAMPLE_THRESHOLD = SAMPLE_THRESHOLD / 2;

    if (text.length < SAMPLE_THRESHOLD) {
        result = trimToEndSentence(result);
    } else {
        result = trimToEndSentence(result.slice(0, HALF_SAMPLE_THRESHOLD)) + ' ' + trimToStartSentence(result.slice(-HALF_SAMPLE_THRESHOLD));
    }

    return result.trim();
}