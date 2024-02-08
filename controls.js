import * as THREE from './lib/three.module.js';
import { saveSettingsDebounced, sendMessageAsUser } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

import {
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    MIN_SCALE,
    MAX_SCALE,
    HIT_BOX_DELAY
} from "./constants.js";

import {
    current_avatars,
    renderer,
    camera,
    VRM_CONTAINER_NAME,
    setExpression,
    setMotion
} from "./vrm.js";
import { func } from './lib/jsm/nodes/code/FunctionNode.js';
import { delay } from '../../../utils.js';

// Mouse controls
let previousMouse = undefined;
let currentMouse = undefined;
let mouseOffset = undefined;
let isDragging = false;
let isRotating = false;
let isScaling = false;
let dragCharacter = undefined;
let isMouseDown = false;

let previous_interaction = { 'character': '', 'message': '' };

let raycaster = new THREE.Raycaster();

function rescale(object, scaleDelta) {
    // Save mouse offset to avoid teleporting model to cursor
    //const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
    //const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
    //const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
    //mouseOffset = new THREE.Vector2(px - dragCharacter.position.x, py - dragCharacter.position.y);

    object.scale.x *= scaleDelta;
    object.scale.y *= scaleDelta;
    object.scale.z *= scaleDelta;

    object.scale.x = Math.min(Math.max(object.scale.x, MIN_SCALE), MAX_SCALE)
    object.scale.y = Math.min(Math.max(object.scale.y, MIN_SCALE), MAX_SCALE)
    object.scale.z = Math.min(Math.max(object.scale.z, MIN_SCALE), MAX_SCALE)

    // TODO: restaure model offset to simulate zoom

    //console.debug(DEBUG_PREFIX,"Scale updated to",object.scale.x);
}

async function hitboxClick(character,hitbox) {
    await delay(HIT_BOX_DELAY);

    // Using control
    if (isMouseDown)
        return;

    // Was a simple click
    const model_path = current_avatars[character]["model_path"]
    console.debug(DEBUG_PREFIX,"Detected click on hitbox",character,hitbox,model_path,extension_settings.vrm.model_settings[model_path]['hitboxes_mapping']);

    const model_expression = extension_settings.vrm.model_settings[model_path]['hitboxes_mapping'][hitbox]["expression"];
    const model_motion = extension_settings.vrm.model_settings[model_path]['hitboxes_mapping'][hitbox]["motion"];
    const message = extension_settings.vrm.model_settings[model_path]['hitboxes_mapping'][hitbox]["message"];

    if (model_expression != "none")
        setExpression(character, model_expression);

    if (model_motion != "none")
        setMotion(character, model_motion, false, true, true);

    if (message != '') {
        console.debug(DEBUG_PREFIX,getContext());
        // Same interaction as last message
        if (getContext().chat[getContext().chat.length - 1].is_user && previous_interaction['character'] == character && previous_interaction['message'] == message) {
            console.debug(DEBUG_PREFIX,'Same as last interaction, nothing done');
        }
        else {
            previous_interaction['character'] = character;
            previous_interaction['message'] = message;

            //$('#send_textarea').val(''); // clear message area to avoid double message
            //sendMessageAsUser(message);
            $('#send_textarea').val(message);
            if (extension_settings.vrm.auto_send_hitbox_message) {
                await getContext().generate();
            }
        }
    }
    else
        console.debug(DEBUG_PREFIX,'Mapped message empty, nothing to send.');
}

//--------------
// Events
//-------------

document.addEventListener("pointermove", async (event) => {pointerMove(event);});
document.addEventListener("pointerdown", (event) => {pointerDown(event);});
document.addEventListener("wheel", async (event) => {wheel(event)});
document.addEventListener("pointerup", () => {// Drop object
    isDragging = false;
    isRotating = false;
    isScaling = false;
    dragCharacter = undefined;

    isMouseDown = false;
    //console.debug(DEBUG_PREFIX,"Ponter released");
} );

// Select model for drag/rotate
async function pointerDown(event) {
    isMouseDown = true;
    if (raycaster !== undefined && currentMouse !== undefined && camera !== undefined) {
        // UI between mouse and canvas
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (element.id != VRM_CANVAS_ID)
            return;

        const mouseX = (event.offsetX / renderer.domElement.clientWidth) * 2 - 1;
        const mouseY = -(event.offsetY / renderer.domElement.clientHeight) * 2 + 1;
        const pointer = new THREE.Vector2(mouseX,mouseY);

        raycaster.setFromCamera(pointer, camera);
        
        // Check for character 
        for(const character in current_avatars) {

            const hitboxes = []

            for(const hit_part in current_avatars[character]["hitboxes"])
                hitboxes.push(current_avatars[character]["hitboxes"][hit_part]["collider"])
            
            let insersects = raycaster.intersectObjects(hitboxes, false);

            if(insersects.length > 0) {
                const hitbox = insersects[0].object;
                hitboxClick(character,hitbox.name);
            }

            insersects = raycaster.intersectObject(current_avatars[character]["collider"], false);
            
            if(insersects.length > 0) {
                dragCharacter = character;
                break;
            }

        }

        // Mouse controls disabled
        if (extension_settings.vrm.lock_models)
            return;

        if (dragCharacter === undefined)
            return;

        const isLeftClick = event.pointerType === 'mouse' && event.button === 0;
        const isMiddleClick = event.pointerType === 'mouse' && event.button === 1;

        // Move
        if(isLeftClick && !event.ctrlKey && !event.shiftKey){
            // Save mouse offset to avoid teleporting model to cursor
            const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
            const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
            const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
            mouseOffset = new THREE.Vector2(px - current_avatars[dragCharacter]["objectContainer"].position.x, py - current_avatars[dragCharacter]["objectContainer"].position.y);

            isDragging = true;
            isRotating = false;
            isScaling = false;
        }

        // Rotation
        if(isMiddleClick || (isLeftClick && event.ctrlKey && !event.shiftKey)){ 
            isDragging = false;
            isRotating = true;
            isScaling = false;
        }

        // Scale
        if(isLeftClick && event.shiftKey && !event.ctrlKey){
            isScaling = true;
        }
    }
}

async function pointerMove(event) {
    // init
    if (previousMouse === undefined || currentMouse === undefined) {
        previousMouse = new THREE.Vector2();
        currentMouse = new THREE.Vector2();
    }
    
    // Mouse controls disabled
    if (extension_settings.vrm.lock_models)
        return;

    if (raycaster !== undefined && camera !== undefined) {
        const character = dragCharacter;

        // Draggin model
        if (isDragging) {
            const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
            const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
            const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
            const model_path = current_avatars[character]["model_path"];
            current_avatars[character]["objectContainer"].position.set( px-mouseOffset.x, py-mouseOffset.y, 0.0 );

            extension_settings.vrm.model_settings[model_path]['x'] = (current_avatars[character]["objectContainer"].position.x).toFixed(2);
            extension_settings.vrm.model_settings[model_path]['y'] = (current_avatars[character]["objectContainer"].position.y).toFixed(2);
            $('#vrm_model_position_x').val(extension_settings.vrm.model_settings[model_path]['x']);
            $('#vrm_model_position_x_value').text(extension_settings.vrm.model_settings[model_path]['x']);
            $('#vrm_model_position_y').val(extension_settings.vrm.model_settings[model_path]['y']);
            $('#vrm_model_position_y_value').text(extension_settings.vrm.model_settings[model_path]['y']);
            saveSettingsDebounced();
        }

        // Rotating model
        if (isRotating) {
            const xDelta = (previousMouse.x - (event.clientX / window.innerWidth)) * 10;
            const yDelta = (previousMouse.y - (event.clientY / window.innerHeight)) * 10;
            const model_path = current_avatars[character]["objectContainer"].model_path;
            current_avatars[character]["objectContainer"].rotation.set(current_avatars[character]["objectContainer"].rotation.x - yDelta, current_avatars[character]["objectContainer"].rotation.y - xDelta , 0.0 );

            extension_settings.vrm.model_settings[model_path]['rx'] = (current_avatars[character]["objectContainer"].rotation.x).toFixed(2);
            extension_settings.vrm.model_settings[model_path]['ry'] = (current_avatars[character]["objectContainer"].rotation.y).toFixed(2);
            $('#vrm_model_rotation_x').val(extension_settings.vrm.model_settings[model_path]['rx']);
            $('#vrm_model_rotation_x_value').text(extension_settings.vrm.model_settings[model_path]['rx']);
            $('#vrm_model_rotation_y').val(extension_settings.vrm.model_settings[model_path]['ry']);
            $('#vrm_model_rotation_y_value').text(extension_settings.vrm.model_settings[model_path]['ry']);
            saveSettingsDebounced();
        }

        // Scaling
        if (isScaling) {
            const yDelta = (previousMouse.y - (event.clientY / window.innerHeight)) * 10;
            
            //console.debug(DEBUG_PREFIX,"SCALING delta",yDelta)
            let scaleDelta = 1.05;
            if (yDelta < 0)
                scaleDelta = 0.95;

            rescale(current_avatars[character]["objectContainer"], scaleDelta);
            rescale(current_avatars[character]["collider"], scaleDelta);
            
            // Update saved settings
            const model_path = current_avatars[character]["model_path"];
            extension_settings.vrm.model_settings[model_path]['scale'] = (current_avatars[character]["objectContainer"].scale.x).toFixed(2);
            $('#vrm_model_scale').val(extension_settings.vrm.model_settings[model_path]['scale']);
            $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[model_path]['scale']);
            saveSettingsDebounced();
        }

        // Save mouse position
        previousMouse.x = (event.clientX / window.innerWidth);
        previousMouse.y = (event.clientY / window.innerHeight);
    }
}

async function wheel(event) {
    // Mouse controls disabled
    if (extension_settings.vrm.lock_models)
        return;

    //No change
    if(event.deltaY == 0)
        return;

    // UI between mouse and canvas
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element != null && element.id != VRM_CANVAS_ID)
        return;

    const mouseX = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    const mouseY = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    const pointer = new THREE.Vector2(mouseX,mouseY);

    raycaster.setFromCamera(pointer, camera);

    // Check for character 
    for(const character in current_avatars) {
        const insersects = raycaster.intersectObject(current_avatars[character]["collider"], false);
            
        if(insersects.length > 0) {
            // Restrict scale
            let scaleDelta = 1.1;
            if (event.deltaY > 0)
                scaleDelta = 0.9;

            rescale(current_avatars[character]["objectContainer"], scaleDelta);
            rescale(current_avatars[character]["collider"], scaleDelta);
            
            // Update saved settings
            const model_path = current_avatars[character]["model_path"];
            extension_settings.vrm.model_settings[model_path]['scale'] = (current_avatars[character]["objectContainer"].scale.x).toFixed(2);
            $('#vrm_model_scale').val(extension_settings.vrm.model_settings[model_path]['scale']);
            $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[model_path]['scale']);
            saveSettingsDebounced();
            break;
        }
    }
}
