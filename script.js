// 核心配置
const GRID_ROWS = 6;
const GRID_COLS = 10;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;
const CENTER_POS = 29; // 6x10 中心索引（第30个格子）
let uploadedImages = {};
let currentEditIndex = -1;
// 预计算的中心向外上传顺序（固定）
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
        cell.className = `puzzle-cell bg-gray-100/50`;
        cell.dataset.index = i;
        // 标记上传优先级（用于视觉提示，可选）
        cell.dataset.order = UPLOAD_ORDER.indexOf(i) + 1;
        cell.addEventListener('click', () => handleCellClick(i));
        
        if (uploadedImages[i]) {
            renderCellImage(cell, uploadedImages[i].url, uploadedImages[i].blendMode);
        }
        puzzleGrid.appendChild(cell);
    }
    updateBgOpacity();
    updateUploadCount();
}

// 预计算中心向外的上传顺序（仅计算一次，提升性能）
function calculateUploadOrder() {
    const order = [CENTER_POS];
    const visited = new Set([CENTER_POS]);
    const directions = [-GRID_COLS, GRID_COLS, -1, 1]; // 上下左右
    let queue = [CENTER_POS];

    while (queue.length > 0 && order.length < TOTAL_CELLS) {
        const current = queue.shift();
        for (const dir of directions) {
            const neighbor = current + dir;
            if (neighbor < 0 || neighbor >= TOTAL_CELLS) continue;
            
            const currentRow = Math.floor(current / GRID_COLS);
            const neighborRow = Math.floor(neighbor / GRID_COLS);
            // 防止跨列（比如第10列不能向右，第0列不能向左）
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

// 智能选择混合模式（核心优化1：色调适配）
function getOptimalBlendMode(imgUrl, cellIndex) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imgUrl;
        
        img.onload = () => {
            // 创建画布分析图片色调
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 50;
            canvas.height = 50;
            ctx.drawImage(img, 0, 0, 50, 50);
            
            // 获取图片像素数据
            const imageData = ctx.getImageData(0, 0, 50, 50);
            const data = imageData.data;
            let brightnessSum = 0;
            let saturationSum = 0;
            
            // 计算平均亮度和饱和度
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i] / 255;
                const g = data[i+1] / 255;
                const b = data[i+2] / 255;
                
                // 计算亮度（HSL的L）
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const brightness = (max + min) / 2;
                
                // 计算饱和度（HSL的S）
                const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * brightness - 1));
                
                brightnessSum += brightness;
                saturationSum += saturation;
            }
            
            const avgBrightness = brightnessSum / (data.length / 4);
            const avgSaturation = saturationSum / (data.length / 4);
            
            // 根据亮度/饱和度选择最优混合模式
            if (avgBrightness < 0.3) {
                // 暗色调图片 → screen模式（提亮，保留背景）
                resolve('blend-screen');
            } else if (avgBrightness > 0.7) {
                // 亮色调图片 → multiply模式（压暗，融合背景）
                resolve('blend-multiply');
            } else if (avgSaturation < 0.2) {
                // 低饱和度（黑白）→ overlay模式（增强对比）
                resolve('blend-overlay');
            } else if (cellIndex === CENTER_POS) {
                // 中心位置 → soft-light（柔和，突出核心）
                resolve('blend-soft-light');
            } else {
                // 常规图片 → luminosity（保留色调，融合亮度）
                resolve('blend-luminosity');
            }
        };
        
        // 异常处理：默认使用overlay
        img.onerror = () => resolve('blend-overlay');
    });
}

// 处理单元格点击
function handleCellClick(index) {
    // 点击上传时，强制遵循中心向外顺序（核心优化2）
    const nextIndex = getNextUploadIndex();
    if (!uploadedImages[index] && index !== nextIndex && nextIndex !== -1) {
        alert(`请先上传第 ${nextIndex + 1} 个位置（中心向外第 ${UPLOAD_ORDER.indexOf(nextIndex) + 1} 个）的图片`);
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

// 获取下一个待上传的位置（严格按中心向外顺序）
function getNextUploadIndex() {
    for (const index of UPLOAD_ORDER) {
        if (!uploadedImages[index]) {
            return index;
        }
    }
    return -1; // 全部上传完成
}

// 渲染单元格图片（应用智能混合模式）
function renderCellImage(cell, url, blendMode) {
    cell.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    // 应用混合模式，保证背景和上传图色调和谐
    img.className = `w-full h-full object-cover ${blendMode || 'blend-overlay'} transition-all duration-700`;
    cell.appendChild(img);
    cell.classList.remove('bg-gray-100/50');
    cell.classList.add('bg-white/20'); // 轻微透明白底，提升可读性
}

// 更新背景透明度
function updateBgOpacity() {
    const count = Object.keys(uploadedImages).length;
    // 调整透明度曲线：前半段缓慢提升，后半段快速提升
    let opacity;
    if (count < 30) {
        opacity = 0.3 + (count / 30) * 0.2; // 0.3 → 0.5
    } else {
        opacity = 0.5 + ((count - 30) / 30) * 0.5; // 0.5 → 1.0
    }
    bgContainer.style.opacity = opacity;
}

// 更新上传计数
function updateUploadCount() {
    const count = Object.keys(uploadedImages).length;
    uploadCount.textContent = `已上传 ${count}/${TOTAL_CELLS} 张`;
    
    // 全部上传完成提示
    if (count === TOTAL_CELLS) {
        uploadCount.textContent += ' ✨ 拼图完成！';
        bgContainer.style.opacity = 1; // 背景图完全清晰
    }
}

// 文件上传处理（新增混合模式逻辑）
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const imgUrl = event.target.result;
        // 获取最优混合模式
        const blendMode = await getOptimalBlendMode(imgUrl, currentEditIndex);
        
        uploadedImages[currentEditIndex] = { 
            url: imgUrl,
            blendMode: blendMode // 保存混合模式
        };
        
        const cell = puzzleGrid.children[currentEditIndex];
        renderCellImage(cell, imgUrl, blendMode);
        
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
    cell.classList.add('bg-gray-100/50');
    cell.classList.remove('bg-white/20');
    
    updateBgOpacity();
    updateUploadCount();
    previewModal.classList.add('hidden');
    currentEditIndex = -1;
});

// 重置拼图
resetBtn.addEventListener('click', () => {
    if (confirm('确定要重置所有拼图吗？已上传的图片将全部删除！')) {
        uploadedImages = {};
        bgContainer.style.opacity = 0.3;
        initGrid();
    }
});

// 一键上传（强制按中心向外顺序）
uploadBtn.addEventListener('click', () => {
    const nextIndex = getNextUploadIndex();
    if (nextIndex === -1) {
        alert('拼图已满！60张照片已全部上传完成 ✨');
        return;
    }
    
    currentEditIndex = nextIndex;
    fileInput.click();
    
    // 视觉提示：高亮下一个待上传位置
    const nextCell = puzzleGrid.children[nextIndex];
    nextCell.classList.add('ring-2', 'ring-primary', 'ring-opacity-50');
    setTimeout(() => {
        nextCell.classList.remove('ring-2', 'ring-primary', 'ring-opacity-50');
    }, 2000);
});

// 点击外部关闭
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.classList.add('hidden');
        currentEditIndex = -1;
    }
});

// 初始化
window.addEventListener('load', initGrid);

// 窗口大小调整时重新计算网格高度
window.addEventListener('resize', () => {
    const grid = document.getElementById('puzzleGrid');
    const width = grid.clientWidth;
    grid.style.height = `${width * GRID_ROWS / GRID_COLS}px`;
});
