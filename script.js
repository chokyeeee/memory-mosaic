// 从 config.js 读取配置
const GRID_ROWS = CONFIG.gridRows;
const GRID_COLS = CONFIG.gridCols;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;
const CENTER_INDEX = CONFIG.centerIndex;

// 从 URL 读取版本号，如 ?v=2，默认 v1
const VERSION = new URLSearchParams(window.location.search).get('v') || '1';

let uploadedImages = {}; // { index: { url, cellName } }
let currentEditIndex = -1;
let isUploading = false;
let cellColors = [];
let useServer = false; // 是否使用 GitHub 存储（自动检测）
let syncTimer = null;
let isSyncing = false;
const SYNC_INTERVAL_MS = CONFIG.syncIntervalMs || 5000;
const LOCAL_CACHE_KEY = `memory-mosaic:v${VERSION}`;

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

function readAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// ========== 存储层：自动切换 GitHub / 本地 ==========

function saveLocalCache() {
    try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(uploadedImages));
    } catch (e) {
        console.warn('[本地缓存] 保存失败:', e.message);
    }
}

function loadLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            uploadedImages = parsed;
            console.log('[本地缓存] 已恢复图片数量:', Object.keys(uploadedImages).length);
        }
    } catch (e) {
        console.warn('[本地缓存] 读取失败:', e.message);
    }
}

function clearLocalCache() {
    try {
        localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch (e) {
        console.warn('[本地缓存] 清空失败:', e.message);
    }
}

function applyServerCells(cells) {
    const next = {};
    for (const cell of cells) {
        const index = cellNameToIndex(cell.name);
        next[index] = {
            url: `/api/image?v=${VERSION}&name=${cell.name}&t=${Date.now()}`,
            cellName: cell.name,
        };
    }
    uploadedImages = next;
    saveLocalCache();
    initGrid();
}

// 尝试连接服务器，成功则用 GitHub 存储
async function detectServerMode() {
    try {
        console.log(`[检测] 尝试连接 /api/cells?v=${VERSION} ...`);
        const res = await fetch(`/api/cells?v=${VERSION}`);
        console.log('[检测] /api/cells 响应状态:', res.status);
        if (res.ok) {
            useServer = true;
            const data = await res.json();
            console.log('[检测] 服务器模式已启用，已有图片:', data.cells.length, '张');
            console.log('[检测] 图片列表:', data.cells.map(c => c.name));
            const cachedRaw = localStorage.getItem(LOCAL_CACHE_KEY);
            let cachedCount = 0;
            if (cachedRaw) {
                try {
                    const parsed = JSON.parse(cachedRaw);
                    cachedCount = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
                } catch (e) {
                    cachedCount = 0;
                }
            }
            if (data.cells.length === 0 && cachedCount > 0) {
                // 服务端暂时空列表时，优先保留本地缓存，避免刷新后误清空
                loadLocalCache();
                initGrid();
            } else {
                applyServerCells(data.cells);
            }
        } else {
            const text = await res.text();
            console.warn('[检测] /api/cells 返回非 200:', res.status, text);
            useServer = false;
            loadLocalCache();
        }
    } catch (e) {
        console.warn('[检测] 无法连接服务器，使用本地模式:', e.message);
        useServer = false;
        loadLocalCache();
    }
}

async function syncFromServer() {
    if (!useServer || isUploading || isSyncing) return;
    isSyncing = true;
    try {
        const res = await fetch(`/api/cells?v=${VERSION}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const currentNames = Object.values(uploadedImages).map((x) => x.cellName).sort();
        const nextNames = data.cells.map((x) => x.name).sort();
        if (JSON.stringify(currentNames) !== JSON.stringify(nextNames)) {
            applyServerCells(data.cells);
            console.log('[同步] 检测到更新，已刷新拼图');
        }
    } catch (e) {
        console.warn('[同步] 拉取失败:', e.message);
    } finally {
        isSyncing = false;
    }
}

function startAutoSync() {
    if (!useServer) return;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(syncFromServer, SYNC_INTERVAL_MS);
}

// 上传图片
async function handleUpload(cellName, file, cellIndex) {
    console.log(`[上传] 开始上传 ${cellName}，原始大小: ${(file.size / 1024).toFixed(1)}KB，类型: ${file.type}`);
    const compressed = await compressImage(file);
    console.log(`[上传] 压缩后大小: ${(compressed.size / 1024).toFixed(1)}KB`);

    if (useServer) {
        console.log(`[上传] 使用服务器模式，PUT /api/upload?v=${VERSION}&name=${cellName}`);
        const res = await fetch(`/api/upload?v=${VERSION}&name=${cellName}`, {
            method: 'PUT',
            headers: { 'Content-Type': compressed.type },
            body: compressed,
        });
        console.log(`[上传] 服务器响应状态: ${res.status}`);
        if (!res.ok) {
            const err = await res.json();
            console.error('[上传] 服务器返回错误:', err);
            throw new Error(err.error || '上传失败');
        }
        const url = `/api/image?v=${VERSION}&name=${cellName}&t=${Date.now()}`;
        console.log(`[上传] 上传成功，图片地址: ${url}`);
        return url;
    } else {
        console.log(`[上传] 使用本地模式，转为 data URL`);
        return await readAsDataURL(compressed);
    }
}

// 删除图片
async function handleDelete(cellName) {
    if (useServer) {
        console.log(`[删除] DELETE /api/delete?v=${VERSION}&name=${cellName}`);
        const res = await fetch(`/api/delete?v=${VERSION}&name=${cellName}`, { method: 'DELETE' });
        console.log(`[删除] 响应状态: ${res.status}`);
        if (!res.ok) throw new Error('删除失败');
        console.log(`[删除] ${cellName} 删除成功`);
    } else {
        console.log(`[删除] 本地模式，移除 ${cellName}`);
    }
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

    const img = document.createElement('img');
    img.src = url;
    img.className = 'puzzle-img';
    cell.appendChild(img);

    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;
    const tint = document.createElement('div');
    tint.className = 'cell-tint';
    tint.style.backgroundImage = `url(${CONFIG.targetImage})`;
    tint.style.backgroundSize = `${GRID_COLS * 100}% ${GRID_ROWS * 100}%`;
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
    const modeLabel = useServer ? '' : '（本地模式）';
    uploadCount.textContent = `已上传 ${count}/${TOTAL_CELLS} 张${modeLabel}`;
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

// 文件上传
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
        const imageUrl = await handleUpload(cellName, file, currentEditIndex);
        uploadedImages[currentEditIndex] = { url: imageUrl, cellName };
        cell.classList.add('has-image');
        renderCellImage(cell, imageUrl, currentEditIndex);
        updateUploadCount();
        saveLocalCache();
    } catch (err) {
        alert('上传失败，请重试');
        cell.innerHTML = '';
        cell.classList.remove('has-image');
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

deleteBtn.addEventListener('click', async () => {
    if (currentEditIndex === -1) return;
    const cellName = getCellName(currentEditIndex);

    try {
        await handleDelete(cellName);
        delete uploadedImages[currentEditIndex];
        const cell = puzzleGrid.children[currentEditIndex];
        cell.classList.remove('has-image');
        cell.innerHTML = '';
        updateUploadCount();
        saveLocalCache();
    } catch (err) {
        alert('删除失败，请重试');
        console.error(err);
    }

    previewModal.classList.add('hidden');
    currentEditIndex = -1;
});

// 重置
resetBtn.addEventListener('click', async () => {
    if (!confirm('确定要重置所有拼图吗？已上传的图片将全部删除！')) return;

    if (useServer) {
        setUploading(true);
        try {
            const names = Object.values(uploadedImages).map((img) => img.cellName);
            for (const name of names) {
                await handleDelete(name);
            }
        } catch (err) {
            alert('重置失败，请重试');
            console.error(err);
            setUploading(false);
            return;
        }
        setUploading(false);
    }

    uploadedImages = {};
    clearLocalCache();
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

// ========== 导出图片 ==========

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

document.getElementById('exportBtn').addEventListener('click', async () => {
    const count = Object.keys(uploadedImages).length;
    if (count === 0) {
        alert('还没有上传任何照片');
        return;
    }

    const btn = document.getElementById('exportBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> 生成中...';

    try {
        // 画布尺寸（高清输出）
        const EXPORT_W = GRID_COLS * 200; // 每格 200px
        const EXPORT_H = GRID_ROWS * 200;
        const cellW = 200;
        const cellH = 200;

        const canvas = document.createElement('canvas');
        canvas.width = EXPORT_W;
        canvas.height = EXPORT_H;
        const ctx = canvas.getContext('2d');

        // 1. 画背景目标图
        const bgImg = await loadImage(CONFIG.targetImage);
        ctx.drawImage(bgImg, 0, 0, EXPORT_W, EXPORT_H);

        // 2. 空格子画白色半透明蒙版
        for (let i = 0; i < TOTAL_CELLS; i++) {
            if (!uploadedImages[i]) {
                const row = Math.floor(i / GRID_COLS);
                const col = i % GRID_COLS;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
            }
        }

        // 3. 有图的格子：画照片 + 目标图色调叠加
        for (const [indexStr, data] of Object.entries(uploadedImages)) {
            const i = parseInt(indexStr);
            const row = Math.floor(i / GRID_COLS);
            const col = i % GRID_COLS;
            const x = col * cellW;
            const y = row * cellH;

            // 画上传的照片
            try {
                const photo = await loadImage(data.url);
                // 居中裁剪（模拟 object-fit: cover）
                const srcRatio = photo.width / photo.height;
                const dstRatio = cellW / cellH;
                let sx, sy, sw, sh;
                if (srcRatio > dstRatio) {
                    sh = photo.height;
                    sw = sh * dstRatio;
                    sx = (photo.width - sw) / 2;
                    sy = 0;
                } else {
                    sw = photo.width;
                    sh = sw / dstRatio;
                    sx = 0;
                    sy = (photo.height - sh) / 2;
                }
                ctx.drawImage(photo, sx, sy, sw, sh, x, y, cellW, cellH);

                // 叠加目标图对应区域（半透明）
                ctx.globalAlpha = CONFIG.tintOpacity;
                const bgSx = (col / GRID_COLS) * bgImg.width;
                const bgSy = (row / GRID_ROWS) * bgImg.height;
                const bgSw = bgImg.width / GRID_COLS;
                const bgSh = bgImg.height / GRID_ROWS;
                ctx.drawImage(bgImg, bgSx, bgSy, bgSw, bgSh, x, y, cellW, cellH);
                ctx.globalAlpha = 1.0;
            } catch (e) {
                console.warn(`[导出] 加载图片失败: ${data.cellName}`, e);
            }
        }

        // 4. 画网格线
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        for (let r = 1; r < GRID_ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellH);
            ctx.lineTo(EXPORT_W, r * cellH);
            ctx.stroke();
        }
        for (let c = 1; c < GRID_COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellW, 0);
            ctx.lineTo(c * cellW, EXPORT_H);
            ctx.stroke();
        }

        // 5. 导出：弹出图片，支持手机长按保存
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const overlay = document.createElement('div');
        overlay.id = 'exportOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <p style="color:#fff;margin-bottom:12px;font-size:14px;">长按图片保存到相册</p>
            <img src="${dataUrl}" style="max-width:90vw;max-height:70vh;border-radius:8px;">
            <button onclick="this.parentElement.remove()" style="margin-top:16px;padding:10px 32px;background:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">关闭</button>
        `;
        document.body.appendChild(overlay);

        console.log(`[导出] 成功，尺寸: ${EXPORT_W}x${EXPORT_H}`);
    } catch (err) {
        alert('导出失败，请重试');
        console.error('[导出] 失败:', err);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-download mr-2"></i> 导出图片';
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
    console.log('[初始化] 开始加载...');
    console.log('[初始化] 目标图:', CONFIG.targetImage);
    uploadCount.textContent = '加载中...';
    cellColors = await extractCellColors(CONFIG.targetImage);
    console.log('[初始化] 颜色提取完成，共', cellColors.length, '个格子');
    await detectServerMode();
    if (!useServer) {
        initGrid();
    } else {
        clearLocalCache();
        startAutoSync();
    }
    console.log(`[初始化] 完成。存储模式: ${useServer ? 'GitHub（持久化）' : '本地（浏览器持久化）'}，已加载 ${Object.keys(uploadedImages).length} 张图片`);
});
