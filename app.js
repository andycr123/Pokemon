// Question Reference: discourse.threejs.org/t/how-do-i-make-interactive-grass-patches/65340

let camera, scene, renderer, ground, lightPrimary, lightSecondary, assets, controls, player, raycaster, pointer;

let grassStuff;
const GRASS_COUNT = 10000;
const SHOW_PLAYER = true;

class GrassMaterial extends THREE.ShaderMaterial {
  uniforms = {
    fTime: {
      value: 0.0
    },
    vPlayerPosition: {
      value: new THREE.Vector3(0.0, -1.0, 0.0)
    },
    fPlayerColliderRadius: {
      value: 1.1,
    }
  };

  vertexShader = `
    uniform float fTime;
    uniform vec3 vPlayerPosition;
    uniform float fPlayerColliderRadius;
  
    varying float fDistanceFromGround;
    varying vec3 vInstanceColor;

    float rand(float n){return fract(sin(n) * 43758.5453123);}

    float rand(vec2 n) { 
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }
    
    float createNoise(vec2 n) {
      vec2 d = vec2(0.0, 1.0);
      vec2 b = floor(n);
      vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));

      return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
    }

    vec3 localToWorld(vec3 target) {
      return (modelMatrix * instanceMatrix * vec4(target, 1.0)).xyz;
    }
  
    void main() {
      fDistanceFromGround = max(0.0, position.y);
      vInstanceColor = instanceColor;
      
      vec3 worldPosition = localToWorld(position);

      float noise = createNoise(vec2(position.x, position.z)) * 0.6 + 0.4;

      float distanceFromPlayer = length(vPlayerPosition - worldPosition);

      vec3 sway = 0.1 * vec3(
        cos(fTime) * noise * fDistanceFromGround,
        0.0,
        0.0
      );
      
      vec3 vNormal = normalize(
        vPlayerPosition - worldPosition
      );
      vNormal.y = abs(vNormal.y);

      float fOffset = fPlayerColliderRadius - distanceFromPlayer;
      vec3 vPlayerOffset = -(vNormal * fOffset);

      worldPosition += mix(
        sway * min(1.0, distanceFromPlayer / 4.0),
        vPlayerOffset,
        float(distanceFromPlayer < fPlayerColliderRadius)
      );

      gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
    }
  `;

  fragmentShader = `
    varying float fDistanceFromGround;
    varying vec3 vInstanceColor;
  
    void main() {
      vec3 colorDarkest = vec3(
        24.0 / 255.0,
        30.0 / 255.0,
        41.0 / 255.0
      );
      vec3 colorBrightest = vec3(
        88.0 / 255.0,
        176.0 / 255.0,
        110.0 / 255.0
      );
      vec3 color = mix(
        colorDarkest,
        colorBrightest,
        fDistanceFromGround / 2.0
      );

      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, 1.);
    }
  `;
  
  constructor(props) {
    super(props);
  }
}

const createGrassPatch = async (position, rotation, scale) => {
  if (!grassStuff) {
    const gltf = await (new THREE.GLTFLoader().loadAsync(assets.grassModel));
    
    grassStuff = {
      clock: new THREE.Clock(),
      mesh: new THREE.InstancedMesh(
        gltf.scene.children[0].geometry.clone(),
        new GrassMaterial({
          side: THREE.DoubleSide
        }),
        GRASS_COUNT
      ),
      instances: [],
      update: () => {
        grassStuff.instances.forEach((grass, index) => {
          grass.updateMatrix();
          
          grassStuff.mesh.setMatrixAt(index, grass.matrix);
        });

        grassStuff.mesh.instanceMatrix.needsUpdate = true;
			  grassStuff.mesh.computeBoundingSphere();
        
        grassStuff.mesh.material.uniforms.fTime.value = grassStuff.clock.getElapsedTime();

        requestAnimationFrame(grassStuff.update);
      }
    };

    scene.add(grassStuff.mesh);
    grassStuff.mesh.position.y = -2.0;
    
    grassStuff.update();
    
    const empty = new THREE.Object3D();
    empty.scale.setScalar(0.0);
    empty.updateMatrix();

    for (let i = 0; i < grassStuff.mesh.count; i++) {
      grassStuff.mesh.setMatrixAt(i, empty.matrix);
      grassStuff.mesh.setColorAt(i, new THREE.Color(Math.random() * 0xffffff));
    }
    
    grassStuff.mesh.instanceColor.needsUpdate = true;
    grassStuff.mesh.instanceMatrix.needsUpdate = true; 
    grassStuff.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  }
  
  const grass = new THREE.Object3D();
  grass.position.copy(position);
  grass.rotation.copy(rotation);
  grass.scale.copy(scale);
  grass.visible = false;
  
  grassStuff.instances.push(grass);
};

const createPlayer = () => {
  const player = new THREE.Group();
  
  new THREE.GLTFLoader().load(assets.pokeballModel, gltf => {
    gltf.scene.scale.setScalar(0.25);
    player.add(gltf.scene);
  });
  
  setInterval(() => {
    raycaster.setFromCamera(pointer, camera);
    
    const hits = raycaster.intersectObject(ground, true);
    
    if (!hits.length) {
      return;
    }
    
    const target = new THREE.Vector3().copy(hits[0].point);
    target.y += 1.0;
    
    const oldPosition = player.position.clone();
    
    player.position.lerp(target, 0.1);
    
    const deltaX = oldPosition.x - player.position.x;
    const deltaZ = oldPosition.z - player.position.z;
    
    player.rotation.z += deltaX;
    player.rotation.x -= deltaZ;
    
    if (grassStuff) {
      grassStuff.mesh.material.uniforms.vPlayerPosition.value.copy(player.position);
    }
  }, 1000 / 60);
  
  scene.add(player);
};

const createWorld = async () => {
  ground = new THREE.Mesh(
    new THREE.CylinderGeometry(25.0, 25.0, 0.01, 64),
    new THREE.MeshStandardMaterial({
      map: assets.debugFloor,
    })
  );
  ground.position.y = -2.0;
  ground.receiveShadow = true;
  
  lightPrimary = new THREE.PointLight(0xffffff, 1.0, 10.0);
  lightPrimary.position.set(2.0, 2.0, 2.0);
  lightPrimary.castShadow = true;
  
  lightSecondary = new THREE.PointLight(0x8888ff, 1.0, 10.0);
  lightSecondary.position.set(-2.0, 2.0, -2.0);
  lightSecondary.castShadow = true;

  scene.add(ground);
  scene.add(lightPrimary);
  scene.add(lightSecondary);
  
  createPlayer();
  
  for (let i = 0; i < GRASS_COUNT; i++) {
    await createGrassPatch(
      new THREE.Vector3().randomDirection()
        .multiply(new THREE.Vector3(
          1.0,
          0.0,
          1.0
        ))
        .multiplyScalar(10.0),
      new THREE.Euler(
        0.0,
        Math.random() * Math.PI * 2.0,
        0.0,
      ),
      new THREE.Vector3().setScalar(Math.random() * 0.25 + 0.25),
    );
  }
};

const init = () => {
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000.0);
  camera.position.set(-5, 5, 7);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);
  
  new THREE.TextureLoader().load(assets.background, texture => {
    texture.mapping = THREE.EquirectangularRefractionMapping;
    texture.encoding = THREE.LinearEncoding;
    scene.background = texture;
  });
  
  new THREE.RGBELoader().load(assets.environment, texture => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
  });

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  
  pointer = new THREE.Vector2(0.0, 0.0);
  raycaster = new THREE.Raycaster();
  
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  window.addEventListener('pointermove', event => {
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  });
  
  window.addEventListener('pointerdown', event => {
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  });

  document.body.appendChild(renderer.domElement);
  
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  
  createWorld();
}

const animate = () => {
  requestAnimationFrame(animate);
  
  controls.update();

  renderer.render(scene, camera); 
}

assets = {
  debugFloor: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/9f120108-34f1-4c8e-8340-42ab82b1110c.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    texture.repeat.setScalar(4.0);
  }),
  debugWall: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/5cf2cf39-d43a-4d47-a1d4-6c2e04bf6805.png'),
  debugGreen: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/9a69fcdb-e1b0-4b1a-9869-2688080a6ef7.png'),
  debugOrange: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/6897a0b3-265f-4131-90f4-cba63ffe15c2.png'),
  debugRed: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/0a6c4374-d249-41a7-aa46-e96ca643a100.png'),
  debugPurple: new THREE.TextureLoader().load('//cdn.wtlstudio.com/sample.wtlstudio.com/00cc7870-9fb6-4a0c-8aaf-72b5fa9d92fb.png'),
  grassModel: '//cdn.wtlstudio.com/sample.wtlstudio.com/a776537a-3038-4cd0-a90a-dab044a3f7ec.glb',
  pokeballModel: '//cdn.wtlstudio.com/sample.wtlstudio.com/1e6b7047-1626-4eb6-8344-ce513ec2769f.glb',
  background: '//cdn.wtlstudio.com/sample.wtlstudio.com/2b211464-b704-4060-a50c-126fc53a8f27.jpg',
  environment: '//cdn.wtlstudio.com/sample.wtlstudio.com/8e560393-27e2-4092-acb1-a33b17b6a113.hdr'
};

init();
animate();
