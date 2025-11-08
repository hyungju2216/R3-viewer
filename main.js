import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'; 

// --- 0. 전역 변수 및 초기 설정 ---

// 메인 씬 (3D 보기)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// 미니 씬 (정사영 뷰)
const miniScene = new THREE.Scene();
miniScene.background = new THREE.Color(0xf8f8f8); // 미니 뷰어 배경색

const miniViewportElement = document.getElementById('mini-viewport');
let miniRenderer; 
let miniCamera; 
let miniMesh = null; // 미니 씬에 들어갈 복제된 도형

// 미니 뷰어 렌더러 설정
if (miniViewportElement) {
    miniRenderer = new THREE.WebGLRenderer({ antialias: true });
    miniRenderer.setSize(200, 200);
    miniViewportElement.appendChild(miniRenderer.domElement);
}

let currentMesh = null;
let currentPlane = null;

// 💡 평면 회전 기능을 위한 전역 변수 추가
let currentNormal = new THREE.Vector3(0, 0, 1); // 현재 평면의 법선 벡터 (정규화됨)
let currentD = 0; // 현재 평면 방정식 Ax+By+Cz+D=0 의 D 값

// 💡 요청하신 Z-Up 시각화에 맞는 초기 카메라 위치
const defaultCameraPosition = new THREE.Vector3(5, 2, 3); 


// --- 1. 카메라 (정사영 카메라) ---

const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 15;
const camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
);
// 💡 Z-Up 설정 유지: Z축이 위로 향하도록 함
camera.up.set(0, 0, 1);
camera.position.copy(defaultCameraPosition);
camera.lookAt(0, 0, 0);

// 미니 뷰어용 정사영 카메라 설정 (miniCamera 정의를 if 블록 밖으로 옮겨서 TypeError 방지)
let dynamicMiniFrustumSize = 5;
miniCamera = new THREE.OrthographicCamera(
    dynamicMiniFrustumSize / -2,
    dynamicMiniFrustumSize / 2,
    dynamicMiniFrustumSize / 2,
    dynamicMiniFrustumSize / -2,
    0.1,
    1000
);
miniCamera.up.set(0, 0, 1); // 미니 카메라도 Z-Up 적용
miniCamera.position.copy(defaultCameraPosition); 
miniCamera.lookAt(0, 0, 0);
miniCamera.target = new THREE.Vector3(0, 0, 0); 


// --- 2. 조명 및 축 ---

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const axisLength = 6;
const arrowHeadLength = 0.5;
const arrowHeadWidth = 0.2;
const axisColor = 0x000000; 

function createAxisArrow(dir, origin, length, color, headLength, headWidth) {
    const arrow = new THREE.ArrowHelper(dir, origin, length, color, headLength, headWidth);
    scene.add(arrow);
    return arrow;
}

const origin = new THREE.Vector3(0, 0, 0);
// Z-Up 설정 시: X-오른쪽, Y-앞쪽, Z-위쪽 (기본 설정 그대로 둡니다.)
createAxisArrow(new THREE.Vector3(1, 0, 0), origin, axisLength, axisColor, arrowHeadLength, arrowHeadWidth); // X축
createAxisArrow(new THREE.Vector3(0, 1, 0), origin, axisLength, axisColor, arrowHeadLength, arrowHeadWidth); // Y축
createAxisArrow(new THREE.Vector3(0, 0, 1), origin, axisLength, axisColor, arrowHeadLength, arrowHeadWidth); // Z축


// 텍스트 레이블 생성 헬퍼 함수
function createTextLabel(text, size = 0.5, color = 'black') { 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 100;
    
    context.font = `${fontSize}px Arial`;
    const textWidth = context.measureText(text).width;
    
    canvas.width = textWidth + 20;
    canvas.height = fontSize + 20;
    context.font = `${fontSize}px Arial`;
    context.fillStyle = '#000000'; 
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(size * aspect * 0.5, size * 0.5, 1);
    return sprite;
}

const labelOffset = axisLength + 0.5; 

const labelX = createTextLabel('X', 0.8, 'black');
labelX.position.set(labelOffset, 0, 0); 
scene.add(labelX);

const labelY = createTextLabel('Y', 0.8, 'black');
labelY.position.set(0, labelOffset, 0); 
scene.add(labelY);

const labelZ = createTextLabel('Z', 0.8, 'black');
labelZ.position.set(0, 0, labelOffset); 
scene.add(labelZ);


// --- 3. 컨트롤 (OrbitControls, DragControls) ---

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.minZoom = 0.5;
controls.maxZoom = 4;
controls.enabled = true; // 기본적으로 켜둠

controls.target.set(0, 0, 0);

let dragControls;

function initDragControls() {
    if (dragControls) {
        dragControls.removeEventListener('drag', updateMiniMeshAndCamera);
        dragControls.removeEventListener('dragend', updateMiniMeshAndCamera);
        dragControls.dispose();
    }
    
    if (currentMesh) {
        const objects = [currentMesh]; 
        dragControls = new DragControls(objects, camera, renderer.domElement);
        
        dragControls.addEventListener('dragstart', (event) => { /* controls.enabled = false; */ }); 
        dragControls.addEventListener('dragend', (event) => { /* controls.enabled = true; */ }); 
        
        dragControls.addEventListener('drag', updateMiniMeshAndCamera);
        dragControls.addEventListener('dragend', updateMiniMeshAndCamera);
        
        dragControls.enabled = false; 
    }
}

/**
 * 컨트롤 모드를 설정합니다.
 * @param {string} mode 'drag' (도형 이동) 또는 'orbit' (시점 이동)
 */
function setControlMode(mode) {
    if (!dragControls || !currentMesh) {
        if (mode === 'drag') {
             document.getElementById('mode-status').textContent = '도형 없음 (View)';
             controls.enabled = true;
             return;
        }
    }

    if (mode === 'drag') {
        dragControls.enabled = true;
        controls.enabled = false;
        document.getElementById('mode-status').textContent = '도형 이동 (Drag)';
    } else if (mode === 'orbit') {
        if (dragControls) {
            dragControls.enabled = false;
        }
        controls.enabled = true;
        document.getElementById('mode-status').textContent = '시점 이동 (View)';
    }
}


/**
 * 현재 도형을 지정된 축을 중심으로 회전시킵니다.
 */
function rotateCurrentMesh(axis, angleDegrees) {
    if (!currentMesh) {
        alert("장면에 도형이 없습니다. 먼저 도형을 생성해주세요.");
        return;
    }

    const angleRadians = angleDegrees * (Math.PI / 180);

    switch (axis) {
        case 'x': currentMesh.rotation.x += angleRadians; break;
        case 'y': currentMesh.rotation.y += angleRadians; break;
        case 'z': currentMesh.rotation.z += angleRadians; break;
    }

    updateMiniMeshAndCamera();
}

// 미니 뷰포트의 도형 업데이트 및 카메라 조정
function updateMiniMeshAndCamera() {
    if (!currentMesh || !miniMesh || !miniCamera) return; // miniCamera 정의 여부 확인
    
    miniMesh.position.copy(currentMesh.position);
    miniMesh.rotation.copy(currentMesh.rotation);
    miniMesh.updateMatrixWorld();

    const box = new THREE.Box3().setFromObject(miniMesh);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());

    const target = miniCamera.target ? miniCamera.target : new THREE.Vector3(0, 0, 0); 
    const planeNormal = miniCamera.position.clone().sub(target).normalize(); 
    
    let maxProjectedExtent = 0;
    
    const vertices = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    let axis1 = new THREE.Vector3(1, 0, 0); 
    if (Math.abs(planeNormal.dot(axis1)) > 0.9) axis1.set(0, 1, 0); 
    axis1.sub(planeNormal.clone().multiplyScalar(planeNormal.dot(axis1))).normalize();
    
    let axis2 = new THREE.Vector3().crossVectors(planeNormal, axis1).normalize();

    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;

    vertices.forEach(v => {
        v.applyMatrix4(miniMesh.matrixWorld); 
        
        const vCentered = v.clone().sub(center);
        const projected1 = vCentered.dot(axis1);
        const projected2 = vCentered.dot(axis2);
        
        min1 = Math.min(min1, projected1); max1 = Math.max(max1, projected1);
        min2 = Math.min(min2, projected2); max2 = Math.max(max2, projected2);
    });

    const extent1 = max1 - min1;
    const extent2 = max2 - min2;
    maxProjectedExtent = Math.max(extent1, extent2) * 1.1; 

    // 미니 카메라의 시야 범위(Frustum Size)를 조정
    miniCamera.left = maxProjectedExtent / -2; miniCamera.right = maxProjectedExtent / 2;
    miniCamera.top = maxProjectedExtent / 2; miniCamera.bottom = maxProjectedExtent / -2;
    miniCamera.updateProjectionMatrix();

    miniCamera.lookAt(center);
    miniCamera.target.copy(center); 
    
    // 카메라 위치를 도형 중심으로 다시 설정 (투영 각도 유지)
    const cameraDistance = 10;
    const newCameraPosition = center.clone().add(planeNormal.clone().multiplyScalar(cameraDistance));
    miniCamera.position.copy(newCameraPosition);
}


// --- 4. 공간도형 생성 및 관리 함수 ---

function createAndAddMesh(geometry, material = new THREE.MeshStandardMaterial({ color: 0x0077ff, wireframe: false })) {
    // 1. 메인 씬 업데이트
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
    }
    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);
    initDragControls();

    // 2. 미니 씬 업데이트 (도형 복사)
    if (miniMesh) {
        miniScene.remove(miniMesh);
        miniMesh.geometry.dispose();
        miniMesh.material.dispose();
    }
    
    let miniMaterial;
    miniMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x555555, 
        side: THREE.DoubleSide
    });
    
    miniMesh = new THREE.Mesh(geometry.clone(), miniMaterial);
    miniScene.add(miniMesh);

    updateMiniMeshAndCamera();
    
    // 도형 생성 시 컨트롤 모드를 '시점 이동'으로 초기화
    setControlMode('orbit'); 
}

function createUnitPolyhedron(type) {
    let geometry;
    const radius = 1; 
    const height = 2;
    let material; 

    // 💡 Z-Up/오른손 좌표계 사용 (X: 오른쪽, Y: 전방, Z: 상방)

    switch (type) {
        case 'tetrahedron': 
            const s = 3; 
            const h_base = Math.sqrt(3) / 2 * s; // 밑면 정삼각형 높이
            const H_tetra = Math.sqrt(2/3) * s; // 정사면체 높이
            
            const tetrahedronVertices = [
                new THREE.Vector3(0, 0, 0),                        // X축 상의 꼭짓점 1
                new THREE.Vector3(s, 0, 0),                        // X축 상의 꼭짓점 2
                new THREE.Vector3(s / 2, h_base, 0),               // XY 평면 상의 꼭짓점 3
                new THREE.Vector3(s / 2, h_base / 3, H_tetra)      // 정점 (무게중심 위)
            ];
            
            geometry = new ConvexGeometry(tetrahedronVertices); 
            break;
            
        case 'cube': 
            const sideLength = 2;
            geometry = new THREE.BoxGeometry(sideLength, sideLength, sideLength); 
            
            geometry.translate(sideLength / 2, sideLength / 2, sideLength / 2); 
            break;
            
        case 'sphere': 
            geometry = new THREE.SphereGeometry(radius, 32, 32); 
            break;
            
        case 'cone': 
            geometry = new THREE.ConeGeometry(radius, height, 32); 
            // **원뿔 (복구 완료):** X축으로 90도 회전, 밑면이 Z=0
            geometry.rotateX(Math.PI / 2); 
            geometry.translate(0, 0, height / 2);
            break;
            
        case 'cylinder': 
            geometry = new THREE.CylinderGeometry(radius, radius, height, 32); 
            // **원기둥 (복구 완료):** X축으로 90도 회전, 밑면이 Z=0
            geometry.rotateX(Math.PI / 2);
            geometry.translate(0, 0, height / 2); 
            break;
            
        case 'circle': 
            geometry = new THREE.CircleGeometry(radius, 32); 
            // CircleGeometry는 기본적으로 XY 평면에 생성되므로, 회전 필요 없음
            geometry.translate(0, 0, 0); 
            break;
            
        default: return;
    }
    
    // 재질 설정
    if (type === 'sphere' || type === 'cone' || type === 'cylinder') {
        material = new THREE.MeshPhongMaterial({ 
            color: 0xcc44aa, 
            specular: 0x555555, 
            shininess: 30,
            side: THREE.DoubleSide 
        });
    } else if (type === 'circle') {
         material = new THREE.MeshBasicMaterial({ 
            color: 0xcc44aa, 
            side: THREE.DoubleSide
        });
    } else {
        material = new THREE.MeshStandardMaterial({ color: 0x0077ff, wireframe: false });
    }
    
    createAndAddMesh(geometry, material);
}

function createCustomPolyhedron(verticesString) {
    const vertices = [];
    try {
        const rawPoints = verticesString.split(/],?\s*/).filter(s => s.trim() !== '');
        rawPoints.forEach(pointStr => {
            const match = pointStr.match(/\[(.*)\]/);
            let coords;
            if (match && match[1]) {
                coords = match[1].split(',').map(Number);
            } else {
                coords = pointStr.replace(/[\[\]]/g, '').split(',').map(Number);
            }
            if (coords.length === 3 && coords.every(c => !isNaN(c))) {
                vertices.push(new THREE.Vector3(coords[0], coords[1], coords[2]));
            } else {
                throw new Error("Invalid coordinate format or non-numeric value.");
            }
        });
    } catch (e) {
        alert("점 좌표 형식이 올바르지 않습니다. 예: [1,0,0], [0,1,0], [0,0,1]\n오류: " + e.message);
        return;
    }

    if (vertices.length < 3) {
        alert("최소 3개 이상의 점이 필요합니다.");
        return;
    }
    
    const geometry = new ConvexGeometry(vertices);
    createAndAddMesh(geometry);
}


function setOrthographicPlane(coefficients) {
    const [A, B, C, D] = coefficients;

    const inputNormal = new THREE.Vector3(A, B, C);
    const normalLength = inputNormal.length();
    if (normalLength === 0) {
        alert("유효한 평면 법선 벡터(A, B, C)를 입력해야 합니다.");
        return;
    }
    
    // 💡 전역 변수 업데이트: 법선 벡터와 D 저장
    currentNormal.copy(inputNormal).normalize();
    currentD = D;

    // 2. 평면 헬퍼 시각화 (메인 씬에만)
    if (currentPlane) {
        scene.remove(currentPlane);
        currentPlane.geometry.dispose();
        currentPlane.material.dispose();
    }
    
    const planeGeometry = new THREE.PlaneGeometry(10, 10, 10, 10);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccccc, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 0.2,
        wireframe: true 
    });
    
    currentPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    
    // 평면의 회전 설정: XY 평면(법선 (0,0,1))을 currentNormal로 회전
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), 
        currentNormal 
    );
    currentPlane.setRotationFromQuaternion(quaternion);

    // 평면의 위치 설정: 원점으로부터 법선 방향으로의 거리
    const distanceToOrigin = -currentD / normalLength; // 이 값은 법선 벡터의 길이로 나뉘어야 정확함.
    currentPlane.position.copy(currentNormal).multiplyScalar(distanceToOrigin); // 수정된 로직

    scene.add(currentPlane);

    // 3. 정사영 카메라 위치 설정 (시점 유지 로직 적용)
    
    const cameraDistance = 10;
    const newCameraVector = currentNormal.clone().multiplyScalar(cameraDistance);
    
    // 메인 카메라: 시점(position)은 유지하고, 초점(target)만 평면 중심으로 변경
    controls.target.copy(currentPlane.position);
    controls.update();

    // 미니 카메라 (정사영 뷰): 항상 평면에 수직인 시점으로 변경
    if (miniCamera) {
        const mainCameraPosition = currentPlane.position.clone().add(newCameraVector); // 평면에 수직인 위치
        miniCamera.position.copy(mainCameraPosition); 
        miniCamera.lookAt(currentPlane.position); 
        miniCamera.target.copy(currentPlane.position); 
    }
    
    // 평면이 바뀌었으므로 정사영 뷰 업데이트
    updateMiniMeshAndCamera();
}


/**
 * 💡 새로운 함수: 현재 설정된 평면을 회전시키고 정사영을 업데이트합니다. (시점 유지)
 */
function rotateCurrentPlane(axis, angleDegrees) {
    if (!currentPlane) {
        alert("장면에 평면이 설정되지 않았습니다. 먼저 '평면 설정' 버튼을 눌러주세요.");
        return;
    }

    const angleRadians = angleDegrees * (Math.PI / 180);
    const rotationAxis = new THREE.Vector3();
    
    switch (axis) {
        case 'x': rotationAxis.set(1, 0, 0); break;
        case 'y': rotationAxis.set(0, 1, 0); break;
        case 'z': rotationAxis.set(0, 0, 1); break;
    }

    const quaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angleRadians);
    
    // 1. 법선 벡터 회전: 법선 벡터(currentNormal)를 회전축 중심으로 회전시킵니다.
    currentNormal.applyQuaternion(quaternion);
    
    // 2. 평면 객체 회전 (시각화 업데이트)
    const newQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        currentNormal
    );
    currentPlane.setRotationFromQuaternion(newQuaternion);
    
    // 3. 평면 위치 재계산
    // D는 불변. 평면의 위치(center)는 법선 방향으로의 거리(-D/|N|)를 유지함.
    const normalLength = currentNormal.length(); 
    const distanceToOrigin = -currentD / normalLength; 
    currentPlane.position.copy(currentNormal).multiplyScalar(distanceToOrigin); 
    
    // 4. 카메라 및 정사영 뷰 업데이트 (시점 유지 로직 적용)
    
    const cameraDistance = 10;
    const newCameraVector = currentNormal.clone().multiplyScalar(cameraDistance);
    
    // 메인 카메라: 시점(position)은 유지하고, 초점(target)만 평면 중심으로 변경
    controls.target.copy(currentPlane.position);
    controls.update();

    // 미니 카메라 (정사영 뷰): 항상 평면에 수직인 시점으로 변경
    if (miniCamera) {
        const mainCameraPosition = currentPlane.position.clone().add(newCameraVector);
        miniCamera.position.copy(mainCameraPosition); 
        miniCamera.lookAt(currentPlane.position);
        miniCamera.target.copy(currentPlane.position);
    }
    
    // 정사영 이미지 업데이트
    updateMiniMeshAndCamera();
    
    // UI의 입력 필드에도 회전된 A, B, C, D 값 반영 
    document.getElementById('plane-input').value = 
        `${currentNormal.x.toFixed(4)}, ${currentNormal.y.toFixed(4)}, ${currentNormal.z.toFixed(4)}, ${currentD.toFixed(4)}`;
}


function parsePlaneInput(input) {
    const parts = String(input).split(',').map(s => Number(s.trim()));
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
        return parts;
    }
    return null;
}

// --- 5. UI 이벤트 리스너 ---

// NEW: 컨트롤 모드 버튼 이벤트 리스너
document.getElementById('set-drag-mode').addEventListener('click', () => {
    setControlMode('drag');
});

document.getElementById('set-orbit-mode').addEventListener('click', () => {
    setControlMode('orbit');
});


// 단위 다면체 버튼 이벤트 리스너 (정다면체 + 회전체)
document.querySelectorAll('#unit-polyhedron-buttons button, #revolution-buttons button').forEach(button => {
    button.addEventListener('click', () => {
        const type = button.getAttribute('data-type');
        createUnitPolyhedron(type);
    });
});

// 사용자 정의 도형 생성 버튼
document.getElementById('create-formula-btn').addEventListener('click', () => {
    const formulaInput = document.getElementById('formula-input').value;
    if (formulaInput.trim() !== '') {
        createCustomPolyhedron(formulaInput);
    } else {
        alert("점 좌표를 입력해주세요.");
    }
});

// 도형 회전 버튼 이벤트 리스너
document.querySelectorAll('#rotation-buttons button').forEach(button => {
    button.addEventListener('click', () => {
        const axis = button.getAttribute('data-axis');
        const angleInput = document.getElementById('rotation-angle-input');
        const angle = parseFloat(angleInput.value);

        if (isNaN(angle)) {
            alert("유효한 회전 각도를 입력해주세요.");
            return;
        }

        rotateCurrentMesh(axis, angle);
    });
});

// 평면 설정 버튼 (일반 입력)
document.getElementById('set-plane-btn').addEventListener('click', () => {
    const planeInput = document.getElementById('plane-input').value;
    const coefficients = parsePlaneInput(planeInput);

    if (coefficients) {
        setOrthographicPlane(coefficients);
    } else {
        alert("평면 방정식 입력 형식이 잘못되었습니다. [A, B, C, D] 형식으로 4개의 숫자를 콤마로 구분하여 입력해주세요.");
    }
});

// 주요 좌표 평면 버튼 이벤트 리스너
document.querySelectorAll('.preset-planes div button').forEach(button => {
    button.addEventListener('click', () => {
        const planeCoeffs = button.getAttribute('data-plane');
        document.getElementById('plane-input').value = planeCoeffs; 
        const coefficients = parsePlaneInput(planeCoeffs);
        setOrthographicPlane(coefficients);
    });
});

// 💡 평면 회전 버튼 이벤트 리스너 추가
document.querySelectorAll('#plane-rotation-buttons button').forEach(button => {
    button.addEventListener('click', () => {
        const axis = button.getAttribute('data-axis');
        const angleInput = document.getElementById('plane-rotation-angle-input');
        const angle = parseFloat(angleInput.value);

        if (isNaN(angle)) {
            alert("유효한 평면 회전 각도를 입력해주세요.");
            return;
        }

        rotateCurrentPlane(axis, angle);
    });
});


document.getElementById('clear-scene-btn').addEventListener('click', () => {
    // 모델 제거
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
        currentMesh = null;
    }
    if (miniMesh) {
        miniScene.remove(miniMesh);
        miniMesh.geometry.dispose();
        miniMesh.material.dispose();
        miniMesh = null;
    }
    // 평면 헬퍼 제거
    if (currentPlane) {
        scene.remove(currentPlane);
        currentPlane.geometry.dispose();
        currentPlane.material.dispose();
        currentPlane = null;
    }
    
    // DragControls 제거 
    if (dragControls) {
        dragControls.removeEventListener('drag', updateMiniMeshAndCamera);
        dragControls.removeEventListener('dragend', updateMiniMeshAndCamera);
        dragControls.dispose();
        dragControls = null;
    }
    
    // UI 및 카메라 초기화
    document.getElementById('formula-input').value = '';
    document.getElementById('plane-input').value = '0, 0, 1, 0';
    document.getElementById('mode-status').textContent = '시점 이동 (View)';
    
    // 💡 평면 상태 초기화
    currentNormal.set(0, 0, 1);
    currentD = 0;
    
    // 카메라 위치 초기화 (Z-up)
    camera.position.copy(defaultCameraPosition);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true; // 시점 이동 활성화
    controls.update();

    if (miniCamera) {
        miniCamera.position.copy(defaultCameraPosition); 
        miniCamera.lookAt(0, 0, 0);
        miniCamera.target.set(0, 0, 0); 
        // 미니 뷰어 크기 초기화
        miniCamera.left = dynamicMiniFrustumSize / -2;
        miniCamera.right = dynamicMiniFrustumSize / 2;
        miniCamera.top = dynamicMiniFrustumSize / 2;
        miniCamera.bottom = dynamicMiniFrustumSize / -2;
        miniCamera.updateProjectionMatrix();
    }
});


// --- 6. 애니메이션 루프 및 크기 조절 대응 ---

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // 도형의 변환이 미니 뷰어에도 반영되도록 매 프레임 업데이트
    if (currentMesh && miniMesh && miniCamera) {
        updateMiniMeshAndCamera();
    }

    // 메인 뷰어 렌더링
    renderer.render(scene, camera);
    
    // 미니 뷰어 렌더링
    if (miniRenderer && miniCamera) {
        miniRenderer.render(miniScene, miniCamera);
    }
}

window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = frustumSize * newAspect / -2;
    camera.right = frustumSize * newAspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});

// NEW: 시작 시 요청하신 대로 구와 XY 평면(z=0)을 설정합니다.
createUnitPolyhedron('sphere'); 

// 💡 수정! parsePlaneInput의 반환 값이 null일 경우를 방지합니다.
const initialCoefficients = parsePlaneInput('0, 0, 1, 0');
if (initialCoefficients) {
    setOrthographicPlane(initialCoefficients); // coefficients가 배열일 때만 실행
} else {
    // 혹시라도 초기 설정에 문제가 생기면 경고 메시지를 띄웁니다.
    console.error("초기 평면 설정(0, 0, 1, 0)이 유효하지 않습니다. 코드 확인이 필요합니다.");
}

setControlMode('orbit');

// ======================================================
// ======== NEW: Gemini 채팅 인터페이스 로직 (API 연동 구조 수정) ========
// ======================================================

// ⚠️ 여기에 API 키와 엔드포인트를 설정하세요.
const YOUR_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"; 
const YOUR_API_KEY = "AIzaSyD8-XELgbuHbKfeV_mjdVKn65fvgnCpXF4"; // <-- 이 부분을 직접 변경해야 합니다.

/**
 * 3D 도형 생성에 필요한 키워드가 질문에 포함되어 있는지 확인합니다.
 * @param {string} text - 사용자 입력 텍스트
 * @returns {string | null} - 생성할 도형 이름 ('sphere', 'cube' 등) 또는 null
 */
function getShapeTypeFromQuery(text) {
    const t = text.toLowerCase();
    
    if (!t.includes('그려줘') && !t.includes('보여줘') && !t.includes('생성해줘')) {
        return null; // 도형 요청이 아님
    }

    if (t.includes('구')) return 'sphere';
    if (t.includes('정육면체') || t.includes('큐브')) return 'cube';
    if (t.includes('원뿔')) return 'cone';
    if (t.includes('원기둥')) return 'cylinder';
    if (t.includes('정사면체')) return 'tetrahedron';
    
    return null; // 도형 요청은 했지만 알 수 없는 도형
}


/**
 * (API 연동) Gemini 질문을 처리하고 응답을 받습니다.
 */
document.getElementById('gemini-submit-btn').addEventListener('click', handleGeminiQuery);

async function handleGeminiQuery() { 
    const queryInput = document.getElementById('gemini-question-input');
    const originalQuery = queryInput.value.trim();
    const answerArea = document.getElementById('gemini-answer-area');
    
    if (originalQuery === '') {
        answerArea.textContent = '질문을 입력해주세요.';
        return;
    }
    
    if (YOUR_API_KEY === "여기에_AI_Studio에서_발급받은_API_키를_넣으세요") {
        answerArea.textContent = '⚠️ API 키를 main.js 파일에 먼저 입력해주세요!';
        return;
    }
    
    // 1. 도형 생성 요청인지 먼저 파악합니다.
    const shapeToCreate = getShapeTypeFromQuery(originalQuery);
    
    // API에 보낼 최종 질문 (도형 요청인 경우 메시지를 보강합니다)
    let finalQuery = originalQuery;

    if (shapeToCreate) {
        // Gemini가 텍스트 답변을 할 때 도형 이름을 포함하도록 유도하는 지시를 추가
        finalQuery = `"${originalQuery}"에 대한 답변을 생성해주세요. (참고: 사용자가 3D 뷰어에서 이 도형을 그리는 기능을 활성화했습니다. 도형 이름은 ${shapeToCreate}입니다.)`;
    }
    
    // 로딩 상태 표시
    answerArea.textContent = 'Gemini가 답변을 생각 중입니다...';

    try {
        const response = await fetch(YOUR_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': YOUR_API_KEY 
            },
            body: JSON.stringify({
                "contents": [
                    { "parts": [ { "text": finalQuery } ] }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API 오류: ${response.status} (${response.statusText})`);
        }

        const apiResponse = await response.json();
        
        const responseText = apiResponse.candidates?.[0]?.content?.parts?.[0]?.text || 
                             "죄송합니다. 답변을 생성하지 못했습니다.";
        
        // 2. 3D 도형 생성 (API 호출 후)
        // API 응답과 관계없이 사용자의 원래 요청에 도형이 포함되어 있으면 무조건 그립니다.
        if (shapeToCreate) {
            createUnitPolyhedron(shapeToCreate);
        }
        
        // 3. 최종 답변을 답변란에 표시
        answerArea.textContent = responseText;

    } catch (error) {
        console.error("API 요청 실패:", error);
        
        if (error.message.includes('403')) {
            answerArea.textContent = `❌ API 요청 실패: 권한이 거부되었습니다 (403 Forbidden). 
            API 키가 올바른지, 특히 Live Server 주소(http://127.0.0.1 또는 localhost)가 API 키의 'HTTP 리퍼러' 제한에 등록되어 있는지 **필수적으로 확인**해주세요.`;
        } else {
            answerArea.textContent = `❌ API 요청 실패: ${error.message}`;
        }
    }
}

// ======================================================
// ================== 추가된 코드 끝 =====================
// ======================================================

animate();