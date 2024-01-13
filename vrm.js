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
    ANIMATION_FADE_TIME,
    SPRITE_DIV,
    VN_MODE_DIV
} from "./constants.js";

import {
    currentChatMembers,
    getExpressionLabel
} from './utils.js';

import {
    delay
} from '../../../utils.js';

import {
    animations_files
} from './ui.js';

export {
    loadScene,
    loadAllModels,
    loadModel,
    getVRM,
    setExpression,
    setMotion,
    updateExpression,
    talk,
    updateModel,
    vrm_colliders,
    renderer,
    camera,
    VRM_CONTAINER_NAME
}

const VRM_CONTAINER_NAME = "VRM_CONTAINER";
const VRM_COLLIDER_NAME = "VRM_COLLIDER"

// Avatars
let current_avatars = {} // contain loaded avatar variables
let vrm_colliders = [] // use for raycasting

// Animations
let animations_cache = {};

// 3D Scene
let renderer = undefined;
let scene = undefined;
let camera = undefined;
let light = undefined;

// gltf and vrm
let currentInstanceId = 0;
let clock = undefined;
const lookAtTarget = new THREE.Object3D();

const gridHelper = new THREE.GridHelper( 20, 20 );
const axesHelper = new THREE.AxesHelper( 10 );

// animate
function animate() {
    requestAnimationFrame( animate );
    if (renderer !== undefined && scene !== undefined && camera !== undefined) {
        const deltaTime = clock.getDelta();

        for(const character in current_avatars) {
            const vrm = current_avatars[character]["vrm"]
            const mixer =  current_avatars[character]["animation_mixer"]
            // Look at camera
            if (extension_settings.vrm.follow_camera)
                vrm.lookAt.target = lookAtTarget;
            else
                vrm.lookAt.target = null;

            vrm.update( deltaTime );
            mixer.update( deltaTime );
            current_avatars[character]["colliderHelper"].visible = extension_settings.vrm.show_grid;
        }
        // Show/hide helper grid
        gridHelper.visible = extension_settings.vrm.show_grid;
        axesHelper.visible = extension_settings.vrm.show_grid;

        renderer.render( scene, camera );
    }
}

animate();

async function loadScene() {
    clock = new THREE.Clock();
    current_avatars = {};
    vrm_colliders = [];
    animations_cache = {};
    const instanceId = currentInstanceId + 1;
    currentInstanceId = instanceId;

    // Delete the canvas
    if (document.getElementById(VRM_CANVAS_ID) !== null) {
        document.getElementById(VRM_CANVAS_ID).remove();
        // Hide sprite divs
    }
    
    $('#' + SPRITE_DIV).addClass('vrm-hidden');
    $('#' + VN_MODE_DIV).addClass('vrm-hidden');

    if (!extension_settings.vrm.enabled) {
        $('#' + SPRITE_DIV).removeClass('vrm-hidden');
        $('#' + VN_MODE_DIV).removeClass('vrm-hidden');
        return
    }

    clock.start();

    // renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias : true });
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.domElement.id = VRM_CANVAS_ID;
    document.body.appendChild( renderer.domElement );

    // camera
    camera = new THREE.PerspectiveCamera( 50.0, window.innerWidth / window.innerHeight, 0.1, 100.0 );
    //const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
    camera.position.set( 0.0, 1.0, 5.0 );

    // camera controls
    //const controls = new OrbitControls( camera, renderer.domElement );
    //controls.screenSpacePanning = true;
    //controls.target.set( 0.0, 1.0, 0.0 );
    //controls.update();

    // scene
    scene = new THREE.Scene();
    
    // Grid debuging helpers
    scene.add( gridHelper );
    scene.add( axesHelper );
    gridHelper.visible = extension_settings.vrm.show_grid;
    axesHelper.visible = extension_settings.vrm.show_grid;

    // light
    light = new THREE.DirectionalLight( 0xffffff );
    light.position.set( 1.0, 1.0, 1.0 ).normalize();
    scene.add( light );

    // lookat target
    camera.add( lookAtTarget );

    //current_characters = currentChatMembers();
    //await loadAllModels(current_characters);

    //console.debug(DEBUG_PREFIX,"DEBUG",renderer);
}

async function loadAllModels(current_characters) {
    // Unload models
    for(const character in current_avatars) {
        await loadModel(character,null);
    }

    if (extension_settings.vrm.enabled) {

        // Load new characters models
        for(const character of current_characters) {
            const model_path = extension_settings.vrm.character_model_mapping[character];
            if (model_path !== undefined) {
                console.debug(DEBUG_PREFIX,"Loading VRM model of",character,":",model_path);

                await loadModel(character,model_path);
            }
        }
    }
}

async function loadModel(character,model_path=null) {
    // unload existing model
    if (current_avatars[character] !== undefined) {
        console.debug(DEBUG_PREFIX,"Unloading avatar of",character);
        const container = current_avatars[character]["objectContainer"];
        scene.remove(scene.getObjectByName(container.name));
        // Delete collider
        for(const i in vrm_colliders)
            if (vrm_colliders[i].name == current_avatars[character]["collider"].name) {
                //console.debug(DEBUG_PREFIX,"DELETE COLLIDER",vrm_colliders[i])
                vrm_colliders.splice(i, 1);
                //console.debug(DEBUG_PREFIX,vrm_colliders)
                break;
            }
        delete current_avatars[character];
        await container.traverse(obj => obj.dispose?.());
    }

    // Model set to none
    if (model_path === null)
        return;

    // gltf and vrm
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.register( ( parser ) => {
        return new VRMLoaderPlugin( parser );
    } );

    await loader.load(
        model_path,
        async ( gltf ) => { // called when the resource is loaded

            const vrm = gltf.userData.vrm;
            const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode( 'hips' ).position.y;
            const vrmRootY = vrm.scene.position.y;
            const hipsHeight = Math.abs( vrmHipsY - vrmRootY ); // Used for offset center rotation and animation scaling

            // calling these functions greatly improves the performance
            VRMUtils.removeUnnecessaryVertices( gltf.scene );
            VRMUtils.removeUnnecessaryJoints( gltf.scene );

            // Disable frustum culling
            vrm.scene.traverse( ( obj ) => {
                obj.frustumCulled = false;
            } );

            // un-T-pose
            vrm.springBoneManager.reset();
            if (vrm.meta?.metaVersion === '1') {
                vrm.humanoid.getNormalizedBoneNode("rightUpperArm").rotation.z = -250;
                vrm.humanoid.getNormalizedBoneNode("rightLowerArm").rotation.z = 0.2;
                vrm.humanoid.getNormalizedBoneNode("leftUpperArm").rotation.z = 250;
                vrm.humanoid.getNormalizedBoneNode("leftLowerArm").rotation.z = -0.2;
            }
            else {
                vrm.humanoid.getNormalizedBoneNode("rightUpperArm").rotation.z = 250;
                vrm.humanoid.getNormalizedBoneNode("rightLowerArm").rotation.z = -0.2;
                vrm.humanoid.getNormalizedBoneNode("leftUpperArm").rotation.z = -250;
                vrm.humanoid.getNormalizedBoneNode("leftLowerArm").rotation.z = 0.2;
            }

            // Add vrm to scene
            VRMUtils.rotateVRM0(vrm); // rotate if the VRM is VRM0.0
            const scale = extension_settings.vrm.model_settings[model_path]["scale"]
            // Create a group to set model center as rotation/scaling origin
            const object_container = new THREE.Group(); // First container to scale/position center model
            object_container.visible = false;
            object_container.name = VRM_CONTAINER_NAME+"_"+character;
            object_container.character = character; // link to character for mouse controls
            object_container.model_path = model_path; // link to character for mouse controls
            object_container.scale.set(scale,scale,scale);
            object_container.position.y = 0.5; // offset to center model
            const verticalOffset = new THREE.Group(); // Second container to rotate center model
            verticalOffset.position.y = -hipsHeight; // offset model for rotate on "center"
            verticalOffset.add(vrm.scene)
            object_container.add(verticalOffset)
            scene.add( object_container );
            object_container.parent = scene;
            
            // Collider used to detect mouse click
            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(vrm.scene);
            boundingBox.set(new THREE.Vector3(boundingBox.min.x/2,boundingBox.min.y,-0.25), new THREE.Vector3(boundingBox.max.x/2,boundingBox.max.y,0.25))
            const dimensions = new THREE.Vector3().subVectors( boundingBox.max, boundingBox.min );
            // make a BoxGeometry of the same size as Box3
            const boxGeo = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
            // move new mesh center so it's aligned with the original object
            const matrix = new THREE.Matrix4().setPosition(dimensions.addVectors(boundingBox.min, boundingBox.max).multiplyScalar( 0.5 ));
            boxGeo.applyMatrix4(matrix);
            // make a mesh
            const collider = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial( { visible: false } ));
            collider.name = VRM_COLLIDER_NAME+"_"+character;
            collider.material.side = THREE.BackSide;
            verticalOffset.add(collider);
            vrm_colliders.push(collider);
            // Make a debug visual helper
            const colliderHelper = new THREE.Box3Helper( boundingBox, 0xffff00 );
            collider.add(colliderHelper);
            colliderHelper.visible = extension_settings.vrm.show_grid;
            
            // Avatar dynamic settings
            current_avatars[character] = {
                "vrm":vrm, // the actual vrm object
                "hipsHeight":hipsHeight, // its original hips height, used for scaling loaded animation
                "objectContainer":object_container, // the actual 3d group containing the vrm scene, handle centered position/rotation/scaling
                "collider":collider,
                "colliderHelper":colliderHelper,
                "expression": "none",
                "animation_mixer": new THREE.AnimationMixer(vrm.scene),
                "motion": {
                    "name": "none",
                    "animation": null
                },
                "talkEnd": 0,
            };

            updateModel(character);

            // Cache model animations
            if (animations_cache[model_path] === undefined) {
                animations_cache[model_path] = {};
                const animation_names = [extension_settings.vrm.model_settings[model_path]['animation_default']['motion']]
                for (const i in extension_settings.vrm.model_settings[model_path]['classify_mapping']) {
                    animation_names.push(extension_settings.vrm.model_settings[model_path]['classify_mapping'][i]["motion"]);
                }

                for (const file of animations_files) {
                    for (const i of animation_names) {
                        if(file.includes(i) && animations_cache[model_path][file] === undefined) {
                            const clip = await loadAnimation(vrm, hipsHeight, file);
                            if (clip !== undefined)
                                animations_cache[model_path][file] = clip;
                        }
                    }
                }

                console.debug(DEBUG_PREFIX,"Cached animations:",animations_cache[model_path]);
            }

            // Load default expression/motion
            const expression = extension_settings.vrm.model_settings[model_path]['animation_default']['expression'];
            const motion =  extension_settings.vrm.model_settings[model_path]['animation_default']['motion'];

            if (expression !== undefined && expression != "none") {
                console.debug(DEBUG_PREFIX,"Set default expression to",expression);
                setExpression(character, expression);
            }
            if (motion !== undefined && motion != "none") {
                console.debug(DEBUG_PREFIX,"Set default motion to",motion);
                setMotion(character, motion, true);
            }

            blink(character, currentInstanceId);
            textTalk(character, currentInstanceId);
            object_container.visible = true;
            console.debug(DEBUG_PREFIX,"VRM fully loaded:",character,model_path);
            console.debug(DEBUG_PREFIX,"MODEL:",vrm);
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

async function setExpression(character, value) {
    if (current_avatars[character] === undefined) {
        console.debug(DEBUG_PREFIX,"WARNING requested setExpression of character without vrm loaded:",character,"(loaded",current_avatars,")");
        return;
    }

    const vrm = current_avatars[character]["vrm"];
    const current_expression = current_avatars[character]["expression"];
    console.debug(DEBUG_PREFIX,"Switch expression of",character,"from",current_expression,"to",value);
    
    if (value == "none")
        value = "neutral";

    // Rest all expressions
    for(const expression in vrm.expressionManager.expressionMap)
        vrm.expressionManager.setValue(expression, 0.0);

    vrm.expressionManager.setValue(value, 0.25);
    current_avatars[character]["expression"] = value;
}

async function loadAnimation(vrm, hipsHeight, motion_file_path) {
    let clip;
    try {
        // Mixamo animation
        if (motion_file_path.endsWith(".fbx")) {
            console.debug(DEBUG_PREFIX,"Loading fbx file");

            // Load animation
            clip = await loadMixamoAnimation(motion_file_path, vrm, hipsHeight);
        }
        else
        if (motion_file_path.endsWith(".bvh")) {
            console.debug(DEBUG_PREFIX,"Loading bvh file");
            clip = await loadBVHAnimation(motion_file_path, vrm, hipsHeight);
        }
        else {
            console.debug(DEBUG_PREFIX,"UNSUPORTED animation file");
            toastr.error('Wrong animation file format:'+motion_file_path, DEBUG_PREFIX + ' cannot play animation', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            return;
        }
    }
    catch(error) {
        console.debug(DEBUG_PREFIX,"Something went wrong when loading animation file:",motion_file_path);
        toastr.error('Wrong animation file format:'+motion_file_path, DEBUG_PREFIX + ' cannot play animation', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
        return;
    }
    return clip;
}

async function setMotion(character, motion_file_path, loop=false, force=false, random=true ) {
    if (current_avatars[character] === undefined) {
        console.debug(DEBUG_PREFIX,"WARNING requested setMotion of character without vrm loaded:",character,"(loaded",current_avatars,")");
        return;
    }
    const model_path = extension_settings.vrm.character_model_mapping[character];
    const vrm = current_avatars[character]["vrm"];
    const hipsHeight = current_avatars[character]["hipsHeight"];
    const mixer = current_avatars[character]["animation_mixer"];
    const current_motion_name = current_avatars[character]["motion"]["name"];
    const current_motion_animation= current_avatars[character]["motion"]["animation"];
    let clip = undefined;

    console.debug(DEBUG_PREFIX,"Switch motion for",character,"from",current_motion_name,"to",motion_file_path,"loop=",loop,"force=",force,"random=",random);

    // Disable current animation
    if (motion_file_path == "none") {
        if (current_motion_animation !== null) {
            current_motion_animation.fadeOut(ANIMATION_FADE_TIME);
            current_motion_animation.terminated = true;
        }
        current_avatars[character]["motion"]["animation"] = null;
        return;
    }

    // Pick random animationX
    const filename = motion_file_path.replace(/\.[^/.]+$/, "").replace(/\d+$/, "");
    if (random) {
        let same_motion = []
        for(const i of animations_files) {
            if (i.replace(/\.[^/.]+$/, "").replace(/\d+$/, "") == filename)
            same_motion.push(i)
        }
        motion_file_path = same_motion[Math.floor(Math.random() * same_motion.length)];
        console.debug(DEBUG_PREFIX,"Picked a random animation among",same_motion,":",motion_file_path);
    }

    // new animation
    if (current_motion_name != motion_file_path || loop || force) {

        if (animations_cache[model_path][motion_file_path] !== undefined) {
            clip = animations_cache[model_path][motion_file_path];
        }
        else {
            clip = await loadAnimation(vrm, hipsHeight, motion_file_path);

            if (clip === undefined) {
                return;
            }

            animations_cache[model_path][motion_file_path] = clip;
        }

        current_avatars[character]["motion"]["name"] = motion_file_path;

        // create AnimationMixer for VRM
        const new_motion_animation = mixer.clipAction( clip );

        // Fade out current animation
        if ( current_motion_animation !== null ) {
            current_motion_animation.fadeOut( ANIMATION_FADE_TIME );
            current_motion_animation.terminated = true;
            console.debug(DEBUG_PREFIX,"Fade out previous animation");
        }
        
        // Fade in new animation
        new_motion_animation
            .reset()
            .setEffectiveTimeScale( 1 )
            .setEffectiveWeight( 1 )
            .fadeIn( ANIMATION_FADE_TIME )
            .play();
        new_motion_animation.terminated = false;

        current_avatars[character]["motion"]["animation"] = new_motion_animation;

        // Fade out animation after full loop
        if (!loop) {
            setTimeout(() => {
                if (!new_motion_animation.terminated) {
                    setMotion(character, extension_settings.vrm.model_settings[model_path]["animation_default"]["motion"], true);
                }
            }, clip.duration*1000 - ANIMATION_FADE_TIME*1000);
        }

        //console.debug(DEBUG_PREFIX,"VRM animation",new_motion_animation);
        
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

    setExpression(character, model_expression);
    setMotion(character, model_motion);
}


// Blink
function blink(character, instanceId) {
    var blinktimeout = Math.floor(Math.random() * 250) + 50;
    const current_blink = 0; //currentVRM.expressionManager.getValue("blinkLeft");
    //console.debug(DEBUG_PREFIX, "TEST", current_blink, instanceId, currentInstanceId);
    setTimeout(() => {
        if (current_avatars[character] !== undefined) {
            current_avatars[character]["vrm"].expressionManager.setValue("blink",current_blink);
            //console.debug(DEBUG_PREFIX,"Blinking",blinktimeout)
        }
    }, blinktimeout);
    
    if (current_avatars[character] !== undefined) {
        current_avatars[character]["vrm"].expressionManager.setValue("blink",1.0-current_blink);
        current_avatars[character]["vrm"].expressionManager.setValue(current_avatars[character]["expression"],1);
    }

    var rand = Math.round(Math.random() * 10000) + 1000;
    setTimeout(function () {
        if (current_avatars[character] !== undefined && instanceId == currentInstanceId)
            blink(character,instanceId);
        else
            console.debug(DEBUG_PREFIX,"Stopping blink model is no more loaded.")
    }, rand);
}

// One run for each character
// Animate mouth if talkEnd is set to a future time
async function textTalk(character, instanceId) {
    const mouth_open_speed = 1.5;
    while (currentInstanceId == instanceId) {
        // Model was removed
        if (current_avatars[character] === undefined)
            break;
        const vrm = current_avatars[character]["vrm"]
        const talkEnd = current_avatars[character]["talkEnd"]
        let mouth_y = 0.0;
        if (talkEnd > Date.now()) {
            mouth_y = (Math.sin((talkEnd - Date.now())) + 1) / 2;
            // Neutralize all expression in case setExpression called in parrallele
            for(const expression in vrm.expressionManager.expressionMap)
                vrm.expressionManager.setValue(expression, Math.min(0.25, vrm.expressionManager.getValue(expression)));
            //vrm.expressionManager.setValue(current_avatars[character]["vrm"]["expression"],0.25);
            vrm.expressionManager.setValue("aa",mouth_y);
            //console.debug(DEBUG_PREFIX,"MOVING MOUTH",mouth_y)
        }
        else { // Restaure expression
            vrm.expressionManager.setValue(current_avatars[character]["expression"],1.0);
            vrm.expressionManager.setValue("aa",0.0);
            //console.debug(DEBUG_PREFIX,"RESTORE MOUTH",vrm.expressionManager.getValue(current_avatars[character]["expression"]))
        }
        await delay(100 / mouth_open_speed);
    }
}

async function talk(chat_id) {
    // No model for user or system
    if (getContext().chat[chat_id].is_user || getContext().chat[chat_id].is_system)
        return;

    const message = getContext().chat[chat_id]
    const text = message.mes;
    const character = message.name;

    console.debug(DEBUG_PREFIX,"Playing mouth animation for",character," message:",text);

    // No model loaded for character
    if(current_avatars[character] === undefined) {
        console.debug(DEBUG_PREFIX,"No model loaded, cannot animate talk")
        return;
    }

    current_avatars[character]["talkEnd"] = Date.now() + text.length * 10;
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

async function updateModel(character) {
    if (current_avatars[character] !== undefined) {
        const object_container = current_avatars[character]["objectContainer"];
        const model_path = extension_settings.vrm.character_model_mapping[character];

        object_container.scale.x = extension_settings.vrm.model_settings[model_path]['scale'];
        object_container.scale.y = extension_settings.vrm.model_settings[model_path]['scale'];
        object_container.scale.z = extension_settings.vrm.model_settings[model_path]['scale'];

        object_container.position.x = (extension_settings.vrm.model_settings[model_path]['x']);
        object_container.position.y = (extension_settings.vrm.model_settings[model_path]['y']);
        object_container.position.z = 0.0; // In case somehow it get away from 0

        object_container.rotation.x = extension_settings.vrm.model_settings[model_path]['rx'];
        object_container.rotation.y = extension_settings.vrm.model_settings[model_path]['ry'];
        object_container.rotation.z = 0.0; // In case somehow it get away from 0

        //console.debug(DEBUG_PREFIX,"Updated model:")
        //console.debug(DEBUG_PREFIX,"Scale:",object_container.scale)
        //console.debug(DEBUG_PREFIX,"Position:",object_container.position)
        //console.debug(DEBUG_PREFIX,"Rotation:",object_container.rotation)
    }
}

function getVRM(character) {
    if (current_avatars[character] === undefined)
        return undefined;
    return current_avatars[character]["vrm"];
}