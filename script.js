// 核心配置
const GRID_ROWS = 6;
const GRID_COLS = 10;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;
const CENTER_INDEX = 29; // 6×10中心位置索引（第30个格子）
let uploadedImages = {}; // { index: { url: '', cellName: '' } }
let currentEditIndex = -1;

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
const bgContainer = document.getElementById('bgContainer');
const uploadCount = document.getElementById('uploadCount');

// 生成格子名称：1-1, 1-2 ... 6-10
function getCellName(index) {
    const row = Math.floor(index / GRID_COLS) + 1;
    const col = (index % GRID_COLS) + 1;
    return `${row}-${col}`;
}

// 初始化网格
function initGrid() {
    puzzleGrid.innerHTML = '';
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell';
        cell.dataset.index = i;
        cell.dataset.name = getCellName(i); // 存储格子名称
        cell.title = `格子 ${getCellName(i)}`; // 鼠标悬停提示
        cell.addEventListener('click', () => handleCellClick(i));
        
        if (uploadedImages[i]) {
            renderCellImage(cell, uploadedImages[i].url);
        }
        puzzleGrid.appendChild(cell);
    }
    updateBgOpacity();
    updateUploadCount();
}

// 计算中心向外的上传顺序（按钮上传用）
function getCenterOutOrder() {
    const order = [CENTER_INDEX];
    const visited = new Set([CENTER_INDEX]);
    const directions = [-GRID_COLS, GRID_COLS, -1, 1]; // 上下左右
    let queue = [CENTER_INDEX];

    while (queue.length > 0 && order.length < TOTAL_CELLS) {
        const current = queue.shift();
        for (const dir of directions) {
            const neighbor = current + dir;
            if (neighbor < 0 || neighbor >= TOTAL_CELLS) continue;
            if (dir === -1 && current % GRID_COLS === 0) continue; // 左边界
            if (dir === 1 && (current + 1) % GRID_COLS === 0) continue; // 右边界
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                order.push(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return order;
}

// 获取下一个待上传的中心位置（按钮上传用）
function getNextCenterIndex() {
    const order = getCenterOutOrder();
    for (const idx of order) {
        if (!uploadedImages[idx]) return idx;
    }
    return -1;
}

// 处理格子点击（直接上传用）
function handleCellClick(index) {
    currentEditIndex = index;
    if (uploadedImages[index]) {
        previewImg.src = uploadedImages[index].url;
        previewModal.classList.remove('hidden');
    } else {
        fileInput.click();
    }
}

// 渲染格子图片（色调适配：soft-light混合模式）
function renderCellImage(cell, url) {
    cell.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.className = 'puzzle-img';
    cell.appendChild(img);
}

// 更新背景透明度：上传越多越清晰
function updateBgOpacity() {
    const count = Object.keys(uploadedImages).length;
    const opacity = 0.4 + (count / TOTAL_CELLS) * 0.5; // 0.4 → 0.9
    bgContainer.style.opacity = opacity;
}

// 更新上传计数
function updateUploadCount() {
    const count = Object.keys(uploadedImages).length;
    uploadCount.textContent = `已上传 ${count}/${TOTAL_CELLS} 张`;
    if (count === TOTAL_CELLS) {
        uploadCount.textContent += ' ✨ 拼图完成！';
        bgContainer.style.opacity = 0.9;
    }
}

// 文件上传处理
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || currentEditIndex === -1) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgUrl = event.target.result;
        uploadedImages[currentEditIndex] = {
            url: imgUrl,
            cellName: getCellName(currentEditIndex)
        };
        
        const cell = puzzleGrid.children[currentEditIndex];
        renderCellImage(cell, imgUrl);
        
        updateBgOpacity();
        updateUploadCount();
        fileInput.value = '';
        currentEditIndex = -1;
    };
    reader.readAsDataURL(file);
});

// 预览弹窗操作
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
    cell.innerHTML = '';
    updateBgOpacity();
    updateUploadCount();
    previewModal.classList.add('hidden');
    currentEditIndex = -1;
});

// 重置拼图
resetBtn.addEventListener('click', () => {
    if (confirm('确定要重置所有拼图吗？已上传的图片将全部删除！')) {
        uploadedImages = {};
        bgContainer.style.opacity = 0.4;
        initGrid();
    }
});

// 按钮上传：自动从中心向外填充
uploadBtn.addEventListener('click', () => {
    const nextIndex = getNextCenterIndex();
    if (nextIndex === -1) {
        alert('拼图已满！60张照片已全部上传完成 ✨');
        return;
    }
    currentEditIndex = nextIndex;
    fileInput.click();
    // 视觉提示
    const nextCell = puzzleGrid.children[nextIndex];
    nextCell.style.outline = '2px solid #2563eb';
    setTimeout(() => nextCell.style.outline = 'none', 2000);
});

// 点击外部关闭预览
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.classList.add('hidden');
        currentEditIndex = -1;
    }
});

// 初始化
window.addEventListener('load', initGrid);

// 响应式网格高度
window.addEventListener('resize', () => {
    const grid = document.getElementById('puzzleGrid');
    const width = grid.clientWidth;
    grid.style.height = `${width * GRID_ROWS / GRID_COLS}px`;
});
