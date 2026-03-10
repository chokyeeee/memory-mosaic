const MAX_PHOTOS = 60;

const COLS = 10;
const ROWS = 6;

const TILE = 120;

const canvas = document.getElementById("mosaic");
const ctx = canvas.getContext("2d");

canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

let count = 0;

const target = new Image();
target.src = "target.jpg";

let colorMap = [];

target.onload = function(){

let temp = document.createElement("canvas");
let tctx = temp.getContext("2d");

temp.width = canvas.width;
temp.height = canvas.height;

tctx.drawImage(target,0,0,canvas.width,canvas.height);

let data = tctx.getImageData(0,0,temp.width,temp.height).data;

for(let y=0;y<ROWS;y++){

for(let x=0;x<COLS;x++){

let r=0,g=0,b=0,c=0;

for(let yy=0;yy<TILE;yy++){

for(let xx=0;xx<TILE;xx++){

let px=((y*TILE+yy)*temp.width+(x*TILE+xx))*4;

r+=data[px];
g+=data[px+1];
b+=data[px+2];

c++;

}

}

colorMap.push({

r:r/c,
g:g/c,
b:b/c

});

}

}

};

function uploadPhoto(){

if(count>=MAX_PHOTOS){

alert("拼图已完成");

return;

}

let file=document.getElementById("upload").files[0];

let img=new Image();

img.src=URL.createObjectURL(file);

img.onload=function(){

let size=Math.min(img.width,img.height);

let tile=document.createElement("canvas");

tile.width=TILE;
tile.height=TILE;

let tctx=tile.getContext("2d");

tctx.drawImage(

img,

(img.width-size)/2,
(img.height-size)/2,
size,
size,

0,
0,
TILE,
TILE

);

let index=count;
let targetColor=colorMap[index];

let imgData=tctx.getImageData(0,0,TILE,TILE);

let d=imgData.data;

for(let i=0;i<d.length;i+=4){

d[i]=(d[i]+targetColor.r)/2;
d[i+1]=(d[i+1]+targetColor.g)/2;
d[i+2]=(d[i+2]+targetColor.b)/2;

}

tctx.putImageData(imgData,0,0);

let x=index%COLS;
let y=Math.floor(index/COLS);

ctx.drawImage(tile,x*TILE,y*TILE);

count++;

document.getElementById("counter").innerText=count+" / 60";

}

}
