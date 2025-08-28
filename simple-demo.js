// Discount Depot - Simple TABS Character Demo (No external physics)
class SimpleRagdollDemo {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.ragdoll = null;
        this.mouse = { x: 0, y: 0 };
        this.raycaster = new THREE.Raycaster();
        this.isDragging = false;
        this.draggedPart = null;
        this.dragOffset = new THREE.Vector3();
        
        this.init();
        this.animate();
    }
    
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x87CEEB, 10, 50);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 5, 10);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        
        // Add lights
        this.setupLighting();
        
        // Create ground
        this.createGround();
        
        // Create ragdoll character
        this.createRagdoll();
        
        // Setup controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);
    }
    
    createGround() {
        // Visual ground
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x90EE90,
            transparent: true,
            opacity: 0.8
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    createRagdoll() {
        this.ragdoll = {
            parts: {},
            velocities: {},
            constraints: []
        };
        
        // Body part configurations (TABS-style proportions)
        const bodyParts = {
            head: { size: [0.6, 0.6, 0.6], pos: [0, 7, 0], color: 0xFFDBB3, mass: 1 },
            torso: { size: [1.2, 1.8, 0.8], pos: [0, 5, 0], color: 0x4169E1, mass: 3 },
            pelvis: { size: [1.0, 0.6, 0.8], pos: [0, 3, 0], color: 0x2F4F4F, mass: 2 },
            leftUpperArm: { size: [0.3, 1.0, 0.3], pos: [-1.0, 5.5, 0], color: 0xFFDBB3, mass: 0.5 },
            rightUpperArm: { size: [0.3, 1.0, 0.3], pos: [1.0, 5.5, 0], color: 0xFFDBB3, mass: 0.5 },
            leftForearm: { size: [0.25, 0.8, 0.25], pos: [-1.0, 4, 0], color: 0xFFDBB3, mass: 0.3 },
            rightForearm: { size: [0.25, 0.8, 0.25], pos: [1.0, 4, 0], color: 0xFFDBB3, mass: 0.3 },
            leftThigh: { size: [0.4, 1.2, 0.4], pos: [-0.4, 1.5, 0], color: 0x8B4513, mass: 1 },
            rightThigh: { size: [0.4, 1.2, 0.4], pos: [0.4, 1.5, 0], color: 0x8B4513, mass: 1 },
            leftShin: { size: [0.3, 1.0, 0.3], pos: [-0.4, 0.2, 0], color: 0xFFDBB3, mass: 0.5 },
            rightShin: { size: [0.3, 1.0, 0.3], pos: [0.4, 0.2, 0], color: 0xFFDBB3, mass: 0.5 }
        };
        
        // Create body parts
        Object.keys(bodyParts).forEach(partName => {
            this.createBodyPart(partName, bodyParts[partName]);
        });
        
        // Create constraints (joints)
        this.createConstraints();
        
        // Add some initial wobble
        this.addInitialMotion();
    }
    
    createBodyPart(name, config) {
        // Create visual mesh
        const geometry = new THREE.BoxGeometry(...config.size);
        const material = new THREE.MeshLambertMaterial({ 
            color: config.color,
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...config.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.partName = name;
        this.scene.add(mesh);
        
        // Store references
        this.ragdoll.parts[name] = {
            mesh: mesh,
            mass: config.mass,
            restPosition: new THREE.Vector3(...config.pos)
        };
        
        // Initialize velocity
        this.ragdoll.velocities[name] = new THREE.Vector3(0, 0, 0);
    }
    
    createConstraints() {
        // Define joint connections with rest distances
        this.ragdoll.constraints = [
            // Spine
            { partA: 'head', partB: 'torso', restLength: 1.2, strength: 0.8 },
            { partA: 'torso', partB: 'pelvis', restLength: 1.5, strength: 0.9 },
            
            // Arms
            { partA: 'torso', partB: 'leftUpperArm', restLength: 1.0, strength: 0.7 },
            { partA: 'torso', partB: 'rightUpperArm', restLength: 1.0, strength: 0.7 },
            { partA: 'leftUpperArm', partB: 'leftForearm', restLength: 1.0, strength: 0.6 },
            { partA: 'rightUpperArm', partB: 'rightForearm', restLength: 1.0, strength: 0.6 },
            
            // Legs
            { partA: 'pelvis', partB: 'leftThigh', restLength: 1.0, strength: 0.8 },
            { partA: 'pelvis', partB: 'rightThigh', restLength: 1.0, strength: 0.8 },
            { partA: 'leftThigh', partB: 'leftShin', restLength: 1.2, strength: 0.7 },
            { partA: 'rightThigh', partB: 'rightShin', restLength: 1.2, strength: 0.7 }
        ];
    }
    
    addInitialMotion() {
        // Add some random initial velocities
        Object.keys(this.ragdoll.velocities).forEach(partName => {
            this.ragdoll.velocities[partName].set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.5
            );
        });
    }
    
    setupEventListeners() {
        this.renderer.domElement.addEventListener('mousedown', (event) => this.onMouseDown(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));
        this.renderer.domElement.addEventListener('mouseup', (event) => this.onMouseUp(event));
    }
    
    onMouseDown(event) {
        if (event.button !== 0) return; // Only left click
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Check for intersections with ragdoll parts
        const meshes = Object.values(this.ragdoll.parts).map(part => part.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);
        
        if (intersects.length > 0) {
            this.isDragging = true;
            this.controls.enabled = false;
            
            const clickedMesh = intersects[0].object;
            this.draggedPart = clickedMesh.userData.partName;
            
            // Calculate offset from mesh center to click point
            this.dragOffset.copy(intersects[0].point).sub(clickedMesh.position);
        }
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        if (this.isDragging && this.draggedPart) {
            // Cast ray and find intersection with an invisible plane
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Create a plane perpendicular to camera at the dragged part's z position
            const partPos = this.ragdoll.parts[this.draggedPart].mesh.position;
            const plane = new THREE.Plane();
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            plane.setFromNormalAndCoplanarPoint(cameraDirection, partPos);
            
            const intersection = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, intersection);
            
            if (intersection) {
                // Move the part to the intersection point minus the offset
                const targetPos = intersection.sub(this.dragOffset);
                this.ragdoll.parts[this.draggedPart].mesh.position.copy(targetPos);
                
                // Add some velocity based on movement
                const currentVel = this.ragdoll.velocities[this.draggedPart];
                currentVel.multiplyScalar(0.9); // Damping
            }
        }
    }
    
    onMouseUp(event) {
        this.isDragging = false;
        this.controls.enabled = true;
        this.draggedPart = null;
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    updatePhysics(deltaTime) {
        const gravity = -9.8;
        const damping = 0.98;
        const groundY = 0;
        
        // Apply gravity and update positions
        Object.keys(this.ragdoll.parts).forEach(partName => {
            if (partName === this.draggedPart) return; // Skip dragged part
            
            const part = this.ragdoll.parts[partName];
            const velocity = this.ragdoll.velocities[partName];
            
            // Apply gravity
            velocity.y += gravity * deltaTime * part.mass * 0.1;
            
            // Apply damping
            velocity.multiplyScalar(damping);
            
            // Update position
            const newPos = part.mesh.position.clone().add(velocity.clone().multiplyScalar(deltaTime));
            
            // Ground collision
            const partBottom = newPos.y - part.mesh.geometry.parameters.height / 2;
            if (partBottom < groundY) {
                newPos.y = groundY + part.mesh.geometry.parameters.height / 2;
                velocity.y = Math.abs(velocity.y) * 0.3; // Bounce
                velocity.x *= 0.8; // Friction
                velocity.z *= 0.8;
            }
            
            part.mesh.position.copy(newPos);
        });
        
        // Apply constraints (joint physics)
        this.ragdoll.constraints.forEach(constraint => {
            const partA = this.ragdoll.parts[constraint.partA];
            const partB = this.ragdoll.parts[constraint.partB];
            
            if (!partA || !partB) return;
            
            const posA = partA.mesh.position;
            const posB = partB.mesh.position;
            
            const distance = posA.distanceTo(posB);
            const difference = distance - constraint.restLength;
            
            if (Math.abs(difference) > 0.01) {
                const direction = posB.clone().sub(posA).normalize();
                const correction = direction.multiplyScalar(difference * constraint.strength * 0.5);
                
                // Apply correction based on mass ratios
                const totalMass = partA.mass + partB.mass;
                const ratioA = partB.mass / totalMass;
                const ratioB = partA.mass / totalMass;
                
                if (constraint.partA !== this.draggedPart) {
                    posA.add(correction.clone().multiplyScalar(ratioA));
                }
                if (constraint.partB !== this.draggedPart) {
                    posB.sub(correction.clone().multiplyScalar(ratioB));
                }
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const deltaTime = 1/60; // Fixed timestep
        
        // Update physics
        this.updatePhysics(deltaTime);
        
        // Update controls
        this.controls.update();
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the demo when the page loads
window.addEventListener('load', () => {
    new SimpleRagdollDemo();
});