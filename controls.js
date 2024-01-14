import * as THREE from 'three';
import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

import {
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    MIN_SCALE,
    MAX_SCALE,
} from "./constants.js";

import {
    vrm_colliders,
    renderer,
    camera,
    VRM_CONTAINER_NAME
} from "./vrm.js";

// Mouse controls
let previousMouse = undefined;
let currentMouse = undefined;
let mouseOffset = undefined;
let isDragging = false;
let isRotating = false;
let isScaling = false;
let dragObject = undefined;

let raycaster = new THREE.Raycaster();

function rescale(object, scaleDelta) {
    // Save mouse offset to avoid teleporting model to cursor
    //const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
    //const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
    //const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
    //mouseOffset = new THREE.Vector2(px - dragObject.position.x, py - dragObject.position.y);

    object.scale.x *= scaleDelta;
    object.scale.y *= scaleDelta;
    object.scale.z *= scaleDelta;

    object.scale.x = Math.min(Math.max(object.scale.x, MIN_SCALE), MAX_SCALE)
    object.scale.y = Math.min(Math.max(object.scale.y, MIN_SCALE), MAX_SCALE)
    object.scale.z = Math.min(Math.max(object.scale.z, MIN_SCALE), MAX_SCALE)

    // Update saved settings
    const model_path = object.model_path;
    extension_settings.vrm.model_settings[model_path]['scale'] = (object.scale.x).toFixed(2);
    $('#vrm_model_scale').val(extension_settings.vrm.model_settings[model_path]['scale']);
    $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[model_path]['scale']);
    saveSettingsDebounced();

    // TODO: restaure model offset to simulate zoom

    //console.debug(DEBUG_PREFIX,"Scale updated to",object.scale.x);
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
    dragObject = undefined;
    //console.debug(DEBUG_PREFIX,"Ponter released");
} );

// Select model for drag/rotate
async function pointerDown(event) {
    if (raycaster !== undefined && currentMouse !== undefined && camera !== undefined) {
        // UI between mouse and canvas
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (element.id != VRM_CANVAS_ID)
            return;

        const mouseX = (event.offsetX / renderer.domElement.clientWidth) * 2 - 1;
        const mouseY = -(event.offsetY / renderer.domElement.clientHeight) * 2 + 1;
        const pointer = new THREE.Vector2(mouseX,mouseY);

        raycaster.setFromCamera(pointer, camera);

        var intersects = raycaster.intersectObjects(vrm_colliders, false);
        if (intersects.length > 0) {
            //controls.enabled = false;
            // Climb to VRM object
            dragObject = intersects[0].object;
            while (dragObject.parent != null && !dragObject.name.includes(VRM_CONTAINER_NAME) && dragObject.parent.type != "Scene")
                dragObject = dragObject.parent;

            //console.debug(DEBUG_PREFIX,"CLICKED on",dragObject);

            if (!dragObject.name.includes(VRM_CONTAINER_NAME))
                return;

            const isLeftClick = event.pointerType === 'mouse' && event.button === 0;
            const isMiddleClick = event.pointerType === 'mouse' && event.button === 1;

            // Move
            if(isLeftClick && !event.ctrlKey && !event.shiftKey){
                // Save mouse offset to avoid teleporting model to cursor
                const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
                const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
                const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
                mouseOffset = new THREE.Vector2(px - dragObject.position.x, py - dragObject.position.y);

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
}

async function pointerMove(event) {
    if (raycaster !== undefined && camera !== undefined) {
        // init
        if (previousMouse === undefined || currentMouse === undefined) {
            previousMouse = new THREE.Vector2();
            currentMouse = new THREE.Vector2();
        }

        // Draggin model
        if (isDragging) {
            const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
            const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
            const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
            const model_path = dragObject.model_path;
            dragObject.position.set( px-mouseOffset.x, py-mouseOffset.y, 0.0 );

            extension_settings.vrm.model_settings[model_path]['x'] = (dragObject.position.x).toFixed(2);
            extension_settings.vrm.model_settings[model_path]['y'] = (dragObject.position.y).toFixed(2);
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
            const model_path = dragObject.model_path;
            dragObject.rotation.set(dragObject.rotation.x - yDelta, dragObject.rotation.y - xDelta , 0.0 );

            extension_settings.vrm.model_settings[model_path]['rx'] = (dragObject.rotation.x).toFixed(2);
            extension_settings.vrm.model_settings[model_path]['ry'] = (dragObject.rotation.y).toFixed(2);
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
            rescale(dragObject, scaleDelta);
        }

        // Save mouse position
        previousMouse.x = (event.clientX / window.innerWidth);
        previousMouse.y = (event.clientY / window.innerHeight);
    }
}

async function wheel(event) {
    //event.preventDefault();
    // UI between mouse and canvas
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element != null && element.id != VRM_CANVAS_ID)
        return;

    const mouseX = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    const mouseY = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    const pointer = new THREE.Vector2(mouseX,mouseY);

    raycaster.setFromCamera(pointer, camera);
    var intersects = raycaster.intersectObjects(vrm_colliders, false);
    if (intersects.length > 0) {
        // Climb to VRM object
        dragObject = intersects[0].object;
        while (dragObject.parent != null && !dragObject.name.includes(VRM_CONTAINER_NAME) && dragObject.parent.type != "Scene")
            dragObject = dragObject.parent;

        //console.debug(DEBUG_PREFIX,"Wheel on",dragObject);

        if (!dragObject.name.includes(VRM_CONTAINER_NAME) || event.deltaY == 0)
            return;

        // UI between mouse and canvas
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (element.id != VRM_CANVAS_ID)
            return;

        // Restrict scale
        let scaleDelta = 1.1;
        if (event.deltaY > 0)
            scaleDelta = 0.9;

        rescale(dragObject, scaleDelta);
    }
}
