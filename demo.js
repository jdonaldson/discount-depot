// Discount Depot - TABS Character Demo
class RagdollDemo {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.world = null;
        this.ragdoll = null;
        this.mouse = { x: 0, y: 0 };
        this.raycaster = new THREE.Raycaster();
        this.isDragging = false;
        this.dragConstraint = null;
        this.dragBody = null;
        this.isWalking = false;
        this.walkStartTime = 0;
        this.walkDuration = 3000; // 3 seconds
        
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
        
        // Setup physics world
        this.setupPhysics();
        
        // Create ground
        this.createGround();
        
        // Create ragdoll character
        this.createRagdoll();
        
        // Setup controls (disabled for character interaction)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enabled = false; // Keep camera fixed
        
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
    
    setupPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -20, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        this.world.defaultContactMaterial.friction = 0.4;
        this.world.defaultContactMaterial.restitution = 0.3;
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
        
        // Physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.add(groundBody);
    }
    
    createRagdoll() {
        this.ragdoll = {
            bodies: {},
            meshes: {},
            constraints: []
        };
        
        // Body part configurations (TABS-style proportions)
        const bodyParts = {
            head: { size: [0.6, 0.6, 0.6], pos: [0, 7, 0], color: 0xFFDBB3 },
            torso: { size: [1.2, 1.8, 0.8], pos: [0, 5, 0], color: 0x4169E1 },
            pelvis: { size: [1.0, 0.6, 0.8], pos: [0, 3, 0], color: 0x2F4F4F },
            leftUpperArm: { size: [0.3, 1.0, 0.3], pos: [-1.0, 5.5, 0], color: 0xFFDBB3 },
            rightUpperArm: { size: [0.3, 1.0, 0.3], pos: [1.0, 5.5, 0], color: 0xFFDBB3 },
            leftForearm: { size: [0.25, 0.8, 0.25], pos: [-1.0, 4, 0], color: 0xFFDBB3 },
            rightForearm: { size: [0.25, 0.8, 0.25], pos: [1.0, 4, 0], color: 0xFFDBB3 },
            leftThigh: { size: [0.4, 1.2, 0.4], pos: [-0.4, 1.5, 0], color: 0x8B4513 },
            rightThigh: { size: [0.4, 1.2, 0.4], pos: [0.4, 1.5, 0], color: 0x8B4513 },
            leftShin: { size: [0.3, 1.0, 0.3], pos: [-0.4, 0.2, 0], color: 0xFFDBB3 },
            rightShin: { size: [0.3, 1.0, 0.3], pos: [0.4, 0.2, 0], color: 0xFFDBB3 }
        };
        
        // Create body parts
        Object.keys(bodyParts).forEach(partName => {
            this.createBodyPart(partName, bodyParts[partName]);
        });
        
        // Create joints/constraints
        this.createJoints();
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
        this.scene.add(mesh);
        
        // Create physics body
        const shape = new CANNON.Box(new CANNON.Vec3(
            config.size[0] / 2, 
            config.size[1] / 2, 
            config.size[2] / 2
        ));
        const body = new CANNON.Body({ mass: name === 'head' ? 2 : 5 });
        body.addShape(shape);
        body.position.set(...config.pos);
        body.material = new CANNON.Material();
        body.material.friction = 0.3;
        body.material.restitution = 0.2;
        this.world.add(body);
        
        // Store references
        this.ragdoll.bodies[name] = body;
        this.ragdoll.meshes[name] = mesh;
        
        // Add some initial random motion for fun
        body.velocity.set(
            (Math.random() - 0.5) * 2,
            Math.random() * 2,
            (Math.random() - 0.5) * 2
        );
    }
    
    createJoints() {
        const joints = [
            // Spine
            { bodyA: 'head', bodyB: 'torso', pivotA: [0, -0.3, 0], pivotB: [0, 0.9, 0] },
            { bodyA: 'torso', bodyB: 'pelvis', pivotA: [0, -0.9, 0], pivotB: [0, 0.3, 0] },
            
            // Arms
            { bodyA: 'torso', bodyB: 'leftUpperArm', pivotA: [-0.6, 0.5, 0], pivotB: [0, 0.5, 0] },
            { bodyA: 'torso', bodyB: 'rightUpperArm', pivotA: [0.6, 0.5, 0], pivotB: [0, 0.5, 0] },
            { bodyA: 'leftUpperArm', bodyB: 'leftForearm', pivotA: [0, -0.5, 0], pivotB: [0, 0.4, 0] },
            { bodyA: 'rightUpperArm', bodyB: 'rightForearm', pivotA: [0, -0.5, 0], pivotB: [0, 0.4, 0] },
            
            // Legs
            { bodyA: 'pelvis', bodyB: 'leftThigh', pivotA: [-0.4, -0.3, 0], pivotB: [0, 0.6, 0] },
            { bodyA: 'pelvis', bodyB: 'rightThigh', pivotA: [0.4, -0.3, 0], pivotB: [0, 0.6, 0] },
            { bodyA: 'leftThigh', bodyB: 'leftShin', pivotA: [0, -0.6, 0], pivotB: [0, 0.5, 0] },
            { bodyA: 'rightThigh', bodyB: 'rightShin', pivotA: [0, -0.6, 0], pivotB: [0, 0.5, 0] }
        ];
        
        joints.forEach(joint => {
            const constraint = new CANNON.PointToPointConstraint(
                this.ragdoll.bodies[joint.bodyA],
                new CANNON.Vec3(...joint.pivotA),
                this.ragdoll.bodies[joint.bodyB],
                new CANNON.Vec3(...joint.pivotB)
            );
            this.world.addConstraint(constraint);
            this.ragdoll.constraints.push(constraint);
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
        const meshes = Object.values(this.ragdoll.meshes);
        const intersects = this.raycaster.intersectObjects(meshes);
        
        if (intersects.length > 0) {
            this.isDragging = true;
            
            // Find the corresponding physics body
            const clickedMesh = intersects[0].object;
            for (let partName in this.ragdoll.meshes) {
                if (this.ragdoll.meshes[partName] === clickedMesh) {
                    this.dragBody = this.ragdoll.bodies[partName];
                    break;
                }
            }
            
            if (this.dragBody) {
                // Create a constraint to drag the body
                const worldPoint = intersects[0].point;
                this.dragConstraint = new CANNON.PointToPointConstraint(
                    this.dragBody,
                    new CANNON.Vec3(0, 0, 0),
                    new CANNON.Body({ mass: 0 }),
                    new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z)
                );
                this.world.addConstraint(this.dragConstraint);
            }
        }
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        if (this.isDragging && this.dragConstraint && this.dragBody) {
            // Update drag constraint position
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Create a plane perpendicular to the camera at the current body position
            const bodyPos = this.dragBody.position;
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            const plane = new THREE.Plane(cameraDirection, -cameraDirection.dot(bodyPos));
            
            const intersection = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(plane, intersection)) {
                this.dragConstraint.pivotB.set(intersection.x, intersection.y, intersection.z);
            }
        }
    }
    
    onMouseUp(event) {
        if (this.isDragging) {
            this.isDragging = false;
            
            if (this.dragConstraint) {
                this.world.removeConstraint(this.dragConstraint);
                this.dragConstraint = null;
                this.dragBody = null;
            }
            
            // Start walking when mouse is released
            this.startWalking();
        }
    }
    
    startWalking() {
        this.isWalking = true;
        this.walkStartTime = Date.now();
        console.log('Character started walking!');
    }
    
    stopWalking() {
        this.isWalking = false;
        console.log('Character stopped walking');
    }
    
    updateWalking() {
        if (!this.isWalking) return;
        
        // Check if walking time is up
        const currentTime = Date.now();
        if (currentTime - this.walkStartTime > this.walkDuration) {
            this.stopWalking();
            return;
        }
        
        // Simple walking animation - apply forces to legs alternately
        const walkTime = (currentTime - this.walkStartTime) / 1000; // in seconds
        const walkSpeed = 2; // steps per second
        const stepPhase = Math.sin(walkTime * walkSpeed * Math.PI);
        
        // Get leg bodies
        const leftThigh = this.ragdoll.bodies.leftThigh;
        const rightThigh = this.ragdoll.bodies.rightThigh;
        const leftShin = this.ragdoll.bodies.leftShin;
        const rightShin = this.ragdoll.bodies.rightShin;
        const torso = this.ragdoll.bodies.torso;
        
        // Apply forward force to torso
        torso.velocity.x += 0.2;
        
        // Alternating leg movement
        const legForce = 15;
        const liftForce = 8;
        
        if (stepPhase > 0) {
            // Left leg forward, right leg back
            leftThigh.applyImpulse(new CANNON.Vec3(legForce, liftForce, 0), new CANNON.Vec3(0, 0, 0));
            leftShin.applyImpulse(new CANNON.Vec3(legForce * 0.5, 0, 0), new CANNON.Vec3(0, 0, 0));
            
            rightThigh.applyImpulse(new CANNON.Vec3(-legForce * 0.3, 0, 0), new CANNON.Vec3(0, 0, 0));
        } else {
            // Right leg forward, left leg back
            rightThigh.applyImpulse(new CANNON.Vec3(legForce, liftForce, 0), new CANNON.Vec3(0, 0, 0));
            rightShin.applyImpulse(new CANNON.Vec3(legForce * 0.5, 0, 0), new CANNON.Vec3(0, 0, 0));
            
            leftThigh.applyImpulse(new CANNON.Vec3(-legForce * 0.3, 0, 0), new CANNON.Vec3(0, 0, 0));
        }
        
        // Keep torso somewhat upright
        const torsoRotation = torso.quaternion;
        const uprightForce = new CANNON.Vec3(0, 0, -torsoRotation.x * 50);
        torso.torque.vadd(uprightForce, torso.torque);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update walking behavior
        this.updateWalking();
        
        // Step physics
        this.world.step(1/60);
        
        // Update visual meshes to match physics bodies
        Object.keys(this.ragdoll.bodies).forEach(partName => {
            const body = this.ragdoll.bodies[partName];
            const mesh = this.ragdoll.meshes[partName];
            
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
        });
        
        // Update controls
        this.controls.update();
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the demo when the page loads
window.addEventListener('load', () => {
    new RagdollDemo();
});