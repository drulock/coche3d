document.addEventListener('DOMContentLoaded', () => {
    console.log("Script.js cargado y DOMContentLoaded");

    if (typeof THREE === 'undefined') {
        console.error("THREE.js no se ha cargado correctamente. Revisa la etiqueta <script> en tu HTML.");
        alert("Error: THREE.js no pudo cargarse. La aplicación no funcionará.");
        return;
    }
    console.log("THREE.js versión:", THREE.REVISION);

    const worldContainer = document.getElementById('world-container');
    const sectionsContainer = document.getElementById('sections-container');
    const contentSections = document.querySelectorAll('.content-section');
    const instructionsDiv = document.getElementById('instructions');

    let scene, camera, renderer;
    let player, carBody, wheels = [];

    const NORMAL_SPEED = 0.13;
    const NITRO_SPEED = 0.32;
    let playerSpeed = NORMAL_SPEED;
    let playerTurnSpeed = 0.045;
    let playerRadius = 0.9; // Radio del coche para colisiones con árboles

    let keys = { w: false, s: false, a: false, d: false, shift: false };

    let sectionTriggers = [];
    let collidableObjects = [];
    let gameActive = true;

    const worldSize = 70; // Área jugable un poco más grande

    let nitroActive = false;
    let nitroAmount = 100;
    const NITRO_CONSUMPTION_RATE = 0.6;
    const NITRO_RECHARGE_RATE = 0.15;
    const MAX_NITRO = 100;
    let nitroBarElement, nitroContainerElement;

    function initThreeJS() {
        console.log("initThreeJS llamada");

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Cielo
        scene.fog = new THREE.Fog(0x87ceeb, 25, worldSize + 15);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha:true por si quieres fondo transparente en el futuro
            renderer.setPixelRatio(window.devicePixelRatio); // Mejor calidad en pantallas HiDPI
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            worldContainer.appendChild(renderer.domElement);
        } catch (e) {
            console.error("Error creando WebGLRenderer:", e); return;
        }

        const groundGeometry = new THREE.PlaneGeometry(worldSize * 1.6, worldSize * 1.6); // Suelo más grande
        const groundTexture = createGroundTexture(); // Textura simple para el suelo
        const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        player = new THREE.Object3D();
        player.position.set(0, 0.25, 2); // Iniciar un poco adelante
        scene.add(player);
        createCar();

        camera.position.set(0, 3, -5.5); // Cámara un poco más alta y atrás
        camera.lookAt(new THREE.Vector3(0, 0.7, 0));
        player.add(camera);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
        directionalLight.position.set(20, 25, 15); // Sol más inclinado
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 1;
        directionalLight.shadow.camera.far = 80;
        directionalLight.shadow.camera.left = -worldSize / 1.2;
        directionalLight.shadow.camera.right = worldSize / 1.2;
        directionalLight.shadow.camera.top = worldSize / 1.2;
        directionalLight.shadow.camera.bottom = -worldSize / 1.2;
        scene.add(directionalLight);
        // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera); // Para depurar sombras
        // scene.add(shadowHelper);

        createWalls();
        createSectionTrigger('quienes-somos', new THREE.Vector3(worldSize/2 - 15, 0.1, 0), '#FF6347', "Quiénes Somos"); // Tomato color
        createSectionTrigger('servicios', new THREE.Vector3(-worldSize/2 + 15, 0.1, 8), '#3CB371', "Servicios");    // MediumSeaGreen
        createSectionTrigger('contacto', new THREE.Vector3(0, 0.1, -worldSize/2 + 15), '#1E90FF', "Contacto");   // DodgerBlue


        for (let i = 0; i < 45; i++) { // Más árboles
            createTree(
                (Math.random() - 0.5) * (worldSize - 10),
                (Math.random() - 0.5) * (worldSize - 10)
            );
        }

        createNitroBar();
        updateInstructions();

        window.addEventListener('resize', onWindowResize, false);
        document.addEventListener('keydown', onKeyDown, false);
        document.addEventListener('keyup', onKeyUp, false);
        document.querySelectorAll('.back-button').forEach(button => {
            button.addEventListener('click', showGame);
        });


        animate();
        console.log("initThreeJS completado");
    }
    function createGroundTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = '#2E8B57'; // Verde mar
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = 'rgba(0,0,0,0.05)'; // Sutil patrón
        for (let i = 0; i < 64; i += 4) {
            for (let j = 0; j < 64; j += 4) {
                if ((i/4 + j/4) % 2 === 0) {
                    context.fillRect(i, j, 2, 2);
                }
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(worldSize/4, worldSize/4); // Repetir la textura
        return texture;
    }


    function createCar() {
        const carPaintColor = 0xe63946; // Rojo vibrante
        const carMaterial = new THREE.MeshStandardMaterial({ color: carPaintColor, roughness: 0.2, metalness: 0.3 });
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
        const glassMaterial = new THREE.MeshPhysicalMaterial({ // Material para "cristales"
            color: 0xaaddff,
            metalness: 0.1,
            roughness: 0.05,
            transmission: 0.9, // Opacidad (0=opaco, 1=transparente)
            transparent: true,
            opacity: 0.3 // Para que se vea algo a través
        });


        const bodyWidth = 1.3; const bodyHeight = 0.65; const bodyDepth = 2.4;
        const wheelRadius = 0.25; const wheelThickness = 0.18;

        const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
        carBody = new THREE.Mesh(bodyGeometry, carMaterial);
        carBody.castShadow = true;
        carBody.position.y = 0; // Relativo al 'player' que ya está elevado
        player.add(carBody);

        // Cabina con "cristales"
        const cabinBaseWidth = bodyWidth * 0.75;
        const cabinBaseHeight = bodyHeight * 0.05; // Base pequeña para la cabina
        const cabinBaseDepth = bodyDepth * 0.5;

        const cabinBaseGeo = new THREE.BoxGeometry(cabinBaseWidth, cabinBaseHeight, cabinBaseDepth);
        const cabinBase = new THREE.Mesh(cabinBaseGeo, carMaterial);
        cabinBase.position.y = bodyHeight/2 + cabinBaseHeight/2;
        cabinBase.position.z = -bodyDepth * 0.1;
        carBody.add(cabinBase);


        const cabinPillarHeight = bodyHeight * 0.7;
        const cabinGlassWidth = cabinBaseWidth * 0.95;
        const cabinGlassDepth = cabinBaseDepth * 0.95;

        const cabinGlassGeo = new THREE.BoxGeometry(cabinGlassWidth, cabinPillarHeight, cabinGlassDepth);
        const cabinGlass = new THREE.Mesh(cabinGlassGeo, glassMaterial);
        cabinGlass.castShadow = true; // Los cristales pueden proyectar sombra (sutil)
        cabinGlass.position.y = cabinPillarHeight/2; // Encima de la base de la cabina
        cabinBase.add(cabinGlass); // Hijo de la base de la cabina

        wheels = [];
        const wheelPositions = [
            {x: bodyWidth / 2 - wheelThickness*0.3, y: 0, z: bodyDepth / 2 * 0.7},  // Delantera derecha
            {x: -bodyWidth / 2 + wheelThickness*0.3, y: 0, z: bodyDepth / 2 * 0.7}, // Delantera izquierda
            {x: bodyWidth / 2 - wheelThickness*0.3, y: 0, z: -bodyDepth / 2 * 0.7}, // Trasera derecha
            {x: -bodyWidth / 2 + wheelThickness*0.3, y: 0, z: -bodyDepth / 2 * 0.7} // Trasera izquierda
        ];

        for (let i = 0; i < 4; i++) {
            const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 20); // Más segmentos
            wheelGeometry.rotateZ(Math.PI / 2);
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.castShadow = true;
            wheel.position.set(wheelPositions[i].x, wheelPositions[i].y, wheelPositions[i].z);
            player.add(wheel);
            wheels.push(wheel);
        }
    }

    function createWalls() {
        const wallHeight = 7;
        const wallThickness = 2.5;
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x607D8B, roughness: 0.85, metalness: 0.1 }); // Gris azulado

        const halfWorld = worldSize / 2 + wallThickness / 2;
        const wallLength = worldSize + wallThickness * 2; // Para asegurar que cubren las esquinas

        const wallData = [
            { size: [wallThickness, wallHeight, wallLength], position: [halfWorld, wallHeight / 2, 0] },
            { size: [wallThickness, wallHeight, wallLength], position: [-halfWorld, wallHeight / 2, 0] },
            { size: [wallLength, wallHeight, wallThickness], position: [0, wallHeight / 2, halfWorld] },
            { size: [wallLength, wallHeight, wallThickness], position: [0, wallHeight / 2, -halfWorld] }
        ];
        collidableObjects = collidableObjects.filter(obj => obj.type !== 'wall');
        wallData.forEach(data => {
            const wallGeo = new THREE.BoxGeometry(data.size[0], data.size[1], data.size[2]);
            const wall = new THREE.Mesh(wallGeo, wallMaterial);
            wall.position.fromArray(data.position);
            wall.receiveShadow = true; // Las paredes grandes deberían recibir sombras
            scene.add(wall);
            collidableObjects.push({ mesh: wall, type: 'wall', boundingBox: new THREE.Box3().setFromObject(wall) });
        });
    }

    function makeTextSprite(message, parameters) {
        const fontface = parameters.fontface || 'Arial, Helvetica, sans-serif';
        const fontsize = parameters.fontsize || 38;
        const borderThickness = parameters.borderThickness || 3;
        const borderColor = parameters.borderColor || { r: 0, g: 0, b: 0, a: 1.0 };
        const backgroundColor = parameters.backgroundColor || { r: 250, g: 250, b: 250, a: 0.85 };
        const textColor = parameters.textColor || 'rgba(0,0,0,1)'; // Acepta string de color CSS

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `Bold ${fontsize}px ${fontface}`;
        const metrics = context.measureText(message);
        const textWidth = metrics.width;

        canvas.width = textWidth + fontsize; // Más padding
        canvas.height = fontsize * 1.5;   // Más padding vertical
        context.font = `Bold ${fontsize}px ${fontface}`; // Reaplicar

        context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;
        context.strokeStyle = `rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.a})`;
        context.lineWidth = borderThickness;

        const roundRect = (ctx, x, y, w, h, r) => {
            ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath(); ctx.fill(); if (borderThickness > 0) ctx.stroke();
        };
        roundRect(context, borderThickness / 2, borderThickness / 2, canvas.width - borderThickness, canvas.height - borderThickness, fontsize / 3);

        context.fillStyle = textColor;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(message, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }); // depthTest:false para que siempre esté visible
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 60, canvas.height / 60, 1.0); // Ajustar divisor para tamaño
        return sprite;
    }

    function createTree(x, z) {
        const treeBaseRadius = 0.45 + Math.random() * 0.35;
        const treeCollisionRadius = treeBaseRadius + 0.4;

        if (Math.sqrt(x*x + z*z) < 12) return;
        for(const trigger of sectionTriggers){
            if(new THREE.Vector3(x,0,z).distanceTo(trigger.position) < trigger.radius + treeCollisionRadius + 4) return;
        }
        if (Math.abs(x) > worldSize/2 - treeCollisionRadius - 2 || Math.abs(z) > worldSize/2 - treeCollisionRadius - 2) return;

        const trunkHeight = Math.random() * 2.0 + 2.0;
        const trunkGeo = new THREE.CylinderGeometry(treeBaseRadius * 0.4, treeBaseRadius * 0.6, trunkHeight, 10);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4423 }); // Marrón más oscuro para tronco
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkHeight / 2, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        scene.add(trunk);

        collidableObjects.push({ type: 'tree', position: new THREE.Vector3(x, 0, z), radius: treeCollisionRadius });

        const leavesLayers = Math.floor(Math.random() * 2) + 3;
        let currentHeight = trunkHeight * 0.7; // Hojas empiezan más abajo en el tronco
        let currentLeavesRadius = treeBaseRadius * 2.8 + Math.random() * 0.8;

        for (let i = 0; i < leavesLayers; i++) {
            const leavesGeo = new THREE.SphereGeometry(currentLeavesRadius, 8, 6); // Geometría más simple para hojas
            const colorVariation = Math.random() * 0.2 - 0.1; // Pequeña variación de color
            const leavesMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1 + colorVariation, 0.4 + colorVariation, 0.1 + colorVariation) });
            const leaves = new THREE.Mesh(leavesGeo, leavesMat);
            leaves.position.set(x, currentHeight + currentLeavesRadius * 0.4, z);
            leaves.castShadow = true;
            leaves.receiveShadow = true;
            scene.add(leaves);
            currentHeight += currentLeavesRadius * 0.5; // Menos espaciado vertical
            currentLeavesRadius *= 0.80; // Reducción más drástica
        }
    }

    function createSectionTrigger(id, position, colorString, labelText) {
        const triggerRadius = 3.0;
        const poleHeight = 0.2; const poleRadius = 0.2;

        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 10);
        const poleMat = new THREE.MeshStandardMaterial({ color: colorString, emissive: colorString, emissiveIntensity: 0.3 });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.copy(position);
        poleMesh.position.y = poleHeight / 2;
        poleMesh.castShadow = true;
        scene.add(poleMesh);

        const textSprite = makeTextSprite(labelText, {
            fontsize: 42, fontface: 'Verdana, Geneva, sans-serif',
            borderColor: { r:30, g:30, b:30, a:0.9 },
            backgroundColor: { r:255, g:255, b:255, a:0.8 },
            textColor: colorString
        });
        textSprite.position.set(position.x, position.y + 2.2, position.z); // Texto más alto
        scene.add(textSprite);

        sectionTriggers.push({ id, mesh: poleMesh, sprite: textSprite, position, radius: triggerRadius, label: labelText });
    }

    function createNitroBar() {
        nitroContainerElement = document.createElement('div');
        nitroContainerElement.id = 'nitro-container';
        nitroBarElement = document.createElement('div');
        nitroBarElement.id = 'nitro-bar';
        nitroContainerElement.appendChild(nitroBarElement);
        document.body.appendChild(nitroContainerElement);
    }
    function updateNitroBar() { if (nitroBarElement) nitroBarElement.style.width = (nitroAmount / MAX_NITRO) * 100 + '%'; }
    function updateInstructions() { if (instructionsDiv) instructionsDiv.innerHTML = "W/S: Mover<br>A/D: Girar<br>SHIFT: Nitro"; }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    function onKeyDown(event) {
        if (!gameActive) return; const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true; else if (key === 'shift') keys.shift = true;
    }
    function onKeyUp(event) {
        if (!gameActive) return; const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false; else if (key === 'shift') keys.shift = false;
    }

    function handleNitro() {
        if (keys.shift && nitroAmount > 0 && (keys.w || keys.s)) {
            nitroActive = true; playerSpeed = NITRO_SPEED;
            nitroAmount = Math.max(0, nitroAmount - NITRO_CONSUMPTION_RATE);
        } else {
            nitroActive = false; playerSpeed = NORMAL_SPEED;
            nitroAmount = Math.min(MAX_NITRO, nitroAmount + NITRO_RECHARGE_RATE);
        }
        updateNitroBar();
    }

    function updatePlayerMovement() {
        if (!gameActive || !player || !player.position) return;
        handleNitro();
        const prevPosition = player.position.clone();
        const prevRotationY = player.rotation.y;

        if (keys.a) player.rotation.y += playerTurnSpeed;
        if (keys.d) player.rotation.y -= playerTurnSpeed;

        const moveZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
        if (moveZ !== 0) {
            const wheelRotationSpeed = (nitroActive ? 0.45 : 0.22) * (moveZ > 0 ? -1 : 1);
            wheels.forEach(wheel => wheel.rotation.x += wheelRotationSpeed);
            player.translateZ(moveZ * playerSpeed);
        }

        let collisionResponse = checkWorldCollisions();
        if (collisionResponse.collided) {
            player.position.copy(prevPosition);
            player.rotation.y = prevRotationY;
            // Pequeño "rebote" para evitar quedarse pegado
            if (collisionResponse.normal) {
                 player.position.addScaledVector(collisionResponse.normal, 0.05);
            }
        }

        if (!collisionResponse.collided) {
            for (const trigger of sectionTriggers) {
                if (player.position.distanceTo(trigger.position) < trigger.radius) {
                    showSection(trigger.id);
                    const backOffDirection = player.getWorldDirection(new THREE.Vector3()).negate();
                    player.position.addScaledVector(backOffDirection, trigger.radius * 0.6 + playerRadius * 0.3);
                    break;
                }
            }
        }
    }

    function checkWorldCollisions() {
        const response = { collided: false, normal: null };
        if (!player || !player.position) return response;

        const playerSphere = new THREE.Sphere(player.position, playerRadius); // Para árboles
        const carDimensions = new THREE.Vector3(1.3, 1, 2.4); // Ancho(X), Alto(Y), Largo(Z) del coche. Ajustar a createCar()
        const playerWorldBox = new THREE.Box3().setFromCenterAndSize(player.position, carDimensions)
                                            .applyMatrix4(new THREE.Matrix4().makeRotationY(player.rotation.y)); // Rotar el BBox (simplificación)

        for (const obj of collidableObjects) {
            if (obj.type === 'tree') {
                if (playerSphere.intersectsSphere(new THREE.Sphere(obj.position, obj.radius))) {
                    response.collided = true;
                    response.normal = new THREE.Vector3().subVectors(player.position, obj.position).normalize();
                    return response;
                }
            } else if (obj.type === 'wall') {
                 // Para paredes, AABB vs AABB (el BBox del coche no está realmente orientado, es una aproximación)
                const wallBox = obj.boundingBox;
                const playerAABB = new THREE.Box3().setFromCenterAndSize(player.position, carDimensions); // AABB no rotado para esta prueba

                if (playerAABB.intersectsBox(wallBox)) {
                    response.collided = true;
                    // Calcular una normal de empuje simple
                    const closestPoint = new THREE.Vector3();
                    wallBox.clampPoint(player.position, closestPoint);
                    response.normal = new THREE.Vector3().subVectors(player.position, closestPoint).normalize();
                    if (response.normal.lengthSq() === 0) { // Si está exactamente dentro
                        // Intentar empujar hacia afuera basado en la cara más cercana (más complejo)
                        // Por ahora, una normal genérica si está totalmente dentro
                        response.normal.set(player.position.x > 0 ? -1:1, 0, player.position.z > 0 ? -1:1).normalize();
                    }
                    return response;
                }
            }
        }
        return response;
    }

    function showSection(sectionId) {
        gameActive = false;
        if (worldContainer) worldContainer.style.display = 'none';
        if (instructionsDiv) instructionsDiv.style.display = 'none';
        if (nitroContainerElement) nitroContainerElement.style.display = 'none';
        if (sectionsContainer) sectionsContainer.style.display = 'block';
        let sectionFound = false;
        contentSections.forEach(section => {
            section.id === sectionId ? (section.classList.add('active'), sectionFound = true) : section.classList.remove('active');
        });
        if (!sectionFound) console.error(`Section with ID "${sectionId}" not found.`);
    }

    function showGame() {
        gameActive = true;
        if (sectionsContainer) sectionsContainer.style.display = 'none';
        contentSections.forEach(section => section.classList.remove('active'));
        if (worldContainer) worldContainer.style.display = 'block';
        if (instructionsDiv) instructionsDiv.style.display = 'block';
        if (nitroContainerElement) nitroContainerElement.style.display = 'block';
        keys = { w: false, s: false, a: false, d: false, shift: false };
    }

    function animate() {
        requestAnimationFrame(animate);
        if (gameActive) {
            updatePlayerMovement();
        }
        if (renderer && scene && camera && (gameActive || (worldContainer && worldContainer.style.display !== 'none'))) {
            renderer.render(scene, camera);
        }
    }
    initThreeJS();
});