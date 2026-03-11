// 核心修改：简化 renderCellImage 函数
function renderCellImage(cell, url) {
    cell.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    // 移除 bg-blend，直接显示图片
    img.className = 'w-full h-full object-cover transition-all duration-500';
    cell.appendChild(img);
    cell.classList.remove('bg-gray-100/50');
    cell.classList.add('bg-white');
}

// 修复文件上传错误处理
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('上传文件:', file); // 调试日志
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imgUrl = event.target.result;
            uploadedImages[currentEditIndex] = { url: imgUrl };
            
            const cell = puzzleGrid.children[currentEditIndex];
            if (!cell) throw new Error('单元格不存在');
            
            renderCellImage(cell, imgUrl);
            updateBgOpacity();
            updateUploadCount();
            console.log('图片渲染成功');
        } catch (err) {
            console.error('渲染失败:', err);
            alert('图片加载失败，请重试');
        }
    };
    reader.onerror = (err) => {
        console.error('文件读取失败:', err);
        alert('文件读取失败');
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // 清空以支持重复上传
});
