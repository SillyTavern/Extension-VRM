import { loadFileToDocument } from "../../../utils.js";
export {
    MODULE_NAME,
    extensionFolderPath,
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    VRM_MODEL_FOLDER
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
