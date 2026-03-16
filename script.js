// 从 config.js 读取配置
const GRID_ROWS = CONFIG.gridRows;
const GRID_COLS = CONFIG.gridCols;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;
const CENTER_INDEX = CONFIG.centerIndex;

let uploadedImages = {}; // { index: { url: dataURL, cellName: '' } }
let currentEditIndex = -1;
let isUploading = false;
let cellColors = []; // 每个格子从目标图提取的平均颜色

// DOM元素
const puzzleGrid = document.getElementById('puzzleGrid');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');
const fileInput = document.getElementById('fileInput');
const previewModal = document.getElementById('previewModal');
const previewImg = document.getElementById('previewImg');
const replaceBtn = document.getElementById('replaceBtn');
const deleteBtn = document.getElementById('deleteBtn');
const closePreview = document.getElementById('closePreview');
const uploadCount = document.getElementById('uploadCount');
const bgContainer = document.getElementById('bgContainer');

// ========== 马赛克核心：从目标图提取每个格子的平均颜色 ==========

function extractCellColors(imgSrc) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const cellW = img.width / GRID_COLS;
            const cellH = img.height / GRID_ROWS;
            const colors = [];

            for (let i = 0; i < TOTAL_CELLS; i++) {
                const row = Math.floor(i / GRID_COLS);
                const col = i % GRID_COLS;
                const x = Math.floor(col * cellW);
                const y = Math.floor(row * cellH);
                const w = Math.floor(cellW);
                const h = Math.floor(cellH);

                const data = ctx.getImageData(x, y, w, h).data;
                let r = 0, g = 0, b = 0;
                const pixelCount = data.length / 4;
                for (let p = 0; p < data.length; p += 4) {
                    r += data[p];
                    g += data[p + 1];
                    b += data[p + 2];
                }
                colors.push({
                    r: Math.round(r / pixelCount),
                    g: Math.round(g / pixelCount),
                    b: Math.round(b / pixelCount),
                });
            }
            resolve(colors);
        };
        img.onerror = () => {
            resolve(Array(TOTAL_CELLS).fill({ r: 128, g: 128, b: 128 }));
        };
        img.src = imgSrc;
    });
}

// ========== 格子名称工具 ==========

function getCellName(index) {
    const row = Math.floor(index / GRID_COLS) + 1;
    const col = (index % GRID_COLS) + 1;
    return `${row}-${col}`;
}

function cellNameToIndex(name) {
    const [row, col] = name.split('-').map(Number);
    return (row - 1) * GRID_COLS + (col - 1);
}

// ========== 图片压缩 ==========

function compressImage(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') {
            return resolve(file);
        }

        const maxWidth = CONFIG.compressMaxWidth;
        const quality = CONFIG.compressQuality;
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            if (img.width <= maxWidth && file.size < 200 * 1024) {
                return resolve(file);
            }

            const canvas = document.createElement('canvas');
            const ratio = Math.min(maxWidth / img.width, 1);
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

// 读取文件为 data URL
function readAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// ========== 网格渲染 ==========

function initGrid() {
    puzzleGrid.innerHTML = '';
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell';
        cell.dataset.index = i;
        cell.dataset.name = getCellName(i);
        cell.title = `格子 ${getCellName(i)}`;
        cell.addEventListener('click', () => handleCellClick(i));

        if (uploadedImages[i]) {
            cell.classList.add('has-image');
            renderCellImage(cell, uploadedImages[i].url, i);
        }
        puzzleGrid.appendChild(cell);
    }
    updateUploadCount();
}

// 渲染格子：照片 + 目标图对应区域作为叠加层
function renderCellImage(cell, url, index) {
    cell.innerHTML = '';

    // 照片层
    const img = document.createElement('img');
    img.src = url;
    img.className = 'puzzle-img';
    cell.appendChild(img);

    // 叠加层：用目标图的对应区域（非纯色），保持自然色彩
    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;
    const tint = document.createElement('div');
    tint.className = 'cell-tint';
    tint.style.backgroundImage = `url(${CONFIG.targetImage})`;
    tint.style.backgroundSize = `${GRID_COLS * 100}% ${GRID_ROWS * 100}%`;
    // 百分比定位：让背景图的对应区域对齐到这个格子
    const xPos = GRID_COLS > 1 ? (col / (GRID_COLS - 1)) * 100 : 0;
    const yPos = GRID_ROWS > 1 ? (row / (GRID_ROWS - 1)) * 100 : 0;
    tint.style.backgroundPosition = `${xPos}% ${yPos}%`;
    tint.style.opacity = CONFIG.tintOpacity;
    cell.appendChild(tint);
}

// ========== 上传顺序（中心向外BFS） ==========

function getCenterOutOrder() {
    const order = [CENTER_INDEX];
    const visited = new Set([CENTER_INDEX]);
    const directions = [-GRID_COLS, GRID_COLS, -1, 1];
    let queue = [CENTER_INDEX];

    while (queue.length > 0 && order.length < TOTAL_CELLS) {
        const current = queue.shift();
        for (const dir of directions) {
            const neighbor = current + dir;
            if (neighbor < 0 || neighbor >= TOTAL_CELLS) continue;
            if (dir === -1 && current % GRID_COLS === 0) continue;
            if (dir === 1 && (current + 1) % GRID_COLS === 0) continue;
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                order.push(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return order;
}

function getNextCenterIndex() {
    const order = getCenterOutOrder();
    for (const idx of order) {
        if (!uploadedImages[idx]) return idx;
    }
    return -1;
}

// ========== 交互逻辑 ==========

function handleCellClick(index) {
    if (isUploading) return;
    currentEditIndex = index;
    if (uploadedImages[index]) {
        previewImg.src = uploadedImages[index].url;
        previewModal.classList.remove('hidden');
    } else {
        fileInput.click();
    }
}

function updateUploadCount() {
    const count = Object.keys(uploadedImages).length;
    uploadCount.textContent = `已上传 ${count}/${TOTAL_CELLS} 张`;
    if (count === TOTAL_CELLS) {
        uploadCount.textContent += ' ✨ 拼图完成！';
    }
}

function showCellLoading(cell) {
    cell.innerHTML =
        '<div class="flex items-center justify-center h-full"><i class="fa fa-spinner fa-spin text-white text-lg"></i></div>';
}

function setUploading(state) {
    isUploading = state;
    uploadBtn.disabled = state;
    uploadBtn.classList.toggle('opacity-50', state);
    uploadBtn.classList.toggle('cursor-not-allowed', state);
}

// 文件上传（本地模式：压缩后转 data URL）
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || currentEditIndex === -1) return;

    if (file.size > CONFIG.maxFileSizeMB * 1024 * 1024) {
        alert(`图片太大了，请选择 ${CONFIG.maxFileSizeMB}MB 以内的图片`);
        fileInput.value = '';
        return;
    }

    const cellName = getCellName(currentEditIndex);
    const cell = puzzleGrid.children[currentEditIndex];
    showCellLoading(cell);
    setUploading(true);

    try {
        const compressed = await compressImage(file);
        const dataUrl = await readAsDataURL(compressed);
        uploadedImages[currentEditIndex] = { url: dataUrl, cellName };
        cell.classList.add('has-image');
        renderCellImage(cell, dataUrl, currentEditIndex);
        updateUploadCount();
    } catch (err) {
        alert('处理图片失败，请重试');
        const color = cellColors[currentEditIndex];
        cell.innerHTML = '';
        cell.classList.remove('has-image');
        if (color) cell.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
        console.error(err);
    }

    setUploading(false);
    fileInput.value = '';
    currentEditIndex = -1;
});

// 预览弹窗
closePreview.addEventListener('click', () => {
    previewModal.classList.add('hidden');
    currentEditIndex = -1;
});

replaceBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
    fileInput.click();
});

deleteBtn.addEventListener('click', () => {
    if (currentEditIndex === -1) return;
    delete uploadedImages[currentEditIndex];
    const cell = puzzleGrid.children[currentEditIndex];
    cell.classList.remove('has-image');
    cell.innerHTML = '';
    updateUploadCount();
    previewModal.classList.add('hidden');
    currentEditIndex = -1;
});

// 重置
resetBtn.addEventListener('click', () => {
    if (!confirm('确定要重置所有拼图吗？已上传的图片将全部删除！')) return;
    uploadedImages = {};
    initGrid();
});

// 按钮上传
uploadBtn.addEventListener('click', () => {
    if (isUploading) return;
    const nextIndex = getNextCenterIndex();
    if (nextIndex === -1) {
        alert('拼图已满！60张照片已全部上传完成 ✨');
        return;
    }
    currentEditIndex = nextIndex;
    fileInput.click();
    const nextCell = puzzleGrid.children[nextIndex];
    nextCell.style.outline = '2px solid #fff';
    setTimeout(() => (nextCell.style.outline = 'none'), 2000);
});

// 关闭预览
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.classList.add('hidden');
        currentEditIndex = -1;
    }
});

// 响应式
window.addEventListener('resize', () => {
    const width = puzzleGrid.clientWidth;
    puzzleGrid.style.height = `${(width * GRID_ROWS) / GRID_COLS}px`;
});

// ========== 初始化 ==========

window.addEventListener('load', async () => {
    uploadCount.textContent = '加载中...';
    cellColors = await extractCellColors(CONFIG.targetImage);
    initGrid();
});
