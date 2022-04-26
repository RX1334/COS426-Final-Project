// file imports directly from CDN
import {
  WebGLRenderer, ACESFilmicToneMapping, sRGBEncoding, Color, CylinderGeometry,
  RepeatWrapping, DoubleSide, BoxGeometry, Mesh, PointLight, MeshPhysicalMaterial,
  PerspectiveCamera, Scene, PMREMGenerator, PCFSoftShadowMap, Vector2, Vector3, TextureLoader,
  SphereGeometry, MeshStandardMaterial, MeshBasicMaterial, FloatType, VSMShadowMap
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

// dictionary that maps the tilePosition to the hex
let positionToHexDict = new Map();
// keyState of up down left or right
let keyState;
// radius of sphere
let radius = 1;
// dictionary that maps xy 1D coordinate to tilePosition
let XYtoPositionDict = new Map();
let babySpheres = [];


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
  for(let i = -20; i <= 20; i++) {
    for(let j = -20; j <= 20; j++) {
      let position = tileToPosition(i, j);
      //console.log(position);
      if(position.length() > 16) continue;
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
  const sphere = new Mesh( geometry, material );
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
    updateSphere(sphere);
  });

  // add baby rabbits (for now, spheres with smaller radii)
  for (let i = 0; i < 3; i++) {
    let geometry = new SphereGeometry( radius/2, 32, 16 );
    let material = new MeshBasicMaterial( { color: 0xff0000} );
    let babySphere = new Mesh( geometry, material );
    babySpheres.push(babySphere);
    scene.add(babySphere);
    // randomly put baby rabbits on the scene
    while (true) {
      let i = Math.floor(16* Math.random() - 8);
      let j = Math.floor(16 * Math.random() - 8);
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


  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    //updateSphere(sphere);
  });
})();
/*
function animateSphereMovement(sphere, currPosition, translationVec, timeStamp) {

  let timeStampRatio = timeStamp 

  sphere.position.x = (1 -  timeStampRatio) * currPosition.x + timeStampRatio * translationVec.x;
  sphere.position.y = (1 -  timeStampRatio) * currPosition.y +  timeStampRatio * (translationVec.y + radius);
  sphere.position.z = (1 -  timeStampRatio) * currPosition.z +  timeStampRatio * (translationVec.z);

  requestAnimationFrame(animateSphereMovement);
}
*/
// sphere moves to next tile upon click
function updateSphere(sphere) {
  console.log(sphere.position);
  let prevX = sphere.tileX;
  let prevY = sphere.tileY;
  //console.log(keyState);
  console.log(tileToPosition(sphere.tileX, sphere.tileY));
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

  updateBabySpheres(sphere);

}
// clear Baby Spheres if they are in contact with sphere
function updateBabySpheres(sphere) {
  for (let babySphere of babySpheres) {
    if ((babySphere.tileX == sphere.tileX) && (babySphere.tileY == sphere.tileY)) {
      scene.remove(babySphere);
    }
  }
}
// sphere moves randomly 
function updateSphere2(sphere) {
  if (sphere.coordinates.x >= 20) {
    sphere.translateX(-0.05);
    sphere.coordinates.x += -1;
  }
  else if (sphere.coordinates.x <= -20) {
    sphere.translateX(0.05);
    sphere.coordinates.x += 1;
  }
  else {
    let p = Math.random();
    let dir = p >= 0.5 ? 1 : -1;
    sphere.translateX(dir * 1);
    sphere.coordinates.x += dir *1;
  }
  if (sphere.coordinates.y >= 20) {
    sphere.translateY(-1);
    sphere.coordinates.y += -1;
  }
  else if (sphere.coordinates.y <= -20) {
    sphere.translateY(1);
    sphere.coordinates.y += 1;
  }
  else {
    let p = Math.random();
    let dir = p >= 0.5 ? 1 : -1;
    sphere.translateY(dir * 1);
    sphere.coordinates.y += dir * 1;
  }
  requestAnimationFrame(updateSphere);
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
  // if (position == tileToPosition(0, 0)) console.log(height);

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
  //console.log(position);
  //console.log(position.x);
  //console.log(position.y);
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
