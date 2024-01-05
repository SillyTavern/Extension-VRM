import { loadFileToDocument } from "../../../utils.js";
export {
    MODULE_NAME,
    extensionFolderPath,
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    VRM_MODEL_FOLDER,
    CLASSIFY_EXPRESSIONS,
    FALLBACK_EXPRESSION
}

const MODULE_NAME = 'VRM';
const VRM_MODEL_FOLDER = 'live2d';
const extensionFolderPath = `scripts/extensions/third-party/Extension-VRM`;
const DEBUG_PREFIX = "<VRM module>"
const VRM_CANVAS_ID = "vrm-canvas"

const JS_LIBS = [
"es-module-shims.js"
]

// Load JS libraries
for(const i of JS_LIBS){
    await loadFileToDocument(
        `${extensionFolderPath}/lib/${i}`,
        "js"
    );
}

const CLASSIFY_EXPRESSIONS = [
    'admiration',
    'amusement',
    'anger',
    'annoyance',
    'approval',
    'caring',
    'confusion',
    'curiosity',
    'desire',
    'disappointment',
    'disapproval',
    'disgust',
    'embarrassment',
    'excitement',
    'fear',
    'gratitude',
    'grief',
    'joy',
    'love',
    'nervousness',
    'optimism',
    'pride',
    'realization',
    'relief',
    'remorse',
    'sadness',
    'surprise',
    'neutral',
];

const FALLBACK_EXPRESSION = "neutral";