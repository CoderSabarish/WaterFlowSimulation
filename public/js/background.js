// ============================================================
// background.js — Three.js Animated Water Particle Background
// ============================================================
// Creates a beautiful, performance-optimized particle system
// that simulates flowing water / underwater ambience.
// Uses BufferGeometry for GPU-efficient rendering.
// Automatically pauses when the browser tab is hidden.
// ============================================================

(function () {
  'use strict';

  // --- Configuration ---
  const PARTICLE_COUNT = 600;       // Number of particles (lower = better performance)
  const PARTICLE_SIZE = 2.5;        // Size of each particle
  const SPREAD_X = 60;              // Horizontal spread
  const SPREAD_Y = 40;              // Vertical spread
  const SPREAD_Z = 30;              // Depth spread
  const WAVE_SPEED = 0.0003;        // Speed of the wave motion
  const DRIFT_SPEED = 0.15;         // Horizontal drift speed

  // Check if Three.js is available
  if (typeof THREE === 'undefined') {
    console.warn('⚠️ Three.js not loaded — background animation disabled');
    return;
  }

  // --- Create Canvas Element ---
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) {
    console.warn('⚠️ No #bg-canvas element found');
    return;
  }

  // --- Three.js Setup ---
  // Scene: the 3D world
  const scene = new THREE.Scene();

  // Camera: how we view the scene
  const camera = new THREE.PerspectiveCamera(
    60,                                          // Field of view (degrees)
    window.innerWidth / window.innerHeight,      // Aspect ratio
    0.1,                                         // Near clipping plane
    100                                          // Far clipping plane
  );
  camera.position.z = 30;

  // Renderer: draws the scene to the canvas
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,                     // Transparent background
    antialias: false,                // Disable for performance
    powerPreference: 'low-power'     // Use integrated GPU if available
  });

  // Cap pixel ratio at 2 for performance on high-DPI screens
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // --- Create Particles ---
  // Using BufferGeometry for maximum GPU performance
  const geometry = new THREE.BufferGeometry();

  // Position array: x, y, z for each particle
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  // Custom attribute: stores initial positions for wave calculation
  const initPositions = new Float32Array(PARTICLE_COUNT * 3);
  // Size variation for each particle
  const sizes = new Float32Array(PARTICLE_COUNT);
  // Opacity variation
  const opacities = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;

    // Random starting positions
    positions[i3] = (Math.random() - 0.5) * SPREAD_X;        // x
    positions[i3 + 1] = (Math.random() - 0.5) * SPREAD_Y;    // y
    positions[i3 + 2] = (Math.random() - 0.5) * SPREAD_Z;    // z

    // Save initial positions
    initPositions[i3] = positions[i3];
    initPositions[i3 + 1] = positions[i3 + 1];
    initPositions[i3 + 2] = positions[i3 + 2];

    // Random size variation (0.5x to 1.5x)
    sizes[i] = PARTICLE_SIZE * (0.5 + Math.random());

    // Random opacity (0.2 to 0.8)
    opacities[i] = 0.2 + Math.random() * 0.6;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  // --- Particle Material ---
  // Custom shader material for glowing, round particles
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,  // Glow effect when particles overlap

    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0x00d4ff) },  // Neon cyan
      uColor2: { value: new THREE.Color(0x0055cc) },  // Deep blue
      uPixelRatio: { value: renderer.getPixelRatio() }
    },

    // Vertex shader: positions particles and sets size
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vOpacity;
      
      void main() {
        vec3 pos = position;
        
        // Wave motion: particles bob up and down in a sine wave
        pos.y += sin(pos.x * 0.15 + uTime * 0.5) * 1.5;
        pos.y += cos(pos.z * 0.2 + uTime * 0.3) * 1.0;
        
        // Gentle horizontal drift
        pos.x += sin(uTime * 0.2 + pos.y * 0.1) * 0.5;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Size attenuation (particles shrink with distance)
        gl_PointSize = aSize * uPixelRatio * (8.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        
        // Pass opacity based on depth (farther = more transparent)
        vOpacity = smoothstep(-20.0, 5.0, mvPosition.z) * 0.6;
      }
    `,

    // Fragment shader: draws circular, glowing particles
    fragmentShader: `
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform float uTime;
      varying float vOpacity;
      
      void main() {
        // Create circular particle shape
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        
        // Discard pixels outside the circle
        if (dist > 0.5) discard;
        
        // Soft glow falloff
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        alpha *= vOpacity;
        
        // Mix between two colors based on time
        float colorMix = sin(uTime * 0.3) * 0.5 + 0.5;
        vec3 color = mix(uColor1, uColor2, colorMix);
        
        gl_FragColor = vec4(color, alpha * 0.7);
      }
    `
  });

  // Create the particle system and add to scene
  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // --- Add a second, larger particle layer for depth ---
  const geometry2 = new THREE.BufferGeometry();
  const positions2 = new Float32Array(200 * 3);
  const sizes2 = new Float32Array(200);

  for (let i = 0; i < 200; i++) {
    const i3 = i * 3;
    positions2[i3] = (Math.random() - 0.5) * SPREAD_X * 1.5;
    positions2[i3 + 1] = (Math.random() - 0.5) * SPREAD_Y * 1.5;
    positions2[i3 + 2] = (Math.random() - 0.5) * SPREAD_Z * 2;
    sizes2[i] = PARTICLE_SIZE * (1.5 + Math.random() * 2);
  }

  geometry2.setAttribute('position', new THREE.BufferAttribute(positions2, 3));
  geometry2.setAttribute('aSize', new THREE.BufferAttribute(sizes2, 1));

  const material2 = material.clone();
  material2.uniforms.uColor1 = { value: new THREE.Color(0x003366) };
  material2.uniforms.uColor2 = { value: new THREE.Color(0x001133) };

  const bgParticles = new THREE.Points(geometry2, material2);
  scene.add(bgParticles);

  // --- Animation Loop ---
  let animationId;
  let isVisible = true;
  const clock = new THREE.Clock();

  function animate() {
    if (!isVisible) return;

    animationId = requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();

    // Update time uniform for shaders
    material.uniforms.uTime.value = elapsed;
    material2.uniforms.uTime.value = elapsed;

    // Slowly drift all particles to the right (water flow effect)
    const posArray = geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Drift horizontally
      posArray[i3] += DRIFT_SPEED * 0.016;  // ~1 pixel per frame at 60fps

      // Wrap around when off-screen
      if (posArray[i3] > SPREAD_X / 2) {
        posArray[i3] = -SPREAD_X / 2;
      }
    }
    geometry.attributes.position.needsUpdate = true;

    // Slow rotation for depth perception
    particles.rotation.y = Math.sin(elapsed * 0.05) * 0.1;
    bgParticles.rotation.y = Math.sin(elapsed * 0.03) * 0.05;

    renderer.render(scene, camera);
  }

  // --- Start the animation ---
  animate();

  // --- Pause/Resume when tab visibility changes ---
  // Saves CPU/GPU when the user switches tabs
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isVisible = false;
      cancelAnimationFrame(animationId);
      clock.stop();
    } else {
      isVisible = true;
      clock.start();
      animate();
    }
  });

  // --- Handle window resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  console.log('🌊 Background animation initialized');
})();
