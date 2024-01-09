import { loadFileToDocument } from "../../../utils.js";
export {
    MODULE_NAME,
    extensionFolderPath,
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    VRM_MODEL_FOLDER,
    CLASSIFY_EXPRESSIONS,
    FALLBACK_EXPRESSION,
    DEFAULT_EXPRESSION_MAPPING,
    DEFAULT_MOTION_MAPPING
}

const MODULE_NAME = "VRM";
const VRM_MODEL_FOLDER = "live2d";
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
    "admiration",
    "amusement",
    "anger",
    "annoyance",
    "approval",
    "caring",
    "confusion",
    "curiosity",
    "desire",
    "disappointment",
    "disapproval",
    "disgust",
    "embarrassment",
    "excitement",
    "fear",
    "gratitude",
    "grief",
    "joy",
    "love",
    "nervousness",
    "optimism",
    "pride",
    "realization",
    "relief",
    "remorse",
    "sadness",
    "surprise",
    "neutral"
];

const FALLBACK_EXPRESSION = "neutral";

const DEFAULT_EXPRESSION_MAPPING = {
    "default": "neutral",
    "admiration": "happy",
    "amusement": "happy",
    "anger": "angry",
    "annoyance": "angry",
    "approval": "relaxed",
    "caring": "relaxed",
    "confusion": "surprised",
    "curiosity": "surprised",
    "desire": "relaxed",
    "disappointment": "angry",
    "disapproval": "angry",
    "disgust": "angry",
    "embarrassment": "surprised",
    "excitement": "surprised",
    "fear": "sad",
    "gratitude": "happy",
    "grief": "sad",
    "joy": "happy",
    "love": "happy",
    "nervousness": "sad",
    "optimism": "happy",
    "pride": "relaxed",
    "realization": "surprised",
    "relief": "relaxed",
    "remorse": "sad",
    "sadness": "sad",
    "surprise": "surprised",
    "neutral": "neutral"
}

const DEFAULT_MOTION_MAPPING = {
    "default": "assets/vrm/animation/st_default.fbx",
    "admiration": "none",
    "amusement": "none",
    "anger": "none",
    "annoyance": "none",
    "approval": "none",
    "caring": "none",
    "confusion": "none",
    "curiosity": "none",
    "desire": "none",
    "disappointment": "none",
    "disapproval": "none",
    "disgust": "none",
    "embarrassment": "none",
    "excitement": "none",
    "fear": "none",
    "gratitude": "none",
    "grief": "none",
    "joy": "none",
    "love": "none",
    "nervousness": "none",
    "optimism": "none",
    "pride": "none",
    "realization": "none",
    "relief": "none",
    "remorse": "none",
    "sadness": "none",
    "surprise": "none",
    "neutral": "none"
}