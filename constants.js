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
    DEFAULT_MOTION_MAPPING,
    MIN_SCALE,
    MAX_SCALE
}

const MODULE_NAME = "VRM";
const VRM_MODEL_FOLDER = "live2d";
const extensionFolderPath = `scripts/extensions/third-party/Extension-VRM`;
const DEBUG_PREFIX = "<VRM module>"
const VRM_CANVAS_ID = "vrm-canvas"
const MIN_SCALE = 0.2
const MAX_SCALE = 30

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
    "default": "assets/vrm/animation/neutral.bvh",
    "admiration": "assets/vrm/animation/admiration.bvh",
    "amusement": "assets/vrm/animation/amusement.bvh",
    "anger": "assets/vrm/animation/anger.bvh",
    "annoyance": "assets/vrm/animation/annoyance.bvh",
    "approval": "assets/vrm/animation/approval.bvh",
    "caring": "assets/vrm/animation/caring.bvh",
    "confusion": "assets/vrm/animation/confusion.bvh",
    "curiosity": "assets/vrm/animation/curiosity.bvh",
    "desire": "assets/vrm/animation/desire.bvh",
    "disappointment": "assets/vrm/animation/disappointment.bvh",
    "disapproval": "assets/vrm/animation/disapproval.bvh",
    "disgust": "assets/vrm/animation/disgust.bvh",
    "embarrassment": "assets/vrm/animation/embarrassment.bvh",
    "excitement": "assets/vrm/animation/excitement.bvh",
    "fear": "assets/vrm/animation/fear.bvh",
    "gratitude": "assets/vrm/animation/gratitude.bvh",
    "grief": "assets/vrm/animation/grief.bvh",
    "joy": "assets/vrm/animation/joy.bvh",
    "love": "assets/vrm/animation/love.bvh",
    "nervousness": "assets/vrm/animation/nervousness.bvh",
    "optimism": "assets/vrm/animation/optimism.bvh",
    "pride": "assets/vrm/animation/pride.bvh",
    "realization": "assets/vrm/animation/realization.bvh",
    "relief": "assets/vrm/animation/relief.bvh",
    "remorse": "assets/vrm/animation/remorse.bvh",
    "sadness": "assets/vrm/animation/sadness.bvh",
    "surprise": "assets/vrm/animation/surprise.bvh",
    "neutral": "assets/vrm/animation/neutral.bvh"
}