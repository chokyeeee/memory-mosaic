// 核心配置
const GRID_ROWS = 6;
const GRID_COLS = 10;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;
const CENTER_POS = 29; // 6x10 中心索引
let uploadedImages = {};
let currentEditIndex = -1;
const UPLOAD_ORDER = calculateUploadOrder();

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

// 初始化网格
function initGrid() {
    puzzleGrid.innerHTML = '';
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => handleCellClick(i));
        
        if (uploadedImages[i]) {
            renderCellImage(cell, uploadedImages[i].url);
        }
        puzzleGrid.appendChild(cell);
    }
    updateBgOpacity();
    updateUploadCount();
}

// 计算中心向外上传顺序
function calculateUploadOrder() {
    const order = [CENTER_POS];
    const visited = new Set([CENTER_POS]);
    const directions = [-GRID_COLS, GRID_COLS, -1, 1];
    let queue = [CENTER_POS];

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

// 处理单元格点击
function handleCellClick(index) {
    const nextIndex = getNextUploadIndex();
    if (!uploadedImages[index] && index !== nextIndex && nextIndex !== -1) {
        alert(`请先上传中心向外第 ${UPLOAD_ORDER.indexOf(nextIndex) + 1} 个位置`);
        currentEditIndex = nextIndex;
        fileInput.click();
        return;
    }
    
    currentEditIndex = index;
    if (uploadedImages[index]) {
        previewImg.src = uploadedImages[index].url;
        previewModal.classList.remove('hidden');
    } else {
        fileInput.click();
    }
}

// 获取下一个待上传位置
function getNextUploadIndex() {
    for (const index of UPLOAD_ORDER) {
        if (!uploadedImages[index]) return index;
    }
    return -1;
}

// ✅ 修复渲染：直接设置 style，确保混合模式生效
function renderCellImage(cell, url) {
    cell.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    // 直接设置样式，不依赖 CSS 类名
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.mixBlendMode = 'soft-light';
    img.style.opacity = '0.85';
    img.style.transition = 'opacity 0.5s ease';
    cell.appendChild(img);
}

// ✅ 修复背景透明度：始终保持背景可见
function updateBgOpacity() {
    const count = Object.keys(uploadedImages).length;
    const opacity = 0.4 + (count / TOTAL_CELLS) * 0.5; // 0.4 → 0.9
    bgContainer.style.opacity = opacity;
}

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
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgUrl = event.target.result;
        uploadedImages[currentEditIndex] = { url: imgUrl };
        
        const cell = puzzleGrid.children[currentEditIndex];
        renderCellImage(cell, imgUrl);
        
        updateBgOpacity();
        updateUploadCount();
        fileInput.value = '';
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

// 一键上传（中心向外）
uploadBtn.addEventListener('click', () => {
    const nextIndex = getNextUploadIndex();
    if (nextIndex === -1) {
        alert('拼图已满！60张照片已全部上传完成 ✨');
        return;
    }
    
    currentEditIndex = nextIndex;
    fileInput.click();
    
    // 视觉提示
    const nextCell = puzzleGrid.children[nextIndex];
    nextCell.style.outline = '2px solid #165DFF';
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
