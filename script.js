// 核心配置参数
const MAX_PHOTOS = 60; // 总拼图数量
const COLS = 10;       // 列数
const ROWS = 6;        // 行数
const TILE = 120;      // 每格尺寸(px)

// 获取画布和上下文
const canvas = document.getElementById("mosaic");
const ctx = canvas.getContext("2d");

// 设置画布尺寸
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

// 已上传照片计数
let count = 0;

// 加载背景图
const target = new Image();
target.src = "target.jpg"; // 匹配你仓库里的背景图文件名
target.crossOrigin = "anonymous"; // 解决跨域加载问题

// 背景图加载失败提示
target.onerror = function() {
  alert("❌ 背景图加载失败！请检查：\n1. 文件名是否为 bg.jpg\n2. 文件是否在根目录\n3. 文件格式是否为 jpg");
};

// 存储每个格子的目标色调
let colorMap = [];

// 背景图加载完成后处理
target.onload = function() {
  // 创建临时画布计算色调
  let temp = document.createElement("canvas");
  let tctx = temp.getContext("2d");
  temp.width = canvas.width;
  temp.height = canvas.height;
  
  // 绘制背景图到临时画布
  tctx.drawImage(target, 0, 0, canvas.width, canvas.height);
  
  // 获取背景图像素数据
  let data = tctx.getImageData(0, 0, temp.width, temp.height).data;
  
  // 计算每个格子的平均色调
  for(let y = 0; y < ROWS; y++) {
    for(let x = 0; x < COLS; x++) {
      let r = 0, g = 0, b = 0, pixelCount = 0;
      
      // 遍历当前格子的所有像素
      for(let yy = 0; yy < TILE; yy++) {
        for(let xx = 0; xx < TILE; xx++) {
          let pixelIndex = ((y * TILE + yy) * temp.width + (x * TILE + xx)) * 4;
          r += data[pixelIndex];
          g += data[pixelIndex + 1];
          b += data[pixelIndex + 2];
          pixelCount++;
        }
      }
      
      // 存储当前格子的平均色调
      colorMap.push({
        r: r / pixelCount,
        g: g / pixelCount,
        b: b / pixelCount
      });
    }
  }
  
  // ✅ 核心修复：将背景图绘制到主画布（能看到背景了）
  ctx.drawImage(target, 0, 0, canvas.width, canvas.height);
};

// 上传照片核心函数
function uploadPhoto() {
  // 检查是否已填满
  if(count >= MAX_PHOTOS) {
    alert("🎉 拼图已全部完成！");
    return;
  }
  
  // 获取上传文件
  let fileInput = document.getElementById("upload");
  if(!fileInput.files || fileInput.files.length === 0) {
    alert("⚠️ 请先选择一张照片再上传！");
    return;
  }
  
  let file = fileInput.files[0];
  // 只允许图片格式
  if(!file.type.startsWith("image/")) {
    alert("❌ 请上传图片格式的文件（jpg/png等）！");
    return;
  }
  
  // 加载上传的图片
  let img = new Image();
  img.src = URL.createObjectURL(file);
  
  img.onload = function() {
    // 1. 中心裁剪为1:1比例
    let size = Math.min(img.width, img.height);
    let tileCanvas = document.createElement("canvas");
    tileCanvas.width = TILE;
    tileCanvas.height = TILE;
    let tileCtx = tileCanvas.getContext("2d");
    
    // 绘制并裁剪图片
    tileCtx.drawImage(
      img,
      (img.width - size) / 2,  // 裁剪起始X
      (img.height - size) / 2, // 裁剪起始Y
      size, size,              // 裁剪尺寸
      0, 0,                    // 绘制起始位置
      TILE, TILE               // 目标尺寸
    );
    
    // 2. 匹配对应格子的背景色调
    let currentIndex = count;
    let targetColor = colorMap[currentIndex];
    
    // 获取裁剪后图片的像素数据
    let imgData = tileCtx.getImageData(0, 0, TILE, TILE);
    let pixelData = imgData.data;
    
    // 混合色调（上传图片色调 + 背景格子色调）
    for(let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = (pixelData[i] + targetColor.r) / 2;     // R通道
      pixelData[i + 1] = (pixelData[i + 1] + targetColor.g) / 2; // G通道
      pixelData[i + 2] = (pixelData[i + 2] + targetColor.b) / 2; // B通道
      // 保留透明度（A通道）
    }
    
    // 应用色调调整后的像素数据
    tileCtx.putImageData(imgData, 0, 0);
    
    // 3. 计算当前照片的位置并绘制到画布
    let posX = currentIndex % COLS * TILE;  // X坐标
    let posY = Math.floor(currentIndex / COLS) * TILE; // Y坐标
    ctx.drawImage(tileCanvas, posX, posY);
    
    // 4. 更新计数
    count++;
    document.getElementById("counter").innerText = count + " / 60";
    
    // 清空文件选择框（方便再次上传）
    fileInput.value = "";
  };
  
  // 图片加载失败处理
  img.onerror = function() {
    alert("❌ 图片加载失败，请换一张照片试试！");
  };
}
