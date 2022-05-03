// file imports directly from CDN
import {
  WebGLRenderer,
  ACESFilmicToneMapping,
  sRGBEncoding,
  Color,
  Clock,
  CylinderGeometry,
  CircleGeometry,
  PlaneGeometry,
  DirectionalLight,
  RepeatWrapping,
  DoubleSide,
  BoxGeometry,
  Mesh,
  PointLight,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  PMREMGenerator,
  PCFSoftShadowMap,
  Vector2,
  Vector3,
  TextureLoader,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  FloatType,
  ConeGeometry,
  AmbientLight
} from 'three';

import { OrbitControls } from 'OrbitControls';
import { FBXLoader } from 'FBXLoader';
import { RGBELoader } from 'RGBELoader';
import { mergeBufferGeometries } from 'BufferGeometryUtils';
import { Water } from 'Water';
import { EffectComposer} from 'EffectComposer';
import { RenderPass } from 'Render';
import { UnrealBloomPass } from 'Bloom';
import { TWEEN } from 'Tween';
import Stats from 'Stats';
import { CSS2DRenderer, CSS2DObject } from 'CSS2D';

import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise';

// Instantiate Relevant Items
let scene, camera, controls, clock, stats, water;
let effectComposer, renderer, labelRenderer, envmap, pmrem;
let renderPass, bloomPass;
let light, ambientLight;

// Define World Settings
// we can control max height to make things more flat or not.
const MAX_HEIGHT = 10;

// map dimensions
const LENGTH = 45;
const MAX_DISTANCE_THRESHOLD = Math.floor(0.8 * LENGTH);
const BABYRABBITS_NUM = Math.floor(LENGTH / 6);
const FOXES_NUM = Math.floor(LENGTH / 15);
const BEARS_NUM = Math.floor(LENGTH / 40);
const WATER_HEIGHT = 0.15;

// dictionary that maps the tilePosition to the hex
let positionToHexDict = new Map();
// dictionary that maps xy 1D coordinate to tilePosition
let XYtoPositionDict = new Map();
// map storing impassible terrain
let hardTerrain = new Map();

// other game object trackers
let babyRabbits = [];
let bears = [];
let foxes = [];
let labels = [];
let foxLabels = [];
let keyState;
let globalRabbit;
let globalStar;

let mToggle = 0;
let pToggle = 0;

// game state information
let lives = 10;
let turnNumber = 0;
let score = 0;
let babiesLeft = BABYRABBITS_NUM;

// build sequence
initScene();
initLights();
initListeners();
buildScene();
animateScene();

// initializes camera, scene, renderer, effectComposer
function initScene() {
  // Update Game State UI Fields
  document.getElementById('hitpoints').innerHTML = lives;
  document.getElementById('totalScore').innerHTML = score;
  document.getElementById('babiesRemaining').innerHTML = babiesLeft;

  // Initialize Camera
  camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(-17, 35, 31);

  // Initialize Scene
  scene = new Scene();
  scene.background = new Color("#55ceff");

  //Initialize Clock
  clock = new Clock();

  // initialize stats
  // stats = new Stats();
  // 0: fps, 1: ms, 2: mb, 3+: custom
  // stats.showPanel(0);
  // document.body.appendChild(stats.dom);

  // Initialize Renderer
  renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio( window.devicePixelRatio );

  // ACES Filmic Tone Mapping maps high dynamic range (HDR) lighting conditions
  // to low dynamic range (LDR) digital screen representations.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputEncoding = sRGBEncoding;
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.autoClear = false;

  // we have several options for shadow mapping, but after testing, this does
  // seem to be the best we have. Although we could try VSMShadowMap or
  // PCFShadowMap for performance reasons.
  renderer.shadowMap.type = PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // label renderer for debugging purposes
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0px';
  document.body.appendChild( labelRenderer.domElement );

  // initialize effect composer for post processing
  effectComposer = new EffectComposer(renderer);

  renderPass =  new RenderPass( scene, camera );
  effectComposer.addPass(renderPass);

  bloomPass = new UnrealBloomPass( new Vector2( window.innerWidth, window.innerHeight ), 1, LENGTH, 1);
  effectComposer.addPass(bloomPass);

  // Set up Camera Manipulation
  controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.target.set(0, 0, 0);
  controls.dampingFactor = 0.05;
  controls.enableDamping = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.autoRotate = true;
}

// initializes lights
function initLights() {
  // set up lights, color should be mostly white. Even a small bit other imbalance
  // is shown pretty obviously.
  light = new PointLight(new Color("#fee2d2").convertSRGBToLinear().convertSRGBToLinear(), LENGTH * 3, 0);
  light.position.set(20 * Math.floor(LENGTH / 15), Math.floor(MAX_HEIGHT * 2.2), 10 * Math.floor(LENGTH / 15));

  light.castShadow = true;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 500;
  scene.add(light);

  // add ambient lighting to soften things out
  ambientLight = new AmbientLight(new Color("#fee2d2").convertSRGBToLinear().convertSRGBToLinear(), 0.7);
  scene.add(ambientLight);
}

// initializes UI Interaction behaviors
function initListeners() {
  // add event listener for rabbit
  document.addEventListener("keydown", function(event) {
    keyState = event.key;
    updateRabbitPerspective();

    if (keyState == " ") {
      moveRabbitUponSpacebar();
      // increment turn number and have foxes and bears move
      turnNumber++;
      if (turnNumber % 2 == 0) updateFoxes();
      if (turnNumber % 3 == 0) updateBears();

      checkCollisions();
    }

    if (keyState == "p") {
      getPerformance();
      // mapValidTiles();
      mapFoxAdjacentTiles();
    }

    if (keyState == "m") {
      mapHexCoords();
    }
  });

  // add event listener for window resizing
  window.addEventListener( 'resize', onWindowResize, false );

  // start button functionality
  let btn = document.querySelector('#start');
  btn.addEventListener("click", function() {
    controls.autoRotate = false;
    document.getElementById("initialOverlay").style.display = "none";
    document.getElementById("start").style.display = "none";
    document.getElementById("instructions").style.display = "none";
    document.getElementById("status").style.userSelect = "none";
    document.getElementById("startFlavorText").style.display = "none";
    document.getElementById("info").style.display = "flex";
  });
}

// general FBX loader
function loadAsset(path) {
  return new Promise((resolve, reject) => {
    const fbxLoader = new FBXLoader();
    fbxLoader.load(path, (asset) => resolve(asset));
  })
}

// builds the scene
async function buildScene() {
  // environment map set up. await in this case means that the command here will
  // wait for RGBE Loader to finish processing the HDR file before continuing.
  let pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let envmapTexture = await new RGBELoader().loadAsync("assets/envmap3.hdr");
  let rt = pmrem.fromEquirectangular(envmapTexture);
  envmap = rt.texture;

  // load in textures for different hex types. Using minecraft texture packs
  // is actually a very good idea for skinning the tiles.
  let textures = {
    dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
    dirt2: await new TextureLoader().loadAsync("assets/dirt2.png"),
    gravel: await new TextureLoader().loadAsync("assets/gravel.png"),
    grass: await new TextureLoader().loadAsync("assets/grass.png"),
    sand: await new TextureLoader().loadAsync("assets/sand.png"),
    water: await new TextureLoader().loadAsync("assets/water.jpg"),
    stone: await new TextureLoader().loadAsync("assets/stone.png"),
  };

  // noise for generating different heights. we could use a different noise
  // engine if we wanted actually, depending on what we want.
  const simplex = new SimplexNoise();

  // create 40x40 hex map, varying height using simplex noise. This will be
  // larger for our purposes, but I haven't tested quite yet.
  for (let i = -LENGTH; i <= LENGTH; i++) {
    for (let j = -LENGTH; j <= LENGTH; j++) {
      // calculate position for current tile
      let tilePosition = tileToPosition(i, j);

      // if position is within desired radius, add a hex
      if (tilePosition.length() < MAX_DISTANCE_THRESHOLD) {
        let noise = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
        noise = Math.pow(noise, 1.5);

        XYtoPositionDict.set(XYto1D(i, j), tilePosition);
        if (noise <= WATER_HEIGHT) {
          hardTerrain.set(tilePosition, 1);
        } else {
          hardTerrain.set(tilePosition, 0);
        }

        hex(noise * MAX_HEIGHT, tilePosition, envmap);
      }
    }
  }

  // adds the aggregate geometries of each terrain type and textures them
  let stoneMesh = hexMesh(stoneGeo, textures.stone);
  let grassMesh = hexMesh(grassGeo, textures.grass);
  let dirt2Mesh = hexMesh(dirt2Geo, textures.dirt2);
  let gravelMesh = hexMesh(gravelGeo, textures.gravel);
  let dirtMesh = hexMesh(dirtGeo, textures.dirt);
  let sandMesh = hexMesh(sandGeo, textures.sand);
  scene.add(stoneMesh, dirtMesh, dirt2Mesh, gravelMesh, sandMesh, grassMesh);

  // water.js water
  const textureLoader = new TextureLoader();
  const waterGeometry = new CircleGeometry( 0.85 * LENGTH, 64 );
	water = new Water( waterGeometry, {
		color: new Color("#ffffff"),
		scale: 1,
		flowDirection: new Vector2( 0.1 , 0.05 ),
		textureWidth: 512,
		textureHeight: 512,
    normalMap0: textureLoader.load( 'assets/Water_1_M_Normal.jpg' ),
    normalMap1: textureLoader.load( 'assets/Water_2_M_Normal.jpg' ),
	} );

	water.position.set(0, MAX_HEIGHT * WATER_HEIGHT, 0);
	water.rotation.x = Math.PI * - 0.5;
	scene.add( water );

  // defines and adds the map floor
  let mapFloor = new Mesh(
    new CylinderGeometry(0.9 * LENGTH, 0.9 * LENGTH, MAX_HEIGHT * 0.1, 50),
    new MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt2,
      envMapIntensity: 0.1,
      side: DoubleSide,
    })
  );
  mapFloor.receiveShadow = true;
  mapFloor.position.set(0, -MAX_HEIGHT * 0.05, 0);
  scene.add(mapFloor);

  // load in rabbit asset and set global rabbit variable
  loadAsset('assets/rabbit.fbx').then((rabbit) => {
    rabbit.scale.multiplyScalar(0.05);

    let tilePosition = XYtoPositionDict.get(XYto1D(0, 0));
    let translationVec = positionToHexDict.get(tilePosition)[1];

    rabbit.translateX(translationVec.x);
    rabbit.translateY(translationVec.y);
    rabbit.translateZ(translationVec.z);
    rabbit.tileX = 0;
    rabbit.tileY = 0;

    scene.add(rabbit);

    globalRabbit = rabbit;
    globalRabbit.angleMetric = 60;
    globalRabbit.rotateY(Math.PI / 6);
    globalRabbit.rotateY(2 * Math.PI / 3);
  })

  // load in star asset and set global star variable
  loadAsset('assets/star.fbx').then((star) => {
    star.scale.multiplyScalar(0.005);

    let tile = getRandomValidTile();
    let translationVec = positionToHexDict.get(tile[0])[1];

    star.translateX(translationVec.x);
    star.translateY(translationVec.y + 1.5);
    star.translateZ(translationVec.z);
    star.tileX = tile[1];
    star.tileY = tile[2];
    star.children[0].material.color = new Color(0xffff00);

    console.log(star);

    scene.add(star);

    globalStar = star;
    globalStar.angleMetric = 60;
    globalStar.rotateY(Math.PI / 6);
    globalStar.rotateY(2 * Math.PI / 3);

    let tween = new TWEEN.Tween(star.rotation)
        .to({ y: "-" + Math.PI/2}, 1000) // relative animation
        .onComplete(function() {
            // Check that the full 360 degrees of rotation,
            // and calculate the remainder of the division to avoid overflow.
            if (Math.abs(group.rotation.y)>=2*Math.PI) {
                group.rotation.y = group.rotation.y % (2*Math.PI);
            }
        })
        .start();
     tween.repeat(Infinity);
  })

  // add other animals to the scene
  generateBabyRabbits();
  generateBears();
  generateFoxes();
}

// animation
function animateScene() {
  requestAnimationFrame( animateScene );

  controls.update();
  // stats.update();
  TWEEN.update();

	render();
}

// render function
function render() {
  const delta = clock.getDelta();
  effectComposer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// end game function
function endGame(type) {
  // display endgame UI
  document.getElementById("initialOverlay").style.display = "block";
  document.getElementById("startFlavorText").style.display = "block";

  // game won by exiting via burrow
  if (type == 1) {
    if (babiesLeft == 0) {
      document.getElementById("status").innerHTML = "YOU RETURNED HOME WITH ALL YOUR BABIES!";
      document.getElementById("startFlavorText").innerHTML = "GREAT JOB";
    } else {
      document.getElementById("status").innerHTML = "YOU MANAGED TO RETURN HOME WITH ONLY " + babiesLeft + " BABIES...";
      document.getElementById("startFlavorText").innerHTML = "THERE WERE SACRIFICES";
    }
  }

  // game lost by negative health
  if (type == -1) {
    document.getElementById("initialOverlay").style.background = "#990000";
    document.getElementById("status").innerHTML = "UNFORTUNATELY, YOU DIED.";
    document.getElementById("startFlavorText").innerHTML = "TRY HARDER NEXT TIME.";
  }
}

// resize responsiveness
function onWindowResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

// call a function to log current performance stats
function getPerformance() {
  console.log("Scene polycount:", renderer.info.render.triangles)
  console.log("Active Drawcalls:", renderer.info.render.calls)
  console.log("Textures in Memory:", renderer.info.memory.textures)
  console.log("Geometries in Memory:", renderer.info.memory.geometries)
}

// creates baby rabbits and adds them to the scene
function generateBabyRabbits() {
  for (let i = 0; i < BABYRABBITS_NUM; i++) {
    // get a random valid tile
    let tile = getRandomValidTile();
    // load in rabbit asset and set global rabbit variable
    loadAsset('assets/rabbit.fbx').then((rabbit) => {
      rabbit.scale.multiplyScalar(0.03);

      let translationVec = positionToHexDict.get(tile[0])[1];

      rabbit.translateX(translationVec.x);
      rabbit.translateY(translationVec.y);
      rabbit.translateZ(translationVec.z);
      rabbit.tileX = tile[1];
      rabbit.tileY = tile[2];

      babyRabbits.push(rabbit);
      scene.add(rabbit);
    })
  }
}

// creates bears and adds them to the scene
function generateBears() {
  for (let i = 0; i < BEARS_NUM; i++) {
    // get a random valid tile
    let tile = getRandomValidTile();
    // load in bear asset and set global bear variable
    loadAsset('assets/08bearFinal.fbx').then((bear) => {
      bear.scale.multiplyScalar(0.015);

      let translationVec = positionToHexDict.get(tile[0])[1];

      bear.translateX(translationVec.x);
      bear.translateY(translationVec.y);
      bear.translateZ(translationVec.z);
      bear.tileX = tile[1];
      bear.tileY = tile[2];

      bears.push(bear);
      scene.add(bear);
    })
  }
}

// creates foxes and adds them to the scene
function generateFoxes() {
  for (let i = 0; i < FOXES_NUM; i++) {
    // get a random valid tile
    let tile = getRandomValidTile();
    // load in fox asset
    loadAsset('assets/01foxFinal.fbx').then((fox) => {
      fox.scale.multiplyScalar(0.017);

      let translationVec = positionToHexDict.get(tile[0])[1];

      fox.translateX(translationVec.x);
      fox.translateY(translationVec.y);
      fox.translateZ(translationVec.z);
      fox.tileX = tile[1];
      fox.tileY = tile[2];

      foxes.push(fox);
      scene.add(fox);
    })

  }
}

// helper function for getting adjacent tiles
function checkValidTile(tilePosition) {
  return getByValue(XYtoPositionDict, tilePosition) != undefined && hardTerrain.get(tilePosition) != 1;
}

// helper visualizer function for valid tiles
function mapValidTiles() {
  for (let tilePosition of hardTerrain.keys()) {
    let sphereLocation = positionToHexDict.get(tilePosition)[1];
    sphereLocation.y += 2;

    let geometry = new SphereGeometry(0.25, 32, 16);

    let material;
    if (!checkValidTile(tilePosition)) material = new MeshBasicMaterial({ color: 0xff0000 });
    else material = new MeshBasicMaterial({ color: 0x00ff00 });

    let marker = new Mesh( geometry, material );
    marker.position.x = sphereLocation.x;
    marker.position.y = sphereLocation.y;
    marker.position.z = sphereLocation.z;
    scene.add( marker );
  }
}

// helper function for getting a valid random tile
function getRandomValidTile() {
  while (true) {
    let i = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD / 2);
    let j = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD / 2);

    let tilePosition = XYtoPositionDict.get(XYto1D(i, j));
    // keep looking for tiles until you have one that is actually on the terrain
    if (tilePosition == undefined) continue;
    if (!checkValidTile(tilePosition)) continue;

    return [tilePosition, i, j];
  }
}

// returns all accessible adjacent tiles
function getAllAdjacentTiles(tileX, tileY) {
  let possibleTiles = [];
  let tilePosition;
  let indexPosition;

  tilePosition = XYtoPositionDict.get(XYto1D(tileX + 1, tileY));
  if (checkValidTile(tilePosition)) {
    possibleTiles.push([XYto1D(tileX + 1, tileY), 0]);
  }

  tilePosition = XYtoPositionDict.get(XYto1D(tileX - 1, tileY));
  if (checkValidTile(tilePosition)) {
    possibleTiles.push([XYto1D(tileX - 1, tileY), 180]);
  }

  // if y tile is even
  if (mod(tileY, 2) == 0) {
    // 300 degree tile
    if (tileY < 0) indexPosition = XYto1D(tileX + 1, tileY + 1);
    else indexPosition = XYto1D(tileX, tileY + 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 300]);
    }

    // 240 degree tile
    if (tileY >= 0) indexPosition = XYto1D(tileX - 1, tileY + 1);
    else indexPosition = XYto1D(tileX, tileY + 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 240]);
    }

    // 120 degree tile
    if (tileY > 0) indexPosition = XYto1D(tileX - 1, tileY - 1);
    else indexPosition = XYto1D(tileX, tileY - 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 120]);
    }

    // 60 degree tile
    if (tileY <= 0) indexPosition = XYto1D(tileX + 1, tileY - 1);
    else indexPosition = XYto1D(tileX, tileY - 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 60]);
    }
  } else if (mod(tileY, 2) == 1) {
    // 300 degree tile
    if (tileY > 0) indexPosition = XYto1D(tileX + 1, tileY + 1);
    else indexPosition = XYto1D(tileX, tileY + 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 300]);
    }

    // 240 degree tile
    if (tileY <= 0) indexPosition = XYto1D(tileX - 1, tileY + 1);
    else indexPosition = XYto1D(tileX, tileY + 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 240]);
    }

    // 120 degree tile
    if (tileY <= 0) indexPosition = XYto1D(tileX - 1, tileY - 1);
    else indexPosition = XYto1D(tileX, tileY - 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 120]);
    }

    // 60 degree tile
    if (tileY > 0) indexPosition = XYto1D(tileX + 1, tileY - 1);
    else indexPosition = XYto1D(tileX, tileY - 1);

    tilePosition = XYtoPositionDict.get(indexPosition);
    if (checkValidTile(tilePosition)) {
      possibleTiles.push([indexPosition, 60]);
    }
  }
  return possibleTiles;
}

// finds the tile closes in straight line distance to the rabbit
function getClosestAdjacentTileToRabbit(allAdjacent, tileX, tileY) {
  let minDistance = Infinity;
  let closestTile;
  let angle;

  for (let possibleTile of allAdjacent) {
    let tile = XYtoPositionDict.get(possibleTile[0]);
    let rabbitPosition = XYtoPositionDict.get(XYto1D(globalRabbit.tileX, globalRabbit.tileY));
    if (tile.distanceTo(rabbitPosition) < minDistance) {
      closestTile = possibleTile[0];
      angle = possibleTile[1];
      minDistance = tile.distanceTo(rabbitPosition);
    }
  }
  return [closestTile, angle];
}

// helper function for visualizing getAllAdjacentTiles and closestAdjacentTile
function mapFoxAdjacentTiles() {
  if (pToggle == 1) {
    for (let label of foxLabels) {
      label.geometry.dispose();
      label.material.dispose();
      scene.remove(label);
    }

    foxLabels = [];
  } else {
    pToggle = 1;
  }

  for (let fox of foxes) {
    let tileIndices = getAllAdjacentTiles(fox.tileX, fox.tileY); // array child contains (index, angle)
    let closestTileIndex = getClosestAdjacentTileToRabbit(tileIndices, fox.tileX, fox.tileY); // (index, angle)
    for (let tile of tileIndices) {
      let tilePosition = XYtoPositionDict.get(tile[0]);
      let [xpos, ypos] = oneDtoXY(tile[0]);

      let sphereLocation = positionToHexDict.get(tilePosition)[1];
      sphereLocation.y += 1;

      let geometry = new SphereGeometry(0.25, 32, 16);
      let material;

      if (tile[0] == closestTileIndex[0]) {
        material = new MeshBasicMaterial({ color: 0x00ff00 });
        console.log("Closest Adjacent Tile: (X: " + xpos + ", Y: " + ypos + ")");
      } else {
        material = new MeshBasicMaterial({ color: 0xff0000 });
        console.log("Adjacent Tile: (X: " + xpos + ", Y: " + ypos + ")");
      }

      let marker = new Mesh( geometry, material );
      marker.position.x = sphereLocation.x;
      marker.position.y = sphereLocation.y;
      marker.position.z = sphereLocation.z;
      foxLabels.push(marker);
      scene.add(marker);
    }
  }
}

// helper function for visualizing hex coordinates
function mapHexCoords() {
  if (mToggle == 0) {
    mToggle = 1;
    for (let index of XYtoPositionDict.keys()) {
      let [tileX, tileY] = oneDtoXY(index);
      console.log("oneDtoXY(" + index +") = " + oneDtoXY(index)[0] + ", " + oneDtoXY(index)[1]);
      let tileDiv = document.createElement( 'div' );
  		tileDiv.className = 'label';
  		tileDiv.textContent = 'Index: ' + index + ' ( X: ' + tileX + ', Y: ' + tileY + ' )';
  		tileDiv.style.marginTop = '-1em';

      let hexPosition = positionToHexDict.get(XYtoPositionDict.get(index))[1];
  		let tileLabel = new CSS2DObject( tileDiv );
  		tileLabel.position.set(hexPosition.x, hexPosition.y + 1, hexPosition.z);

      labels.push(tileLabel);
  		scene.add(tileLabel);
  		tileLabel.layers.set( 0 );
    }
  } else {
    for (let label of labels) {
      scene.remove(label);
      mToggle = 0;
    }
    labels = [];
  }
}

// wolves move randomly to a neighboring tile
function updateFoxes() {
  //delta = clock.getDelta();
  for (let fox of foxes) {
    let allAdjacent = getAllAdjacentTiles(fox.tileX, fox.tileY); //[index, angle]
    let closestAdjacentTile = getClosestAdjacentTileToRabbit(allAdjacent, fox.tileX, fox.tileY); //[index, angle]

    if (XYtoPositionDict.get(closestAdjacentTile[0]) == undefined) continue;
    let translationVec = positionToHexDict.get(XYtoPositionDict.get(closestAdjacentTile[0]))[1];
    let middlePosition = new Vector3(translationVec.x * .75 + fox.position.x * .25,
                                     translationVec.y + 0.3,
                                     translationVec.z * .75 + fox.position.z * .25);

    let foxJumpUp = new TWEEN.Tween(fox.position)
        .to(middlePosition, 75)
        .easing(TWEEN.Easing.Quadratic.Out);
    let foxFallDown = new TWEEN.Tween(fox.position)
        .to(translationVec, 25)
        .easing(TWEEN.Easing.Quadratic.In);

    // chain and start
    foxJumpUp.chain(foxFallDown);
    foxJumpUp.start();

    [fox.tileX, fox.tileY] = oneDtoXY(closestAdjacentTile[0]);
    fox.rotation.y = closestAdjacentTile[1] * Math.PI / 360;
  }
}

// updates bears to move with foxes, will merge these functions
function updateBears() {
  //delta = clock.getDelta();
  for (let bear of bears) {
    let allAdjacent = getAllAdjacentTiles(bear.tileX, bear.tileY);
    let closestAdjacentTile = getClosestAdjacentTileToRabbit(allAdjacent, bear.tileX, bear.tileY);

    if (XYtoPositionDict.get(closestAdjacentTile[0]) == undefined) continue;

    let translationVec = positionToHexDict.get(XYtoPositionDict.get(closestAdjacentTile[0]))[1];

    let middlePosition = new Vector3(translationVec.x * .75 + bear.position.x * .25,
                                     translationVec.y + 0.3,
                                     translationVec.z * .75 + bear.position.z * .25);

    let bearJumpUp = new TWEEN.Tween(bear.position)
        .to(middlePosition, 75)
        .easing(TWEEN.Easing.Quadratic.Out);
    let bearFallDown = new TWEEN.Tween(bear.position)
        .to(translationVec, 25)
        .easing(TWEEN.Easing.Quadratic.In);

    // chain and start
    bearJumpUp.chain(bearFallDown);
    bearJumpUp.start();

    [bear.tileX, bear.tileY] = oneDtoXY(closestAdjacentTile[0]);
    bear.rotation.y = closestAdjacentTile[1] * Math.PI / 360;
  }
}

// Baby rabbits disappear upon contact with rabbit
function updateBabyRabbits() {
  for (let babyRabbit of babyRabbits) {
    if ((babyRabbit.tileX == globalRabbit.tileX) && (babyRabbit.tileY == globalRabbit.tileY)) {
      scene.remove(babyRabbit);
      babiesLeft--;
      updateScore(1);

      document.getElementById("babiesRemaining").innerHTML = "" + babiesLeft;
      document.getElementById("status").innerHTML = "BABY LOCATED";
    }
  }
}

// changes direction rabbit is facing with the arrow keys
function updateRabbitPerspective() {
  let prevX = globalRabbit.tileX;
  let prevY = globalRabbit.tileY;
  if (keyState == "ArrowLeft") {
    //camera.rotateY(1.047);
    globalRabbit.rotateY(Math.PI / 3);
    globalRabbit.angleMetric = mod(globalRabbit.angleMetric + 60, 360);
  }
  if (keyState == "ArrowRight") {
    //camera.rotateY(-1.047);
    globalRabbit.rotateY(-Math.PI / 3);
    globalRabbit.angleMetric = mod(globalRabbit.angleMetric - 60, 360);
  }
  console.log("Rabbit Angle: " + globalRabbit.angleMetric);
}

// moves rabbit and also detects various scoring events
function moveRabbitUponSpacebar() {
  let prevX = globalRabbit.tileX;
  let prevY = globalRabbit.tileY;

  if (keyState != " ") return;

  if (mod(globalRabbit.angleMetric, 360) == 0) {
    globalRabbit.tileX += 1;
  } else if (mod(globalRabbit.angleMetric + 180, 360) == 0) {
    globalRabbit.tileX -= 1;
  }
  // if y tile is even
  else if (mod(prevY, 2) == 0) {
    if (mod(globalRabbit.angleMetric + 60, 360) == 0) {
      if (prevY < 0) globalRabbit.tileX += 1;
      globalRabbit.tileY += 1;
    }
    if (mod(globalRabbit.angleMetric + 120, 360) == 0) {
      globalRabbit.tileY += 1;
      if (prevY >= 0) globalRabbit.tileX -= 1;
    }
    if (mod(globalRabbit.angleMetric + 240, 360) == 0) {
      globalRabbit.tileY -= 1;
      if (prevY > 0) globalRabbit.tileX -= 1;
    }
    if (mod(globalRabbit.angleMetric + 300, 360) == 0) {
      if (prevY <= 0) globalRabbit.tileX += 1;
      globalRabbit.tileY -= 1;
    }
  } else if (mod(prevY, 2) == 1) {
    if (mod(globalRabbit.angleMetric + 60, 360) == 0) {
      if (prevY > 0) globalRabbit.tileX += 1;
      globalRabbit.tileY += 1;
    }
    if (mod(globalRabbit.angleMetric + 120, 360) == 0) {
      if (prevY <= 0) globalRabbit.tileX -= 1;
      globalRabbit.tileY += 1;
    }
    if (mod(globalRabbit.angleMetric + 240, 360) == 0) {
      if (prevY <= 0) globalRabbit.tileX -= 1;
      globalRabbit.tileY -= 1;
    }
    if (mod(globalRabbit.angleMetric + 300, 360) == 0) {
      if (prevY > 0)  globalRabbit.tileX += 1;
      globalRabbit.tileY -= 1;
    }
  }

  let tilePosition = XYtoPositionDict.get(XYto1D(globalRabbit.tileX, globalRabbit.tileY));

  // if the tile is out of bounds or has hard terrain, don't move.
  if (!checkValidTile(tilePosition)) {
    globalRabbit.tileX = prevX;
    globalRabbit.tileY = prevY;
    document.getElementById("status").innerHTML = "YOU CAN'T GO THERE";
    return;
  }

  document.getElementById("status").innerHTML = "YOU'RE DOING GREAT";

  let translationVec = positionToHexDict.get(tilePosition)[1];

  let middlePosition = new Vector3(translationVec.x * .75 + globalRabbit.position.x * .25,
                                   translationVec.y + 0.3,
                                   translationVec.z * .75 + globalRabbit.position.z * .25);

  let jumpUp = new TWEEN.Tween(globalRabbit.position)
      .to(middlePosition, 75)
      .easing(TWEEN.Easing.Quadratic.Out);
  let fallDown = new TWEEN.Tween(globalRabbit.position)
      .to(translationVec, 25)
      .easing(TWEEN.Easing.Quadratic.In);

  // chain and start
  jumpUp.chain(fallDown);
  jumpUp.start();

  // increment turn number and score
  if (turnNumber % 4 == 0) updateScore(2);

  updateBabyRabbits();
}

// helper function for modding in moveRabbit function
function mod(n, m) {
  return ((n % m) + m) % m;
}

// collision check
function checkCollisions() {
  for (let fox of foxes) {
    if ((globalRabbit.position.x == fox.position.x) && (globalRabbit.position.z == fox.position.z)) {
      updateLives(2);
      updateScore(-1);
    }
  }

  for (let bear of bears) {
    if ((globalRabbit.position.x == bear.position.x) && (globalRabbit.position.z == bear.position.z)) {
      updateLives(4);
      updateScore(-2);
    }
  }

  if ((globalRabbit.position.x == globalStar.position.x) && (globalRabbit.position.z == globalStar.position.z)) {
    updateScore(10);
    endGame(1);
  }
}

// updates rabbit lives
function updateLives(type) {
  if (type == 4) {
    lives -= 4;
    document.getElementById('hitpoints').innerHTML = lives;
  } else if (type == 2) {
    lives -= 2;
    document.getElementById('hitpoints').innerHTML = lives;
  }

  if (lives <= 0){
    // end the game
    endGame(-1);
  }
}

// overloaded update score for baby rabbit scoring
function updateScore(scoreType) {
  let scoreString = "";
  // baby rabbit acquired
  if (scoreType == 1) {
    score += 10;
    scoreString += score;
    document.getElementById('totalScore').innerHTML = scoreString;
  }

  // score for surviving a turn
  if (scoreType == 2) {
    // rewarding turns remaining w.r.t maxRewardedTurns
    let maxRewardedTurns = Math.floor(LENGTH * LENGTH * 0.05);
    if (turnNumber < maxRewardedTurns) score += 1;
    scoreString += score;
    document.getElementById('totalScore').innerHTML = scoreString;
  }

  // score for ending the game
  if (scoreType == 10) {
    // rewarding unused turns
    let maxRewardedTurns = Math.floor(LENGTH * LENGTH * 0.05);
    if (turnNumber < maxRewardedTurns) score += 2 * (maxRewardedTurns - turnNumber);
    scoreString += score;
    document.getElementById('totalScore').innerHTML = scoreString;
  }

  // fox catches rabbit
  if (scoreType == -1) {
    // lose points for getting caught
    score -= 5
    scoreString += score;
    document.getElementById('totalScore').innerHTML = scoreString;
  }

  // fox catches rabbit
  if (scoreType == -2) {
    // lose points for getting caught
    score -= 10
    scoreString += score;
    document.getElementById('totalScore').innerHTML = scoreString;
  }
}

// converts x,y coordinate to 1D (dumb implementation)
function XYto1D(x, y) {
  return (x + LENGTH) * 1000 + y + LENGTH;
}

// converts 1D coordinate to tileX, tileY (dumb implementation)
function oneDtoXY(key) {
  let xCoord = Math.floor(key / 1000) - LENGTH;
  let yCoord = key % 1000 - LENGTH;
  return [xCoord, yCoord];
}

// converts index numbers for X and Y into proper coordinates for hexagons
// actually adds the hexagons edge to edge, meaning the hexagons wiggle around
// a little bit when being added.
function tileToPosition(tileX, tileY) {
  return new Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

// creates a single hexagonal prism object at the given height and position
// this is a helper function to the hex function below. It creates the actual
// object but hex calls it and then skins the object appropriately.
function hexGeometry(height, tilePosition) {
  let geo = new CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(tilePosition.x, height * 0.5, tilePosition.y);

  return geo;
}

// sets thresholds for texturing hexes according to height
const STONE_HEIGHT = MAX_HEIGHT * 0.8;
const DIRT_HEIGHT = MAX_HEIGHT * 0.65;
const GRASS_HEIGHT = MAX_HEIGHT * 0.35;
const SAND_HEIGHT = MAX_HEIGHT * WATER_HEIGHT + 0.01;
const GRAVEL_HEIGHT = MAX_HEIGHT * WATER_HEIGHT * 0.66;
const DIRT2_HEIGHT = MAX_HEIGHT * 0;

// instantiates geometries storing aggregate hex groupings for each terrain
let stoneGeo = new BoxGeometry(0, 0, 0);
let dirtGeo = new BoxGeometry(0, 0, 0);
let dirt2Geo = new BoxGeometry(0, 0, 0);
let gravelGeo = new BoxGeometry(0, 0, 0);
let sandGeo = new BoxGeometry(0, 0, 0);
let grassGeo = new BoxGeometry(0, 0, 0);

// creates a hex at a given height and position and adds them to the proper
// aggregate geometry that is defined above. Uses aforementioned thresholds.
function hex(height, tilePosition) {
  let geo = hexGeometry(height, tilePosition);
  positionToHexDict.set(tilePosition, [geo, new Vector3(tilePosition.x, height, tilePosition.y)]);
  if (height > STONE_HEIGHT) {
    stoneGeo = mergeBufferGeometries([geo, stoneGeo]);

    // if tile is valid and not on rabbit spawn point load in a terrain asset
    if (checkValidTile(tilePosition) && (tilePosition.x != 0 && tilePosition.y != 0)) {
      let randomValue = Math.random();
      if (randomValue > 0.93) {
        loadAsset('assets/PP_Rock_Moss_Grown_09.fbx').then((rock) => {
          rock.scale.multiplyScalar(0.004);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          rock.translateX(translationVec.x);
          rock.translateY(translationVec.y);
          rock.translateZ(translationVec.z);
          rock.rotateY(Math.random() * Math.PI * 2);

          hardTerrain.set(tilePosition, 1);

          scene.add(rock);
        })
      }
    }

  } else if (height > DIRT_HEIGHT) {
    dirtGeo = mergeBufferGeometries([geo, dirtGeo]);

    // if tile is valid and not on rabbit spawn point load in a terrain asset
    if (checkValidTile(tilePosition) && (tilePosition.x != 0 && tilePosition.y != 0)) {
      let randomValue = Math.random();
      if (randomValue > 0.93) {
        loadAsset('assets/PP_Mushroom_Fantasy_Purple_08.fbx').then((shroom) => {
          shroom.scale.multiplyScalar(0.08);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          shroom.translateX(translationVec.x);
          shroom.translateY(translationVec.y);
          shroom.translateZ(translationVec.z);
          shroom.rotateY(Math.random() * Math.PI * 2);

          scene.add(shroom);
        })
      } else if (randomValue > 0.86) {
        loadAsset('assets/PP_Mushroom_Fantasy_Orange_09.fbx').then((shroom) => {
          shroom.scale.multiplyScalar(0.04);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          shroom.translateX(translationVec.x);
          shroom.translateY(translationVec.y);
          shroom.translateZ(translationVec.z);
          shroom.rotateY(Math.random() * Math.PI * 2);

          scene.add(shroom);
        })
      }
    }

  } else if (height > GRASS_HEIGHT) {
    grassGeo = mergeBufferGeometries([geo, grassGeo]);

    // if tile is valid and not on rabbit spawn point load in a terrain asset
    if (checkValidTile(tilePosition) && (tilePosition.x != 0 && tilePosition.y != 0)) {
      let randomValue = Math.random();
      if (randomValue > 0.98) {
        loadAsset('assets/PP_Birch_Tree_05.fbx').then((tree) => {
          tree.scale.multiplyScalar(0.015);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          tree.translateX(translationVec.x);
          tree.translateY(translationVec.y);
          tree.translateZ(translationVec.z);
          tree.rotateY(Math.random() * Math.PI * 2);

          hardTerrain.set(tilePosition, 1);

          scene.add(tree);
        })
      } else if (randomValue > 0.96) {
        loadAsset('assets/PP_Tree_02.fbx').then((tree) => {
          tree.scale.multiplyScalar(0.015);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          tree.translateX(translationVec.x);
          tree.translateY(translationVec.y);
          tree.translateZ(translationVec.z);
          tree.rotateY(Math.random() * Math.PI * 2);

          hardTerrain.set(tilePosition, 1);

          scene.add(tree);
        })
      } else if (randomValue > 0.91) {
        loadAsset('assets/PP_Hyacinth_04.fbx').then((flower) => {
          flower.scale.multiplyScalar(0.05);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          flower.translateX(translationVec.x);
          flower.translateY(translationVec.y);
          flower.translateZ(translationVec.z);
          flower.rotateY(Math.random() * Math.PI * 2);

          scene.add(flower);
        })
      } else if (randomValue > 0.83) {
        loadAsset('assets/PP_Grass_11.fbx').then((grass) => {
          grass.scale.multiplyScalar(0.05);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          grass.translateX(translationVec.x);
          grass.translateY(translationVec.y);
          grass.translateZ(translationVec.z);
          grass.rotateY(Math.random() * Math.PI * 2);

          scene.add(grass);
        })
      } else if (randomValue > 0.88) {
        loadAsset('assets/PP_Rock_Pile_Forest_Moss_05.fbx').then((rock) => {
          rock.scale.multiplyScalar(0.004);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          rock.translateX(translationVec.x);
          rock.translateY(translationVec.y);
          rock.translateZ(translationVec.z);
          rock.rotateY(Math.random() * Math.PI * 2);

          hardTerrain.set(tilePosition, 1);

          scene.add(rock);
        })
      } else if (randomValue > 0.80) {
        loadAsset('assets/PP_Grass_15.fbx').then((grass) => {
          grass.scale.multiplyScalar(0.05);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          grass.translateX(translationVec.x);
          grass.translateY(translationVec.y);
          grass.translateZ(translationVec.z);
          grass.rotateY(Math.random() * Math.PI * 2);

          scene.add(grass);
        })
      }
    }

  } else if (height > SAND_HEIGHT) {
    sandGeo = mergeBufferGeometries([geo, sandGeo]);

    // if tile is valid and not on rabbit spawn point load in a terrain asset
    if (checkValidTile(tilePosition) && (tilePosition.x != 0 && tilePosition.y != 0)) {
      let randomValue = Math.random();
      if (randomValue > 0.94) {
        loadAsset('assets/PP_Rock_Moss_Grown_11.fbx').then((rock) => {
          rock.scale.multiplyScalar(0.004);

          let translationVec = positionToHexDict.get(tilePosition)[1];
          rock.translateX(translationVec.x);
          rock.translateY(translationVec.y);
          rock.translateZ(translationVec.z);
          rock.rotateY(Math.random() * Math.PI * 2);

          hardTerrain.set(tilePosition, 1);

          scene.add(rock);
        })
      }
    }

  } else if (height > GRAVEL_HEIGHT) {
    gravelGeo = mergeBufferGeometries([geo, gravelGeo]);
  } else if (height > DIRT2_HEIGHT) {
    dirt2Geo = mergeBufferGeometries([geo, dirt2Geo]);
  }
}

// helper function for traversing Map by value
function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue)
      return key;
  }
  return undefined;
}

// used to return the total aggregate geometry that is rendered by the renderer.
// this is done so that the GPU only has one mesh to constantly update.
function hexMesh(geo, map) {
  let mat = new MeshPhysicalMaterial({
    envMap: envmap,
    envMapIntensity: 0.135,
    flatShading: true,
    map
  });

  let mesh = new Mesh(geo, mat);
  mesh.castShadow = true; //default is false
  mesh.receiveShadow = true; //default

  return mesh;
}
