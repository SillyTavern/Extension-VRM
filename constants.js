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
    MAX_SCALE,
    ANIMATION_FADE_TIME,
    SPRITE_DIV,
    VN_MODE_DIV,
    DEFAULT_SCALE,
    HITBOXES,
    HIT_BOX_DELAY
}

const MODULE_NAME = "VRM";
const VRM_MODEL_FOLDER = "live2d";
const extensionFolderPath = `scripts/extensions/third-party/Extension-VRM`;
const DEBUG_PREFIX = "<VRM module>";
const VRM_CANVAS_ID = "vrm-canvas";
const MIN_SCALE = 0.2;
const MAX_SCALE = 30;
const ANIMATION_FADE_TIME = 0.3;
const SPRITE_DIV = 'expression-wrapper';
const VN_MODE_DIV = 'visual-novel-wrapper';

const DEFAULT_SCALE = 3.0;
const HIT_BOX_DELAY = 100;

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
    // Fallback
    "default": "neutral",

    // Classify class
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
    "neutral": "neutral",

    // Hitboxes
    "head": "happy",
    "chest": "angry",
    "groin": "angry",
    "butt": "angry",
    "rightFoot": "surprised",
    "leftFoot": "surprised"
}

const DEFAULT_MOTION_MAPPING = {
    // Fallback
    "default": "assets/vrm/animation/neutral",

    // Classify class
    "admiration": "assets/vrm/animation/admiration",
    "amusement": "assets/vrm/animation/amusement",
    "anger": "assets/vrm/animation/anger",
    "annoyance": "assets/vrm/animation/annoyance",
    "approval": "assets/vrm/animation/approval",
    "caring": "assets/vrm/animation/caring",
    "confusion": "assets/vrm/animation/confusion",
    "curiosity": "assets/vrm/animation/curiosity",
    "desire": "assets/vrm/animation/desire",
    "disappointment": "assets/vrm/animation/disappointment",
    "disapproval": "assets/vrm/animation/disapproval",
    "disgust": "assets/vrm/animation/disgust",
    "embarrassment": "assets/vrm/animation/embarrassment",
    "excitement": "assets/vrm/animation/excitement",
    "fear": "assets/vrm/animation/fear",
    "gratitude": "assets/vrm/animation/gratitude",
    "grief": "assets/vrm/animation/grief",
    "joy": "assets/vrm/animation/joy",
    "love": "assets/vrm/animation/love",
    "nervousness": "assets/vrm/animation/nervousness",
    "neutral": "assets/vrm/animation/neutral",
    "optimism": "assets/vrm/animation/optimism",
    "pride": "assets/vrm/animation/pride",
    "realization": "assets/vrm/animation/realization",
    "relief": "assets/vrm/animation/relief",
    "remorse": "assets/vrm/animation/remorse",
    "sadness": "assets/vrm/animation/sadness",
    "surprise": "assets/vrm/animation/surprise",

    // Hitboxes
    "head": "assets/vrm/animation/hitbox_head",
    "chest": "assets/vrm/animation/hitbox_chest",
    "groin": "assets/vrm/animation/hitbox_chest",
    "butt": "assets/vrm/animation/hitbox_groin",
    "rightFoot": "assets/vrm/animation/hitbox_rightFoot",
    "leftFoot": "assets/vrm/animation/hitbox_leftFoot"
}

const HITBOXES = {
    "head": {
        "bone": "head",
        "size": {
            "x":0.1,
            "y":0.1,
            "z":0.1,
        },
        "offset": {
            "x":0,
            "y":0.08,
            "z":0,
        },
        "color": 0x6699ff
    },
    "chest": {
        "bone": "upperChest",
        "size": {
            "x":0.15,
            "y":0.1,
            "z":0.08,
        },
        "offset": {
            "x":0,
            "y":0.00,
            "z":-0.1,
        },
        "color": 0x6666ff
    },
    "groin": {
        "bone": "hips",
        "size": {
            "x":0.05,
            "y":0.05,
            "z":0.12,
        },
        "offset": {
            "x":0,
            "y":-0.1,
            "z":-0.1,
        },
        "color": 0xff99e6
    },
    "butt": {
        "bone": "hips",
        "size": {
            "x":0.15,
            "y":0.1,
            "z":0.05,
        },
        "offset": {
            "x":0,
            "y":0,
            "z":0.1,
        },
        "color": 0xff00ff
    },
    "rightFoot": {
        "bone": "rightFoot",
        "size": {
            "x":0.1,
            "y":0.1,
            "z":0.1,
        },
        "offset": {
            "x":0,
            "y":0,
            "z":0,
        },
        "color": 0x6600cc
    },
    "leftFoot": {
        "bone": "leftFoot",
        "size": {
            "x":0.1,
            "y":0.1,
            "z":0.1,
        },
        "offset": {
            "x":0,
            "y":0,
            "z":0,
        },
        "color": 0x6600cc
    }
}