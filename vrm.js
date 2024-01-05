import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoAnimation } from './loadMixamoAnimation.js';

import { MODULE_NAME, DEBUG_PREFIX, VRM_CANVAS_ID } from "./constants.js";
import { extension_settings } from '../../../extensions.js';

import { currentChatMembers } from './utils.js';
import { delay } from '../../../utils.js';

export {
    loadVRM
}


// gltf and vrm
let currentVrm = undefined;
let currentAnimation = undefined;
let currentMixer = undefined;

const clock = new THREE.Clock();

// DBG
currentAnimation = 'assets/vrm/animation/Breathing Idle.fbx';

async function loadVRM() {
    
    currentMixer = undefined;
    currentVrm = undefined;

    // Delete the canvas
    if (document.getElementById(VRM_CANVAS_ID) !== null)
        document.getElementById(VRM_CANVAS_ID).remove();

    if (!extension_settings.vrm.enabled) {
        return
    }

    // renderer
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setPixelRatio( window.devicePixelRatio );
    document.body.appendChild( renderer.domElement );

    // camera
    const camera = new THREE.PerspectiveCamera( 30.0, window.innerWidth / window.innerHeight, 0.1, 20.0 );
    camera.position.set( 0.0, 1.0, 5.0 );

    // camera controls
    renderer.domElement.id = VRM_CANVAS_ID;
    const controls = new OrbitControls( camera, renderer.domElement );
    controls.screenSpacePanning = true;
    controls.target.set( 0.0, 1.0, 0.0 );
    controls.update();

    // scene
    const scene = new THREE.Scene();

    // light
    const light = new THREE.DirectionalLight( 0xffffff );
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

    const current_characters = currentChatMembers();

    if (current_characters.length > 0 && extension_settings.vrm.character_model_mapping[current_characters[0]] !== undefined) {
        console.debug(DEBUG_PREFIX,current_characters, extension_settings.vrm.character_model_mapping);
        const model_path = extension_settings.vrm.character_model_mapping[current_characters[0]];
        console.debug(DEBUG_PREFIX,"Loading VRM model",model_path);

        loader.load(
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

                currentVrm = vrm;
                if (extension_settings.vrm.follow_cursor)
                    vrm.lookAt.target = lookAtTarget;
                //console.log( vrm );
                scene.add( vrm.scene );

                // rotate if the VRM is VRM0.0
			    VRMUtils.rotateVRM0(vrm);

                if (currentAnimation)
                    loadFBX( currentAnimation );

            },
            // called while loading is progressing
            ( progress ) => console.log( 'Loading model...', 100.0 * ( progress.loaded / progress.total ), '%' ),
            // called when loading has errors
            ( error ) => console.error( error )
        );
    }

    // helpers
    if (extension_settings.vrm.show_grid) {
        const gridHelper = new THREE.GridHelper( 10, 10 );
        scene.add( gridHelper );

        const axesHelper = new THREE.AxesHelper( 5 );
        scene.add( axesHelper );
    }

    // animate
    clock.start();
    
    function animate() {

        requestAnimationFrame( animate );
        
        const deltaTime = clock.getDelta();
        
        // if animation is loaded
        if ( currentMixer ) {
            // update the animation
            currentMixer.update( deltaTime );
        }
        
        if ( currentVrm ) {
            currentVrm.update( deltaTime );
            currentVrm.expressionManager.setValue("neutral",1.0)
            //console.debug(DEBUG_PREFIX,currentVrm);
        }
        renderer.render( scene, camera );
    }

    animate();

    // mouse listener
    window.addEventListener( 'mousemove', ( event ) => {
        lookAtTarget.position.x = 10.0 * ( ( event.clientX - 0.5 * window.innerWidth ) / window.innerHeight );
        lookAtTarget.position.y = - 10.0 * ( ( event.clientY - 0.5 * window.innerHeight ) / window.innerHeight );
    } );
}

// mixamo animation
function loadFBX( animationUrl ) {

	currentAnimation = animationUrl;

	// create AnimationMixer for VRM
	currentMixer = new THREE.AnimationMixer( currentVrm.scene );

	// Load animation
	loadMixamoAnimation( animationUrl, currentVrm ).then( ( clip ) => {
		// Apply the loaded animation to mixer and play
		currentMixer.timeScale = 1.0;
		currentMixer.clipAction( clip ).play();
	} );

}
