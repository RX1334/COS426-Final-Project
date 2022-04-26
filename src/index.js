// file imports directly from CDN
import {
  WebGLRenderer, ACESFilmicToneMapping, sRGBEncoding, Color, CylinderGeometry,
  RepeatWrapping, DoubleSide, BoxGeometry, Mesh, PointLight, MeshPhysicalMaterial,
  PerspectiveCamera, Scene, PMREMGenerator, PCFSoftShadowMap, Vector2, Vector3, TextureLoader,
  SphereGeometry, MeshStandardMaterial, MeshBasicMaterial, FloatType, VSMShadowMap, ConeGeometry
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

import { OrbitControls } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls';
import { RGBELoader } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader';
import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils';
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise';
//import { TWEEN } from 'three/examples/jsm/libs/tween.module.min.js';

// Initialize Scene
const scene = new Scene();
scene.background = new Color("#FFEECC");

// Initialize Camera
const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(-17, 35, 31);

// Initialize Renderer
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);

// ACES Filmic Tone Mapping maps high dynamic range (HDR) lighting conditions
// to low dynamic range (LDR) digital screen representations.
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputEncoding = sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// set up lights
const light = new PointLight( new Color("#fee2d2").convertSRGBToLinear().convertSRGBToLinear(), 80, 200 );
light.position.set(10, 20, 10);

light.castShadow = true;
light.shadow.mapSize.width = 512;
light.shadow.mapSize.height = 512;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 500;
scene.add( light );

// Set up Camera Manipulation
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.dampingFactor = 0.05;
controls.enableDamping = true;
controls.enableZoom = true;

let pmrem = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

// instantiates envmap
let envmap;

// we can control max height to make things more flat or not.
const MAX_HEIGHT = 10;

// map dimensions
const LENGTH = 20; 
const MAX_DISTANCE_THRESHOLD = Math.floor(0.8*LENGTH);
const BABYRABBITS_NUM = 3;
const WOLVES_NUM = 1;
const BEARTRAPS_NUM = 6;
const HUNTERS_NUM = 0;

// dictionary that maps the tilePosition to the hex
let positionToHexDict = new Map();
// keyState of up down left or right
let keyState;
// radius of sphere
let radius = 1;
// sphere
let sphere;
// dictionary that maps xy 1D coordinate to tilePosition
let XYtoPositionDict = new Map();
let babySpheres = [];
let hunters = [];
let hunterZones = [];
let lives = 3;
let bearTraps = [];
let wolves = [];



// this entire function is asynchronous, meaning that it is not concerned with
// the order in which things are declared/instantiated as long as dependencies
// are declared/instantiated at some point within this file. Note that this function
// only runs once. The animation loop is built into the WebGL renderer, which
// functions slightly differently from the one given in our starter code.

// also note that, within the async function, order still matters when it comes
// to instantiating/declaring things in the right order.
(async function() {
  // environment map set up. await in this case means that the command here will
  // wait for RGBE Loader to finish processing the HDR file before continuing.
  let envmapTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
  let rt = pmrem.fromEquirectangular(envmapTexture);
  envmap = rt.texture;

  // load in textures for different hex types. Using minecraft texture packs
  // is actually a very good idea for skinning the tiles.
  let textures = {
    dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
    dirt2: await new TextureLoader().loadAsync("assets/dirt2.png"),
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
  for(let i = -LENGTH; i <= LENGTH; i++) {
    for(let j = -LENGTH; j <= LENGTH; j++) {
      let position = tileToPosition(i, j);
      if(position.length() > MAX_DISTANCE_THRESHOLD) continue;
      XYtoPositionDict.set(XYto1D(i,j), position);

      let noise = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
      noise = Math.pow(noise, 1.5);

      hex(noise * MAX_HEIGHT, position, envmap);
      
    }
  }

  // adds the aggregate geometries of each terrain type and textures them
  let stoneMesh = hexMesh(stoneGeo, textures.stone);
  let grassMesh = hexMesh(grassGeo, textures.grass);
  let dirt2Mesh = hexMesh(dirt2Geo, textures.dirt2);
  let dirtMesh  = hexMesh(dirtGeo, textures.dirt);
  let sandMesh  = hexMesh(sandGeo, textures.sand);
  scene.add(stoneMesh, dirtMesh, dirt2Mesh, sandMesh, grassMesh);

  // adds the water texture
  let seaTexture = textures.water;
  seaTexture.repeat = new Vector2(1, 1);
  seaTexture.wrapS = RepeatWrapping;
  seaTexture.wrapT = RepeatWrapping;

  // defines and adds the mesh for water surface
  // can consider using water.js from three.js examples here
  let seaMesh = new Mesh(
    new CylinderGeometry(17, 17, MAX_HEIGHT * 0.2, 50),
    new MeshPhysicalMaterial({
      envMap: envmap,
      color: new Color("#55aaff").convertSRGBToLinear().multiplyScalar(3),
      ior: 1.4,
      transmission: 1,
      transparent: true,
      thickness: 1.5,
      envMapIntensity: 0.2,
      roughness: 1,
      metalness: 0.025,
      roughnessMap: seaTexture,
      metalnessMap: seaTexture,
    })
  );
  seaMesh.receiveShadow = true;
  seaMesh.rotation.y = -Math.PI * 0.333 * 0.5;
  seaMesh.position.set(0, MAX_HEIGHT * 0.1, 0);
  scene.add(seaMesh);

  // defines and adds the cylinder containing the map
  let mapContainer = new Mesh(
    new CylinderGeometry(17.1, 17.1, MAX_HEIGHT * 0.25, 50, 1, true),
    new MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt,
      envMapIntensity: 0.2,
      side: DoubleSide,
    })
  );
  mapContainer.receiveShadow = true;
  mapContainer.rotation.y = -Math.PI * 0.333 * 0.5;
  mapContainer.position.set(0, MAX_HEIGHT * 0.125, 0);
  scene.add(mapContainer);

  // defines and adds the map floor
  let mapFloor = new Mesh(
    new CylinderGeometry(18.5, 18.5, MAX_HEIGHT * 0.1, 50),
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

  // make a new Spherical object
  const geometry = new SphereGeometry( radius, 32, 16 );
  const material = new MeshBasicMaterial( { color: 0xffff00 } );
  sphere = new Mesh( geometry, material );
    // translate sphere 
  let tilePosition = XYtoPositionDict.get(XYto1D(0, 0));
  let translationVec = positionToHexDict.get(tilePosition)[1];
  sphere.translateX(translationVec.x);
  sphere.translateY(translationVec.y + radius);
  sphere.translateZ(translationVec.z);
  sphere.tileX = 0;
  sphere.tileY = 0;

  scene.add(sphere);

  // add event listener for sphere
  document.addEventListener("keydown", function (event) {
    keyState = event.key;
    updateSphere();
  });

  // add baby rabbits (for now, spheres with smaller radii)
  generateBabyRabbits();
  // add hunters to the scene
  generateHunters();
  // add bear traps to the scene
  generateBearTraps();
  generateWolves();
  // move wolves every second
  window.setInterval(updateWolves, 2000);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    //updateWolves();
    //updateSphere(sphere);
  });
})();

// creates baby rabbits in the form of white spheres of half the radius, and adds them to the scene
function generateBabyRabbits() {
  for (let i = 0; i < BABYRABBITS_NUM; i++) {
    let geometry = new SphereGeometry( radius/2, 32, 16 );
    let material = new MeshBasicMaterial( { color: 0xffffff} );
    let babySphere = new Mesh( geometry, material );
    babySpheres.push(babySphere);
    scene.add(babySphere);
    // randomly put baby rabbits on the scene
    while (true) {
      let i = Math.floor(MAX_DISTANCE_THRESHOLD* Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let j = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let tilePosition = XYtoPositionDict.get(XYto1D(i, j));
      // keep looking for tiles until you have one that is actually on the terrain
      if (tilePosition == undefined) continue;
      let translationVec = positionToHexDict.get(tilePosition)[1];
      babySphere.translateX(translationVec.x);
      babySphere.translateY(translationVec.y + radius/2);
      babySphere.translateZ(translationVec.z);
      babySphere.tileX = i;
      babySphere.tileY = j;
      break;
    }
  }
}
// creates hunters in the form of blue rectangular boxes, and adds them to the scene
function generateHunters() {
  for (let i = 0; i < HUNTERS_NUM; i++) {
    let geometry = new BoxGeometry( radius/2, 4, radius/2);
    let material = new MeshBasicMaterial( { color:  0x0000FF} );
    let hunter = new Mesh( geometry, material );
    hunters.push(hunter);
    scene.add(hunter);
    // add hunterZones
    geometry = new CylinderGeometry( 4 * radius, 4* radius, 0, 40, true );
    material = new MeshBasicMaterial( {color: 0xff0000} );
    let hunterZone = new Mesh( geometry, material );

    hunterZones.push(hunterZone);
    scene.add(hunterZone);
    // randomly put hunters on the scene
    while (true) {
      let i = Math.floor(MAX_DISTANCE_THRESHOLD* Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let j = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let tilePosition = XYtoPositionDict.get(XYto1D(i, j));
      // keep looking for tiles until you have one that is actually on the terrain
      if (tilePosition == undefined) continue;
      let translationVec = positionToHexDict.get(tilePosition)[1];
      hunter.translateX(translationVec.x);
      hunter.translateY(translationVec.y + radius/2);
      hunter.translateZ(translationVec.z);
      hunter.tileX = i;
      hunter.tileY = j;
      // change position of hunterZone
      hunterZone.translateX(translationVec.x);
      hunterZone.translateY(translationVec.y);
      hunterZone.translateZ(translationVec.z);
      hunterZone.tileX = i;
      hunterZone.tileY = j;
      break;
    }
  }
}
// creates bear traps in the form of yellow cones, and adds them to the scene
function generateBearTraps() {
  for (let i = 0; i < BEARTRAPS_NUM; i++) {
    let geometry = new ConeGeometry( 1, 5, 32 );
    let material = new MeshBasicMaterial( {color: 0x808080} );
    let bearTrap = new Mesh( geometry, material );

    bearTraps.push(bearTrap);
    scene.add(bearTrap);
    // randomly put bear traps on the scene
    while (true) {
      let i = Math.floor(MAX_DISTANCE_THRESHOLD* Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let j = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let tilePosition = XYtoPositionDict.get(XYto1D(i, j));
      // keep looking for tiles until you have one that is actually on the terrain
      if (tilePosition == undefined) continue;
      let translationVec = positionToHexDict.get(tilePosition)[1];
      bearTrap.translateX(translationVec.x);
      bearTrap.translateY(translationVec.y);
      bearTrap.translateZ(translationVec.z);
      bearTrap.tileX = i;
      bearTrap.tileY = j;
      break;
    }
  }
}
// creates wolves in the form of yellow black spheres, and adds them to the scene
function generateWolves() {
  for (let i = 0; i < WOLVES_NUM; i++) {
    let geometry = new SphereGeometry( radius/2, 32, 16 ); 
    let material = new MeshBasicMaterial( {color: 0x000000} );
    let wolf = new Mesh( geometry, material );

    wolves.push(wolf);
    scene.add(wolf);
    // randomly put bear traps on the scene
    while (true) {
      let i = Math.floor(MAX_DISTANCE_THRESHOLD* Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let j = Math.floor(MAX_DISTANCE_THRESHOLD * Math.random() - MAX_DISTANCE_THRESHOLD/2);
      let tilePosition = XYtoPositionDict.get(XYto1D(i, j));
      // keep looking for tiles until you have one that is actually on the terrain
      if (tilePosition == undefined) continue;
      let translationVec = positionToHexDict.get(tilePosition)[1];
      wolf.translateX(translationVec.x);
      wolf.translateY(translationVec.y + radius/2);
      wolf.translateZ(translationVec.z);
      wolf.tileX = i;
      wolf.tileY = j;
      break;
    }
  }
}
// wolves move randomly to a neighboring tile
function updateWolves() {
  //delta = clock.getDelta();
  for (let wolf of wolves) {
    // keep loooking for tiles for where the wolf can move to randomly
    while (true) {
      let x = Math.random();
      let y = Math.random();
      let dirX = 0;
      let dirY = 0;
      if (x < 1/3) dirX += 1;
      else if (x < 2/3) dirX += -1;
      if (y < 1/3) dirY += 1;
      else if (y < 2/3) dirY += -1;

      let tilePosition = XYtoPositionDict.get(XYto1D(wolf.tileX + dirX, wolf.tileY + dirY));
      if (tilePosition == undefined) continue;
      let translationVec = positionToHexDict.get(tilePosition)[1];
      wolf.position.x = translationVec.x;
      wolf.position.y = translationVec.y + radius/2;
      wolf.position.z = translationVec.z;
      wolf.tileX += dirX;
      wolf.tileY += dirY;
      break;
    }
    if ((sphere.position.x == wolf.position.x) && (sphere.position.z == wolf.position.z)) {
      //console.log("CONTACT WAS MADE WITH WOLF");
      updateLives();
    }
  }
}
// sphere moves to next tile upon click
function updateSphere() {
  let prevX = sphere.tileX;
  let prevY = sphere.tileY;

  if (keyState == "ArrowLeft") sphere.tileX += 1;
  if (keyState == "ArrowRight") sphere.tileX += -1;
  if (keyState == "ArrowUp") sphere.tileY += 1;
  if (keyState == "ArrowDown") sphere.tileY += -1;
  let tilePosition = XYtoPositionDict.get(XYto1D(sphere.tileX, sphere.tileY));

  if (tilePosition == undefined) {
    sphere.tileX = prevX;
    sphere.tileY = prevY;
    return;
  }

  let translationVec = positionToHexDict.get(tilePosition)[1];
  let currPosition = sphere.position;
  //animateSphereMovement(sphere, currPosition, translationVec);
  
  sphere.position.x = translationVec.x;
  sphere.position.y = translationVec.y + radius;
  sphere.position.z = translationVec.z; 

  updateBabySpheres();
  updateHunterZones();
  updateBearTraps();

}
// Baby Spheres disappear upon contact with sphere
function updateBabySpheres() {
  for (let babySphere of babySpheres) {
    if ((babySphere.tileX == sphere.tileX) && (babySphere.tileY == sphere.tileY)) {
      scene.remove(babySphere);
    }
  }
}
// if sphere/rabbit enters hunter zone, there is a probability p chance that the rabbit loses a life
function updateHunterZones() {
  for (let hunterZone of hunterZones) {
    if (sphere.position.distanceTo(hunterZone.position) < 4 * radius) {
      let p = Math.random();
      if (p < 0.3) {
        updateLives();
      }
    }
  }
}
function updateLives() {
  if (lives != 0) {
    lives--;
    let heartString = "";
    for (let i = 0; i < lives; i++) heartString += "❤️";
    document.getElementById('Number of Lives').innerHTML = heartString;
  }
}
// bear traps spin up out of the ground upon contact with sphere
function updateBearTraps() {
  for (let bearTrap of bearTraps) {
    if ((bearTrap.tileX == sphere.tileX) && (bearTrap.tileY == sphere.tileY)) {
      bearTrap.translateY(10);
    }
  }
}
// converts x,y coordinate to 1D (dumb implementation)
function XYto1D(x, y) {
  return 1000* x + y;
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
function hexGeometry(height, position) {
  let geo  = new CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y);

  return geo;
}

// sets thresholds for texturing hexes according to height
const STONE_HEIGHT = MAX_HEIGHT * 0.8;
const DIRT_HEIGHT = MAX_HEIGHT * 0.7;
const GRASS_HEIGHT = MAX_HEIGHT * 0.5;
const SAND_HEIGHT = MAX_HEIGHT * 0.3;
const DIRT2_HEIGHT = MAX_HEIGHT * 0;

// instantiates geometries storing aggregate hex groupings for each terrain
let stoneGeo = new BoxGeometry(0,0,0);
let dirtGeo = new BoxGeometry(0,0,0);
let dirt2Geo = new BoxGeometry(0,0,0);
let sandGeo = new BoxGeometry(0,0,0);
let grassGeo = new BoxGeometry(0,0,0);

// creates a hex at a given height and position and adds them to the proper
// aggregate geometry that is defined above. Uses aforementioned thresholds.
function hex(height, position) {
  let geo = hexGeometry(height, position);
  positionToHexDict.set(position, [geo, new Vector3(position.x, height, position.y)]);
  if(height > STONE_HEIGHT) {
    stoneGeo = mergeBufferGeometries([geo, stoneGeo]);
  } else if(height > DIRT_HEIGHT) {
    dirtGeo = mergeBufferGeometries([geo, dirtGeo]);

    if(Math.random() > 0.8) {
      // if we were to add other geometries procedurally to tiles, we would do
      // it like so. We would merge it to the aggregate geometry with the appropriate
      // texture. Everything is added to the scene only after everything is divided
      // appropriately by the textures they use.
      // grassGeo = mergeBufferGeometries([grassGeo, tree(height, position)]);
    }
  } else if(height > GRASS_HEIGHT) {
    grassGeo = mergeBufferGeometries([geo, grassGeo]);
  } else if(height > SAND_HEIGHT) {
    sandGeo = mergeBufferGeometries([geo, sandGeo]);
  } else if(height > DIRT2_HEIGHT) {
    dirt2Geo = mergeBufferGeometries([geo, dirt2Geo]);
  }
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
