import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadBVHAnimation, loadMixamoAnimation } from './animationLoader.js';

import { getRequestHeaders, saveSettings, saveSettingsDebounced, sendMessageAsUser } from '../../../../script.js';
import { getContext, extension_settings, getApiUrl, doExtrasFetch, modules } from '../../../extensions.js';

import {
    MODULE_NAME,
    DEBUG_PREFIX,
    VRM_CANVAS_ID,
    FALLBACK_EXPRESSION,
    MIN_SCALE,
    MAX_SCALE,
    ANIMATION_FADE_TIME
} from "./constants.js";

import { currentChatMembers } from './utils.js';
import {
    delay,
    trimToEndSentence,
    trimToStartSentence } from '../../../utils.js';
import { expression } from './lib/jsm/nodes/Nodes.js';
import { ThreeMFLoader } from './lib/jsm/loaders/3MFLoader.js';

export {
    loadVRM,
    currentVRM,
    currentMotion,
    setExpression,
    setMotion,
    updateExpression,
    talk,
    updateModel
}

// Globals
let current_characters = []

// 3D Scene
let renderer = undefined;
let scene = undefined;
let camera = undefined;
let light = undefined;

// gltf and vrm
let currentVRM = undefined;
let currentVRMContainer = undefined;
let currentVRMPath = undefined;
let currentMixer = undefined;
let currentAnimation = undefined;
let currentExpression = "neutral";
let currentMotion = "none";
let currentInstanceId = 0;

let isTalking = false;
let clock = undefined;

let currentVRMHipsHeight = undefined;

// Mouse controls
let raycaster = new THREE.Raycaster();
let previousMouse = undefined;
let currentMouse = undefined;
let mouseOffset = undefined;
let isDragging = false;
let isRotating = false;
let dragObject = undefined;

async function loadVRM() {
    currentMixer = undefined;
    currentVRM = undefined;
    currentVRMContainer = undefined;
    currentVRMPath = undefined;
    currentExpression = "neutral";
    currentMotion = "none";
    currentInstanceId++;

    // Delete the canvas
    if (document.getElementById(VRM_CANVAS_ID) !== null)
        document.getElementById(VRM_CANVAS_ID).remove();

    if (!extension_settings.vrm.enabled) {
        return
    }

    clock = new THREE.Clock();
    clock.start();

    // renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias : true });
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.domElement.id = VRM_CANVAS_ID;
    document.body.appendChild( renderer.domElement );

    // camera
    camera = new THREE.PerspectiveCamera( 30.0, window.innerWidth / window.innerHeight, 0.1, 1000.0 );
    //const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
    camera.position.set( 0.0, 1.0, 5.0 );

    // camera controls
    //const controls = new OrbitControls( camera, renderer.domElement );
    //controls.screenSpacePanning = true;
    //controls.target.set( 0.0, 1.0, 0.0 );
    //controls.update();

    // scene
    scene = new THREE.Scene();

    // light
    light = new THREE.DirectionalLight( 0xffffff );
    light.position.set( 1.0, 1.0, 1.0 ).normalize();
    scene.add( light );

    // lookat target
    const lookAtTarget = new THREE.Object3D();
    camera.add( lookAtTarget );

    // gltf and vrm
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.register( ( parser ) => {
        return new VRMLoaderPlugin( parser );
    } );

    current_characters = currentChatMembers();

    if (current_characters.length > 0 && extension_settings.vrm.character_model_mapping[current_characters[0]] !== undefined) {
        console.debug(DEBUG_PREFIX,current_characters, extension_settings.vrm.character_model_mapping);
        const model_path = extension_settings.vrm.character_model_mapping[current_characters[0]];
        currentVRMPath = model_path;
        console.debug(DEBUG_PREFIX,"Loading VRM model",model_path);

        await loader.load(
            model_path,
            // called when the resource is loaded
            ( gltf ) => {

                const vrm = gltf.userData.vrm;

                // calling these functions greatly improves the performance
                VRMUtils.removeUnnecessaryVertices( gltf.scene );
                VRMUtils.removeUnnecessaryJoints( gltf.scene );

                // Disable frustum culling
                vrm.scene.traverse( ( obj ) => {
                    obj.frustumCulled = false;
                } );

                // Add vrm to scene
                currentVRM = vrm;
			    VRMUtils.rotateVRM0(vrm); // rotate if the VRM is VRM0.0
                currentVRMContainer = new THREE.Group(); // First container to scale/position center model
                currentVRMContainer.name = "VRM_CONTAINER";
                currentVRMContainer.scale.set(2,2,2);
                currentVRMContainer.position.y = 0.5;
                const containerOffset = new THREE.Group(); // Second container to rotate center model
                containerOffset.position.y = -vrm.humanoid?.getNormalizedBoneNode( 'hips' ).position.y; // offset model for rotate on "center"
                containerOffset.add(vrm.scene)
                currentVRMContainer.add(containerOffset)
                scene.add( currentVRMContainer );

                const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode( 'hips' ).position.y;
                const vrmRootY = vrm.scene.position.y;
                currentVRMHipsHeight = Math.abs( vrmHipsY - vrmRootY );
                
                // Grid debuging helpers
                const gridHelper = new THREE.GridHelper( 20, 20 );
                scene.add( gridHelper );
                const axesHelper = new THREE.AxesHelper( 10 );
                scene.add( axesHelper );
                gridHelper.visible = extension_settings.vrm.show_grid;
                axesHelper.visible = extension_settings.vrm.show_grid;

                updateModel(model_path);

                // animate
                function animate() {

                    requestAnimationFrame( animate );
                    const deltaTime = clock.getDelta();
                    
                    // if animation is loaded
                    if ( currentMixer ) {
                        // update the animation
                        currentMixer.update( deltaTime );
                    }
                    
                    if ( currentVRM ) {
                        // Look at camera
                        if (extension_settings.vrm.follow_camera)
                            currentVRM.lookAt.target = lookAtTarget;
                        else
                            currentVRM.lookAt.target = null;
                        
                        currentVRM.update( deltaTime );
                    }

                    // Show/hide helper grid
                    gridHelper.visible = extension_settings.vrm.show_grid;
                    axesHelper.visible = extension_settings.vrm.show_grid;

                    renderer.render( scene, camera );
                }

                // un-T-pose
                console.debug(DEBUG_PREFIX,"VRM",vrm);
                //vrm.humanoid.getNormalizedBoneNode( "hips" ).rotation.y = Math.PI;
                vrm.springBoneManager.reset();
                vrm.humanoid.getNormalizedBoneNode("rightUpperArm").rotation.z = -250;
                vrm.humanoid.getNormalizedBoneNode("rightLowerArm").rotation.z = 0.2;
                vrm.humanoid.getNormalizedBoneNode("leftUpperArm").rotation.z = 250;
                vrm.humanoid.getNormalizedBoneNode("leftLowerArm").rotation.z = -0.2;

                animate();

                // Load default expression/motion
                const expression = extension_settings.vrm.model_settings[model_path]['animation_default']['expression'];
                const motion =  extension_settings.vrm.model_settings[model_path]['animation_default']['motion'];

                if (expression !== undefined && expression != "none") {
                    console.debug(DEBUG_PREFIX,"Set default expression to",expression);
                    setExpression(expression);
                }
                if (motion !== undefined && motion != "none") {
                    console.debug(DEBUG_PREFIX,"Set default motion to",motion);
                    setMotion(motion, true);
                }

                blink(currentVRM, currentInstanceId);
                
                //console.debug(DEBUG_PREFIX,"VRM DEBUG",controls)
                console.debug(DEBUG_PREFIX,"VRM DEBUG",scene)

                console.debug(DEBUG_PREFIX,"VRM scene fully loaded");
            },
            // called while loading is progressing
            ( progress ) => {
                const percent = Math.round(100.0 * ( progress.loaded / progress.total ));
                console.debug(DEBUG_PREFIX, 'Loading model...', percent, '%');
                $("#vrm_model_loading_percent").text(percent);
            },
            // called when loading has errors
            ( error ) => console.error( error )
        );
    }

    console.debug(DEBUG_PREFIX,"DEBUG",renderer);
}

async function setExpression( value ) {
    console.debug(DEBUG_PREFIX,"Switch expression from",currentExpression,"to",value);
    
    if (value == "none")
        value = "neutral";

    if (currentVRM)
        currentVRM.expressionManager.setValue(currentExpression, 0.0);
    currentExpression = value;
    let intensity = 1.0
    if (isTalking)
        intensity = 0.25
    if (currentVRM)
        currentVRM.expressionManager.setValue(currentExpression, intensity);
}

async function setMotion( value, loop=false, force=false ) {
    console.debug(DEBUG_PREFIX,"Switch motion from",currentMotion,"to",value,"force=",force);
    let clip = undefined;

    // Disable animation
    if (value == "none") {
        if (currentAnimation !== undefined) {
            currentAnimation.fadeOut(0.2);
            currentAnimation = undefined;
        }
        currentMotion = "none";
        return;
    }

    // new animation
    if (currentMotion != value || force) {
        currentMotion = value;

        if (currentVRM) {
            // create AnimationMixer for VRM
            if (currentMixer === undefined)
                currentMixer = new THREE.AnimationMixer( currentVRM.scene );

            // Mixamo animation
            if (currentMotion.endsWith(".fbx")) {
                console.debug(DEBUG_PREFIX,"Loading fbx file");

                // Load animation
                clip = await loadMixamoAnimation(currentMotion, currentVRM, currentVRMHipsHeight);
            }
            else
            if (currentMotion.endsWith(".bvh")) {
                console.debug(DEBUG_PREFIX,"Loading bvh file");
                clip = await loadBVHAnimation(currentMotion, currentVRM, currentVRMHipsHeight);
            }
            else {
                console.debug(DEBUG_PREFIX,"UNSUPORTED animation file"); // TODO throw error
                return;
            }

            // create AnimationMixer for VRM
            const newAnimation = currentMixer.clipAction( clip );

            // Fade out current animation
            if ( currentAnimation !== undefined ) {
                currentAnimation.fadeOut( ANIMATION_FADE_TIME );
                currentAnimation.overwrited = true;
                console.debug(DEBUG_PREFIX,"Fade out previous animation");
            }
            
            // Fade in new animation
            newAnimation
                .reset()
                .setEffectiveTimeScale( 1 )
                .setEffectiveWeight( 1 )
                .fadeIn( ANIMATION_FADE_TIME )
                .play();
            newAnimation.overwrited = false;

            // Fade out animation after full loop
            if (!loop) {
                console.debug(DEBUG_PREFIX,"DURATION:",clip.duration*1000 - ANIMATION_FADE_TIME*1000)

                setTimeout(() => {
                    if (!newAnimation.overwrited) {
                        newAnimation.fadeOut(ANIMATION_FADE_TIME);
                        setTimeout(async () => {
                            setMotion(extension_settings.vrm.model_settings[currentVRMPath]["animation_default"]["motion"], true);
                        }, ANIMATION_FADE_TIME+0.1);
                    }
                }, clip.duration*1000);
            }

            currentAnimation = newAnimation;
            console.debug(DEBUG_PREFIX,"VRM animation",currentAnimation);
        }
    }
}

async function updateExpression(chat_id) {
    const message = getContext().chat[chat_id];
    const character = message.name;
    const model_path = extension_settings.vrm.character_model_mapping[character];

    console.debug(DEBUG_PREFIX,'received new message :', message.mes);

    if (message.is_user)
        return;

    if (model_path === undefined) {
        console.debug(DEBUG_PREFIX, 'No model assigned to', character);
        return;
    }

    const expression = await getExpressionLabel(message.mes);
    let model_expression = extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['expression'];
    let model_motion = extension_settings.vrm.model_settings[model_path]['classify_mapping'][expression]['motion'];

    console.debug(DEBUG_PREFIX,'Detected expression in message:',expression);

    // Fallback animations
    if (model_expression == 'none') {
        console.debug(DEBUG_PREFIX,'Expression is none, applying default expression', model_expression);
        model_expression = extension_settings.vrm.model_settings[model_path]['animation_default']['expression'];
    }

    if (model_motion == 'none') {
        console.debug(DEBUG_PREFIX,'Motion is none, playing default motion',model_motion);
        model_motion = extension_settings.vrm.model_settings[model_path]['animation_default']['motion'];
    }

    console.debug(DEBUG_PREFIX,'Playing expression',expression,':', model_expression, model_motion);

    if (model_expression != 'none' && currentVRM !== undefined) {
        setExpression(model_expression);
    }

    if (model_motion != 'none' && currentVRM !== undefined) {
        setMotion(model_motion);
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

// Blink
function blink(vrm, instanceId) {
    var blinktimeout = Math.floor(Math.random() * 250) + 50;
    
    const current_blink = 0; //currentVRM.expressionManager.getValue("blinkLeft");
    console.debug(DEBUG_PREFIX, "TEST", current_blink, instanceId, currentInstanceId);
    setTimeout(() => {
        if (vrm) {
            vrm.expressionManager.setValue("blink",current_blink);
            //console.debug(DEBUG_PREFIX,"Blinking",blinktimeout)
        }
    }, blinktimeout);
    
    if (vrm) {
        vrm.expressionManager.setValue("blink",1.0-current_blink);
        vrm.expressionManager.setValue(currentExpression,1);
    }

    var rand = Math.round(Math.random() * 10000) + 1000;
    setTimeout(function () {
        if (vrm && instanceId == currentInstanceId)
            blink(vrm,instanceId);
        else
            console.debug(DEBUG_PREFIX,"Stopping blink different instance detected.")
    }, rand);
}

async function talk(chat_id) {
    // No model for user or system
    if (getContext().chat[chat_id].is_user || getContext().chat[chat_id].is_system)
        return;

    const message = getContext().chat[chat_id].mes;

    console.debug(DEBUG_PREFIX,'Playing mouth animation for message:',message);
    // No model loaded for character
    if (currentVRM === undefined)
        return;

    let abortTalking = false;

    // Character is already talking TODO: stop previous talk animation
    if (isTalking) {
        console.debug(DEBUG_PREFIX,'Character is already talking abort');
        while (isTalking) {
            abortTalking = true;
            await delay(100);
        }
        abortTalking = false;
        console.debug(DEBUG_PREFIX,'Start new talk');
        //return;
    }

    isTalking = true;
    let startTime = Date.now();
    const duration = message.length * 10;
    const mouth_open_speed = 1.5;
    let mouth_y = 0;

    currentVRM.expressionManager.setValue(currentExpression,0.25);
    console.debug(DEBUG_PREFIX,"Talk duration",duration);

    while ((Date.now() - startTime) < duration) {
        if (abortTalking) {
            console.debug(DEBUG_PREFIX,'Abort talking requested.');
            break;
        }

        // Model destroyed during animation
        if (currentVRM === undefined) {
            console.debug(DEBUG_PREFIX,'Model destroyed during talking animation, abort');
            break;
        }

        mouth_y = Math.sin((Date.now() - startTime));
        currentVRM.expressionManager.setValue("aa",mouth_y);
        await delay(100 / mouth_open_speed);
    }

    if (currentVRM === undefined) {
        currentVRM.expressionManager.setValue(currentExpression,1.0);
    }
    isTalking = false;
}

// handle window resizes
window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize(){
    if (camera !== undefined && renderer !== undefined) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );
    }
}

//--------------
// Events
//-------------

// Select model for drag/rotate
document.addEventListener("pointerdown", (event) => {
    if (raycaster !== undefined && currentVRM !== undefined) {
        var intersects = raycaster.intersectObjects([currentVRM.scene]);
        if (intersects.length > 0) {
            //controls.enabled = false;
            // Climb to VRM object
            dragObject = intersects[0].object;
            while (dragObject.parent.type != "VRM_CONTAINER" && dragObject.parent.type != "Scene")
                dragObject = dragObject.parent;

            if (dragObject.name != "VRM_CONTAINER")
                return;

            // UI between mouse and canvas
            const element = document.elementFromPoint(event.clientX, event.clientY);
            if (element.id != VRM_CANVAS_ID)
                return;

            if(event.pointerType === 'mouse' && event.button === 0){
                // Save mouse offset to avoid teleporting model to cursor
                const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
                const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
                const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
                mouseOffset = new THREE.Vector2(px - dragObject.position.x, py - dragObject.position.y);

                isDragging = true;
                isRotating = false;
                console.debug(DEBUG_PREFIX,"Dragging ",dragObject.name);
            }

            if(event.pointerType === 'mouse' && event.button === 1){ 
                isDragging = false;
                isRotating = true;
                console.debug(DEBUG_PREFIX,"Rotating ",dragObject.name);
            }

        }
    }
} );

// Drop model
document.addEventListener("pointerup", () => {
    isDragging = false;
    isRotating = false;
    dragObject = undefined;
    console.debug(DEBUG_PREFIX,"POINTERUP")
} );

document.addEventListener("pointermove", event => {
    if (raycaster !== undefined && camera !== undefined) {
        // init
        if (previousMouse === undefined || currentMouse === undefined) {
            previousMouse = new THREE.Vector2();
            currentMouse = new THREE.Vector2();
        }

        // Get current mouse position
        currentMouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        currentMouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
        raycaster.setFromCamera(currentMouse, camera);
            
        // Draggin model
        if (isDragging) {
            const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
            const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
            const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
            dragObject.position.set( px-mouseOffset.x, py-mouseOffset.y, 0.0 );

            extension_settings.vrm.model_settings[currentVRMPath]['x'] = (dragObject.position.x).toFixed(2);
            extension_settings.vrm.model_settings[currentVRMPath]['y'] = (dragObject.position.y).toFixed(2);
            $('#vrm_model_position_x').val(extension_settings.vrm.model_settings[currentVRMPath]['x']);
            $('#vrm_model_position_x_value').text(extension_settings.vrm.model_settings[currentVRMPath]['x']);
            $('#vrm_model_position_y').val(extension_settings.vrm.model_settings[currentVRMPath]['y']);
            $('#vrm_model_position_y_value').text(extension_settings.vrm.model_settings[currentVRMPath]['y']);
            saveSettingsDebounced();
        }

        // Rotating model
        if (isRotating) {
            const xDelta = (previousMouse.x - (event.clientX / window.innerWidth)) * 10;
            const yDelta = (previousMouse.y - (event.clientY / window.innerHeight)) * 10;
            dragObject.rotation.set(dragObject.rotation.x - yDelta, dragObject.rotation.y - xDelta , 0.0 );

            extension_settings.vrm.model_settings[currentVRMPath]['rx'] = (dragObject.rotation.x).toFixed(2);
            extension_settings.vrm.model_settings[currentVRMPath]['ry'] = (dragObject.rotation.y).toFixed(2);
            $('#vrm_model_rotation_x').val(extension_settings.vrm.model_settings[currentVRMPath]['rx']);
            $('#vrm_model_rotation_x_value').text(extension_settings.vrm.model_settings[currentVRMPath]['rx']);
            $('#vrm_model_rotation_y').val(extension_settings.vrm.model_settings[currentVRMPath]['ry']);
            $('#vrm_model_rotation_y_value').text(extension_settings.vrm.model_settings[currentVRMPath]['ry']);
            saveSettingsDebounced();
        }

        // Save mouse position
        previousMouse.x = (event.clientX / window.innerWidth);
        previousMouse.y = (event.clientY / window.innerHeight);
    }
});

document.addEventListener("wheel", (event) => {
    event.preventDefault();
    var intersects = raycaster.intersectObjects([currentVRM.scene]);
    if (intersects.length > 0) {
        //controls.enabled = false;
        // Climb to VRM object
        dragObject = intersects[0].object;
        while (dragObject.parent.type != "VRM_CONTAINER" && dragObject.parent.type != "Scene")
                dragObject = dragObject.parent;

        if (dragObject.name != "VRM_CONTAINER" || event.deltaY == 0)
            return;

        // UI between mouse and canvas
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (element.id != VRM_CANVAS_ID)
            return;

        // Restrict scale
        let scaleDelta = 1.1;
        if (event.deltaY > 0)
            scaleDelta = 0.9;

        // Save mouse offset to avoid teleporting model to cursor
        //const range = camera.position.z * Math.tan( camera.fov / 360.0 * Math.PI );
        //const px = ( 2.0 * event.clientX - window.innerWidth ) / window.innerHeight * range;
        //const py = - ( 2.0 * event.clientY - window.innerHeight ) / window.innerHeight * range;
        //mouseOffset = new THREE.Vector2(px - dragObject.position.x, py - dragObject.position.y);

        dragObject.scale.x *= scaleDelta;
        dragObject.scale.y *= scaleDelta;
        dragObject.scale.z *= scaleDelta;

        dragObject.scale.x = Math.min(Math.max(dragObject.scale.x, MIN_SCALE), MAX_SCALE)
        dragObject.scale.y = Math.min(Math.max(dragObject.scale.y, MIN_SCALE), MAX_SCALE)
        dragObject.scale.z = Math.min(Math.max(dragObject.scale.z, MIN_SCALE), MAX_SCALE)

        // Update saved settings
        extension_settings.vrm.model_settings[currentVRMPath]['scale'] = (dragObject.scale.x).toFixed(2);
        $('#vrm_model_scale').val(extension_settings.vrm.model_settings[currentVRMPath]['scale']);
        $('#vrm_model_scale_value').text(extension_settings.vrm.model_settings[currentVRMPath]['scale']);
        saveSettingsDebounced();

        // TODO: restaure model offset to simulate zoom

        console.debug(DEBUG_PREFIX,"Scale updated to",dragObject.scale.x);
    }
} );

async function updateModel(model_path) {
    currentVRMContainer.scale.x = extension_settings.vrm.model_settings[model_path]['scale'];
    currentVRMContainer.scale.y = extension_settings.vrm.model_settings[model_path]['scale'];
    currentVRMContainer.scale.z = extension_settings.vrm.model_settings[model_path]['scale'];

    currentVRMContainer.position.x = (extension_settings.vrm.model_settings[model_path]['x']);
    currentVRMContainer.position.y = (extension_settings.vrm.model_settings[model_path]['y']);
    currentVRMContainer.position.z = 0.0; // In case somehow it get away from 0

    currentVRMContainer.rotation.x = extension_settings.vrm.model_settings[model_path]['rx'];
    currentVRMContainer.rotation.y = extension_settings.vrm.model_settings[model_path]['ry'];
    currentVRMContainer.rotation.z = 0.0; // In case somehow it get away from 0

    console.debug(DEBUG_PREFIX,"Updated model:")
    console.debug(DEBUG_PREFIX,"Scale:",currentVRMContainer.scale)
    console.debug(DEBUG_PREFIX,"Position:",currentVRMContainer.position)
    console.debug(DEBUG_PREFIX,"Rotation:",currentVRMContainer.rotation)
}