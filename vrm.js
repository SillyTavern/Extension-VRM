import * as THREE from './lib/three.module.js';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './lib/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from './lib/three-vrm.module.js';
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
    VN_MODE_DIV,
    HITBOXES
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
    setModel,
    unloadModel,
    getVRM,
    setExpression,
    setMotion,
    updateExpression,
    talk,
    updateModel,
    current_avatars,
    renderer,
    camera,
    VRM_CONTAINER_NAME,
    clearModelCache,
    clearAnimationCache,
    setLight
}

const VRM_CONTAINER_NAME = "VRM_CONTAINER";
const VRM_COLLIDER_NAME = "VRM_COLLIDER"

// Avatars
let current_avatars = {} // contain loaded avatar variables

// Caches
let models_cache = {};
let animations_cache = {};
let tts_lips_sync_job_id = 0;

// 3D Scene
let renderer = undefined;
let scene = undefined;
let camera = undefined;
let light = undefined;

// gltf and vrm
let currentInstanceId = 0;
let modelId = 0;
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
            const vrm = current_avatars[character]["vrm"];
            const mixer = current_avatars[character]["animation_mixer"];
            
            // Look at camera
            if (extension_settings.vrm.follow_camera)
                vrm.lookAt.target = lookAtTarget;
            else
                vrm.lookAt.target = null;

            vrm.update( deltaTime );
            mixer.update( deltaTime );

            // Update control box
            const objectContainer = current_avatars[character]["objectContainer"];
            const hips = vrm.humanoid?.getNormalizedBoneNode("hips");
            hips.getWorldPosition(current_avatars[character]["collider"].position);
            //objectContainer.worldToLocal(current_avatars[character]["collider"].position);
            hips.getWorldQuaternion(current_avatars[character]["collider"].quaternion);
            current_avatars[character]["collider"].scale.copy(objectContainer.scale);
            current_avatars[character]["collider"].visible = extension_settings.vrm.show_grid;

            // Update hitbox
            for (const body_part in current_avatars[character]["hitboxes"]) {
                const bone = vrm.humanoid?.getNormalizedBoneNode(HITBOXES[body_part]["bone"]);
                if (bone !== null) {
                    bone.getWorldPosition(current_avatars[character]["hitboxes"][body_part]["offsetContainer"].position);
                    bone.getWorldQuaternion(current_avatars[character]["hitboxes"][body_part]["offsetContainer"].quaternion);
                    current_avatars[character]["hitboxes"][body_part]["offsetContainer"].scale.copy(objectContainer.scale);
                    current_avatars[character]["hitboxes"][body_part]["offsetContainer"].visible = extension_settings.vrm.show_grid;
                }
            }
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
    models_cache = {};
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
    light = new THREE.DirectionalLight();
    light.position.set( 1.0, 1.0, 1.0 ).normalize();
    setLight(extension_settings.vrm.light_color, extension_settings.vrm.light_intensity);
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
        await unloadModel(character);
    }

    if (extension_settings.vrm.enabled) {
        // Load new characters models
        for(const character of current_characters) {
            const model_path = extension_settings.vrm.character_model_mapping[character];
            if (model_path !== undefined) {
                console.debug(DEBUG_PREFIX,"Loading VRM model of",character,":",model_path);
                await setModel(character,model_path);
            }
        }
    }
}

async function setModel(character,model_path) {
    let model;
    // Model is cached
    if (models_cache[model_path] !== undefined) {
        model = models_cache[model_path];
        await initModel(model);
        console.debug(DEBUG_PREFIX,"Model loaded from cache:",model_path);
    }
    else {
        model = await loadModel(model_path);
    }

    await unloadModel(character);

    // Error occured
    if (model === null) {
        extension_settings.vrm.character_model_mapping[character] = undefined;
        return;
    }

    // Set as character model and start animations
    modelId++;
    current_avatars[character] = model;
    current_avatars[character]["id"] = modelId;
    current_avatars[character]["objectContainer"].name = VRM_CONTAINER_NAME+"_"+character;
    current_avatars[character]["collider"].name = VRM_COLLIDER_NAME+"_"+character;

    // Load default expression/motion
    const expression = extension_settings.vrm.model_settings[model_path]['animation_default']['expression'];
    const motion =  extension_settings.vrm.model_settings[model_path]['animation_default']['motion'];

    if (expression !== undefined && expression != "none") {
        console.debug(DEBUG_PREFIX,"Set default expression to",expression);
        await setExpression(character, expression);
    }
    if (motion !== undefined && motion != "none") {
        console.debug(DEBUG_PREFIX,"Set default motion to",motion);
        await setMotion(character, motion, true);
    }

    if (extension_settings.vrm.blink)
        blink(character, modelId);
    textTalk(character, modelId);
    current_avatars[character]["objectContainer"].visible = true;
    current_avatars[character]["collider"].visible = extension_settings.vrm.show_grid;
    
    scene.add(current_avatars[character]["objectContainer"]);
    scene.add(current_avatars[character]["collider"]);
    for(const hitbox in current_avatars[character]["hitboxes"])
        scene.add(current_avatars[character]["hitboxes"][hitbox]["offsetContainer"]);
}

async function unloadModel(character) {
    // unload existing model
    if (current_avatars[character] !== undefined) {
        console.debug(DEBUG_PREFIX,"Unloading avatar of",character);
        const container = current_avatars[character]["objectContainer"];
        const collider = current_avatars[character]["collider"];

        scene.remove(scene.getObjectByName(container.name));
        scene.remove(scene.getObjectByName(collider.name));
        for(const hitbox in current_avatars[character]["hitboxes"]) {
            console.debug(DEBUG_PREFIX,"REMOVING",current_avatars[character]["hitboxes"][hitbox]["offsetContainer"])
            scene.remove(scene.getObjectByName(current_avatars[character]["hitboxes"][hitbox]["offsetContainer"].name));
        }

        // unload animations
        current_avatars[character]["animation_mixer"].stopAllAction();
        if (current_avatars[character]["motion"]["animation"]  !== null) {
            current_avatars[character]["motion"]["animation"].stop();
            current_avatars[character]["motion"]["animation"].terminated = true;
            current_avatars[character]["motion"]["animation"] = null;
        }

        delete current_avatars[character];

        container.visible = false;
        collider.visible = false;
        if (!extension_settings.vrm.models_cache) {
            await container.traverse(obj => obj.dispose?.());
            await collider.traverse(obj => obj.dispose?.());
        }
    }
}

async function loadModel(model_path) { // Only cache the model if character=null
    // gltf and vrm
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.register( ( parser ) => {
        return new VRMLoaderPlugin( parser );
    } );

    let gltf;
    try {
        gltf = await loader.loadAsync(model_path,
            // called after loaded
            () => {
                console.debug(DEBUG_PREFIX,"Finished loading",model_path);
            },
            // called while loading is progressing
            ( progress ) => {
                const percent = Math.round(100.0 * ( progress.loaded / progress.total ));
                console.debug(DEBUG_PREFIX, 'Loading model...', percent, '%');
                $("#vrm_model_loading_percent").text(percent);
            },
            // called when loading has errors
            ( error ) => {
                console.debug(DEBUG_PREFIX,"Error when loading",model_path,":",error)
                toastr.error('Wrong avatar file:'+model_path, DEBUG_PREFIX + ' cannot load', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
                return;
            }
        );
    }
    catch (error) {
        console.debug(DEBUG_PREFIX,"Error when loading",model_path,":",error)
        toastr.error('Wrong avatar file:'+model_path, DEBUG_PREFIX + ' cannot load', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
        return null;
    }

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
    const scale = extension_settings.vrm.model_settings[model_path]["scale"];
    // Create a group to set model center as rotation/scaling origin
    const object_container = new THREE.Group(); // First container to scale/position center model
    object_container.visible = false;
    object_container.name = VRM_CONTAINER_NAME;
    object_container.model_path = model_path; // link to character for mouse controls
    object_container.scale.set(scale,scale,scale);
    object_container.position.y = 0.5; // offset to center model
    const verticalOffset = new THREE.Group(); // Second container to rotate center model
    verticalOffset.position.y = -hipsHeight; // offset model for rotate on "center"
    verticalOffset.add(vrm.scene)
    object_container.add(verticalOffset);
    //object_container.parent = scene;
    
    // Collider used to detect mouse click
    const boundingBox = new THREE.Box3(new THREE.Vector3(-0.5,-1.0,-0.5), new THREE.Vector3(0.5,1.0,0.5));
    const dimensions = new THREE.Vector3().subVectors( boundingBox.max, boundingBox.min );
    // make a BoxGeometry of the same size as Box3
    const boxGeo = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    // move new mesh center so it's aligned with the original object
    const matrix = new THREE.Matrix4().setPosition(dimensions.addVectors(boundingBox.min, boundingBox.max).multiplyScalar( 0.5 ));
    boxGeo.applyMatrix4(matrix);
    // make a mesh
    const collider = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
        visible: true,
        side: THREE.BackSide,
        wireframe: true,
        color:0xffff00
    }));
    collider.name = VRM_COLLIDER_NAME;
    collider.material.side = THREE.BackSide;
    //scene.add(collider);
    
    // Avatar dynamic settings
    const model = {
        "id": null,
        "model_path": model_path,
        "vrm": vrm, // the actual vrm object
        "hipsHeight": hipsHeight, // its original hips height, used for scaling loaded animation
        "objectContainer": object_container, // the actual 3d group containing the vrm scene, handle centered position/rotation/scaling
        "collider": collider,
        "expression": "none",
        "animation_mixer": new THREE.AnimationMixer(vrm.scene),
        "motion": {
            "name": "none",
            "animation": null
        },
        "talkEnd": 0,
        "hitboxes": {}
    };

    // Hit boxes
    if (extension_settings.vrm.hitboxes) {
        for(const body_part in HITBOXES)
        {
            const bone = vrm.humanoid.getNormalizedBoneNode(HITBOXES[body_part]["bone"])
            if (bone !== null) {
                const position = new THREE.Vector3();
                position.setFromMatrixPosition(bone.matrixWorld);
                console.debug(DEBUG_PREFIX,"Creating hitbox for",body_part,"at",position);

                const size = HITBOXES[body_part]["size"];
                const offset = HITBOXES[body_part]["offset"];

                // Collider used to detect mouse click
                const boundingBox = new THREE.Box3(new THREE.Vector3(-size.x,-size.y,-size.z), new THREE.Vector3(size.x,size.y,size.z));
                const dimensions = new THREE.Vector3().subVectors( boundingBox.max, boundingBox.min );
                // make a BoxGeometry of the same size as Box3
                const boxGeo = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
                // move new mesh center so it's aligned with the original object
                const matrix = new THREE.Matrix4().setPosition(dimensions.addVectors(boundingBox.min, boundingBox.max).multiplyScalar( 0.5 ));
                boxGeo.applyMatrix4(matrix);
                // make a mesh
                const collider = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
                    visible: true,
                    side: THREE.BackSide,
                    wireframe: true,
                    color:HITBOXES[body_part]["color"]
                }));
                collider.name = body_part;
                if (vrm.meta?.metaVersion === '1')
                    collider.position.set(offset.x/hipsHeight,offset.y/hipsHeight,-offset.z/hipsHeight);
                else
                    collider.position.set(-offset.x/hipsHeight,offset.y/hipsHeight,offset.z/hipsHeight);
                // Create a offset container
                const offset_container = new THREE.Group(); // First container to scale/position center model
                offset_container.name = model_path+"_offsetContainer_hitbox_"+body_part;
                offset_container.visible = true;
                offset_container.add(collider);
                //scene.add(offset_container)

                //object_container.localToWorld(position);
                //position.add(new THREE.Vector3(offset.x,offset.y,offset.z));
                //collider.position.set(position.x,position.y,position.z);
                //scene.add(collider);

                model["hitboxes"][body_part] = {
                    "offsetContainer":offset_container,
                    "collider":collider
                }
            }
        }
    }

    //console.debug(DEBUG_PREFIX,vrm);

    // Cache model
    if (extension_settings.vrm.models_cache)
        models_cache[model_path] = model;

    await initModel(model);
    
    console.debug(DEBUG_PREFIX,"VRM fully loaded:",model_path);
    
    return model;
}

async function initModel(model) {
    const object_container = model["objectContainer"];
    const model_path = model["model_path"];

    object_container.scale.x = extension_settings.vrm.model_settings[model_path]['scale'];
    object_container.scale.y = extension_settings.vrm.model_settings[model_path]['scale'];
    object_container.scale.z = extension_settings.vrm.model_settings[model_path]['scale'];

    object_container.position.x = extension_settings.vrm.model_settings[model_path]['x'];
    object_container.position.y = extension_settings.vrm.model_settings[model_path]['y'];
    object_container.position.z = 0.0;

    object_container.rotation.x = extension_settings.vrm.model_settings[model_path]['rx'];
    object_container.rotation.y = extension_settings.vrm.model_settings[model_path]['ry'];
    object_container.rotation.z = 0.0;

    // Cache model animations
    if (extension_settings.vrm.animations_cache && animations_cache[model_path] === undefined) {
        animations_cache[model_path] = {};
        const animation_names = [extension_settings.vrm.model_settings[model_path]['animation_default']['motion']]
        for (const i in extension_settings.vrm.model_settings[model_path]['classify_mapping']) {
            animation_names.push(extension_settings.vrm.model_settings[model_path]['classify_mapping'][i]["motion"]);
        }

        let count = 0;
        for (const file of animations_files) {
            count++;
            for (const i of animation_names) {
                if(file.includes(i) && animations_cache[model_path][file] === undefined) {
                    console.debug(DEBUG_PREFIX,"Loading animation",file,count,"/",animations_files.length)
                    const clip = await loadAnimation(model["vrm"], model["hipsHeight"], file);
                    if (clip !== undefined)
                        animations_cache[model_path][file] = clip;
                }
            }
        }

        console.debug(DEBUG_PREFIX,"Cached animations:",animations_cache[model_path]);
    }
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

    vrm.expressionManager.setValue(value, 1.0);
    current_avatars[character]["expression"] = value;
}

async function loadAnimation(vrm, hipsHeight, motion_file_path) {
    let clip;
    try {
        // Mixamo animation
        if (motion_file_path.endsWith(".fbx")) {
            //console.debug(DEBUG_PREFIX,"Loading fbx file",motion_file_path);

            // Load animation
            clip = await loadMixamoAnimation(motion_file_path, vrm, hipsHeight);
        }
        else
        if (motion_file_path.endsWith(".bvh")) {
            //console.debug(DEBUG_PREFIX,"Loading bvh file",motion_file_path);
            clip = await loadBVHAnimation(motion_file_path, vrm, hipsHeight);
        }
        else {
            //console.debug(DEBUG_PREFIX,"UNSUPORTED animation file");
            toastr.error('Wrong animation file format:'+motion_file_path, DEBUG_PREFIX + ' cannot play animation', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
            return;
        }
    }
    catch(error) {
        //console.debug(DEBUG_PREFIX,"Something went wrong when loading animation file:",motion_file_path);
        toastr.error('Wrong animation file format:'+motion_file_path, DEBUG_PREFIX + ' cannot play animation', { timeOut: 10000, extendedTimeOut: 20000, preventDuplicates: true });
        return null;
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
        current_avatars[character]["motion"]["name"] = "none";
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

        if (animations_cache[model_path] !== undefined && animations_cache[model_path][motion_file_path] !== undefined) {
            clip = animations_cache[model_path][motion_file_path];
        }
        else {
            clip = await loadAnimation(vrm, hipsHeight, motion_file_path);

            if (clip === null) {
                return;
            }

            if (extension_settings.vrm.animations_cache)
                animations_cache[model_path][motion_file_path] = clip;
        }


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
        console.debug(DEBUG_PREFIX,"Loading new animation",motion_file_path);

        current_avatars[character]["motion"]["name"] = motion_file_path;
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

    await setExpression(character, model_expression);
    await setMotion(character, model_motion);
}


// Blink
function blink(character, modelId) {
    //console.debug(DEBUG_PREFIX,"Blink call:",character,modelId)
    if (current_avatars[character] === undefined || current_avatars[character]["id"] != modelId) {
        console.debug(DEBUG_PREFIX,"Stopping blink model is no more loaded:",character,modelId)
        return;
    }

    const vrm = current_avatars[character]["vrm"];

    // Hold eyes closed
    var blinktimeout = Math.floor(Math.random() * 250) + 50;
    setTimeout(() => {
            vrm.expressionManager.setValue("blink",0);
    }, blinktimeout);
    
    // Open eyes
    vrm.expressionManager.setValue("blink",1.0);

    // Keep eyes open
    var rand = Math.round(Math.random() * 10000) + 1000;
    setTimeout(function () {
            blink(character,modelId);
    }, rand);
}

// One run for each character
// Animate mouth if talkEnd is set to a future time
// Terminated when model is unset
// Overrided by tts lip sync option
async function textTalk(character, modelId) {
    const mouth_open_speed = 1.5;
    // Model still here
    while (current_avatars[character] !== undefined && current_avatars[character]["id"] == modelId) {
        //console.debug(DEBUG_PREFIX,"text talk loop:",character,modelId)
        
        // Overrided by lip sync option
        if (!extension_settings.vrm.tts_lips_sync) {
            const vrm = current_avatars[character]["vrm"]
            const talkEnd = current_avatars[character]["talkEnd"]
            let mouth_y = 0.0;
            if (talkEnd > Date.now()) {
                mouth_y = (Math.sin((talkEnd - Date.now())) + 1) / 2;
                // Neutralize all expression in case setExpression called in parrallele
                for(const expression in vrm.expressionManager.expressionMap)
                    vrm.expressionManager.setValue(expression, Math.min(0.25, vrm.expressionManager.getValue(expression)));
                vrm.expressionManager.setValue("aa",mouth_y);
            }
            else { // Restaure expression
                vrm.expressionManager.setValue(current_avatars[character]["expression"],1.0);
                vrm.expressionManager.setValue("aa",0.0);
            }
        }
        await delay(100 / mouth_open_speed);
    }

    console.debug(DEBUG_PREFIX,"Stopping text talk loop model is no more loaded:",character,modelId);
}

// Add text duration to current_avatars[character]["talkEnd"]
// Overrided by tts lip sync option
async function talk(chat_id) {
    // TTS lip sync overide
    if (extension_settings.vrm.tts_lips_sync)
        return;

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

    current_avatars[character]["talkEnd"] = Date.now() + text.length * 50;
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

// Update a character model to fit the saved settings
async function updateModel(character) {
    if (current_avatars[character] !== undefined) {
        const object_container = current_avatars[character]["objectContainer"];
        const model_path = extension_settings.vrm.character_model_mapping[character];

        object_container.scale.x = extension_settings.vrm.model_settings[model_path]['scale'];
        object_container.scale.y = extension_settings.vrm.model_settings[model_path]['scale'];
        object_container.scale.z = extension_settings.vrm.model_settings[model_path]['scale'];

        object_container.position.x = extension_settings.vrm.model_settings[model_path]['x'];
        object_container.position.y = extension_settings.vrm.model_settings[model_path]['y'];
        object_container.position.z = 0.0; // In case somehow it get away from 0

        object_container.rotation.x = extension_settings.vrm.model_settings[model_path]['rx'];
        object_container.rotation.y = extension_settings.vrm.model_settings[model_path]['ry'];
        object_container.rotation.z = 0.0; // In case somehow it get away from 0

        console.debug(DEBUG_PREFIX,"Updated model:",character)
        console.debug(DEBUG_PREFIX,"Scale:",object_container.scale)
        console.debug(DEBUG_PREFIX,"Position:",object_container.position)
        console.debug(DEBUG_PREFIX,"Rotation:",object_container.rotation)
    }
}

// Currently loaded character VRM accessor
function getVRM(character) {
    if (current_avatars[character] === undefined)
        return undefined;
    return current_avatars[character]["vrm"];
}

function clearModelCache() {
    models_cache = {};
    console.debug(DEBUG_PREFIX,"Cleared model cache");
}

function clearAnimationCache() {
    animations_cache = {};
    console.debug(DEBUG_PREFIX,"Cleared animation cache");
}

// Perform audio lip sync
// Overried text mouth movement
async function audioTalk(blob, character) {
    // Option disable
    if (!extension_settings.vrm.tts_lips_sync)
        return;
        /*return response;

    console.debug(DEBUG_PREFIX,"Received lipsync",response, character);
    let responseCopy;
    try {
        responseCopy = response.clone();
    } catch(error) {
        console.debug(DEBUG_PREFIX,"Wrong response format received abort lip sync");
        return response;
    }*/
    tts_lips_sync_job_id++;
    const job_id = tts_lips_sync_job_id;
    console.debug(DEBUG_PREFIX,"Received lipsync",blob, character,job_id);

    const audioContext = new(window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0.5;
    analyser.fftSize = 1024;

    //const blob = await responseCopy.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    const javascriptNode = audioContext.createScriptProcessor(256, 1, 1);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);
    const mouththreshold = 10;
    const mouthboost = 10;

    let lastUpdate = 0;
    const LIPS_SYNC_DELAY = 66;

    function endTalk() {
        source.stop(0);
        source.disconnect();
        analyser.disconnect();
        javascriptNode.disconnect();
        if (current_avatars[character] !== undefined)
            current_avatars[character]["vrm"].expressionManager.setValue("aa", 0);

        audio.removeEventListener("ended", endTalk);
        //javascriptNode.removeEventListener("onaudioprocess", onAudioProcess);
    }

    var audio = document.getElementById("tts_audio");
    function startTalk() {
        source.start(0);
        audio.removeEventListener("onplay", startTalk);
        //javascriptNode.removeEventListener("onaudioprocess", onAudioProcess);
    }
    audio.onplay = startTalk;
    audio.onended = endTalk;

    function onAudioProcess() {
        if(job_id != tts_lips_sync_job_id || audio.paused) {
            console.debug(DEBUG_PREFIX,"TTS lip sync job",job_id,"terminated")
            endTalk();
            return;
        }

        var array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        var values = 0;

        var length = array.length;
        for (var i = 0; i < length; i++) {
            values += array[i];
        }

        // audio in expressed as one number
        var average = values / length;
        var inputvolume = average * (audioContext.sampleRate/48000); // Normalize the treshold

        var voweldamp = 53;
        var vowelmin = 12;
        if(lastUpdate < (Date.now() - LIPS_SYNC_DELAY)) {
            if (current_avatars[character] !== undefined) {
                // Neutralize all expression in case setExpression called in parrallele
                for(const expression in current_avatars[character]["vrm"].expressionManager.expressionMap)
                    current_avatars[character]["vrm"].expressionManager.setValue(expression, Math.min(0.25, current_avatars[character]["vrm"].expressionManager.getValue(expression)));

                if (inputvolume > (mouththreshold * 2)) {
                    const new_value = ((average - vowelmin) / voweldamp) * (mouthboost/10);
                    current_avatars[character]["vrm"].expressionManager.setValue("aa", new_value);
                }
                else {
                    current_avatars[character]["vrm"].expressionManager.setValue("aa", 0);
                }
            }
            lastUpdate = Date.now();
        }
    }

    javascriptNode.onaudioprocess = onAudioProcess;
    // TODO: restaure expression weight ?
}

window['vrmLipSync'] = audioTalk;

// color: any valid color format
// intensity: percent 0-100
function setLight(color,intensity) {

    light.color = new THREE.Color(color);
    light.intensity = intensity/100;
}