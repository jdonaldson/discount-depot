// Neural Network Controller for Ragdoll Standing
class NeuralController {
    constructor(ragdoll, world) {
        this.ragdoll = ragdoll;
        this.world = world;
        this.network = null;
        this.targetStandingHeight = 6.5; // Target height for torso to be considered "standing"
        this.episode = 0;
        this.stepCount = 0;
        this.maxSteps = 1000;
        this.isTraining = true;
        
        // Neural network architecture - deeper network
        this.inputSize = 33; // 11 body parts * 3 (position + velocity + angular velocity)
        this.hidden1Size = 128;
        this.hidden2Size = 64;
        this.outputSize = 10; // 10 controllable joints (excluding head-neck)
        
        // Initialize neural network
        this.initializeNetwork();
        
        // Replace rigid constraints with controllable joints
        this.setupControllableJoints();
        
        // Training parameters
        this.learningRate = 0.01;
        this.epsilon = 0.3; // For epsilon-greedy exploration
        this.gamma = 0.99; // Discount factor
        this.replayBuffer = [];
        this.maxBufferSize = 10000;
        this.batchSize = 64;
        this.bestReward = -Infinity;
        this.bestNetwork = null;
        
        // Tracking for time-based rewards
        this.timeUpright = 0;
        this.consecutiveUprightSteps = 0;
        this.maxConsecutiveUpright = 0;
        
        // Visualization setup
        this.setupVisualization();
    }
    
    initializeNetwork() {
        // Deeper feedforward neural network with Xavier initialization
        this.network = {
            // Input to first hidden layer
            weightsIH1: this.initializeWeights(this.inputSize, this.hidden1Size),
            biasesH1: new Array(this.hidden1Size).fill(0),
            
            // First hidden to second hidden layer
            weightsH1H2: this.initializeWeights(this.hidden1Size, this.hidden2Size),
            biasesH2: new Array(this.hidden2Size).fill(0),
            
            // Second hidden to output layer
            weightsH2O: this.initializeWeights(this.hidden2Size, this.outputSize),
            biasesO: new Array(this.outputSize).fill(0),
        };
    }
    
    initializeWeights(inputSize, outputSize) {
        const weights = [];
        const limit = Math.sqrt(6 / (inputSize + outputSize)); // Xavier initialization
        
        for (let i = 0; i < inputSize; i++) {
            weights[i] = [];
            for (let j = 0; j < outputSize; j++) {
                weights[i][j] = (Math.random() * 2 - 1) * limit;
            }
        }
        return weights;
    }
    
    setupControllableJoints() {
        // Don't remove the existing constraints - work with them
        // The original constraints provide the structural stability we need
        
        // Simple joint mapping for torque application
        this.joints = {
            'neck': { bodyA: this.ragdoll.bodies.head, bodyB: this.ragdoll.bodies.torso, axis: new CANNON.Vec3(1, 0, 0) },
            'spine': { bodyA: this.ragdoll.bodies.torso, bodyB: this.ragdoll.bodies.pelvis, axis: new CANNON.Vec3(1, 0, 0) },
            'leftShoulder': { bodyA: this.ragdoll.bodies.torso, bodyB: this.ragdoll.bodies.leftUpperArm, axis: new CANNON.Vec3(0, 0, 1) },
            'rightShoulder': { bodyA: this.ragdoll.bodies.torso, bodyB: this.ragdoll.bodies.rightUpperArm, axis: new CANNON.Vec3(0, 0, -1) },
            'leftElbow': { bodyA: this.ragdoll.bodies.leftUpperArm, bodyB: this.ragdoll.bodies.leftForearm, axis: new CANNON.Vec3(0, 0, 1) },
            'rightElbow': { bodyA: this.ragdoll.bodies.rightUpperArm, bodyB: this.ragdoll.bodies.rightForearm, axis: new CANNON.Vec3(0, 0, -1) },
            'leftHip': { bodyA: this.ragdoll.bodies.pelvis, bodyB: this.ragdoll.bodies.leftThigh, axis: new CANNON.Vec3(1, 0, 0) },
            'rightHip': { bodyA: this.ragdoll.bodies.pelvis, bodyB: this.ragdoll.bodies.rightThigh, axis: new CANNON.Vec3(1, 0, 0) },
            'leftKnee': { bodyA: this.ragdoll.bodies.leftThigh, bodyB: this.ragdoll.bodies.leftShin, axis: new CANNON.Vec3(1, 0, 0) },
            'rightKnee': { bodyA: this.ragdoll.bodies.rightThigh, bodyB: this.ragdoll.bodies.rightShin, axis: new CANNON.Vec3(1, 0, 0) }
        };
        
        this.controllableJoints = Object.keys(this.joints);
    }
    
    setupVisualization() {
        // Setup neural network visualization canvas
        this.vizCanvas = document.getElementById('neural-viz');
        this.vizCtx = this.vizCanvas.getContext('2d');
        this.vizCanvas.width = 500;
        this.vizCanvas.height = 300;
        
        // Store current activations for visualization
        this.lastInputs = new Array(this.inputSize).fill(0);
        this.lastHidden1Activations = new Array(this.hidden1Size).fill(0);
        this.lastHidden2Activations = new Array(this.hidden2Size).fill(0);
        this.lastOutputs = new Array(this.outputSize).fill(0);
    }
    
    visualizeNetwork() {
        if (!this.vizCtx) return;
        
        const ctx = this.vizCtx;
        const width = this.vizCanvas.width;
        const height = this.vizCanvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, width, height);
        
        // Layer positions for 4 layers (input, hidden1, hidden2, output)
        const inputX = 40;
        const hidden1X = width * 0.3;
        const hidden2X = width * 0.6;
        const outputX = width - 120; // More space for joint labels
        
        // Define margins and spacing
        const inputMargin = 20;
        const hidden1Margin = 20;
        const hidden2Margin = 20;
        const outputMargin = 40;
        const inputHeight = height - 2 * inputMargin;
        const hidden1Height = height - 2 * hidden1Margin;
        const hidden2Height = height - 2 * hidden2Margin;
        const outputHeight = height - 2 * outputMargin;
        
        // Draw connections (sample a few to avoid clutter)
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 0.5;
        
        // Sample input-hidden1 connections
        const inputConnCount = Math.min(8, this.inputSize);
        const hidden1ConnCount = Math.min(15, this.hidden1Size);
        const hidden2ConnCount = Math.min(12, this.hidden2Size);
        
        for (let i = 0; i < inputConnCount; i++) {
            for (let j = 0; j < hidden1ConnCount; j++) {
                const weight = this.network.weightsIH1[i] ? this.network.weightsIH1[i][j] || 0 : 0;
                const intensity = Math.abs(weight) * 0.5;
                
                ctx.strokeStyle = weight > 0 ? 
                    `rgba(0, 255, 0, ${intensity})` : 
                    `rgba(255, 0, 0, ${intensity})`;
                
                const y1 = inputMargin + (i / (inputConnCount - 1)) * inputHeight;
                const y2 = hidden1Margin + (j / (hidden1ConnCount - 1)) * hidden1Height;
                
                ctx.beginPath();
                ctx.moveTo(inputX, y1);
                ctx.lineTo(hidden1X, y2);
                ctx.stroke();
            }
        }
        
        // Sample hidden1-hidden2 connections
        for (let i = 0; i < hidden1ConnCount; i++) {
            for (let j = 0; j < hidden2ConnCount; j++) {
                const weight = this.network.weightsH1H2[i] ? this.network.weightsH1H2[i][j] || 0 : 0;
                const intensity = Math.abs(weight) * 0.3;
                
                ctx.strokeStyle = weight > 0 ? 
                    `rgba(0, 200, 0, ${intensity})` : 
                    `rgba(200, 0, 0, ${intensity})`;
                
                const y1 = hidden1Margin + (i / (hidden1ConnCount - 1)) * hidden1Height;
                const y2 = hidden2Margin + (j / (hidden2ConnCount - 1)) * hidden2Height;
                
                ctx.beginPath();
                ctx.moveTo(hidden1X, y1);
                ctx.lineTo(hidden2X, y2);
                ctx.stroke();
            }
        }
        
        // Sample hidden2-output connections
        for (let i = 0; i < hidden2ConnCount; i++) {
            for (let j = 0; j < this.outputSize; j++) {
                const weight = this.network.weightsH2O[i] ? this.network.weightsH2O[i][j] || 0 : 0;
                const intensity = Math.abs(weight) * 0.5;
                
                ctx.strokeStyle = weight > 0 ? 
                    `rgba(0, 255, 0, ${intensity})` : 
                    `rgba(255, 0, 0, ${intensity})`;
                
                const y1 = hidden2Margin + (i / (hidden2ConnCount - 1)) * hidden2Height;
                const y2 = outputMargin + (j / (this.outputSize - 1)) * outputHeight;
                
                ctx.beginPath();
                ctx.moveTo(hidden2X, y1);
                ctx.lineTo(outputX, y2);
                ctx.stroke();
            }
        }
        
        // Draw input neurons with proper spacing
        const inputCount = Math.min(20, this.inputSize);
        
        for (let i = 0; i < inputCount; i++) {
            const y = inputMargin + (i / (inputCount - 1)) * inputHeight;
            const activation = Math.abs(this.lastInputs[i] || 0);
            
            ctx.fillStyle = `rgba(0, 150, 255, ${Math.min(activation, 1)})`;
            ctx.beginPath();
            ctx.arc(inputX, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw first hidden layer neurons
        const hidden1Count = Math.min(25, this.hidden1Size);
        
        for (let i = 0; i < hidden1Count; i++) {
            const y = hidden1Margin + (i / (hidden1Count - 1)) * hidden1Height;
            const activation = Math.abs(this.lastHidden1Activations[i] || 0) * 0.1;
            
            ctx.fillStyle = `rgba(255, 255, 0, ${Math.min(activation, 1)})`;
            ctx.beginPath();
            ctx.arc(hidden1X, y, 2, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw second hidden layer neurons
        const hidden2Count = Math.min(20, this.hidden2Size);
        
        for (let i = 0; i < hidden2Count; i++) {
            const y = hidden2Margin + (i / (hidden2Count - 1)) * hidden2Height;
            const activation = Math.abs(this.lastHidden2Activations[i] || 0) * 0.1;
            
            ctx.fillStyle = `rgba(255, 150, 0, ${Math.min(activation, 1)})`;
            ctx.beginPath();
            ctx.arc(hidden2X, y, 2, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw output neurons with proper spacing
        
        for (let i = 0; i < this.outputSize; i++) {
            const y = outputMargin + (i / (this.outputSize - 1)) * outputHeight;
            const activation = Math.abs(this.lastOutputs[i] || 0);
            
            ctx.fillStyle = `rgba(255, 100, 0, ${Math.min(activation, 1)})`;
            ctx.beginPath();
            ctx.arc(outputX, y, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            // Label joints with shorter names
            ctx.fillStyle = 'white';
            ctx.font = '9px monospace';
            const shortName = (this.controllableJoints[i] || `J${i}`).replace('left', 'L').replace('right', 'R');
            ctx.fillText(shortName, outputX + 15, y + 3);
        }
        
        // Draw layer labels
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText('Input', inputX - 15, 15);
        ctx.fillText('Hidden1', hidden1X - 20, 15);
        ctx.fillText('Hidden2', hidden2X - 20, 15);
        ctx.fillText('Output', outputX - 20, 15);
    }
    
    updateStats() {
        // Update stats display
        document.getElementById('episode').textContent = this.episode;
        document.getElementById('step').textContent = this.stepCount;
        document.getElementById('reward').textContent = this.calculateReward().toFixed(2);
        document.getElementById('best-reward').textContent = this.bestReward.toFixed(2);
        document.getElementById('epsilon').textContent = this.epsilon.toFixed(3);
        document.getElementById('torso-height').textContent = this.ragdoll.bodies.torso.position.y.toFixed(2);
        document.getElementById('upright-steps').textContent = this.consecutiveUprightSteps;
        document.getElementById('max-upright').textContent = this.maxConsecutiveUpright;
    }
    
    getState() {
        const state = [];
        
        // For each body part, add position, velocity, and angular velocity
        Object.keys(this.ragdoll.bodies).forEach(partName => {
            const body = this.ragdoll.bodies[partName];
            
            // Position (normalized to range -1 to 1)
            state.push(body.position.x / 10);
            state.push(body.position.y / 10);
            state.push(body.position.z / 10);
        });
        
        return state;
    }
    
    forward(state) {
        // Store inputs for visualization
        this.lastInputs = state.slice();
        
        // Forward pass through the deeper neural network
        let activations = state.slice();
        
        // Input to first hidden layer
        const hidden1Activations = new Array(this.hidden1Size);
        for (let j = 0; j < this.hidden1Size; j++) {
            let sum = this.network.biasesH1[j];
            for (let i = 0; i < this.inputSize; i++) {
                sum += activations[i] * this.network.weightsIH1[i][j];
            }
            hidden1Activations[j] = this.relu(sum);
        }
        
        // Store first hidden activations for visualization
        this.lastHidden1Activations = hidden1Activations.slice();
        
        // First hidden to second hidden layer
        const hidden2Activations = new Array(this.hidden2Size);
        for (let j = 0; j < this.hidden2Size; j++) {
            let sum = this.network.biasesH2[j];
            for (let i = 0; i < this.hidden1Size; i++) {
                sum += hidden1Activations[i] * this.network.weightsH1H2[i][j];
            }
            hidden2Activations[j] = this.relu(sum);
        }
        
        // Store second hidden activations for visualization
        this.lastHidden2Activations = hidden2Activations.slice();
        
        // Second hidden to output layer
        const outputActivations = new Array(this.outputSize);
        for (let j = 0; j < this.outputSize; j++) {
            let sum = this.network.biasesO[j];
            for (let i = 0; i < this.hidden2Size; i++) {
                sum += hidden2Activations[i] * this.network.weightsH2O[i][j];
            }
            outputActivations[j] = this.tanh(sum); // Output range -1 to 1
        }
        
        // Store outputs for visualization
        this.lastOutputs = outputActivations.slice();
        
        return outputActivations;
    }
    
    relu(x) {
        return Math.max(0, x);
    }
    
    tanh(x) {
        return Math.tanh(x);
    }
    
    applyActions(actions) {
        // Apply neural network outputs as joint torques
        this.controllableJoints.forEach((jointName, index) => {
            if (index < actions.length && this.joints[jointName]) {
                const joint = this.joints[jointName];
                let torque = actions[index] * 15;
                
                // Skip right shoulder joint entirely - we'll handle it differently
                if (jointName === 'rightShoulder') {
                    return; // Skip this joint
                } else if (jointName === 'leftShoulder') {
                    torque += -10; // Light bias for left arm
                }
                
                const bodyA = joint.bodyA;
                const bodyB = joint.bodyB;
                
                // Apply torque to bodies
                const torqueVec = joint.axis.clone().scale(torque);
                bodyA.torque.vadd(torqueVec, bodyA.torque);
                bodyB.torque.vsub(torqueVec, bodyB.torque);
            }
        });
        
        // Apply direct downward force to right arm - bypass joint system completely
        const rightArm = this.ragdoll.bodies.rightUpperArm;
        rightArm.force.y -= 100; // Strong downward force
        rightArm.torque.x += -20; // Additional rotational torque to pull down
    }
    
    calculateReward() {
        let reward = 0;
        
        // Get body positions
        const torsoHeight = this.ragdoll.bodies.torso.position.y;
        const headHeight = this.ragdoll.bodies.head.position.y;
        const pelvisHeight = this.ragdoll.bodies.pelvis.position.y;
        const torsoPos = this.ragdoll.bodies.torso.position;
        
        // Torso upright orientation
        const torsoUp = new CANNON.Vec3(0, 1, 0);
        this.ragdoll.bodies.torso.quaternion.vmult(torsoUp, torsoUp);
        const uprightness = Math.max(0, torsoUp.y);
        
        // Define "upright" condition
        const isUpright = torsoHeight > 4.0 && uprightness > 0.6;
        
        // Time-based rewards for staying upright
        if (isUpright) {
            this.consecutiveUprightSteps++;
            this.timeUpright++;
            this.maxConsecutiveUpright = Math.max(this.maxConsecutiveUpright, this.consecutiveUprightSteps);
            
            // Exponentially increasing reward for staying up longer
            const timeBonus = Math.min(this.consecutiveUprightSteps * 0.1, 10); // Cap at 10 points
            reward += timeBonus;
            
            // Extra bonus for milestone achievements
            if (this.consecutiveUprightSteps % 60 === 0) { // Every second (60 steps at 60fps)
                reward += 5;
            }
            if (this.consecutiveUprightSteps % 300 === 0) { // Every 5 seconds
                reward += 20;
            }
        } else {
            this.consecutiveUprightSteps = 0;
        }
        
        // Centering/balance rewards - encourage staying near origin
        const distanceFromCenter = Math.sqrt(torsoPos.x * torsoPos.x + torsoPos.z * torsoPos.z);
        const centeringReward = Math.max(0, 3 - distanceFromCenter * 0.5); // Penalty increases with distance
        reward += centeringReward;
        
        // Foot positioning for balance - feet should be under torso
        const leftFootPos = this.ragdoll.bodies.leftShin.position;
        const rightFootPos = this.ragdoll.bodies.rightShin.position;
        const leftFootDistance = Math.sqrt((leftFootPos.x - torsoPos.x) ** 2 + (leftFootPos.z - torsoPos.z) ** 2);
        const rightFootDistance = Math.sqrt((rightFootPos.x - torsoPos.x) ** 2 + (rightFootPos.z - torsoPos.z) ** 2);
        const avgFootDistance = (leftFootDistance + rightFootDistance) / 2;
        const footBalanceReward = Math.max(0, 2 - avgFootDistance); // Reward feet being close to torso
        reward += footBalanceReward;
        
        // Basic height and orientation rewards (reduced importance)
        const heightProgress = Math.max(0, torsoHeight) / this.targetStandingHeight;
        reward += heightProgress * 8; // Reduced from 15
        reward += uprightness * 5; // Reduced from 8
        
        // Stability reward - penalize excessive movement only if upright
        const torsoVel = this.ragdoll.bodies.torso.velocity.length();
        const angularVel = this.ragdoll.bodies.torso.angularVelocity.length();
        if (isUpright) {
            const stabilityReward = Math.max(0, 3 - torsoVel * 0.3 - angularVel * 0.2);
            reward += stabilityReward;
        }
        
        // Less harsh penalties to encourage exploration
        if (headHeight < 1.0 && torsoHeight < 1.5) {
            reward -= 5; // Reduced penalty
        }
        
        // Arm positioning reward - encourage natural arm position
        const leftArmHeight = this.ragdoll.bodies.leftUpperArm.position.y;
        const rightArmHeight = this.ragdoll.bodies.rightUpperArm.position.y;
        
        // Arms should hang naturally (below shoulder level)
        const naturalArmHeight = torsoHeight - 0.5; // Arms should be below torso center
        const leftArmPenalty = Math.max(0, (leftArmHeight - naturalArmHeight) * 2);
        const rightArmPenalty = Math.max(0, (rightArmHeight - naturalArmHeight) * 2);
        reward -= (leftArmPenalty + rightArmPenalty);
        
        // Big milestone bonuses
        if (this.consecutiveUprightSteps > 600) { // Standing for 10+ seconds
            reward += 30;
        }
        if (this.consecutiveUprightSteps > 1800) { // Standing for 30+ seconds
            reward += 50;
        }
        
        return reward;
    }
    
    reset() {
        // Reset ragdoll to initial position with arms hanging naturally
        const bodyParts = {
            head: [0, 7, 0],
            torso: [0, 5, 0],
            pelvis: [0, 3, 0],
            leftUpperArm: [-0.3, 4.5, 0], // Moved closer to body and lower
            rightUpperArm: [0.3, 4.5, 0], // Moved closer to body and lower
            leftForearm: [-0.3, 3.2, 0], // Hanging naturally
            rightForearm: [0.3, 3.2, 0], // Hanging naturally
            leftThigh: [-0.4, 1.5, 0],
            rightThigh: [0.4, 1.5, 0],
            leftShin: [-0.4, 0.2, 0],
            rightShin: [0.4, 0.2, 0]
        };
        
        Object.keys(bodyParts).forEach(partName => {
            const body = this.ragdoll.bodies[partName];
            const basePos = bodyParts[partName];
            
            // Add small random offset
            body.position.set(
                basePos[0] + (Math.random() - 0.5) * 0.2,
                basePos[1] + (Math.random() - 0.5) * 0.2,
                basePos[2] + (Math.random() - 0.5) * 0.2
            );
            
            // Reset velocities
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
            
            // Reset rotation
            body.quaternion.set(0, 0, 0, 1);
        });
        
        this.stepCount = 0;
        this.episode++;
        
        // Reset time-based tracking
        this.consecutiveUprightSteps = 0;
    }
    
    step() {
        if (!this.isTraining) return;
        
        // Get current state
        const state = this.getState();
        
        // Get action from neural network
        let actions = this.forward(state);
        
        // Add exploration noise during training
        if (Math.random() < this.epsilon) {
            actions = actions.map(() => (Math.random() - 0.5) * 2);
        }
        
        // Apply actions
        this.applyActions(actions);
        
        // Calculate reward
        const reward = this.calculateReward();
        
        // Store experience for replay buffer (simplified)
        this.replayBuffer.push({
            state: state,
            action: actions,
            reward: reward,
            episode: this.episode
        });
        
        // Limit buffer size
        if (this.replayBuffer.length > this.maxBufferSize) {
            this.replayBuffer.shift();
        }
        
        this.stepCount++;
        
        // Only reset if completely on the ground for a while, or max steps
        const torsoHeight = this.ragdoll.bodies.torso.position.y;
        const headHeight = this.ragdoll.bodies.head.position.y;
        
        // Track time spent on ground
        if (!this.timeOnGround) this.timeOnGround = 0;
        
        if (headHeight < 1.0 && torsoHeight < 1.5) {
            this.timeOnGround++;
        } else {
            this.timeOnGround = 0; // Reset counter if character gets up
        }
        
        // Only reset after being down for 3+ seconds (180 steps at 60fps)
        if (this.stepCount >= this.maxSteps || this.timeOnGround > 180) {
            console.log(`Episode ${this.episode} completed. Steps: ${this.stepCount}, Time on ground: ${this.timeOnGround}, Final reward: ${reward.toFixed(2)}`);
            this.timeOnGround = 0;
            this.reset();
        }
        
        // Update visualization and stats every frame
        if (this.stepCount % 5 === 0) { // Update viz every 5 steps for performance
            this.visualizeNetwork();
            this.updateStats();
        }
        
        // Simple learning: adjust network weights based on reward (very basic)
        if (this.stepCount % 100 === 0) {
            this.updateNetwork();
        }
    }
    
    updateNetwork() {
        if (this.replayBuffer.length < 50) return;
        
        const recentExperiences = this.replayBuffer.slice(-50);
        const avgReward = recentExperiences.reduce((sum, exp) => sum + exp.reward, 0) / recentExperiences.length;
        
        // Save best performing network
        if (avgReward > this.bestReward) {
            this.bestReward = avgReward;
            this.bestNetwork = this.copyNetwork(this.network);
            console.log(`New best network! Avg reward: ${avgReward.toFixed(2)}`);
        }
        
        // Adaptive learning rate based on performance
        let currentLearningRate = this.learningRate;
        if (avgReward < -5) {
            currentLearningRate *= 2; // Learn faster if doing poorly
        } else if (avgReward > 10) {
            currentLearningRate *= 0.5; // Fine-tune if doing well
        }
        
        // Evolution-style learning: mutate the best network
        const networkToMutate = this.bestNetwork || this.network;
        
        // Mutate input-hidden1 weights
        for (let i = 0; i < networkToMutate.weightsIH1.length; i++) {
            for (let j = 0; j < networkToMutate.weightsIH1[i].length; j++) {
                if (Math.random() < 0.08) { // Lower mutation rate for deeper network
                    const mutation = (Math.random() - 0.5) * currentLearningRate;
                    this.network.weightsIH1[i][j] = networkToMutate.weightsIH1[i][j] + mutation;
                }
            }
        }
        
        // Mutate hidden1-hidden2 weights
        for (let i = 0; i < networkToMutate.weightsH1H2.length; i++) {
            for (let j = 0; j < networkToMutate.weightsH1H2[i].length; j++) {
                if (Math.random() < 0.08) {
                    const mutation = (Math.random() - 0.5) * currentLearningRate;
                    this.network.weightsH1H2[i][j] = networkToMutate.weightsH1H2[i][j] + mutation;
                }
            }
        }
        
        // Mutate hidden2-output weights
        for (let i = 0; i < networkToMutate.weightsH2O.length; i++) {
            for (let j = 0; j < networkToMutate.weightsH2O[i].length; j++) {
                if (Math.random() < 0.08) {
                    const mutation = (Math.random() - 0.5) * currentLearningRate;
                    this.network.weightsH2O[i][j] = networkToMutate.weightsH2O[i][j] + mutation;
                }
            }
        }
        
        // Decay exploration more slowly
        this.epsilon = Math.max(0.05, this.epsilon * 0.9995);
        
        console.log(`Network updated. Avg: ${avgReward.toFixed(2)}, Best: ${this.bestReward.toFixed(2)}, ε: ${this.epsilon.toFixed(3)}`);
    }
    
    copyNetwork(network) {
        return {
            weightsIH1: network.weightsIH1.map(row => [...row]),
            biasesH1: [...network.biasesH1],
            weightsH1H2: network.weightsH1H2.map(row => [...row]),
            biasesH2: [...network.biasesH2],
            weightsH2O: network.weightsH2O.map(row => [...row]),
            biasesO: [...network.biasesO]
        };
    }
    
    toggleTraining() {
        this.isTraining = !this.isTraining;
        console.log(`Training ${this.isTraining ? 'enabled' : 'disabled'}`);
    }
    
    saveNetwork() {
        // Save deeper network weights to localStorage
        const networkData = {
            weightsIH1: this.network.weightsIH1,
            biasesH1: this.network.biasesH1,
            weightsH1H2: this.network.weightsH1H2,
            biasesH2: this.network.biasesH2,
            weightsH2O: this.network.weightsH2O,
            biasesO: this.network.biasesO,
            episode: this.episode
        };
        localStorage.setItem('ragdollNetwork', JSON.stringify(networkData));
        console.log('Deeper network saved to localStorage');
    }
    
    loadNetwork() {
        // Load deeper network weights from localStorage
        const saved = localStorage.getItem('ragdollNetwork');
        if (saved) {
            const networkData = JSON.parse(saved);
            // Check if it's the new deeper network format
            if (networkData.weightsIH1 && networkData.weightsH1H2 && networkData.weightsH2O) {
                this.network.weightsIH1 = networkData.weightsIH1;
                this.network.biasesH1 = networkData.biasesH1;
                this.network.weightsH1H2 = networkData.weightsH1H2;
                this.network.biasesH2 = networkData.biasesH2;
                this.network.weightsH2O = networkData.weightsH2O;
                this.network.biasesO = networkData.biasesO;
                this.episode = networkData.episode || 0;
                console.log(`Deeper network loaded from localStorage. Episode: ${this.episode}`);
                return true;
            } else {
                console.log('Old network format found, using fresh deeper network');
                return false;
            }
        }
        return false;
    }
}