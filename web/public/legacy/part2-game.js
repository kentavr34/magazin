// Профиль заводится тихо, без формы ника и пароля — она осталась
// на index.html. Как только известно, онлайн игрок или нет,
// подтягиваем сохранение (слот 2) и обновляем кнопку "ПРОДОЛЖИТЬ".
// Раньше это же самое ждало в вызове ниже до определения онлайн-статуса —
// из-за этого восстановление с другого устройства могло не успеть
// и кнопка показывала бы только то, что уже лежит на этом телефоне.
if(window.Profile){
  Profile.init(function(){
    Profile.load(2,function(data){
      if(data){SAVE.has=true;SAVE.id=data.id;SAVE.name=data.name;SAVE.inv=data.inv;}
      if(typeof menuOpen==='function')menuOpen();
    });
  });
}

// ============================================================
//  ЯДРО: сцена, текстуры, материалы
// ============================================================
var scene,camera,renderer,ambientLight,sunLight;
var bloomCv,bloomCtx;
var LIGHT_POOL=[],LAMPS=[];   // позиции светильников уровня
var W=innerWidth,H=innerHeight;
var started=false,dead=false,lastT=0;
var PHASE='store';   // store | follow | bed | blackout | loading | corridor

var P={x:12,z:15,y:0,vy:0,yaw:Math.PI,pitch:0,onGround:true,jump:false,eye:0.9};
var EYE_H=0.9,CROUCH_H=0.46,JUMP_V=0.082;   // прыжок выше, чем в первой части

// ---------- процедурные текстуры ----------
function makeTex(draw,rep){
  // Рисуем всегда в координатах 256, а холст берём крупнее и масштабируем
  // контекст. Так рисунок остаётся тем же самым, просто становится чётче:
  // ни одна толщина линии и ни одна крапина не «поедет».
  var S=window.DETAIL?DETAIL.texSize():256;
  var c=document.createElement('canvas');c.width=c.height=S;
  var g=c.getContext('2d');
  if(S!==256)g.scale(S/256,S/256);
  draw(g,256);
  var t=new THREE.CanvasTexture(c);
  t.encoding=THREE.sRGBEncoding;t.anisotropy=window.DETAIL?DETAIL.aniso():4;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep||1,rep||1);
  return t;
}
function speckle(g,s,n,r,gr,b,a){for(var i=0;i<n;i++){g.fillStyle='rgba('+r+','+gr+','+b+','+(Math.random()*a).toFixed(3)+')';g.fillRect(Math.random()*s,Math.random()*s,1,1);}}
function blotch(g,s,n,col,r0,r1){for(var i=0;i<n;i++){var x=Math.random()*s,y=Math.random()*s,r=r0+Math.random()*(r1-r0);var gd=g.createRadialGradient(x,y,0,x,y,r);gd.addColorStop(0,col);gd.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gd;g.beginPath();g.arc(x,y,r,0,6.283);g.fill();}}

var TEX={};
function buildTextures(){
  // ЧИСТАЯ стена магазина — это сон, здесь всё в порядке
  TEX.wallClean=makeTex(function(g,s){
    g.fillStyle='#ffffff';g.fillRect(0,0,s,s);
    speckle(g,s,4000,205,203,198,0.18);
    blotch(g,s,8,'rgba(215,212,205,0.25)',24,70);
  },2);
  // Плитка пола — та самая, что понравилась в первой части
  TEX.tile=makeTex(function(g,s){
    g.fillStyle='#ffffff';g.fillRect(0,0,s,s);
    speckle(g,s,14000,196,194,190,0.22);
    blotch(g,s,10,'rgba(180,178,172,0.20)',20,60);
    g.strokeStyle='rgba(140,138,132,0.7)';g.lineWidth=4;
    g.strokeRect(0,0,s,s);g.beginPath();
    g.moveTo(s/2,0);g.lineTo(s/2,s);g.moveTo(0,s/2);g.lineTo(s,s/2);g.stroke();
  },3);
  TEX.wood=makeTex(function(g,s){
    g.fillStyle='#ffffff';g.fillRect(0,0,s,s);
    for(var p=0;p<4;p++){
      var y=p*(s/4);
      g.fillStyle='rgba('+(178+Math.random()*40|0)+','+(148+Math.random()*32|0)+',115,0.26)';
      g.fillRect(0,y,s,s/4);
      g.strokeStyle='rgba(70,52,32,0.5)';g.lineWidth=2;
      g.beginPath();g.moveTo(0,y);g.lineTo(s,y);g.stroke();
      for(var v=0;v<14;v++){
        g.strokeStyle='rgba(90,66,40,'+(0.05+Math.random()*0.1).toFixed(2)+')';g.lineWidth=0.7;
        var yy=y+Math.random()*(s/4);
        g.beginPath();g.moveTo(0,yy);g.bezierCurveTo(s*0.3,yy+3,s*0.7,yy-3,s,yy);g.stroke();
      }
    }
  },2);
  TEX.fabric=makeTex(function(g,s){
    g.fillStyle='#ffffff';g.fillRect(0,0,s,s);
    for(var i=0;i<s;i+=3){
      g.fillStyle='rgba(120,95,70,0.14)';g.fillRect(i,0,1.4,s);
      g.fillStyle='rgba(255,248,238,0.10)';g.fillRect(0,i,s,1.4);
    }
    speckle(g,s,4000,150,130,105,0.16);
  },4);
  // Ценник — белая карточка с цифрами
  TEX.tag=makeTex(function(g,s){
    g.fillStyle='#f6f4ee';g.fillRect(0,0,s,s);
    g.fillStyle='#c81f24';g.fillRect(0,0,s,s*0.22);
    g.fillStyle='#1a1a1a';g.font='bold '+(s*0.30)+'px monospace';g.textAlign='center';
    g.fillText((Math.floor(Math.random()*89)+10)+'99',s/2,s*0.62);
    g.font=(s*0.11)+'px monospace';g.fillStyle='#555';
    g.fillText('РАСПРОДАЖА',s/2,s*0.85);
  },1);
}

var MATS={};
function buildMaterials(){
  function m(c,r,mt){return new THREE.MeshStandardMaterial({color:c,roughness:r===undefined?0.85:r,metalness:mt||0});}
  MATS.wall=m(0xdedbd4,0.9);
  MATS.floor=m(0xe8e6e0,0.35,0.12);
  MATS.ceil=m(0xf2f0ea,0.95);
  MATS.shelf=m(0xb9b6ae,0.7,0.25);
  MATS.wood=m(0x8a6440,0.85);
  MATS.sofa=m(0x9a6a44,0.9);
  MATS.bedFrame=m(0x4a4860,0.7,0.25);
  MATS.matt=m(0xecebe6,0.9);
  MATS.pillow=m(0xf4f2ee,0.85);
  MATS.metal=m(0x9a9a9a,0.4,0.8);
  MATS.dark=m(0x2a2724,0.9);
  MATS.corrWall=m(0x6a6258,0.95);
  MATS.corrFloor=m(0x4a453e,0.8);
  MATS.tag=new THREE.MeshStandardMaterial({map:TEX.tag,roughness:0.7});
  MATS.wall.map=TEX.wallClean;MATS.wall.bumpMap=TEX.wallClean;MATS.wall.bumpScale=0.02;
  MATS.floor.map=TEX.tile;MATS.floor.bumpMap=TEX.tile;MATS.floor.bumpScale=0.012;
  MATS.wood.map=TEX.wood;MATS.wood.bumpMap=TEX.wood;MATS.wood.bumpScale=0.03;
  MATS.sofa.map=TEX.fabric;MATS.sofa.bumpMap=TEX.fabric;MATS.sofa.bumpScale=0.025;
  MATS.matt.map=TEX.fabric;
  MATS.corrWall.map=TEX.wallClean;MATS.corrWall.bumpMap=TEX.wallClean;MATS.corrWall.bumpScale=0.06;
  MATS.corrFloor.map=TEX.tile;
  // Из тех же картинок считаются нормал-карты: свет начинает ложиться
  // на шов плитки, на волокно доски и на переплетение ткани.
  if(window.DETAIL)DETAIL.upgradeMaterials(MATS);
}

// Страховка от появления внутри мебели: ищем ближайшее свободное место.
// Именно так игрок застрял в столе на складе.
function unstick(r){
  r=r||0.30;
  if(!blocked(P.x,P.z,r))return true;
  for(var rad=0.4;rad<=8;rad+=0.4){
    for(var a=0;a<24;a++){
      var ang=a*Math.PI/12;
      var nx=P.x+Math.cos(ang)*rad, nz=P.z+Math.sin(ang)*rad;
      if(!blocked(nx,nz,r)){P.x=nx;P.z=nz;return true;}
    }
  }
  return false;
}

// ---------- утилиты сцены ----------
var objs=[];
// DETAIL.tagShadow помечает объект: пол и стены принимают тень,
// мебель ещё и отбрасывает. На слабом качестве вызов ничего не делает.
function addObj(o){scene.add(o);objs.push(o);if(window.DETAIL)DETAIL.tagShadow(o);return o;}
function clearScene(){objs.forEach(function(o){scene.remove(o);if(o.geometry)o.geometry.dispose();});objs=[];}
function box(w,h,d,mat,x,y,z,ry){
  var m2=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m2.position.set(x,y,z); if(ry)m2.rotation.y=ry;
  return addObj(m2);
}

function makeEnvMap(){
  // Простая процедурная env-карта (6 маленьких градиентных canvas-
  // граней, тёплый горизонт/тёмный верх-низ) — до этого
  // envMapIntensity уже был выставлен на все материалы
  // (DETAIL.upgradeMaterials), но отражать было нечего, параметр
  // был мёртвым. Дешёво (6×64×64), можно на любом уровне качества.
  var size=64;
  function face(top,bottom){
    var c=document.createElement('canvas');c.width=size;c.height=size;
    var ctx=c.getContext('2d');
    var g=ctx.createLinearGradient(0,0,0,size);
    g.addColorStop(0,top);g.addColorStop(1,bottom);
    ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
    return c;
  }
  var horizon='#3a3020',sky='#0a0806',floorC='#141008';
  var cube=new THREE.CubeTexture([
    face(horizon,horizon),face(horizon,horizon),
    face(sky,horizon),face(horizon,floorC),
    face(horizon,horizon),face(horizon,horizon)
  ]);
  cube.needsUpdate=true;
  return cube;
}
function initThree(){
  scene=new THREE.Scene();
  scene.environment=makeEnvMap();
  renderer=new THREE.WebGLRenderer({antialias:window.DETAIL?DETAIL.wantAA():false});
  renderer.setSize(W,H);
  // Потолок разрешения задаёт DETAIL и сам двигает его по загрузке кадра.
  renderer.setPixelRatio(window.DETAIL?DETAIL.pixelRatio():Math.min(devicePixelRatio||1,1.5));
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  document.getElementById('renderer').appendChild(renderer.domElement);
  // Bloom без EffectComposer — тот же приём, что и в part1.html: даунскейл
  // готового кадра в маленький 2D-канвас, CSS blur + mix-blend-mode:screen
  // поверх сцены. См. подробный комментарий в part1.html/initThree().
  bloomCv=document.getElementById('bloomcv');
  bloomCtx=bloomCv?bloomCv.getContext('2d',{alpha:false}):null;
  function resizeBloom(){
    if(!bloomCv)return;
    bloomCv.width=Math.max(48,Math.round(W/6));
    bloomCv.height=Math.max(27,Math.round(H/6));
  }
  resizeBloom();
  window.__resizeBloom=resizeBloom;
  camera=new THREE.PerspectiveCamera(74,W/H,0.05,120);
  scene.add(camera);
  ambientLight=new THREE.AmbientLight(0xfff2e0,1.15);   // сон: света много, теней почти нет
  scene.add(ambientLight);
  sunLight=new THREE.DirectionalLight(0xfff0d8,0.55);
  sunLight.position.set(6,14,4);scene.add(sunLight);
  // Пул из трёх ламп. Он переезжает к ближайшим светильникам вместо того,
  // чтобы держать в сцене два десятка источников: каждый источник в Three.js
  // считается для КАЖДОГО пикселя, и восемнадцать штук клали планшет.
  for(var i=0;i<3;i++){
    var pl=new THREE.PointLight(0xfff0d8,0,10);
    pl.position.set(0,2.4,0);scene.add(pl);LIGHT_POOL.push(pl);
  }
  scene.fog=new THREE.FogExp2(0xe9e4da,0.022);          // светлая дымка сна
  if(window.DETAIL){DETAIL.upgradeRenderer(renderer,scene,camera);DETAIL.setupLights(sunLight,LIGHT_POOL);DETAIL.makeDust(scene);}
}
// Каждый кадр подтягиваем три лампы к ближайшим светильникам
function updateLights(){
  if(!LAMPS.length)return;
  var best=[];
  for(var i=0;i<LAMPS.length;i++){
    var L=LAMPS[i];
    var d=(L[0]-P.x)*(L[0]-P.x)+(L[2]-P.z)*(L[2]-P.z);
    best.push({d:d,L:L});
  }
  best.sort(function(a,b){return a.d-b.d;});
  for(var k=0;k<LIGHT_POOL.length;k++){
    var pl=LIGHT_POOL[k];
    if(k<best.length){
      var e=best[k];
      pl.position.set(e.L[0],e.L[1],e.L[2]);
      pl.color.setHex(e.L[3]);pl.distance=e.L[4];
      // дальние гасим, чтобы не было видно, как лампа «прыгает»
      pl.intensity=e.L[5]*Math.max(0,1-Math.sqrt(e.d)/(e.L[4]*1.15));
    }else pl.intensity=0;
  }
}
addEventListener('resize',function(){
  W=innerWidth;H=innerHeight;
  if(renderer){renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix();}
  if(window.__resizeBloom)window.__resizeBloom();
});
// ============================================================
//  МАГАЗИН ИЗ СНА — здесь всё ещё работает
// ============================================================
var SW=24, SD=20, SH=3.0;             // ширина, глубина, высота зала
var walls=[];                          // прямоугольники-препятствия {x1,z1,x2,z2}
function solid(x1,z1,x2,z2){walls.push({x1:x1,z1:z1,x2:x2,z2:z2});}
// Границы уровня. Раньше здесь стояли размеры МАГАЗИНА, поэтому
// в комнате после побега (её координаты идут от -3.5) игрока
// выталкивало из точки появления как за пределы карты.
var LV={x1:0,z1:0,x2:24,z2:20};
function setBounds(x1,z1,x2,z2){LV.x1=x1;LV.z1=z1;LV.x2=x2;LV.z2=z2;}
function blocked(x,z,r){
  r=r||0.26;
  if(x<LV.x1+r||z<LV.z1+r||x>LV.x2-r||z>LV.z2-r)return true;
  for(var i=0;i<walls.length;i++){
    var w=walls[i];
    if(x>w.x1-r&&x<w.x2+r&&z>w.z1-r&&z<w.z2+r)return true;
  }
  return false;
}

var CRATES=[];
var BEDS=[];      // кровати: одна из них та самая
var SHADOWS=[];   // тени покупателей
var NPC=null;

// Все коробки на полках — один InstancedMesh вместо трёхсот мешей
function flushCrates(){
  if(!CRATES.length)return;
  var geo=new THREE.BoxGeometry(1,1,0.34);
  var mat=new THREE.MeshStandardMaterial({roughness:0.85});
  var im=new THREE.InstancedMesh(geo,mat,CRATES.length);
  var m4=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3(),s=new THREE.Vector3();
  for(var i=0;i<CRATES.length;i++){
    var c=CRATES[i];
    c.parent.updateMatrixWorld(true);
    v.set(c.x,c.y,c.z).applyMatrix4(c.parent.matrixWorld);
    q.setFromEuler(c.parent.rotation);
    s.set(c.w,c.h,1);
    m4.compose(v,q,s);
    im.setMatrixAt(i,m4);
    if(im.setColorAt)im.setColorAt(i,new THREE.Color().setHSL(c.hue,0.35,c.lit));
  }
  im.instanceMatrix.needsUpdate=true;
  if(im.instanceColor)im.instanceColor.needsUpdate=true;
  addObj(im);
  CRATES=[];
}
function priceTag(x,y,z,ry){
  var t=new THREE.Mesh(new THREE.PlaneGeometry(0.16,0.16),
    new THREE.MeshStandardMaterial({map:TEX.tag,roughness:0.75,side:THREE.DoubleSide}));
  t.position.set(x,y,z); t.rotation.y=ry||0;
  return addObj(t);
}
function shelfRow(x,z,len,ry){
  var g=new THREE.Group();
  for(var i=0;i<3;i++){
    var b=new THREE.Mesh(new THREE.BoxGeometry(len,0.06,0.55),MATS.shelf);
    b.position.set(0,0.45+i*0.62,0);g.add(b);
    // коробки на полках
    for(var k=-len/2+0.4;k<len/2-0.3;k+=0.55+Math.random()*0.3){
      var hh=0.22+Math.random()*0.18;
      // Ящики не создаём мешами — копим и потом рисуем ОДНИМ вызовом
      CRATES.push({x:k,y:0.45+i*0.62+0.03+hh/2,z:0,h:hh,w:0.3+Math.random()*0.12,
                   hue:0.06+Math.random()*0.1,lit:0.42+Math.random()*0.2,parent:g});
    }
  }
  var side=new THREE.Mesh(new THREE.BoxGeometry(0.08,2.0,0.6),MATS.shelf);
  side.position.set(-len/2,1.0,0);g.add(side);
  var side2=side.clone();side2.position.x=len/2;g.add(side2);
  g.position.set(x,0,z); if(ry)g.rotation.y=ry;
  addObj(g);
  // ценники на торце
  for(var t2=0;t2<3;t2++)priceTag(x+(ry?0:-len/2+0.3+t2*(len/3)),0.42+t2*0.62,z+(ry?0.32:0)+(ry?0:0.31),ry||0);
  if(ry)solid(x-0.32,z-len/2,x+0.32,z+len/2); else solid(x-len/2,z-0.32,x+len/2,z+0.32);
}

function buildBed(x,z,tagged){
  var g=new THREE.Group();
  [[-0.42,-0.42],[0.42,-0.42],[-0.42,0.42],[0.42,0.42]].forEach(function(p){
    var l=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.20,0.08),MATS.bedFrame);
    l.position.set(p[0],0.10,p[1]);g.add(l);
  });
  var fr=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.10,0.95),MATS.bedFrame);
  fr.position.y=0.25;g.add(fr);
  var mt=new THREE.Mesh(new THREE.BoxGeometry(0.88,0.16,0.88),MATS.matt);
  mt.position.y=0.38;g.add(mt);
  var pl=new THREE.Mesh(new THREE.BoxGeometry(0.40,0.09,0.30),MATS.pillow);
  pl.position.set(-0.20,0.50,-0.26);g.add(pl);
  var hd=new THREE.Mesh(new THREE.BoxGeometry(0.98,0.55,0.07),MATS.bedFrame);
  hd.position.set(0,0.55,-0.48);g.add(hd);
  g.position.set(x,0,z);
  addObj(g);
  solid(x-0.5,z-0.5,x+0.5,z+0.5);
  var b={x:x,z:z,g:g,tagged:!!tagged};
  BEDS.push(b);
  priceTag(x+0.52,0.62,z,Math.PI/2);
  return b;
}

function buildRegister(x,z){
  var g=new THREE.Group();
  var base=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.05,0.8),MATS.shelf);
  base.position.y=0.52;g.add(base);
  var top=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.07,0.9),MATS.wood);
  top.position.y=1.08;g.add(top);
  var reg=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.30,0.34),MATS.dark);
  reg.position.set(0.4,1.26,0);g.add(reg);
  var scr=new THREE.Mesh(new THREE.PlaneGeometry(0.28,0.14),
    new THREE.MeshStandardMaterial({color:0x203020,emissive:0x2a5a2a,emissiveIntensity:1.4}));
  scr.position.set(0.4,1.34,0.175);g.add(scr);
  for(var i=0;i<3;i++)for(var j=0;j<4;j++){
    var k=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.05),MATS.metal);
    k.position.set(0.28+j*0.08,1.42,-0.06+i*0.06);g.add(k);
  }
  g.position.set(x,0,z);addObj(g);
  LAMPS.push([x,2.3,z,0xfff0d0,6,0.6]);
  solid(x-1.0,z-0.5,x+1.0,z+0.5);
}

// ---------- тени покупателей ----------
function makeShadowPerson(){
  var g=new THREE.Group();
  var m=new THREE.MeshBasicMaterial({color:0x0a0a10,transparent:true,opacity:0.34,
    depthWrite:false});
  // CapsuleGeometry появилась только в r142 — здесь r128, берём цилиндр
  var body=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.21,0.95,10),m);
  body.position.y=0.75;g.add(body);
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.14,10,8),m);
  head.position.y=1.36;g.add(head);
  var la=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.62,6),m);
  la.position.set(-0.24,0.86,0);g.add(la);
  var ra=la.clone();ra.position.x=0.24;g.add(ra);
  return g;
}
function spawnShadows(n){
  for(var i=0;i<n;i++){
    var g=makeShadowPerson();
    var s={g:g,x:2+Math.random()*(SW-4),z:2+Math.random()*(SD-4),
           tx:0,tz:0,spd:0.008+Math.random()*0.006,bob:Math.random()*6};
    pickShadowTarget(s);
    g.position.set(s.x,0,s.z);
    addObj(g);SHADOWS.push(s);
  }
}
function pickShadowTarget(s){
  for(var k=0;k<24;k++){
    var tx=2+Math.random()*(SW-4), tz=2+Math.random()*(SD-4);
    if(!blocked(tx,tz,0.5)){s.tx=tx;s.tz=tz;return;}
  }
  s.tx=s.x;s.tz=s.z;
}
function updateShadows(dt,ts){
  for(var i=0;i<SHADOWS.length;i++){
    var s=SHADOWS[i];
    var dx=s.tx-s.x,dz=s.tz-s.z,d=Math.hypot(dx,dz);
    if(d<0.4){pickShadowTarget(s);continue;}
    var nx=s.x+dx/d*s.spd, nz=s.z+dz/d*s.spd;
    if(blocked(nx,nz,0.45)){pickShadowTarget(s);continue;}
    s.x=nx;s.z=nz;
    s.bob+=dt*7;
    s.g.position.set(s.x,Math.abs(Math.sin(s.bob))*0.03,s.z);
    s.g.rotation.y=Math.atan2(dx,dz);
  }
}

// ---------- человек, который к нам подойдёт ----------
function makeMan(){
  var g=new THREE.Group();
  var coat=new THREE.MeshStandardMaterial({color:0x3d4a5a,roughness:0.9});
  var skin=new THREE.MeshStandardMaterial({color:0xc9a488,roughness:0.75});
  var pants=new THREE.MeshStandardMaterial({color:0x2b2f38,roughness:0.9});
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.62,0.24),coat);
  body.position.y=1.02;g.add(body);
  var head=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.26,0.21),skin);
  head.position.y=1.46;g.add(head);
  var hair=new THREE.Mesh(new THREE.BoxGeometry(0.235,0.07,0.225),
    new THREE.MeshStandardMaterial({color:0x33291f,roughness:0.95}));
  hair.position.y=1.60;g.add(hair);
  [-0.29,0.29].forEach(function(dx){
    var a=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.58,0.14),coat);
    a.position.set(dx,1.02,0);g.add(a);
  });
  [-0.12,0.12].forEach(function(dx){
    var l=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.72,0.18),pants);
    l.position.set(dx,0.36,0);g.add(l);
  });
  return g;
}
// ============================================================
//  СБОРКА МАГАЗИНА И СЦЕНАРИЙ
// ============================================================
function buildStore(){
  clearScene();walls=[];BEDS=[];SHADOWS=[];NPC=null;LAMPS=[];CRATES=[];
  setBounds(0,0,SW,SD);
  // пол, потолок, стены
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(SW,SD),MATS.floor);
  fl.rotation.x=-Math.PI/2;fl.position.set(SW/2,0,SD/2);
  MATS.floor.map.repeat.set(SW,SD);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(SW,SD),MATS.ceil);
  ce.rotation.x=Math.PI/2;ce.position.set(SW/2,SH,SD/2);addObj(ce);
  box(SW,SH,0.2,MATS.wall,SW/2,SH/2,0);
  box(SW,SH,0.2,MATS.wall,SW/2,SH/2,SD);
  box(0.2,SH,SD,MATS.wall,0,SH/2,SD/2);
  box(0.2,SH,SD,MATS.wall,SW,SH/2,SD/2);
  // потолочные лампы
  for(var lx=4;lx<SW;lx+=6)for(var lz=4;lz<SD;lz+=6){
    var pan=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.06,0.34),
      new THREE.MeshStandardMaterial({color:0xfffaf0,emissive:0xfff4dc,emissiveIntensity:1.7}));
    pan.position.set(lx,SH-0.06,lz);addObj(pan);
    LAMPS.push([lx,SH-0.5,lz,0xfff2dc,11,0.42]);   // не источник, а запись в списке
  }
  // ряды полок
  for(var r=0;r<4;r++)shelfRow(4.5+r*3.4,6.0,7.5,Math.PI/2);
  shelfRow(SW/2,2.0,10,0);
  // касса у входа
  buildRegister(19.5,16.5);
  // отдел кроватей — в дальнем углу
  var tagIdx=Math.floor(Math.random()*3);
  for(var i=0;i<3;i++)buildBed(4.5+i*2.4,15.5,i===tagIdx);
  for(var j=0;j<2;j++){
    var sofa=new THREE.Group();
    var sb=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.42,0.75),MATS.sofa);sb.position.y=0.28;sofa.add(sb);
    var bk=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.52,0.2),MATS.sofa);bk.position.set(0,0.66,-0.30);sofa.add(bk);
    sofa.position.set(4.5+j*3.0,0,18.2);addObj(sofa);
    solid(3.7+j*3.0,17.8,5.3+j*3.0,18.6);
  }
  flushCrates();
  spawnShadows(5);
  // человек стоит у кассы и ждёт
  NPC=makeMan();NPC.position.set(18.0,0,14.6);NPC.rotation.y=Math.PI*0.85;addObj(NPC);
  scene.fog=new THREE.FogExp2(0xe9e4da,0.022);
  ambientLight.intensity=1.15;sunLight.intensity=0.55;
  document.getElementById('dream').style.display='block';
}

// ---------- диалог ----------
var SC={step:0,timer:0,waiting:false,manX:0,manZ:0,target:null,arrived:false};
function showSub(who,txt,sec){
  var el=document.getElementById('subs');
  el.innerHTML=(who?'<b>'+who+':</b> ':'')+txt;
  el.style.opacity='1';
  clearTimeout(el._t);
  el._t=setTimeout(function(){el.style.opacity='0';},(sec||3.4)*1000);
}
function showMsg(txt,sec){
  var el=document.getElementById('msg');el.textContent=txt;el.style.opacity='1';
  clearTimeout(el._t);el._t=setTimeout(function(){el.style.opacity='0';},(sec||3)*1000);
}
function setPrompt(t,on){
  var el=document.getElementById('prompt');el.textContent=t||'';
  el.style.opacity=(t&&on)?'1':'0';
}
// На телефоне (и в APK-обёртке на WebView) звук, включая синтез речи,
// заблокирован до первого касания/клика/клавиши — без этого "прогрева"
// speechSynthesis.speak() в части II никогда не звучал, хотя субтитры
// показывались всегда (это обычный текст, автовоспроизведение его не трогает).
var speechOK=false;
function unlockSpeech(){
  if(speechOK||!window.speechSynthesis)return;
  speechOK=true;
  try{var u=new SpeechSynthesisUtterance('');u.volume=0;speechSynthesis.speak(u);}catch(e){}
}
// Та же блокировка на телефоне действует и на <audio> (готовые mp3-реплики
// из Fish Audio, см. sayE()/VOICE_LINES) — отдельный "прогрев" одним тихим
// проигрыванием на первое касание, иначе первый вызов sayE() молчит.
var voiceAudioOK=false;
function unlockVoiceAudio(){
  if(voiceAudioOK)return;
  voiceAudioOK=true;
  try{
    var a=new Audio('audio/voice/part2/you_01.mp3');
    a.volume=0;
    var p=a.play();
    if(p&&p.catch)p.catch(function(){});
    setTimeout(function(){try{a.pause();a.currentTime=0;}catch(e){}},100);
  }catch(e){}
}
function say(txt,rate,pitch){
  if(!window.speechSynthesis)return;
  try{
    var u=new SpeechSynthesisUtterance(txt);u.lang='ru-RU';
    u.rate=rate||0.95;u.pitch=pitch||1.0;
    var voices=speechSynthesis.getVoices();
    var ru=voices.find(function(v){return v.lang.indexOf('ru')>=0;});
    if(ru)u.voice=ru;
    speechSynthesis.speak(u);
  }catch(e){}
}

var nMan=false,nBed=null;
function checkNear(){
  nMan=false;nBed=null;
  if(PHASE==='store'&&NPC){
    var d=Math.hypot(P.x-NPC.position.x,P.z-NPC.position.z);
    if(d<2.2){nMan=true;setPrompt('💬 ПОГОВОРИТЬ — E',true);return;}
  }
  if(PHASE==='follow'&&SC.arrived){
    for(var i=0;i<BEDS.length;i++){
      var b=BEDS[i];
      if(Math.hypot(P.x-b.x,P.z-b.z)<1.9){
        nBed=b;setPrompt(b.tagged?'👃 ПОНЮХАТЬ — E':'Обычная кровать',b.tagged);return;
      }
    }
  }
  setPrompt('',false);
}

function doAct(){
  if(dead)return;
  if(nMan)talkToMan();
  else if(nBed&&nBed.tagged)smellBed();
}

function talkToMan(){
  if(SC.step>0)return;
  SC.step=1;
  questDone();
  setPrompt('',false);
  showSub('Покупатель','Это вы здесь работаете?',3.0);
  say('Это вы здесь работаете?',1.0,1.0);
  setTimeout(function(){showSub('Вы','Да, я охранник. Что-то случилось?',3.0);sayE('Да, я охранник. Что-то случилось?');},3200);
  setTimeout(function(){
    showSub('Покупатель','Помогите, пожалуйста. Там... странно.',3.2);
    say('Помогите пожалуйста. Там странно.',1.0,1.0);
  },6600);
  setTimeout(function(){
    showSub('Покупатель','Почему от этой кровати пахнет как от мяса?',4.0);
    say('Почему от этой кровати пахнет как от мяса?',0.98,1.0);
    startFollow();
  },10000);
}

function startFollow(){
  PHASE='follow';
  var b=BEDS.filter(function(x){return x.tagged;})[0]||BEDS[0];
  SC.target=[b.x+1.4,b.z+1.3];
  SC.arrived=false;
  showMsg('Идите за ним',3.0);
  questShow('Идите за покупателем');
}
function updateFollow(dt){
  if(!NPC||!SC.target)return;
  var dx=SC.target[0]-NPC.position.x, dz=SC.target[1]-NPC.position.z;
  var d=Math.hypot(dx,dz);
  if(d>0.25){
    var sp=Math.min(0.030,0.030);
    var nx=NPC.position.x+dx/d*sp, nz=NPC.position.z+dz/d*sp;
    if(!blocked(nx,nz,0.34)){NPC.position.set(nx,0,nz);}
    else{ // обходим боком
      if(!blocked(nx,NPC.position.z,0.34))NPC.position.x=nx;
      else if(!blocked(NPC.position.x,nz,0.34))NPC.position.z=nz;
    }
    NPC.rotation.y=Math.atan2(dx,dz);
    NPC.position.y=Math.abs(Math.sin(performance.now()*0.008))*0.025;
  }else if(!SC.arrived){
    SC.arrived=true;questDone();
    var b=BEDS.filter(function(x){return x.tagged;})[0];
    NPC.rotation.y=Math.atan2(b.x-NPC.position.x,b.z-NPC.position.z);
    showSub('Покупатель','Вот эта. Понюхайте сами.',3.4);
    say('Вот эта. Понюхайте сами.',1.0,1.0);
  }
}
// ============================================================
//  ПОДМЕНА: кровать оказывается Мебельщиком
// ============================================================
var bossMesh=null;
function createBossMesh(){
  var g=new THREE.Group();
  var legM=new THREE.MeshStandardMaterial({color:0x3a2210,roughness:0.95});
  [-0.22,0.22].forEach(function(dx){
    var l=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.55,0.34),legM);
    l.position.set(dx,0.275,0);g.add(l);
  });
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.82,1.20,0.50),
    new THREE.MeshStandardMaterial({color:0x4a2c18,roughness:0.95}));
  body.position.y=1.15;g.add(body);
  var sh=new THREE.Mesh(new THREE.BoxGeometry(1.02,0.26,0.52),
    new THREE.MeshStandardMaterial({color:0x3f2414,roughness:0.95}));
  sh.position.y=1.62;g.add(sh);
  var head=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.40,0.46),
    new THREE.MeshStandardMaterial({color:0x2a1a10,roughness:0.9}));
  head.position.y=1.95;g.add(head);g.userData.head=head;
  var em=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:5});
  [-0.14,0.14].forEach(function(dx){
    var e=new THREE.Mesh(new THREE.SphereGeometry(0.065,8,8),em);
    e.position.set(dx,1.96,0.24);g.add(e);
  });
  var armM=new THREE.MeshStandardMaterial({color:0x5a3520,roughness:0.95});
  [-0.56,0.56].forEach(function(dx){
    var a=new THREE.Mesh(new THREE.BoxGeometry(0.26,1.05,0.26),armM);
    a.position.set(dx,1.10,0);g.add(a);
  });
  var pl=new THREE.PointLight(0xff3020,1.0,6);pl.position.set(0,1.5,0);g.add(pl);
  return g;
}

var SHK={on:false,t:0,bx:0,bz:0};
function smellBed(){
  if(SHK.on)return;
  SHK.on=true;SHK.t=0;PHASE='bed';
  setPrompt('',false);
  SHK.bx=nBed.x;SHK.bz=nBed.z;
  var theBed=nBed;
  nBed=null;nMan=false;      // цели магазина дальше не действуют
  showSub('Вы','Да... реально пахнет как мясо.',2.6);sayE('Да... реально пахнет как мясо.');
  // прячем кровать, на её месте вырастает он
  theBed.g.visible=false;
  if(!bossMesh){bossMesh=createBossMesh();scene.add(bossMesh);}
  bossMesh.visible=false;
  bossMesh.position.set(SHK.bx,0,SHK.bz);
  bossMesh.scale.set(1,0.05,1);
}
function sndSlam(){
  var a=getAC();if(!a)return;
  // резкий удар: шумовой всплеск + падающий тон
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.5),a.sampleRate);
  var d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){
    var x=i/a.sampleRate;
    d[i]=(Math.random()*2-1)*Math.exp(-x*9)*Math.min(1,x*400);
  }
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(4200,a.currentTime);
  f.frequency.exponentialRampToValueAtTime(180,a.currentTime+0.45);
  var g=a.createGain();g.gain.value=0.9;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
  var o=a.createOscillator(),g2=a.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(220,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(28,a.currentTime+0.55);
  g2.gain.setValueAtTime(0.55,a.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.7);
  o.connect(g2);g2.connect(a.destination);o.start();o.stop(a.currentTime+0.75);
}
function updateShock(dt){
  if(!SHK.on)return;
  SHK.t+=dt;
  var t=SHK.t;
  // смотрим на кровать
  var dx=SHK.bx-P.x, dz=SHK.bz-P.z;
  var want=Math.atan2(dx,dz)+Math.PI;
  var diff=want-P.yaw;
  while(diff>Math.PI)diff-=Math.PI*2; while(diff<-Math.PI)diff+=Math.PI*2;
  P.yaw+=diff*Math.min(1,dt*4);

  if(t<2.9){
    P.pitch+=(-0.25-P.pitch)*Math.min(1,dt*3);     // наклоняемся понюхать
  }else if(t<3.5){
    // РЕЗКО ВСТАЁТ
    if(bossMesh){
      bossMesh.visible=true;
      var k=Math.min(1,(t-2.9)/0.34);
      bossMesh.scale.set(1,0.05+0.95*k*k,1);
      bossMesh.rotation.y=Math.atan2(P.x-SHK.bx,P.z-SHK.bz);
    }
    if(!SHK.slammed){SHK.slammed=true;sndSlam();
      document.getElementById('dmg').style.opacity='1';
      var wh=document.getElementById('white');
      wh.style.transition='none';wh.style.opacity='0.9';
      setTimeout(function(){wh.style.transition='opacity 0.45s';wh.style.opacity='0';},60);
    }
    P.pitch+=(0.55-P.pitch)*Math.min(1,dt*9);
  }else if(t<4.1){
    // удар — камера валится
    P.pitch+=(-0.9-P.pitch)*Math.min(1,dt*6);
    var bl=document.getElementById('black');
    bl.style.transition='opacity 0.5s';bl.style.opacity='1';
  }else{
    SHK.on=false;
    document.getElementById('dmg').style.opacity='0';
    startLoading();
  }
}
// ============================================================
//  ЭКРАН ЗАГРУЗКИ — вращающаяся кровать, как в больших хоррорах
// ============================================================
var LD={on:false,t:0,dur:5.2,raf:0,ang:0,build:null,start:null};
var LD_TIPS=[
 'Он не видит. Он слышит.',
 'Не всё, что стоит в торговом зале, — мебель.',
 'Если бежать некуда — пригнись.',
 'Сон — это тоже место. И там тоже кто-то живёт.'
];

// Простой каркасный рендер кровати на 2D-холсте: свой маленький «движок»,
// чтобы не грузить основную сцену во время загрузки.
function drawLoadBed(cv,ang){
  var c=cv.getContext('2d'),W2=cv.width,H2=cv.height;
  c.clearRect(0,0,W2,H2);
  var boxes=[
    // [cx,cy,cz, sx,sy,sz, цвет]
    [0,-0.42,0, 1.30,0.10,0.95, '#4a4860'],   // рама
    [0,-0.26,0, 1.20,0.22,0.88, '#d8d5cf'],   // матрас
    [-0.40,-0.10,-0.28, 0.42,0.10,0.30,'#efece7'], // подушка
    [0,0.02,-0.50, 1.32,0.62,0.08, '#4a4860'],// изголовье
    [-0.58,-0.62,-0.40, 0.10,0.30,0.10,'#3a384a'],
    [ 0.58,-0.62,-0.40, 0.10,0.30,0.10,'#3a384a'],
    [-0.58,-0.62, 0.40, 0.10,0.30,0.10,'#3a384a'],
    [ 0.58,-0.62, 0.40, 0.10,0.30,0.10,'#3a384a']
  ];
  var faces=[];
  var ca=Math.cos(ang),sa=Math.sin(ang);
  var tilt=0.42, ct=Math.cos(tilt), st=Math.sin(tilt);
  function proj(x,y,z){
    var X=x*ca - z*sa, Z=x*sa + z*ca;          // поворот вокруг вертикали
    var Y=y*ct - Z*st, Z2=y*st + Z*ct;         // наклон камеры
    var d=3.4, f=W2*0.62/(d+Z2);
    return [W2/2+X*f, H2/2+Y*f, Z2];
  }
  boxes.forEach(function(b){
    var hx=b[3]/2,hy=b[4]/2,hz=b[5]/2;
    var v=[];
    for(var i=0;i<8;i++){
      v.push(proj(b[0]+(i&1?hx:-hx), b[1]+(i&2?hy:-hy), b[2]+(i&4?hz:-hz)));
    }
    var quads=[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
    quads.forEach(function(q){
      var zm=(v[q[0]][2]+v[q[1]][2]+v[q[2]][2]+v[q[3]][2])/4;
      faces.push({z:zm,pts:q.map(function(i){return v[i];}),col:b[6]});
    });
  });
  faces.sort(function(a,b2){return b2.z-a.z;});
  faces.forEach(function(f){
    var sh=Math.max(0.25,Math.min(1,1.15-f.z*0.22));
    c.beginPath();c.moveTo(f.pts[0][0],f.pts[0][1]);
    for(var i=1;i<4;i++)c.lineTo(f.pts[i][0],f.pts[i][1]);
    c.closePath();
    var col=f.col;
    var r=parseInt(col.substr(1,2),16)*sh|0,g2=parseInt(col.substr(3,2),16)*sh|0,b3=parseInt(col.substr(5,2),16)*sh|0;
    c.fillStyle='rgb('+r+','+g2+','+b3+')';c.fill();
    c.strokeStyle='rgba(0,0,0,0.35)';c.lineWidth=1;c.stroke();
  });
}

function startLoading(buildFn,startFn){
  LD.build=buildFn||buildCorridor;LD.start=startFn||startCorridor;
  PHASE='loading';
  LD.on=true;LD.t=0;LD.ang=0;
  document.getElementById('load').style.display='block';
  document.getElementById('loadtip').textContent=LD_TIPS[Math.floor(Math.random()*LD_TIPS.length)];
  document.body.style.cursor='default';
  var cv=document.getElementById('loadcv');
  (function spin(){
    if(!LD.on)return;
    LD.raf=requestAnimationFrame(spin);
    LD.ang+=0.012;
    drawLoadBed(cv,LD.ang);
  })();
  // за время загрузки строим коридор
  setTimeout(function(){ LD.build(); },400);
}
function updateLoading(dt){
  if(!LD.on)return;
  LD.t+=dt;
  var f=Math.min(1,LD.t/LD.dur);
  document.getElementById('loadfill').style.width=(f*100).toFixed(0)+'%';
  if(LD.t>=LD.dur){
    LD.on=false;cancelAnimationFrame(LD.raf);
    document.getElementById('load').style.display='none';
    LD.start();
  }
}
// ============================================================
//  КОРИДОР: побег
//  Стамины здесь нет — бежать можно сколько угодно.
//  Мешают падающие шкафы и диваны: через что-то прыгаем,
//  под чем-то проползаем пригнувшись.
// ============================================================
var CW=5.0, CL=150;            // ширина и длина коридора
var OBS=[];                     // препятствия
var CH={on:false,bossZ:0,bossSpd:0,t:0,warned:false,doorMesh:null,mesh:null,lastLine:0};
var CH_LINES=['Куда ты пошёл?','Я с тобой.','Не беги, я всё равно быстрее.','Тебе некуда.'];

function buildCorridor(){
  clearScene();walls=[];OBS=[];LAMPS=[];
  MATS.corrFloor.map.repeat.set(CW,CL);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(CW,CL),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(0,0,-CL/2+4);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(CW,CL),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(0,2.9,-CL/2+4);addObj(ce);
  MATS.corrWall.map.repeat.set(CL/2,2);
  [-CW/2,CW/2].forEach(function(sx){
    var w=new THREE.Mesh(new THREE.BoxGeometry(0.2,2.9,CL),MATS.corrWall);
    w.position.set(sx,1.45,-CL/2+4);addObj(w);
  });
  // дверь за спиной — та, из которой мы вышли
  var dr=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.2,0.14),MATS.wood);
  dr.position.set(0,1.1,4.6);addObj(dr);CH.doorMesh=dr;
  box(CW,2.9,0.2,MATS.corrWall,0,1.45,4.9);
  // редкие лампы: коридор длинный и тёмный
  for(var z=0;z>-CL+6;z-=9){
    var em=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.05,0.2),
      new THREE.MeshStandardMaterial({color:0xffe9c0,emissive:0xffdca0,emissiveIntensity:2.2}));
    em.position.set(0,2.85,z);addObj(em);
    LAMPS.push([0,2.5,z,0xffdcb0,9,0.62]);
  }
  // выход в конце
  var ex=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.3,0.16),
    new THREE.MeshStandardMaterial({color:0x2f8f4f,emissive:0x2f8f4f,emissiveIntensity:0.9}));
  ex.position.set(0,1.15,-CL+5);addObj(ex);

  // ---- препятствия ----
  // тип 'jump' — диван поперёк, перепрыгиваем
  // тип 'duck' — упавший шкаф лёг наклонно, проходим пригнувшись
  // тип 'side' — шкаф перекрыл половину, обходим сбоку
  var z2=-8, kinds=['jump','duck','side'];
  while(z2>-CL+14){
    var kind=kinds[Math.floor(Math.random()*kinds.length)];
    OBS.push(makeObstacle(kind,z2));
    z2-=7+Math.random()*5;
  }
}

function makeObstacle(kind,z){
  var o={kind:kind,z:z,fallen:false,t:0,g:new THREE.Group(),side:Math.random()<0.5?-1:1};
  if(kind==='jump'){
    var s=new THREE.Mesh(new THREE.BoxGeometry(CW-0.4,0.46,0.85),MATS.sofa);
    s.position.y=0.23;o.g.add(s);
    var bk=new THREE.Mesh(new THREE.BoxGeometry(CW-0.4,0.34,0.18),MATS.sofa);
    bk.position.set(0,0.60,-0.33);o.g.add(bk);
    o.h=0.62;
  }else if(kind==='duck'){
    var w1=new THREE.Mesh(new THREE.BoxGeometry(CW-0.3,1.9,0.5),MATS.wood);
    w1.position.set(0,1.55,0);w1.rotation.x=0.42;o.g.add(w1);
    o.h=1.05;                       // низ перекладины — под ней надо пригнуться
  }else{
    var w2=new THREE.Mesh(new THREE.BoxGeometry(CW*0.55,2.1,0.55),MATS.wood);
    w2.position.set(o.side*CW*0.22,1.05,0);o.g.add(w2);
    o.h=99;
  }
  o.g.position.set(0,0,z);
  o.g.visible=false;
  addObj(o.g);
  return o;
}

function startCorridor(){
  PHASE='corridor';
  P.x=0;P.z=2.0;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.onGround=true;
  scene.fog=new THREE.FogExp2(0x0a0908,0.055);
  ambientLight.intensity=0.10;sunLight.intensity=0.0;
  document.getElementById('dream').style.display='none';
  document.getElementById('black').style.transition='opacity 1.2s';
  document.getElementById('black').style.opacity='0';
  // Зазор больше, старт позже: раньше он трогался на 1.2 с и догонял
  // ещё до того, как появлялась надпись «БЕГИ».
  CH.on=true;CH.bossZ=12.0;CH.bossSpd=0.038;CH.t=0;CH.warned=false;CH.lastLine=0;
  mRun=true;syncBtn('brun',true);          // бег включён сразу, искать кнопку не надо
  if(!bossMesh){bossMesh=createBossMesh();scene.add(bossMesh);}
  bossMesh.visible=true;bossMesh.scale.set(1,1,1);
  bossMesh.position.set(0,0,CH.bossZ);bossMesh.rotation.set(0,0,0);
  setTimeout(function(){
    showSub('Мебельщик','О, куда ты пошёл? Давай я с тобой.',3.6);
    if(window.sayE)sayE('О, куда ты пошёл? Давай я с тобой.');
    Music.escape();
  },1200);
  setTimeout(function(){showMsg('БЕГИ',2.2);},3400);
  setTimeout(function(){showMsg('Прыжок — через диваны. Присесть — под шкафами.',3.4);},6200);
}

function updateCorridor(dt){
  if(!CH.on)return;
  CH.t+=dt;
  // Трогается только после предупреждения и разгоняется медленно.
  // Потолок скорости ниже вашего бега на треть — фора есть, но небольшая.
  CH.bossSpd=0.038+Math.min(0.042,Math.max(0,CH.t-5.5)*0.00095);
  if(CH.t>5.5)CH.bossZ-=CH.bossSpd*dt*60;
  if(bossMesh){
    bossMesh.position.set(Math.sin(CH.t*1.6)*0.5,0,CH.bossZ);
    bossMesh.rotation.y=Math.PI;
    var lean=Math.sin(CH.t*9)*0.05;
    bossMesh.rotation.z=lean;
  }
  // реплики в спину
  if(CH.t-CH.lastLine>9&&CH.t>6){
    CH.lastLine=CH.t;
    var l=CH_LINES[Math.floor(Math.random()*CH_LINES.length)];
    showSub('Мебельщик',l,2.8);
    if(window.sayE)sayE(l);
  }
  // препятствия падают, когда игрок близко
  for(var i=0;i<OBS.length;i++){
    var o=OBS[i];
    var d=P.z-o.z;
    if(!o.fallen&&d>0&&d<12){
      o.fallen=true;o.g.visible=true;o.t=0;
      sndCrash();
    }
    if(o.fallen&&o.t<1){
      o.t=Math.min(1,o.t+dt*3.5);
      o.g.position.y=(1-o.t)*2.2;
      o.g.rotation.z=(1-o.t)*0.5*o.side;
    }
  }
  // чем ближе он, тем краснее края — видно затылком
  var gap=CH.bossZ-P.z;
  var dmg=document.getElementById('dmg');
  if(dmg)dmg.style.opacity=gap<4?Math.min(0.85,(4-gap)/3.4).toFixed(2):'0';
  // догнал
  if(CH.bossZ<=P.z+0.85&&!(window.ADMIN&&ADMIN.god)){
    CH.on=false;
    dead=true;
    document.getElementById('dmg').style.opacity='1';
    addShake(0.30);
    if(window.sndScare)sndScare();
    Music.outro();
    setTimeout(function(){
      document.getElementById('endtitle').textContent='ОН ДОГНАЛ';
      document.getElementById('endsub').textContent='Надо было бежать быстрее.';
      updateEndScreen();document.getElementById('endscreen').style.display='flex';
    },700);
  }
  // добежал
  if(P.z<-CL+7){
    CH.on=false;
    Music.outro();
    if(bossMesh)bossMesh.visible=false;
    document.getElementById('black').style.transition='opacity 0.9s';
    document.getElementById('black').style.opacity='1';
    document.getElementById('dmg').style.opacity='0';
    setTimeout(startRoom,1100);          // дальше — обычная комната
  }
}

// столкновение с препятствиями
function obstacleBlocks(x,z,eyeH){
  for(var i=0;i<OBS.length;i++){
    var o=OBS[i];
    if(!o.fallen||o.t<0.7)continue;
    if(Math.abs(z-o.z)>0.55)continue;
    if(o.kind==='side'){
      if((o.side<0&&x<o.side*CW*0.22+CW*0.275)||(o.side>0&&x>o.side*CW*0.22-CW*0.275))return true;
    }else if(o.kind==='jump'){
      if(P.y<o.h-0.10)return true;        // не перепрыгнул
    }else if(o.kind==='duck'){
      if(eyeH>0.62)return true;           // не пригнулся
    }
  }
  return false;
}
function sndCrash(){
  var a=getAC();if(!a)return;
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.45),a.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){var x=i/a.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-x*11);}
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=900;
  var g=a.createGain();g.gain.value=0.5;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
  var o=a.createOscillator(),g2=a.createGain();
  o.type='sine';o.frequency.setValueAtTime(90,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(38,a.currentTime+0.3);
  g2.gain.setValueAtTime(0.5,a.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.4);
  o.connect(g2);g2.connect(a.destination);o.start();o.stop(a.currentTime+0.45);
}
// ============================================================
//  КОМНАТА ПОСЛЕ ПОБЕГА — «фух, убежал»
// ============================================================
var RM={on:false,t:0,hits:0,door:null,shake:0,done:false};

function buildRoom(){
  clearScene();walls=[];LAMPS=[];OBS=[];
  setBounds(-3.5,-3.5,3.5,3.5);
  var w=7,d=7,hh=2.7;
  MATS.corrFloor.map.repeat.set(w,d);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(0,0,0);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(0,hh,0);addObj(ce);
  MATS.corrWall.map.repeat.set(w/2,1.5);
  box(w,hh,0.18,MATS.corrWall,0,hh/2,-d/2);
  box(0.18,hh,d,MATS.corrWall,-w/2,hh/2,0);
  box(0.18,hh,d,MATS.corrWall, w/2,hh/2,0);
  // стена с дверью — та, через которую он придёт
  box((w-1.3)/2,hh,0.18,MATS.corrWall,-(w+1.3)/4,hh/2,d/2);
  box((w-1.3)/2,hh,0.18,MATS.corrWall, (w+1.3)/4,hh/2,d/2);
  box(1.3,0.5,0.18,MATS.corrWall,0,hh-0.25,d/2);
  var dr=new THREE.Mesh(new THREE.BoxGeometry(1.24,2.2,0.12),MATS.wood);
  dr.position.set(0,1.1,d/2-0.04);addObj(dr);RM.door=dr;
  // хлам в комнате
  box(1.4,0.5,0.7,MATS.sofa,-2.0,0.25,-2.0);
  box(0.9,1.6,0.4,MATS.wood, 2.4,0.8,-2.2, 0.3);
  LAMPS.push([0,2.4,-1.0,0xffd8a0,7,0.55]);
  var em=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.05,0.18),
    new THREE.MeshStandardMaterial({color:0xffe9c0,emissive:0xffdca0,emissiveIntensity:1.8}));
  em.position.set(0,2.66,-1.0);addObj(em);
  solid(-2.7,-2.4,-1.3,-1.6); solid(2.0,-2.5,2.8,-1.9);
  scene.fog=new THREE.FogExp2(0x0d0b0a,0.10);
  ambientLight.intensity=0.14;sunLight.intensity=0;
}

function startRoom(){
  PHASE='room';
  buildRoom();
  P.x=0;P.z=-1.6;P.y=0;P.vy=0;P.yaw=0;P.pitch=0;
  unstick();
  dead=false;
  RM.on=true;RM.t=0;RM.hits=0;RM.shake=0;RM.done=false;
  RM.dread=false;RM.said=false;RM.burst=false;RM.blk=false;
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='0';
  document.getElementById('dmg').style.opacity='0';
  Music.stop();
  setTimeout(function(){
    showSub('Вы','Фух... убежал.',2.6);sayE('Фух... убежал.');
  },1800);
}

// ============================================================
//  СТРАШНЫЙ СТИНГЕР
//  Нарастание, потом диссонансный удар. Всё синтезом, оригинальное.
// ============================================================
function sndDread(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime, HIT=t0+1.15;        // удар приходится на первый стук в дверь

  // общая шина с эхом — даёт объём без настоящей реверберации
  var bus=a.createGain();bus.gain.value=1;bus.connect(a.destination);
  var dly=a.createDelay(1.0);dly.delayTime.value=0.19;
  var fb=a.createGain();fb.gain.value=0.42;
  var dg=a.createGain();dg.gain.value=0.35;
  dly.connect(fb);fb.connect(dly);dly.connect(dg);dg.connect(a.destination);

  // 1. НАРАСТАНИЕ: шум сквозь полосовой фильтр, ползущий вверх
  var nb=a.createBuffer(1,Math.floor(a.sampleRate*1.3),a.sampleRate);
  var nd=nb.getChannelData(0);
  for(var i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  var ns=a.createBufferSource();ns.buffer=nb;
  var bp=a.createBiquadFilter();bp.type='bandpass';bp.Q.value=7;
  bp.frequency.setValueAtTime(220,t0);
  bp.frequency.exponentialRampToValueAtTime(4200,HIT);
  var ng=a.createGain();
  ng.gain.setValueAtTime(0.0001,t0);
  ng.gain.exponentialRampToValueAtTime(0.30,HIT-0.03);
  ng.gain.exponentialRampToValueAtTime(0.0001,HIT+0.12);
  ns.connect(bp);bp.connect(ng);ng.connect(bus);ns.start(t0);

  // 2. УДАР: гроздь расстроенных пил — малая секунда и тритон,
  //    самые неприятные интервалы, какие есть
  var root=58.27;                                   // ля-диез контроктавы
  var cluster=[1, 1.0595, 1.4142, 2, 2.1189, 2.8284];
  var sh=a.createWaveShaper();
  var cv=new Float32Array(1024);
  for(i=0;i<1024;i++){var x=i*2/1024-1;cv[i]=(1+18)*x/(1+18*Math.abs(x));}
  sh.curve=cv;sh.oversample='2x';
  var lp=a.createBiquadFilter();lp.type='lowpass';lp.Q.value=3;
  lp.frequency.setValueAtTime(260,HIT);
  lp.frequency.exponentialRampToValueAtTime(2600,HIT+0.06);
  lp.frequency.exponentialRampToValueAtTime(320,HIT+2.4);
  var cg=a.createGain();
  cg.gain.setValueAtTime(0.0001,HIT);
  cg.gain.linearRampToValueAtTime(0.34,HIT+0.012);
  cg.gain.exponentialRampToValueAtTime(0.0001,HIT+2.8);
  cluster.forEach(function(r,k){
    var o=a.createOscillator();
    o.type='sawtooth';o.frequency.value=root*r;
    o.detune.value=(k-2.5)*9;
    o.connect(sh);o.start(HIT);o.stop(HIT+3.0);
  });
  sh.connect(lp);lp.connect(cg);cg.connect(bus);cg.connect(dly);

  // 3. ПРОВАЛ В НИЗ — то, что чувствуется животом
  var so=a.createOscillator(),sg=a.createGain();
  so.type='sine';
  so.frequency.setValueAtTime(96,HIT);
  so.frequency.exponentialRampToValueAtTime(24,HIT+1.5);
  sg.gain.setValueAtTime(0.62,HIT);
  sg.gain.exponentialRampToValueAtTime(0.0001,HIT+2.0);
  so.connect(sg);sg.connect(a.destination);so.start(HIT);so.stop(HIT+2.1);

  // 4. МЕТАЛЛИЧЕСКИЙ ЗВОН: негармоничные обертоны, как у надтреснутого колокола
  [1,2.76,5.40,8.93,13.34,18.64].forEach(function(r,k){
    var o=a.createOscillator(),g=a.createGain();
    o.type='sine';o.frequency.value=196*r;
    g.gain.setValueAtTime(0.10/(k+1),HIT);
    g.gain.exponentialRampToValueAtTime(0.0001,HIT+1.1+k*0.12);
    o.connect(g);g.connect(bus);g.connect(dly);
    o.start(HIT);o.stop(HIT+2.4);
  });

  // 5. ОБРАТНЫЙ ХВОСТ — шёпот, уходящий вверх после удара
  var ns2=a.createBufferSource();ns2.buffer=nb;
  var hp=a.createBiquadFilter();hp.type='highpass';hp.frequency.value=2600;
  var g5=a.createGain();
  g5.gain.setValueAtTime(0.10,HIT);
  g5.gain.exponentialRampToValueAtTime(0.0001,HIT+1.6);
  ns2.connect(hp);hp.connect(g5);g5.connect(dly);ns2.start(HIT);
}

function sndBang(power){
  var a=getAC();if(!a)return;
  // Удар в дверь: глухой корпус + звенящая петля + диссонанс,
  // который нарастает от удара к удару.
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.4),a.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){var x=i/a.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-x*14);}
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=460+power*520;
  var g=a.createGain();g.gain.value=0.45+power*0.4;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
  // корпус двери
  var o=a.createOscillator(),g2=a.createGain();
  o.type='sine';o.frequency.setValueAtTime(118,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(30,a.currentTime+0.30);
  g2.gain.setValueAtTime(0.55+power*0.3,a.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.42);
  o.connect(g2);g2.connect(a.destination);o.start();o.stop(a.currentTime+0.45);
  // петли и металл — тонкий неприятный звон поверх
  [1,3.1,6.7].forEach(function(r,k){
    var m=a.createOscillator(),mg=a.createGain();
    m.type='triangle';m.frequency.value=430*r*(1+power*0.15);
    mg.gain.setValueAtTime((0.09+power*0.06)/(k+1),a.currentTime);
    mg.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.5+k*0.18);
    m.connect(mg);mg.connect(a.destination);m.start();m.stop(a.currentTime+0.8);
  });
  // диссонансный подголосок, чем дальше тем злее
  if(power>0.2){
    var d1=a.createOscillator(),d2=a.createOscillator(),dg2=a.createGain();
    d1.type='sawtooth';d2.type='sawtooth';
    d1.frequency.value=87;d2.frequency.value=87*1.0595;   // малая секунда
    dg2.gain.setValueAtTime(0.0001,a.currentTime);
    dg2.gain.exponentialRampToValueAtTime(0.10*power,a.currentTime+0.05);
    dg2.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.9);
    var dl=a.createBiquadFilter();dl.type='lowpass';dl.frequency.value=700;
    d1.connect(dl);d2.connect(dl);dl.connect(dg2);dg2.connect(a.destination);
    d1.start();d2.start();d1.stop(a.currentTime+1.0);d2.stop(a.currentTime+1.0);
  }
}


// удары в дверь: 4.5 / 6.0 / 7.5, фраза на 8.6, вышибает на 10.2
var RM_T={h1:4.6,h2:6.1,h3:7.6,line:8.7,burst:10.3,black:11.2,end:12.4};
function updateRoom(dt){
  if(!RM.on)return;
  RM.t+=dt;var t=RM.t;
  function hit(n,p){
    if(RM.hits===n-1){
      RM.hits=n;RM.shake=0.6+p*0.5;sndBang(p);
      if(RM.door){RM.door.position.z=3.5-0.10-p*0.06;}
    }
  }
  if(t>RM_T.h1-1.15&&!RM.dread){RM.dread=true;sndDread();}
  if(t>RM_T.h1)hit(1,0);
  if(t>RM_T.h2)hit(2,0.4);
  if(t>RM_T.h3)hit(3,0.8);
  if(t>RM_T.line&&!RM.said){
    RM.said=true;
    showSub('Мебельщик','Ты думал, ты убежал?',3.0);
    sayE('Ты думал, ты убежал?');
  }
  if(t>RM_T.burst&&!RM.burst){
    RM.burst=true;RM.shake=1.6;
    sndBang(1);sndScare();
    if(RM.door){RM.door.rotation.x=-0.9;RM.door.position.set(0.3,0.5,1.4);}
    if(!bossMesh){bossMesh=createBossMesh();scene.add(bossMesh);}
    bossMesh.visible=true;bossMesh.scale.set(1,1,1);
    bossMesh.position.set(0,0,3.2);bossMesh.rotation.set(0,Math.PI,0);
    document.getElementById('dmg').style.opacity='1';
  }
  if(RM.burst&&bossMesh){
    var k=Math.min(1,(t-RM_T.burst)/0.9);
    bossMesh.position.z=3.2-3.0*k;                 // бросок на камеру
  }
  if(t>RM_T.black&&!RM.blk){
    RM.blk=true;
    document.getElementById('black').style.transition='opacity 0.35s';
    document.getElementById('black').style.opacity='1';
  }
  if(t>RM_T.end&&!RM.done){
    RM.done=true;RM.on=false;
    document.getElementById('dmg').style.opacity='0';
    if(bossMesh)bossMesh.visible=false;
    startLoading(buildPrison,startPrison);
  }
  // тряска комнаты
  RM.shake=Math.max(0,RM.shake-dt*1.6);
  if(RM.shake>0){
    P.pitch=(Math.random()-0.5)*RM.shake*0.10;
    P.yaw+=(Math.random()-0.5)*RM.shake*0.02;
  }
}
// ============================================================
//  ТЮРЬМА: клетка, жёлтый ключ, книги, два сейфа, отвёртка
// ============================================================
var PR={
  w:22,d:15,
  cage:{x:3.0,z:11.5,s:3.0},
  hasYellow:false,cageOpen:false,
  keys:0,keysNeed:3,
  safeKeysOpen:false,code:null,codeKnown:false,
  safeCodeOpen:false,hasDriver:false,ventOpen:false,
  shelves:[],bars:[],cageDoor:null,ventMesh:null,
  keyMesh:null,driverMesh:null,intro:0
};
var KP={on:false,buf:''};

function invHUD(){
  var el=document.getElementById('inv');
  var s=[];
  if(PR.hasYellow&&!PR.cageOpen)s.push('🔑 жёлтый ключ');
  if(PR.keys>0&&!PR.safeKeysOpen)s.push('🗝 ключики '+PR.keys+'/'+PR.keysNeed);
  if(PR.codeKnown&&!PR.safeCodeOpen)s.push('🔢 код '+PR.code);
  if(PR.hasDriver)s.push('🪛 отвёртка');
  el.innerHTML=s.join('<br>');
}

function makeBars(x,z,len,vertical){
  var g=new THREE.Group();
  var n=Math.round(len/0.26);
  for(var i=0;i<=n;i++){
    var b=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,2.4,6),MATS.metal);
    var o=-len/2+i*(len/n);
    b.position.set(vertical?0:o,1.2,vertical?o:0);
    g.add(b);
  }
  var top=new THREE.Mesh(new THREE.BoxGeometry(vertical?0.09:len,0.09,vertical?len:0.09),MATS.metal);
  top.position.y=2.4;g.add(top);
  g.position.set(x,0,z);
  return addObj(g);
}

function buildPrison(){
  clearScene();walls=[];LAMPS=[];OBS=[];
  setBounds(0,0,PR.w,PR.d);
  PR.hasYellow=false;PR.cageOpen=false;PR.keys=0;PR.safeKeysOpen=false;
  PR.codeKnown=false;PR.safeCodeOpen=false;PR.hasDriver=false;PR.ventOpen=false;
  PR.shelves=[];PR.intro=0;
  PR.code=String(Math.floor(1000+Math.random()*9000));
  var W2=PR.w,D2=PR.d,HH=3.2;
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/2,1.6);
  box(W2,HH,0.2,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.2,MATS.corrWall,W2/2,HH/2,D2);
  box(0.2,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.2,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  for(var lx=4;lx<W2;lx+=6){
    LAMPS.push([lx,HH-0.5,D2/2,0xffd8a0,10,0.5]);
    var em=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.05,0.2),
      new THREE.MeshStandardMaterial({color:0xffe0b0,emissive:0xffcf90,emissiveIntensity:1.6}));
    em.position.set(lx,HH-0.07,D2/2);addObj(em);
  }

  // ---- клетка ----
  var c=PR.cage,s=c.s;
  makeBars(c.x,c.z-s/2,s,false);
  makeBars(c.x-s/2,c.z,s,true);
  makeBars(c.x+s/2,c.z,s,true);
  // передняя стенка с дверью
  makeBars(c.x-s/4-0.1,c.z+s/2,s/2-0.4,false);
  PR.cageDoor=makeBars(c.x+s/4+0.1,c.z+s/2,s/2-0.4,false);
  solid(c.x-s/2-0.1,c.z-s/2-0.1,c.x+s/2+0.1,c.z-s/2+0.1);
  solid(c.x-s/2-0.1,c.z-s/2,c.x-s/2+0.1,c.z+s/2);
  solid(c.x+s/2-0.1,c.z-s/2,c.x+s/2+0.1,c.z+s/2);
  PR.frontWall=[c.x-s/2,c.z+s/2-0.1,c.x+s/2,c.z+s/2+0.1];
  PR.frontIdx={x1:PR.frontWall[0],z1:PR.frontWall[1],x2:PR.frontWall[2],z2:PR.frontWall[3]};
  walls.push(PR.frontIdx);

  // жёлтый ключ рядом с клеткой, внутри
  PR.keyMesh=new THREE.Group();
  var km=new THREE.MeshStandardMaterial({color:0xffd23a,emissive:0xffb800,emissiveIntensity:1.5,
    roughness:0.35,metalness:0.6});
  var rod=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.24,0.04),km);rod.position.y=0.12;PR.keyMesh.add(rod);
  var rng=new THREE.Mesh(new THREE.TorusGeometry(0.06,0.016,6,12),km);
  rng.position.y=0.27;rng.rotation.x=Math.PI/2;PR.keyMesh.add(rng);
  var tth=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.035,0.035),km);tth.position.set(0.04,0.03,0);PR.keyMesh.add(tth);
  var kl=new THREE.PointLight(0xffc020,0.8,2.6);kl.position.y=0.2;PR.keyMesh.add(kl);
  PR.keyMesh.position.set(c.x+0.9,0.05,c.z-0.9);addObj(PR.keyMesh);

  // ---- книжные стеллажи ----
  var spots=[[8.5,1.0,0],[12.5,1.0,0],[16.5,1.0,0],[1.0,4.0,Math.PI/2],[1.0,7.5,Math.PI/2],[20.8,8.5,-Math.PI/2]];
  var withKey=[0,1,2,3,4,5].sort(function(){return Math.random()-0.5;}).slice(0,PR.keysNeed);
  spots.forEach(function(sp,i){
    var g=new THREE.Group();
    var bk=new THREE.Mesh(new THREE.BoxGeometry(1.8,2.1,0.34),MATS.wood);
    bk.position.y=1.05;g.add(bk);
    for(var r=0;r<4;r++){
      for(var x2=-0.78;x2<0.78;x2+=0.075+Math.random()*0.05){
        var hbk=0.24+Math.random()*0.1;
        var col=new THREE.Color().setHSL(Math.random(),0.3,0.22+Math.random()*0.25);
        var bo=new THREE.Mesh(new THREE.BoxGeometry(0.05,hbk,0.24),
          new THREE.MeshStandardMaterial({color:col,roughness:0.9}));
        bo.position.set(x2,0.32+r*0.48+hbk/2,0.05);g.add(bo);
      }
      var shl=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.04,0.3),MATS.wood);
      shl.position.set(0,0.30+r*0.48,0.02);g.add(shl);
    }
    g.position.set(sp[0],0,sp[1]);g.rotation.y=sp[2];addObj(g);
    var half=sp[2]===0?[0.95,0.28]:[0.28,0.95];
    solid(sp[0]-half[0],sp[1]-half[1],sp[0]+half[0],sp[1]+half[1]);
    PR.shelves.push({x:sp[0],z:sp[1],hasKey:withKey.indexOf(i)>=0,searched:false});
  });

  // ---- сейф под ключики ----
  PR.safeKeys={x:19.0,z:12.0};
  makeSafe(PR.safeKeys.x,PR.safeKeys.z,-Math.PI/2,0x6a6f75);
  // ---- сейф с кодом, на столе ----
  var tb=new THREE.Group();
  var tp=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.09,1.0),MATS.wood);tp.position.y=0.86;tb.add(tp);
  [[-0.95,-0.4],[0.95,-0.4],[-0.95,0.4],[0.95,0.4]].forEach(function(q){
    var lg=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.86,0.09),MATS.wood);
    lg.position.set(q[0],0.43,q[1]);tb.add(lg);
  });
  tb.position.set(11.0,0,12.5);addObj(tb);
  solid(9.8,11.9,12.2,13.1);
  PR.safeCode={x:11.0,z:12.5};
  // Столешница на 0.905, сейф высотой 0.8 -> центр должен быть на 1.31.
  // Раньше стоял на 0.95 и уходил в стол на треть метра.
  makeSafe(11.0,12.5,Math.PI,0x4a4f55,1.31);

  // ---- вентиляция ----
  var vg=new THREE.Group();
  var fr=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.9,0.08),MATS.metal);vg.add(fr);
  for(var i2=0;i2<6;i2++){
    var sl=new THREE.Mesh(new THREE.BoxGeometry(0.98,0.06,0.05),MATS.dark);
    sl.position.set(0,-0.34+i2*0.135,0.05);vg.add(sl);
  }
  [[-0.48,-0.38],[0.48,-0.38],[-0.48,0.38],[0.48,0.38]].forEach(function(q){
    var sc=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.06,6),MATS.metal);
    sc.rotation.x=Math.PI/2;sc.position.set(q[0],q[1],0.06);vg.add(sc);
  });
  vg.position.set(PR.w-0.25,1.3,3.0);vg.rotation.y=-Math.PI/2;addObj(vg);
  PR.ventMesh=vg;PR.vent={x:PR.w-0.9,z:3.0};   // отодвинута от стеллажа

  scene.fog=new THREE.FogExp2(0x0b0a0c,0.075);
  ambientLight.intensity=0.13;sunLight.intensity=0;
}

function makeSafe(x,z,ry,col,yy){
  var g=new THREE.Group();
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.6),
    new THREE.MeshStandardMaterial({color:col,roughness:0.5,metalness:0.65}));
  g.add(body);
  var dr=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.68,0.06),
    new THREE.MeshStandardMaterial({color:col+0x0a0a0a,roughness:0.42,metalness:0.7}));
  dr.position.z=0.31;g.add(dr);
  var hd=new THREE.Mesh(new THREE.TorusGeometry(0.11,0.025,6,14),MATS.metal);
  hd.position.set(0.16,0,0.35);g.add(hd);
  var kp=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.26,0.03),MATS.dark);
  kp.position.set(-0.16,0.05,0.35);g.add(kp);
  var led=new THREE.Mesh(new THREE.PlaneGeometry(0.14,0.05),
    new THREE.MeshStandardMaterial({color:0x203020,emissive:0xaa2222,emissiveIntensity:1.6}));
  led.position.set(-0.16,0.16,0.37);g.add(led);
  g.userData.led=led;
  g.position.set(x,(yy||0.4),z);g.rotation.y=ry;addObj(g);
  solid(x-0.5,z-0.5,x+0.5,z+0.5);
  return g;
}
// ---------- взаимодействие в тюрьме ----------
var nPr=null;
function prNear(){
  nPr=null;
  if(PHASE!=='prison'||KP.on)return;
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  if(!PR.hasYellow&&PR.keyMesh&&d2(PR.keyMesh.position.x,PR.keyMesh.position.z)<1.2){
    nPr={t:'key'};setPrompt('🔑 ВЗЯТЬ КЛЮЧ — E',true);return;
  }
  if(PR.hasYellow&&!PR.cageOpen&&d2(PR.cage.x,PR.cage.z+PR.cage.s/2)<1.6){
    nPr={t:'cage'};setPrompt('🔓 ОТКРЫТЬ КЛЕТКУ — E',true);return;
  }
  if(PR.cageOpen){
    // Сначала крупные объекты, потом книги: иначе стеллаж рядом
    // перехватывал подсказку у вентиляции.
    if(d2(PR.vent.x,PR.vent.z)<1.8){
      nPr={t:'vent'};
      setPrompt(PR.hasDriver?'🪛 ОТКРУТИТЬ РЕШЁТКУ — E':'Решётка на винтах',PR.hasDriver);return;
    }
    if(d2(PR.safeCode.x,PR.safeCode.z)<1.8){
      nPr={t:'safeCode'};
      setPrompt(PR.safeCodeOpen?(PR.hasDriver?'Пусто':'🪛 ВЗЯТЬ ОТВЁРТКУ — E'):'🔢 ВВЕСТИ КОД — E',true);return;
    }
    if(d2(PR.safeKeys.x,PR.safeKeys.z)<1.7){
      nPr={t:'safeKeys'};
      setPrompt(PR.safeKeysOpen?'Пусто':(PR.keys>=PR.keysNeed?'🗝 ОТКРЫТЬ СЕЙФ — E':'Нужно ключиков: '+PR.keysNeed+' (есть '+PR.keys+')'),
                !PR.safeKeysOpen&&PR.keys>=PR.keysNeed);return;
    }
    for(var i=0;i<PR.shelves.length;i++){
      var s=PR.shelves[i];
      if(d2(s.x,s.z)<1.7){
        nPr={t:'shelf',i:i};
        setPrompt(s.searched?'Здесь уже смотрели':'📚 ОБЫСКАТЬ КНИГИ — E',!s.searched);return;
      }
    }
  }
  setPrompt('',false);
}

function prAct(){
  if(!nPr)return;
  var t=nPr.t;
  if(t==='key'){
    PR.hasYellow=true;scene.remove(PR.keyMesh);PR.keyMesh=null;invHUD();
    showSub('Вы','Ключ. Прямо у решётки. Он что, обронил?',3.0);sayE('Ключ. Прямо у решётки. Он что, обронил?');
  }
  else if(t==='cage'){
    PR.cageOpen=true;questDone();
    if(PR.cageDoor){PR.cageDoor.rotation.y=-1.3;PR.cageDoor.position.x+=0.6;PR.cageDoor.position.z+=0.5;}
    var fi=walls.indexOf(PR.frontIdx);
    if(fi>=0)walls.splice(fi,1);
    invHUD();sndCreak();
    showMsg('Клетка открыта',2.2);
  }
  else if(t==='shelf'){
    var s=PR.shelves[nPr.i];
    if(s.searched)return;
    s.searched=true;
    if(s.hasKey){
      PR.keys++;invHUD();sndPickup();
      showSub('Вы','Маленький ключик. В книге вырезана дырка.',3.0);sayE('Маленький ключик. В книге вырезана дырка.');
      if(PR.keys===PR.keysNeed)setTimeout(function(){showMsg('Все ключики собраны',2.4);},1200);
    }else{
      showSub('Вы','Просто книги.',1.8);sayE('Просто книги.');
    }
  }
  else if(t==='safeKeys'){
    if(PR.safeKeysOpen||PR.keys<PR.keysNeed)return;
    PR.safeKeysOpen=true;PR.codeKnown=true;invHUD();sndSafe();
    showSub('Вы','Внутри бумажка. Код: '+PR.code,4.2);
    say('Код. '+PR.code.split('').join(' '),0.8,0.55);
    setTimeout(function(){
      showSub('Вы','Почему он так любит сейфы?',2.8);sayE('Почему он так любит сейфы?');
    },4600);
  }
  else if(t==='safeCode'){
    if(PR.safeCodeOpen){
      if(!PR.hasDriver){
        PR.hasDriver=true;invHUD();sndPickup();
        showSub('Вы','Отвёртка. Он держал в сейфе... отвёртку.',3.4);sayE('Отвёртка. Он держал в сейфе... отвёртку.');
      }
      return;
    }
    openKeypad();
  }
  else if(t==='vent'){
    if(!PR.hasDriver)return;
    PR.ventOpen=true;
    if(PR.ventMesh){PR.ventMesh.rotation.z=0.5;PR.ventMesh.position.y=1.0;}
    sndCreak();
    showMsg('Решётка снята. Внутри темно.',3.0);
    setTimeout(function(){ if(!dead)ventEnter(); },2600);
  }
  invHUD();
}

// ---------- кодовый замок ----------
function openKeypad(){
  KP.on=true;KP.buf='';
  document.getElementById('keypad').style.display='flex';
  kpDraw();
}
function closeKeypad(){KP.on=false;document.getElementById('keypad').style.display='none';}
function kpDraw(){
  document.getElementById('kpdisp').textContent=(KP.buf+'____').slice(0,4).split('').join(' ');
}
function kpPress(d){
  if(KP.buf.length<4){KP.buf+=d;kpDraw();sndBeep(600);}
  if(KP.buf.length===4){
    setTimeout(function(){
      if(KP.buf===PR.code){
        PR.safeCodeOpen=true;invHUD();sndSafe();closeKeypad();
        showSub('Вы','Открылось.',1.8);sayE('Открылось.');
      }else{
        sndBeep(180);KP.buf='';kpDraw();
        document.getElementById('kpdisp').textContent='— — — —';
      }
    },260);
  }
}
function kpClear(){KP.buf='';kpDraw();}

// ---------- вступление в тюрьме ----------
function startPrison(){
  PHASE='prison';
  P.x=PR.cage.x;P.z=PR.cage.z;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  unstick();
  dead=false;mRun=false;syncBtn('brun',false);
  document.getElementById('black').style.transition='opacity 1.6s';
  document.getElementById('black').style.opacity='0';
  document.getElementById('inv').style.display='block';
  invHUD();
  // он проходит мимо клетки и уходит
  if(!bossMesh){bossMesh=createBossMesh();scene.add(bossMesh);}
  bossMesh.visible=true;bossMesh.scale.set(1,1,1);
  bossMesh.position.set(PR.cage.x+7,0,PR.cage.z+2.4);
  bossMesh.rotation.set(0,-Math.PI/2,0);
  PR.intro=0.001;
  setTimeout(function(){showSub('Вы','Где я...',2.2);sayE('Где я...');},1600);
  setTimeout(function(){questShow('Выберитесь из клетки','Ключ где-то рядом');},4000);
  setTimeout(function(){showSub('Вы','Он ходит там. Надо тихо.',2.8);sayE('Он ходит там. Надо тихо.');},5200);
}
function updatePrison(dt){
  if(PR.intro>0){
    PR.intro+=dt;
    if(bossMesh&&bossMesh.visible){
      bossMesh.position.x-=dt*1.35;
      if(bossMesh.position.x<-2.5){bossMesh.visible=false;PR.intro=0;
        showMsg('Он ушёл',2.0);}
    }
  }
  if(PR.keyMesh){
    PR.keyMesh.rotation.y+=dt*1.6;
    PR.keyMesh.position.y=0.05+Math.sin(performance.now()*0.0022)*0.04;
  }
  prNear();
}
function ventEnter(){
  document.getElementById('black').style.transition='opacity 1.0s';
  document.getElementById('black').style.opacity='1';
  setTimeout(startVent,1100);
}

// ---------- звуки ----------
function sndBeep(f){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain();
  o.type='square';o.frequency.value=f;
  g.gain.setValueAtTime(0.05,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.12);
  o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+0.14);
}
function sndPickup(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain();
  o.type='triangle';o.frequency.setValueAtTime(720,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(1500,a.currentTime+0.1);
  g.gain.setValueAtTime(0.07,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.22);
  o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+0.24);
}
function sndSafe(){
  var a=getAC();if(!a)return;
  [0,0.1,0.24].forEach(function(dt2,k){
    var o=a.createOscillator(),g=a.createGain();
    o.type='square';o.frequency.value=[300,420,880][k];
    g.gain.setValueAtTime(0.06,a.currentTime+dt2);
    g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dt2+0.18);
    o.connect(g);g.connect(a.destination);o.start(a.currentTime+dt2);o.stop(a.currentTime+dt2+0.2);
  });
}
function sndCreak(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain(),f=a.createBiquadFilter();
  o.type='sawtooth';
  o.frequency.setValueAtTime(140,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(70,a.currentTime+0.9);
  f.type='lowpass';f.frequency.value=520;f.Q.value=2;
  g.gain.setValueAtTime(0.0001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.09,a.currentTime+0.2);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+1.1);
  o.connect(f);f.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+1.2);
}
// ============================================================
//  ВЕНТИЛЯЦИЯ: ползком, и там кто-то есть
// ============================================================
var VT={on:false,len:11,spider:null,hits:0,dead:false,t:0,warned:false};

function makeSpider(){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:0x1a1410,roughness:0.9});
  var body=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),m);
  body.scale.set(1,0.7,1.25);body.position.y=0.17;g.add(body);
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),m);
  head.position.set(0,0.16,0.20);g.add(head);
  var em=new THREE.MeshStandardMaterial({color:0xff2020,emissive:0xff1000,emissiveIntensity:3});
  [-0.04,0.04].forEach(function(dx){
    var e=new THREE.Mesh(new THREE.SphereGeometry(0.022,6,6),em);
    e.position.set(dx,0.19,0.27);g.add(e);
  });
  g.userData.legs=[];
  for(var s=-1;s<=1;s+=2)for(var i=0;i<4;i++){
    var leg=new THREE.Group();
    var a=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.22,5),m);
    a.rotation.z=s*0.9;a.position.set(s*0.09,0.05,0);leg.add(a);
    var b2=new THREE.Mesh(new THREE.CylinderGeometry(0.010,0.010,0.20,5),m);
    b2.rotation.z=s*-0.5;b2.position.set(s*0.19,-0.02,0);leg.add(b2);
    leg.position.set(0,0.14,-0.12+i*0.10);
    g.add(leg);g.userData.legs.push({o:leg,ph:i*1.4+(s>0?0.7:0)});
  }
  return g;
}

function buildVent(){
  clearScene();walls=[];LAMPS=[];
  var w=1.25,hh=1.05,L=VT.len;
  MATS.metal.map=TEX.wallClean;
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(w,L),
    new THREE.MeshStandardMaterial({color:0x59575a,roughness:0.55,metalness:0.7}));
  fl.rotation.x=-Math.PI/2;fl.position.set(0,0,-L/2+1);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(w,L),
    new THREE.MeshStandardMaterial({color:0x3a383c,roughness:0.6,metalness:0.6}));
  ce.rotation.x=Math.PI/2;ce.position.set(0,hh,-L/2+1);addObj(ce);
  [-w/2,w/2].forEach(function(sx){
    var s=new THREE.Mesh(new THREE.BoxGeometry(0.06,hh,L),
      new THREE.MeshStandardMaterial({color:0x4a484c,roughness:0.5,metalness:0.72}));
    s.position.set(sx,hh/2,-L/2+1);addObj(s);
  });
  // поперечные рёбра — чтобы чувствовалось движение
  for(var z=0;z>-L+2;z-=1.2){
    var r=new THREE.Mesh(new THREE.BoxGeometry(w,0.04,0.05),
      new THREE.MeshStandardMaterial({color:0x6a686c,roughness:0.45,metalness:0.75}));
    r.position.set(0,hh-0.02,z);addObj(r);
  }
  // свет только у входа и выхода
  LAMPS.push([0,0.9,0.5,0xffd8a0,3.0,0.5]);
  LAMPS.push([0,0.9,-L+2.2,0xbfd8ff,3.4,0.6]);
  VT.spider=makeSpider();
  VT.spider.position.set(0,0,-L*0.52);
  VT.spider.rotation.y=Math.PI;
  addObj(VT.spider);
  scene.fog=new THREE.FogExp2(0x08070a,0.16);
  ambientLight.intensity=0.10;sunLight.intensity=0;
}

function startVent(){
  PHASE='vent';
  buildVent();
  P.x=0;P.z=0.4;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  dead=false;
  mCrouch=true;syncBtn('bcrouch',true);      // в трубе только ползком
  mRun=false;syncBtn('brun',false);
  VT.on=true;VT.hits=0;VT.dead=false;VT.t=0;VT.warned=false;
  document.getElementById('inv').style.display='none';
  document.getElementById('black').style.transition='opacity 1.2s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showMsg('Тесно. Только ползком.',2.6);},900);
  setTimeout(function(){questShow('Проберитесь по вентиляции');},2600);
}

function updateVent(dt){
  if(!VT.on)return;
  VT.t+=dt;
  // паук перебирает лапами
  if(VT.spider&&!VT.dead){
    if(window.ADMIN)VT.spider.scale.setScalar(ADMIN.mobScale());
    VT.spider.userData.legs.forEach(function(l){
      l.o.rotation.x=Math.sin(VT.t*7+l.ph)*0.35;
    });
    var d=Math.abs(P.z-VT.spider.position.z);
    if(d<3.2&&!VT.warned){
      VT.warned=true;
      showSub('Вы','Там что-то шевелится.',2.4);sayE('Там что-то шевелится.');
      sndSkitter();
    }
    // подползает навстречу
    if(d<3.0)VT.spider.position.z+=dt*0.35;
    if(d<0.85){
      setPrompt('👊 УДАРИТЬ — E ('+VT.hits+'/3)',true);
      VT.near=true;
    }else{VT.near=false;setPrompt('',false);}
  }else{
    VT.near=false;
    if(P.z<-VT.len+2.4){
      VT.on=false;
      document.getElementById('black').style.transition='opacity 1.0s';
      document.getElementById('black').style.opacity='1';
      setTimeout(function(){startLoading(buildWarehouse,startWarehouse);},1100);
    }
  }
  // принудительно держим пригнутым
  if(!mCrouch){mCrouch=true;syncBtn('bcrouch',true);}
}

function ventHit(){
  if(!VT.near||VT.dead)return;
  VT.hits++;
  sndPunch();
  if(VT.spider){
    VT.spider.position.z-=0.22;
    VT.spider.rotation.z=(Math.random()-0.5)*0.8;
  }
  if(VT.hits>=3){
    VT.dead=true;questDone();
    if(VT.spider){
      VT.spider.rotation.x=Math.PI;
      VT.spider.position.y=0.06;
      VT.spider.userData.legs.forEach(function(l){l.o.rotation.x=1.2;});
    }
    sndCrunch();
    setPrompt('',false);
    showSub('Вы','Ненавижу пауков.',2.4);sayE('Ненавижу пауков.');
    setTimeout(function(){showMsg('Впереди свет',2.4);},2600);
  }else{
    showMsg('Ещё!',1.0);
  }
}

function sndSkitter(){
  var a=getAC();if(!a)return;
  for(var i=0;i<9;i++){
    var t=a.currentTime+i*0.055+Math.random()*0.02;
    var o=a.createOscillator(),g=a.createGain();
    o.type='square';o.frequency.value=1800+Math.random()*1400;
    g.gain.setValueAtTime(0.018,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.03);
    o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+0.04);
  }
}
function sndPunch(){
  var a=getAC();if(!a)return;
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.18),a.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){var x=i/a.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-x*26);}
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=1100;
  var g=a.createGain();g.gain.value=0.4;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
  var o=a.createOscillator(),g2=a.createGain();
  o.type='sine';o.frequency.setValueAtTime(150,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(52,a.currentTime+0.14);
  g2.gain.setValueAtTime(0.4,a.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.2);
  o.connect(g2);g2.connect(a.destination);o.start();o.stop(a.currentTime+0.22);
}
function sndCrunch(){
  var a=getAC();if(!a)return;
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.3),a.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){
    var x=i/a.sampleRate;
    d[i]=(Math.random()*2-1)*Math.exp(-x*9)*(Math.random()<0.3?1:0.3);
  }
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='bandpass';f.frequency.value=900;f.Q.value=1.2;
  var g=a.createGain();g.gain.value=0.5;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
}
// ============================================================
//  СКЛАД: они слепые и глухие. Но чувствуют пол и тепло.
// ============================================================
var WH={
  w:38,d:28,
  grid:null,                       // занятость клеток
  mobs:[],                         // мебельщики
  pieces:[],                       // куски карты
  got:0,need:4,
  table:null,taped:false,arrow:null,exitOpen:false,
  vib:0,                           // текущая вибрация пола
  heat:0,                          // сколько времени рядом стоим
  caught:false,t:0
};
var WH_TIPS=null;

function whCellFree(cx,cz){
  if(cx<1||cz<1||cx>=WH.w-1||cz>=WH.d-1)return false;
  return !WH.grid[cz*WH.w+cx];
}
function whPath(sx,sz,tx,tz){
  var s=[Math.floor(sx),Math.floor(sz)],t=[Math.floor(tx),Math.floor(tz)];
  if(!whCellFree(t[0],t[1])||!whCellFree(s[0],s[1]))return null;
  var prev={},seen={},q=[s],head=0,found=false;
  function key(c){return c[0]+','+c[1];}
  seen[key(s)]=1;
  while(head<q.length){
    var c=q[head++];
    if(c[0]===t[0]&&c[1]===t[1]){found=true;break;}
    var nb=[[c[0]+1,c[1]],[c[0]-1,c[1]],[c[0],c[1]+1],[c[0],c[1]-1]];
    for(var i=0;i<4;i++){
      var n=nb[i],k=key(n);
      if(seen[k]||!whCellFree(n[0],n[1]))continue;
      seen[k]=1;prev[k]=c;q.push(n);
    }
  }
  if(!found)return null;
  var path=[],cur=t;
  while(cur&&!(cur[0]===s[0]&&cur[1]===s[1])){
    path.push([cur[0]+0.5,cur[1]+0.5]);cur=prev[key(cur)];
  }
  return path.reverse();
}

function makeCrate(x,z,h,special){
  var col=special?0x8a6a3a:0x6a5540;
  var m=new THREE.MeshStandardMaterial({color:col,roughness:0.92,map:TEX.wood});
  var g=new THREE.Mesh(new THREE.BoxGeometry(0.95,h,0.95),m);
  g.position.set(x,h/2,z);addObj(g);
  if(special){
    var tape=new THREE.Mesh(new THREE.BoxGeometry(0.99,0.08,0.99),
      new THREE.MeshStandardMaterial({color:0xd8b23a,emissive:0xa07a10,emissiveIntensity:0.8}));
    tape.position.set(x,h*0.62,z);addObj(tape);
  }
  return g;
}

function buildWarehouse(){
  clearScene();walls=[];LAMPS=[];
  setBounds(0,0,WH.w,WH.d);
  WH.mobs=[];WH.pieces=[];WH.got=0;WH.taped=false;WH.exitOpen=false;
  WH.vib=0;WH.heat=0;WH.caught=false;WH.t=0;WH.arrow=null;
  var W2=WH.w,D2=WH.d,HH=5.0;
  WH.grid=new Uint8Array(W2*D2);

  // тонкий деревянный пол — по нему и идёт вибрация
  MATS.wood.map.repeat.set(W2/2,D2/2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),
    new THREE.MeshStandardMaterial({color:0x7a5f42,roughness:0.95,map:TEX.wood,
      bumpMap:TEX.wood,bumpScale:0.05}));
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/2,2.5);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  for(var lx=6;lx<W2;lx+=9)for(var lz=7;lz<D2;lz+=10){
    LAMPS.push([lx,HH-1.0,lz,0xffdcb0,13,0.5]);
    var em=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.06,0.3),
      new THREE.MeshStandardMaterial({color:0xffe0b8,emissive:0xffcf90,emissiveIntensity:1.5}));
    em.position.set(lx,HH-0.1,lz);addObj(em);
  }

  // ---- стеллажи и ящики ----
  function occupy(x1,z1,x2,z2){
    solid(x1,z1,x2,z2);
    for(var cz=Math.floor(z1);cz<=Math.floor(z2);cz++)
      for(var cx=Math.floor(x1);cx<=Math.floor(x2);cx++)
        if(cx>=0&&cz>=0&&cx<W2&&cz<D2)WH.grid[cz*W2+cx]=1;
  }
  // длинные ряды стеллажей поперёк зала
  for(var r=0;r<4;r++){
    var zz=6+r*6;
    for(var seg=0;seg<2;seg++){
      var x0=4+seg*19, len=13;
      var rack=new THREE.Mesh(new THREE.BoxGeometry(len,3.2,1.1),
        new THREE.MeshStandardMaterial({color:0x54524e,roughness:0.7,metalness:0.35}));
      rack.position.set(x0+len/2,1.6,zz);addObj(rack);
      occupy(x0,zz-0.7,x0+len,zz+0.7);
      for(var bx=x0+1;bx<x0+len-0.6;bx+=1.6){
        makeCrate(bx,zz+1.15,0.7+Math.random()*0.5,false);
      }
    }
  }
  // отдельные ящики
  for(var i=0;i<26;i++){
    var cx2=2+Math.random()*(W2-4), cz2=2+Math.random()*(D2-4);
    if(Math.hypot(cx2-1.6,cz2-2.0)<3.5)continue;      // не заваливаем выход из вентиляции
    if(!whCellFree(Math.floor(cx2),Math.floor(cz2)))continue;
    makeCrate(cx2,cz2,0.6+Math.random()*0.7,false);
    occupy(cx2-0.5,cz2-0.5,cx2+0.5,cz2+0.5);
  }
  // ---- четыре коробки с кусками карты ----
  var spots=[[6.5,3.5],[31.5,3.5],[6.5,25.0],[31.5,25.0]];
  spots.forEach(function(s,k){
    var fx=s[0],fz=s[1],guard=0;
    while(!whCellFree(Math.floor(fx),Math.floor(fz))&&guard++<40){
      fx=2+Math.random()*(W2-4);fz=2+Math.random()*(D2-4);
    }
    makeCrate(fx,fz,0.85,true);
    occupy(fx-0.5,fz-0.5,fx+0.5,fz+0.5);
    WH.pieces.push({x:fx,z:fz,taken:false,n:k+1});
  });

  // ---- стол у вентиляции ----
  var tb=new THREE.Group();
  var tp=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.1,1.2),MATS.wood);tp.position.y=0.9;tb.add(tp);
  [[-1.05,-0.5],[1.05,-0.5],[-1.05,0.5],[1.05,0.5]].forEach(function(q){
    var lg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.9,0.1),MATS.wood);
    lg.position.set(q[0],0.45,q[1]);tb.add(lg);
  });
  // скотч лежит прямо на столе
  var tape=new THREE.Mesh(new THREE.TorusGeometry(0.11,0.045,8,16),
    new THREE.MeshStandardMaterial({color:0xd9c07a,roughness:0.5}));
  tape.position.set(0.75,0.99,0.2);tape.rotation.x=Math.PI/2;tb.add(tape);
  tb.position.set(3.0,0,5.2);addObj(tb);
  occupy(1.8,4.5,4.2,5.9);
  WH.table={x:3.0,z:5.2};      // отодвинут: раньше игрок появлялся прямо в нём

  // ---- вентиляция, из которой вылезли ----
  var vg=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.9,0.1),MATS.metal);
  vg.position.set(0.2,1.4,2.0);vg.rotation.y=Math.PI/2;addObj(vg);

  // ---- выход ----
  WH.exit={x:W2-1.2,z:D2-2.5};
  var ex=new THREE.Mesh(new THREE.BoxGeometry(0.16,2.4,1.5),
    new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.6,metalness:0.5}));
  ex.position.set(W2-0.25,1.2,WH.exit.z);addObj(ex);
  WH.exitMesh=ex;

  // ---- мебельщики ----
  var starts=[[19,8],[12,20],[28,15]];
  starts.forEach(function(s){
    var fx=s[0],fz=s[1],guard=0;
    while(!whCellFree(fx,fz)&&guard++<50){fx=2+Math.floor(Math.random()*(W2-4));fz=2+Math.floor(Math.random()*(D2-4));}
    var m=createBossMesh();
    m.position.set(fx+0.5,0,fz+0.5);scene.add(m);objs.push(m);
    WH.mobs.push({g:m,x:fx+0.5,z:fz+0.5,alert:0,state:'patrol',
                  tx:fx+0.5,tz:fz+0.5,path:null,pi:0,pcx:-1,pcz:-1,
                  wait:0,px:0,pz:0,stuck:0});
  });

  scene.fog=new THREE.FogExp2(0x0b0a0a,0.048);
  ambientLight.intensity=0.12;sunLight.intensity=0;
}
// ---------- логика склада ----------
function startWarehouse(){
  PHASE='warehouse';
  saveAt('warehouse');
  P.x=1.6;P.z=2.0;P.y=0;P.vy=0;P.yaw=0;P.pitch=0;
  unstick();
  dead=false;mCrouch=true;syncBtn('bcrouch',true);mRun=false;syncBtn('brun',false);
  document.getElementById('inv').style.display='block';
  document.getElementById('vibwrap').style.display='block';
  whHUD();
  document.getElementById('black').style.transition='opacity 1.5s';
  document.getElementById('black').style.opacity='0';
  SearchMusic.start();          // играет, пока ищем коробки
  setTimeout(function(){showSub('Вы','Сколько же их...',2.6);sayE('Сколько же их...');},1600);
  setTimeout(function(){showMsg('Они не видят и не слышат. Но пол тонкий.',4.0);},4600);
  setTimeout(function(){showMsg('Иди сидя. И не стой рядом — они чуют тепло.',4.0);},9000);
  setTimeout(function(){questShow('Соберите четыре куска карты','Коробки помечены жёлтой лентой');},11500);
}

function whHUD(){
  var el=document.getElementById('inv');
  var s=['🗺 куски карты: '+WH.got+'/'+WH.need];
  if(WH.taped)s.push('✅ карта склеена');
  el.innerHTML=s.join('<br>');
}

// Вибрация пола зависит от того, КАК вы движетесь
function whVib(){
  var mag=Math.hypot(jmx,jmy);
  var kb=(K['KeyW']||K['KeyS']||K['KeyA']||K['KeyD'])?1:0;
  var moving=Math.max(mag,kb)>0.08;
  var run=mRun||K['ShiftLeft']||K['ShiftRight'];
  var cr=mCrouch||K['ControlLeft']||K['ControlRight'];
  if(!P.onGround)return 1.0;              // приземление — сильнейший удар по полу
  if(!moving)return 0.0;
  if(cr)return 0.14;
  if(run)return 1.0;
  return 0.52;
}

function updateWarehouse(dt){
  if(PHASE!=='warehouse'||WH.caught)return;
  WH.t+=dt;
  var vib=whVib();
  WH.vib+=(vib-WH.vib)*Math.min(1,dt*8);
  var vf=document.getElementById('vibfill');
  if(vf){
    vf.style.width=(WH.vib*100).toFixed(0)+'%';
    vf.style.background=WH.vib<0.2?'#3a7a4a':(WH.vib<0.6?'#c9a227':'#c02020');
  }

  var anyHeat=false, minAlert=0;
  for(var i=0;i<WH.mobs.length;i++){
    var m=WH.mobs[i];
    var dx=P.x-m.x,dz=P.z-m.z,d=Math.hypot(dx,dz)||0.001;

    // 1. ВИБРАЦИЯ: радиус растёт от того, как топаете
    var vibR=1.2+WH.vib*15;
    if(d<vibR)m.alert+=dt*(0.40+WH.vib*1.8)*(1-d/vibR);
    // 2. ТЕПЛО: рядом стоять нельзя. Раньше прирост был МЕНЬШЕ затухания,
    //    и тепло не работало вовсе — стоять вплотную можно было вечно.
    if(d<2.8){m.alert+=dt*(0.90*(1-d/2.8)+0.20);anyHeat=true;}
    m.alert-=dt*0.22;
    if(m.alert<0)m.alert=0;
    if(m.alert>1.6)m.alert=1.6;
    if(m.alert>minAlert)minAlert=m.alert;

    var spd;
    if(m.alert>=1.0){
      m.state='hunt';m.tx=P.x;m.tz=P.z;spd=0.052;
    }else if(m.alert>=0.45){
      m.state='check';spd=0.030;
      if(m.wait<=0){m.tx=P.x;m.tz=P.z;m.wait=1.4;}
    }else{
      if(m.state!=='patrol'){m.state='patrol';m.path=null;m.pcx=-1;}
      spd=0.018;
      m.wait-=dt;
      if(m.wait<=0){
        for(var g=0;g<30;g++){
          var rx=1+Math.floor(Math.random()*(WH.w-2)),rz=1+Math.floor(Math.random()*(WH.d-2));
          if(whCellFree(rx,rz)){m.tx=rx+0.5;m.tz=rz+0.5;break;}
        }
        m.wait=4+Math.random()*5;
      }
    }
    m.wait-=dt;

    // движение по найденному пути
    var tcx=Math.floor(m.tx),tcz=Math.floor(m.tz);
    if(m.pcx!==tcx||m.pcz!==tcz||!m.path||m.pi>=m.path.length){
      m.path=whPath(m.x,m.z,m.tx,m.tz)||[];m.pcx=tcx;m.pcz=tcz;m.pi=0;
    }
    var node=m.path[m.pi];
    if(node){
      var ndx=node[0]-m.x,ndz=node[1]-m.z,nd=Math.hypot(ndx,ndz)||1;
      if(nd<0.24)m.pi++;
      else{
        var nx=m.x+ndx/nd*spd,nz=m.z+ndz/nd*spd;
        if(whCellFree(Math.floor(nx),Math.floor(m.z)))m.x=nx;
        if(whCellFree(Math.floor(m.x),Math.floor(nz)))m.z=nz;
        m.g.rotation.y=Math.atan2(ndx,ndz);
      }
    }
    if(Math.abs(m.x-m.px)+Math.abs(m.z-m.pz)<0.004)m.stuck++;else m.stuck=0;
    m.px=m.x;m.pz=m.z;
    if(m.stuck>60){m.stuck=0;m.path=null;m.pcx=-1;m.wait=0;}

    m.g.position.set(m.x,0,m.z);
    var e=m.state==='hunt'?7:(m.state==='check'?3.5:1.2);
    m.g.children.forEach(function(c){
      if(c.material&&c.material.emissiveIntensity!==undefined)c.material.emissiveIntensity=e;
    });
    if(d<0.95&&m.alert>=1.0)whCaught();
  }

  // край экрана краснеет по самой высокой тревоге
  var dmg=document.getElementById('dmg');
  if(dmg)dmg.style.opacity=minAlert>0.4?Math.min(0.8,(minAlert-0.4)*0.9).toFixed(2):'0';
  var hw=document.getElementById('heatw');
  if(hw)hw.style.opacity=anyHeat?'1':'0';

  if(WH.arrow){
    WH.arrow.position.y=1.9+Math.sin(WH.t*2.2)*0.12;
    WH.arrow.rotation.y=Math.atan2(WH.exit.x-P.x,WH.exit.z-P.z);
  }
  whNear();
}

function whCaught(){
  if(window.ADMIN&&ADMIN.god)return;
  WH.caught=true;dead=true;
  SearchMusic.stop();
  document.getElementById('dmg').style.opacity='1';
  addShake(0.30);
  sndScare();Music.outro();
  setTimeout(function(){
    document.getElementById('endtitle').style.color='#c02020';
    document.getElementById('endtitle').textContent='ОНИ ПОЧУВСТВОВАЛИ';
    document.getElementById('endsub').textContent='Пол слишком тонкий. И ты слишком тёплый.';
    updateEndScreen();document.getElementById('endscreen').style.display='flex';
  },800);
}

var nWh=null;
function whNear(){
  nWh=null;
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  for(var i=0;i<WH.pieces.length;i++){
    var p=WH.pieces[i];
    if(!p.taken&&d2(p.x,p.z)<1.5){
      nWh={t:'piece',i:i};setPrompt('🗺 ВЗЯТЬ КУСОК КАРТЫ — E',true);return;
    }
  }
  if(d2(WH.table.x,WH.table.z)<1.9){
    if(!WH.taped){
      nWh={t:'table'};
      setPrompt(WH.got>=WH.need?'📐 СОБРАТЬ КАРТУ — E':'Собрано кусков: '+WH.got+'/'+WH.need,WH.got>=WH.need);
      return;
    }
  }
  if(WH.taped&&d2(WH.exit.x,WH.exit.z)<2.0){
    nWh={t:'exit'};setPrompt('🚪 ВЫХОД — E',true);return;
  }
  setPrompt('',false);
}

function whAct(){
  if(!nWh)return;
  if(nWh.t==='piece'){
    var p=WH.pieces[nWh.i];
    p.taken=true;WH.got++;whHUD();sndPickup();
    showSub('Вы','Кусок карты. Уже '+WH.got+' из '+WH.need+'.',2.6);
    if(WH.got>=WH.need){questDone();setTimeout(function(){showMsg('К столу у вентиляции',3.0);},2000);}
  }
  else if(nWh.t==='table'){
    if(WH.got<WH.need)return;
    assembleMap();
  }
  else if(nWh.t==='exit'){
    WH.caught=true;
    Music.outro();
    document.getElementById('black').style.transition='opacity 1.6s';
    document.getElementById('black').style.opacity='1';
    setTimeout(startHall,1700);        // дальше — огромный коридор
  }
}

// ---------- сборка карты на столе ----------
function assembleMap(){
  var ov=document.getElementById('mapov');
  ov.style.display='flex';
  var cv=document.getElementById('mapcv'),c=cv.getContext('2d');
  var t0=performance.now();
  document.getElementById('mapmsg').textContent='Складываем...';
  (function anim(){
    var t=(performance.now()-t0)/1000;
    var k=Math.min(1,t/2.2);
    c.fillStyle='#12100e';c.fillRect(0,0,cv.width,cv.height);
    var W2=cv.width,H2=cv.height,cx=W2/2,cy=H2/2,s=Math.min(W2,H2)*0.34;
    var quads=[[-1,-1],[1,-1],[-1,1],[1,1]];
    quads.forEach(function(q,i){
      var off=(1-k)*(120+i*30);
      var x=cx+q[0]*s/2+q[0]*off, y=cy+q[1]*s/2+q[1]*off;
      c.save();c.translate(x,y);c.rotate((1-k)*(i%2?0.3:-0.3));
      c.fillStyle='#d9cfae';c.fillRect(-s/2,-s/2,s,s);
      c.strokeStyle='#8a7c58';c.lineWidth=2;c.strokeRect(-s/2,-s/2,s,s);
      // линии плана на куске
      c.strokeStyle='#6a5c3c';c.lineWidth=1.5;
      for(var l=0;l<5;l++){
        c.beginPath();
        c.moveTo(-s/2+8,-s/2+10+l*(s-20)/5);
        c.lineTo(-s/2+8+((i*37+l*53)%(s-24)),-s/2+10+l*(s-20)/5);
        c.stroke();
      }
      c.restore();
    });
    if(k>=1){
      // скотч по швам
      c.fillStyle='rgba(226,206,140,0.55)';
      c.fillRect(cx-s/2-6,cy-8,s+12,16);
      c.fillRect(cx-8,cy-s/2-6,16,s+12);
      // красная стрелка к выходу
      c.strokeStyle='#c02020';c.lineWidth=4;
      c.beginPath();c.moveTo(cx-s*0.3,cy+s*0.25);c.lineTo(cx+s*0.34,cy-s*0.22);c.stroke();
      c.beginPath();c.moveTo(cx+s*0.34,cy-s*0.22);c.lineTo(cx+s*0.20,cy-s*0.20);
      c.lineTo(cx+s*0.30,cy-s*0.08);c.closePath();c.fillStyle='#c02020';c.fill();
    }
    if(t<3.6)requestAnimationFrame(anim);
  })();
  setTimeout(function(){
    document.getElementById('mapmsg').textContent='Скотч. Держится.';
    sndPickup();
  },2400);
  setTimeout(function(){
    document.getElementById('mapmsg').textContent='Выход — на востоке.';
  },3300);
  setTimeout(function(){
    ov.style.display='none';
    WH.taped=true;whHUD();
    SearchMusic.stop();         // карта собрана — поиск закончен, музыка уходит
    showSub('Вы','Теперь понятно, куда идти.',2.6);sayE('Теперь понятно, куда идти.');
    spawnArrow();
  },5000);
}

function spawnArrow(){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:0xff4a4a,emissive:0xff2a2a,emissiveIntensity:2.4});
  var shaft=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.7),m);
  shaft.position.z=-0.1;g.add(shaft);
  var tip=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.34,4),m);
  tip.rotation.x=-Math.PI/2;tip.position.z=-0.6;g.add(tip);
  g.position.set(P.x,1.9,P.z);
  scene.add(g);objs.push(g);
  WH.arrow=g;
  if(WH.exitMesh)WH.exitMesh.material.emissive=new THREE.Color(0x2f8f4f),
                 WH.exitMesh.material.emissiveIntensity=0.8;
}
// ============================================================
//  ЩИТОК: соединяем провода. Как в первой части, но пять кругов.
// ============================================================
var WP={active:false,round:0,rounds:5,sel:null,done:{},order:[],onDone:null};
var WIRE_COLS=[['#d84040','красный'],['#40b050','зелёный'],['#4070d8','синий'],
               ['#d8c040','жёлтый'],['#b060c0','фиолетовый']];
var WP_LINES=['Так... поехали.','Да блин, ещё провода.','Окей, третьи провода.',
              'Сколько же их тут.','Последние. Должны быть последние.'];

function openWires(rounds,cb){
  if(WP.active)return;
  WP.active=true;WP.round=0;WP.rounds=rounds||5;WP.onDone=cb||null;
  document.getElementById('wires').style.display='flex';
  wpRound();
}
function closeWires(){
  WP.active=false;
  document.getElementById('wires').style.display='none';
}
function wpRound(){
  WP.sel=null;WP.done={};
  WP.order=[0,1,2,3,4].sort(function(){return Math.random()-0.5;});
  document.getElementById('wpround').textContent='КРУГ '+(WP.round+1)+' / '+WP.rounds;
  document.getElementById('wphint').textContent=WP_LINES[Math.min(WP.round,WP_LINES.length-1)];
  wpDraw();
}
function wpDraw(){
  var L=document.getElementById('wpleft'),R=document.getElementById('wpright');
  L.innerHTML='';R.innerHTML='';
  WIRE_COLS.forEach(function(c,i){
    var b=document.createElement('div');
    b.className='wire'+(WP.done[i]?' done':'')+(WP.sel===i?' sel':'');
    b.style.background=c[0];
    b.onclick=function(){ if(WP.done[i])return; WP.sel=i; wpDraw(); };
    L.appendChild(b);
  });
  WP.order.forEach(function(idx){
    var b=document.createElement('div');
    b.className='wire'+(WP.done[idx]?' done':'');
    b.style.background=WIRE_COLS[idx][0];
    b.onclick=function(){ wpConnect(idx); };
    R.appendChild(b);
  });
}
function wpConnect(idx){
  if(WP.sel===null||WP.done[idx])return;
  if(WP.sel===idx){
    WP.done[idx]=true;WP.sel=null;sndBeep(900);
    wpDraw();
    if(Object.keys(WP.done).length>=5){
      WP.round++;
      if(WP.round>=WP.rounds){
        document.getElementById('wphint').textContent='Щёлкнуло. Готово.';
        sndSafe();
        setTimeout(function(){
          var cb=WP.onDone;closeWires();if(cb)cb();
        },900);
      }else{
        document.getElementById('wphint').textContent='Отсоединились...';
        setTimeout(function(){
          if(WP.active){
            wpRound();
            var l=WP_LINES[Math.min(WP.round,WP_LINES.length-1)];
            say(l,0.9,0.6);
          }
        },1000);
      }
    }
  }else{
    WP.sel=null;sndBeep(160);
    var el=document.getElementById('wires');
    el.classList.add('bad');setTimeout(function(){el.classList.remove('bad');},260);
    wpDraw();
  }
}
// ============================================================
//  ОГРОМНЫЙ КОРИДОР: потолок под небо, по бокам двое гигантов
// ============================================================
var HL={
  w:11,h:19,len:72,          // ширина, высота, длина основного коридора
  sideZ:-58,sideLen:26,      // поворот налево
  on:false,t:0,
  chaser:null,cz:0,cspd:0,started:false,
  giants:[],gate:null,gateOpen:false,
  panel:{x:0,z:0},atPanel:false,
  danger:0,caught:false
};

function makeGiant(scale){
  var g=createBossMesh();
  g.scale.set(scale,scale,scale);
  return g;
}

function buildHall(){
  clearScene();walls=[];LAMPS=[];
  setBounds(-HL.w/2-HL.sideLen-0.6,-HL.len-4,HL.w/2+2,6);   // за торец прохода не уйти
  HL.giants=[];HL.gateOpen=false;HL.caught=false;HL.danger=0;HL.started=false;HL.t=0;

  var W2=HL.w,HH=HL.h,L=HL.len;
  MATS.corrFloor.map.repeat.set(W2,L);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,L),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(0,0,-L/2+3);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,L),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(0,HH,-L/2+3);addObj(ce);
  MATS.corrWall.map.repeat.set(L/3,HH/3);
  var SZ0=HL.sideZ, GAP=3.5;                       // проём в левой стене
  // правая стена — сплошная
  var wr=new THREE.Mesh(new THREE.BoxGeometry(0.4,HH,L),MATS.corrWall);
  wr.position.set(W2/2,HH/2,-L/2+3);addObj(wr);
  solid(W2/2-0.3,-L+2,W2/2+0.3,5);
  // левая — ДВА куска, между ними настоящий проход
  var segA=(3-(SZ0+GAP));
  var wa=new THREE.Mesh(new THREE.BoxGeometry(0.4,HH,segA),MATS.corrWall);
  wa.position.set(-W2/2,HH/2,(3+(SZ0+GAP))/2);addObj(wa);
  solid(-W2/2-0.3,SZ0+GAP,-W2/2+0.3,5);
  var segB=((SZ0-GAP)-(-L+3));
  var wb=new THREE.Mesh(new THREE.BoxGeometry(0.4,HH,segB),MATS.corrWall);
  wb.position.set(-W2/2,HH/2,((SZ0-GAP)+(-L+3))/2);addObj(wb);
  solid(-W2/2-0.3,-L+2,-W2/2+0.3,SZ0-GAP);
  // перемычка над проёмом — видно, что это именно проход
  box(0.4,HH-5.6,GAP*2,MATS.corrWall,-W2/2,5.6+(HH-5.6)/2,SZ0);
  box(W2,HH,0.4,MATS.corrWall,0,HH/2,4);
  solid(-W2/2,4,W2/2,4.6);

  // ---- двое гигантов в нишах ----
  [[-1,-20],[1,-34]].forEach(function(s){
    var g=makeGiant(7.2);
    g.position.set(s[0]*(W2/2-0.6),0,s[1]);
    g.rotation.y=s[0]>0?Math.PI/2:-Math.PI/2;
    scene.add(g);objs.push(g);
    HL.giants.push({g:g,ph:Math.random()*6});
    // ниша за ним, чтобы читался объём
    box(1.2,HH*0.9,7,MATS.dark,s[0]*(W2/2+0.5),HH*0.45,s[1]);
  });

  // ---- свет: редкий, очень высоко ----
  for(var z=-4;z>-L+4;z-=11){
    LAMPS.push([0,HH-2.5,z,0xbfd0e0,26,0.75]);
    var em=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.1,0.5),
      new THREE.MeshStandardMaterial({color:0xd8e4f0,emissive:0xa8c0d8,emissiveIntensity:1.4}));
    em.position.set(0,HH-0.12,z);addObj(em);
  }

  // ---- поворот налево ----
  var SZ=HL.sideZ, SL=HL.sideLen, SW2=7;
  MATS.corrFloor.map.repeat.set(SL,SW2);
  var sfl=new THREE.Mesh(new THREE.PlaneGeometry(SL,SW2),MATS.corrFloor);
  sfl.rotation.x=-Math.PI/2;sfl.position.set(-W2/2-SL/2,0,SZ);addObj(sfl);
  var sce=new THREE.Mesh(new THREE.PlaneGeometry(SL,SW2),MATS.dark);
  sce.rotation.x=Math.PI/2;sce.position.set(-W2/2-SL/2,5.5,SZ);addObj(sce);
  [SZ-SW2/2,SZ+SW2/2].forEach(function(sz){
    var w=new THREE.Mesh(new THREE.BoxGeometry(SL,5.5,0.4),MATS.corrWall);
    w.position.set(-W2/2-SL/2,2.75,sz);addObj(w);
    solid(-W2/2-SL,sz-0.3,-W2/2,sz+0.3);
  });
  solid(-W2/2-SL-0.4,SZ-SW2/2,-W2/2-SL,SZ+SW2/2);   // торец прохода
  for(var x=-W2/2-3;x>-W2/2-SL+2;x-=7){
    LAMPS.push([x,4.9,SZ,0xffd8a0,11,0.6]);
    var em2=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.3),
      new THREE.MeshStandardMaterial({color:0xffe0b8,emissive:0xffcf90,emissiveIntensity:1.4}));
    em2.position.set(x,5.42,SZ);addObj(em2);
  }
  // тупик коридора за поворотом
  box(W2,HH,0.4,MATS.corrWall,0,HH/2,-L+3);

  // ---- ворота в конце бокового прохода ----
  var GX=-W2/2-SL+1.2;
  var gate=new THREE.Group();
  [-1,1].forEach(function(s){
    var leaf=new THREE.Mesh(new THREE.BoxGeometry(0.3,4.6,3.3),
      new THREE.MeshStandardMaterial({color:0x4a4d52,roughness:0.55,metalness:0.7}));
    leaf.position.set(0,2.3,s*1.65);gate.add(leaf);
    for(var r=0;r<4;r++){
      var rib=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.16,3.1),MATS.metal);
      rib.position.set(0,0.8+r*1.1,s*1.65);gate.add(rib);
    }
  });
  gate.position.set(GX,0,SZ);addObj(gate);
  HL.gate=gate;
  HL.gateWall={x1:GX-0.4,z1:SZ-3.4,x2:GX+0.4,z2:SZ+3.4};
  walls.push(HL.gateWall);

  // ---- электрощиток рядом с воротами ----
  var pan=new THREE.Group();
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.25,1.15,0.9),
    new THREE.MeshStandardMaterial({color:0x5a5f4a,roughness:0.6,metalness:0.5}));
  pan.add(body);
  var door=new THREE.Mesh(new THREE.BoxGeometry(0.06,1.0,0.8),
    new THREE.MeshStandardMaterial({color:0x6a705a,roughness:0.55,metalness:0.55}));
  door.position.set(0.16,0,0);pan.add(door);
  var led=new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.05),
    new THREE.MeshStandardMaterial({color:0x300,emissive:0xcc2020,emissiveIntensity:2}));
  led.position.set(0.20,0.42,0.2);led.rotation.y=Math.PI/2;pan.add(led);
  pan.userData.led=led;
  pan.position.set(GX+1.6,1.5,SZ-2.6);addObj(pan);
  HL.panelMesh=pan;
  HL.panel={x:GX+1.9,z:SZ-2.6};

  // светящаяся стрелка у проёма — иначе его не найти в таком зале
  var sign=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.5),
    new THREE.MeshStandardMaterial({color:0x1a3a1a,emissive:0x30c050,emissiveIntensity:2.2,
      side:THREE.DoubleSide}));
  sign.position.set(-W2/2+0.3,2.6,SZ0);sign.rotation.y=Math.PI/2;addObj(sign);
  LAMPS.push([-W2/2+1.2,3.0,SZ0,0x60ff80,7,0.5]);

  scene.fog=new THREE.FogExp2(0x0a0c10,0.028);
  ambientLight.intensity=0.13;sunLight.intensity=0;
}

function startHall(){
  PHASE='hall';
  saveAt('hall');
  buildHall();
  P.x=0;P.z=1.5;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  unstick();
  dead=false;mCrouch=false;syncBtn('bcrouch',false);
  mRun=true;syncBtn('brun',true);
  document.getElementById('inv').style.display='none';
  document.getElementById('vibwrap').style.display='none';
  document.getElementById('heatw').style.opacity='0';
  document.getElementById('black').style.transition='opacity 1.6s';
  document.getElementById('black').style.opacity='0';
  HL.on=true;
  // погоня появляется не сразу — дают рассмотреть гигантов
  HL.chaser=createBossMesh();HL.chaser.position.set(0,0,6);
  HL.chaser.visible=false;scene.add(HL.chaser);objs.push(HL.chaser);
  HL.cz=6;HL.cspd=0.046;
  setTimeout(function(){showSub('Вы','Какой высокий...',2.4);sayE('Какой высокий...');},1800);
  setTimeout(function(){
    showSub('Вы','Их что, двое? И они... огромные.',3.2);sayE('Их что, двое? И они... огромные.');
  },6000);
  setTimeout(function(){
    HL.started=true;HL.chaser.visible=true;
    sndScare();Music.escape();
    showMsg('СЗАДИ',2.0);
    questShow('Уходите налево','Справа тупик');
  },11000);
}

function updateHall(dt){
  if(!HL.on||HL.caught)return;
  HL.t+=dt;
  // гиганты еле заметно дышат — так страшнее, чем если бы стояли статуями
  HL.giants.forEach(function(gi){
    gi.ph+=dt*0.35;
    gi.g.position.y=Math.sin(gi.ph)*0.18;
    gi.g.rotation.z=Math.sin(gi.ph*0.7)*0.012;
  });
  if(HL.started&&!WP.active){
    HL.cz-=HL.cspd*dt*60;
    HL.chaser.position.set(Math.sin(HL.t*1.4)*1.2,0,HL.cz);
    HL.chaser.rotation.y=Math.PI;
    // он идёт только по главному коридору, за угол не сворачивает сразу
    var gap;
    if(P.z>HL.sideZ+3.5)gap=HL.cz-P.z;
    else gap=Math.max(0.1,(HL.cz-HL.sideZ)+Math.abs(P.x));
    var dmg=document.getElementById('dmg');
    if(dmg)dmg.style.opacity=gap<6?Math.min(0.8,(6-gap)/5).toFixed(2):'0';
    // HL.danger раньше объявлялся, но никогда не обновлялся — фонарь
    // не мог на него реагировать. Тот же gap, что красит виньетку.
    HL.danger=gap<6?Math.min(1,(6-gap)/5):0;
    if(gap<1.0)hallCaught();
  }else HL.danger=0;
  hallNear();
}
function hallCaught(){
  if(window.ADMIN&&ADMIN.god)return;
  HL.caught=true;dead=true;
  document.getElementById('dmg').style.opacity='1';
  addShake(0.30);
  sndScare();Music.outro();
  if(WP.active)closeWires();
  setTimeout(function(){
    document.getElementById('endtitle').style.color='#c02020';
    document.getElementById('endtitle').textContent='НЕ УСПЕЛ';
    document.getElementById('endsub').textContent='Ворота остались закрытыми.';
    updateEndScreen();document.getElementById('endscreen').style.display='flex';
  },800);
}

var nHall=null;
function hallNear(){
  nHall=null;
  if(WP.active){setPrompt('',false);return;}
  var d=Math.hypot(P.x-HL.panel.x,P.z-HL.panel.z);
  if(!HL.gateOpen&&d<2.0){
    nHall='panel';setPrompt('⚡ ЭЛЕКТРОЩИТОК — E',true);return;
  }
  if(HL.gateOpen&&Math.hypot(P.x-(HL.panel.x-2.0),P.z-HL.panel.z-2.6)<3.0){
    nHall='gate';setPrompt('🚪 ВЫЙТИ — E',true);return;
  }
  setPrompt('',false);
}
function hallAct(){
  if(nHall==='panel')openWires(5,hallGateOpen);
  else if(nHall==='gate')hallExit();
}
function hallGateOpen(){
  HL.gateOpen=true;questDone();
  if(HL.gate){
    HL.gate.children.forEach(function(c){
      if(c.position.z>0)c.position.z+=2.6; else c.position.z-=2.6;
    });
  }
  if(HL.panelMesh&&HL.panelMesh.userData.led){
    HL.panelMesh.userData.led.material.emissive.setHex(0x20cc40);
  }
  var gi=walls.indexOf(HL.gateWall);
  if(gi>=0)walls.splice(gi,1);
  sndCreak();
  showMsg('Ворота открылись',2.6);
  say('Открылось. Наружу.',0.85,0.55);
}
function hallExit(){
  HL.on=false;
  Music.outro();
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='1';
  document.getElementById('dmg').style.opacity='0';
  setTimeout(function(){startLoading(buildShelter,startShelter);},1500);
}
// ============================================================
//  ПРИЮТ: яркий, детский — и в этом самое неприятное
//  «Улица» оказывается нарисованным небом под потолком.
// ============================================================
var SH2={w:34,d:26,h:9,on:false,t:0,slide:null,onSlide:false,revealed:false,flick:[]};

function texSky(){
  return makeTex(function(g,s){
    var gr=g.createLinearGradient(0,0,0,s);
    gr.addColorStop(0,'#4a90d9');gr.addColorStop(0.6,'#8ec5f0');gr.addColorStop(1,'#cfe6f7');
    g.fillStyle=gr;g.fillRect(0,0,s,s);
    for(var c=0;c<7;c++){
      var cx=Math.random()*s,cy=Math.random()*s*0.6,r=18+Math.random()*30;
      g.fillStyle='rgba(255,255,255,0.85)';
      for(var k=0;k<5;k++){
        g.beginPath();
        g.arc(cx+(k-2)*r*0.5,cy+Math.sin(k)*r*0.15,r*(0.55+Math.random()*0.3),0,6.283);
        g.fill();
      }
    }
    // краска местами облупилась — это не настоящее небо
    for(var p=0;p<10;p++){
      var px=Math.random()*s,py=Math.random()*s,pr=6+Math.random()*22;
      g.fillStyle='rgba(60,58,54,0.55)';
      g.beginPath();
      for(var a=0;a<=10;a++){
        var an=a/10*6.283,rr=pr*(0.6+Math.random()*0.6);
        var xx=px+Math.cos(an)*rr,yy=py+Math.sin(an)*rr;
        if(a===0)g.moveTo(xx,yy);else g.lineTo(xx,yy);
      }
      g.closePath();g.fill();
    }
  },2);
}
function texKidWall(){
  return makeTex(function(g,s){
    g.fillStyle='#f2e4c8';g.fillRect(0,0,s,s);
    // весёлые полосы
    for(var i=0;i<s;i+=32){
      g.fillStyle=['#f6c9c9','#c9e6f6','#d8f0c9','#f6e6c9'][(i/32)%4];
      g.fillRect(i,0,16,s);
    }
    // детские рисунки: солнце, домик, человечек
    g.strokeStyle='rgba(90,70,50,0.5)';g.lineWidth=2;
    for(var k=0;k<3;k++){
      var x=30+Math.random()*(s-80),y=40+Math.random()*(s-90);
      g.beginPath();g.arc(x,y,12,0,6.283);g.stroke();
      for(var r=0;r<8;r++){
        var a=r/8*6.283;
        g.beginPath();g.moveTo(x+Math.cos(a)*15,y+Math.sin(a)*15);
        g.lineTo(x+Math.cos(a)*22,y+Math.sin(a)*22);g.stroke();
      }
    }
    // ОБОИ ПОРВАНЫ: рваные лоскуты, под ними серая стена
    for(var t=0;t<9;t++){
      var tx=Math.random()*s,ty=Math.random()*s,tw=20+Math.random()*70,th=30+Math.random()*90;
      g.fillStyle='rgba(72,68,64,0.85)';
      g.beginPath();g.moveTo(tx,ty);
      for(var q=0;q<7;q++){
        g.lineTo(tx+(Math.random()-0.3)*tw, ty+q*th/7+(Math.random()-0.5)*12);
      }
      for(q=6;q>=0;q--){
        g.lineTo(tx+tw*0.2+(Math.random()-0.5)*14, ty+q*th/7);
      }
      g.closePath();g.fill();
    }
    speckle(g,s,3000,120,110,95,0.18);
  },2);
}

function buildShelter(){
  clearScene();walls=[];LAMPS=[];SH2.flick=[];
  setBounds(0,0,SH2.w,SH2.d);
  var W2=SH2.w,D2=SH2.d,HH=SH2.h;
  if(!TEX.sky)TEX.sky=texSky();
  if(!TEX.kid)TEX.kid=texKidWall();

  // пол — светлая плитка с дорожкой
  MATS.floor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),
    new THREE.MeshStandardMaterial({color:0xd9d2c4,roughness:0.6,map:TEX.tile}));
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  // жёлтая дорожка через весь зал
  var path=new THREE.Mesh(new THREE.PlaneGeometry(2.4,D2-2),
    new THREE.MeshStandardMaterial({color:0xe8c860,roughness:0.7}));
  path.rotation.x=-Math.PI/2;path.position.set(W2/2,0.01,D2/2);addObj(path);
  for(var pz=2;pz<D2-2;pz+=2.2){
    var dash=new THREE.Mesh(new THREE.PlaneGeometry(0.2,1.0),
      new THREE.MeshStandardMaterial({color:0xfff4d0,roughness:0.7}));
    dash.rotation.x=-Math.PI/2;dash.position.set(W2/2,0.02,pz);addObj(dash);
  }
  // ПОТОЛОК-НЕБО
  var sky=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),
    new THREE.MeshStandardMaterial({map:TEX.sky,roughness:0.95,
      emissive:0x88aacc,emissiveIntensity:0.28}));
  sky.rotation.x=Math.PI/2;sky.position.set(W2/2,HH,D2/2);addObj(sky);
  SH2.skyMesh=sky;
  // стены в детских обоях
  var kidMat=new THREE.MeshStandardMaterial({map:TEX.kid,roughness:0.9,
    bumpMap:TEX.kid,bumpScale:0.03});
  TEX.kid.repeat.set(W2/4,HH/4);
  box(W2,HH,0.3,kidMat,W2/2,HH/2,0);
  box(W2,HH,0.3,kidMat,W2/2,HH/2,D2);
  box(0.3,HH,D2,kidMat,0,HH/2,D2/2);
  box(0.3,HH,D2,kidMat,W2,HH/2,D2/2);

  // ---- свет: часть ламп мигает ----
  for(var lx=5;lx<W2;lx+=8)for(var lz=5;lz<D2;lz+=8){
    var bad=Math.random()<0.4;
    LAMPS.push([lx,HH-1.2,lz,bad?0xd8e0ff:0xfff0d0,15,0.55]);
    var em=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.08,0.4),
      new THREE.MeshStandardMaterial({color:0xfff6e0,emissive:0xfff0d0,emissiveIntensity:1.8}));
    em.position.set(lx,HH-0.12,lz);addObj(em);
    if(bad)SH2.flick.push({m:em,li:LAMPS.length-1,ph:Math.random()*10,st:1});
  }

  // ---- ТРУБА-ГОРКА: закрытая, вход сверху, лестница СЗАДИ ----
  var sl=new THREE.Group();
  var SX=8.0,SZ=7.0,TOPY=3.4;
  // сама труба уходит вниз и скрывается в полу
  var tubeMat=new THREE.MeshStandardMaterial({color:0x3aa0d0,roughness:0.4,metalness:0.25});
  for(var seg=0;seg<7;seg++){
    var u=seg/6;
    var t=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,1.15,12),tubeMat);
    t.position.set(Math.sin(u*2.2)*0.9, TOPY-u*TOPY*0.92, u*2.0);
    t.rotation.x=0.55+u*0.35; t.rotation.z=Math.sin(u*2.2)*0.25;
    sl.add(t);
  }
  // оранжевые кольца
  for(var rr=0;rr<7;rr++){
    var u2=rr/6;
    var ring=new THREE.Mesh(new THREE.TorusGeometry(0.88,0.07,6,14),
      new THREE.MeshStandardMaterial({color:0xf0a03a,roughness:0.5}));
    ring.position.set(Math.sin(u2*2.2)*0.9, TOPY-u2*TOPY*0.92, u2*2.0);
    ring.rotation.x=Math.PI/2-(0.55+u2*0.35);
    sl.add(ring);
  }
  // площадка наверху и лестница ПОЗАДИ трубы, а не перед ней
  var plat=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.16,1.5),
    new THREE.MeshStandardMaterial({color:0x4aa8d8,roughness:0.4}));
  plat.position.set(0,TOPY+0.5,-1.0);sl.add(plat);
  for(var st=0;st<7;st++){
    var step=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.12,0.38),
      new THREE.MeshStandardMaterial({color:0xf0a03a,roughness:0.6}));
    step.position.set(0,0.35+st*0.52,-1.9-st*0.30);sl.add(step);
  }
  [-0.85,0.85].forEach(function(hx){
    var rail=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,4.6),
      new THREE.MeshStandardMaterial({color:0xe05a5a,roughness:0.6}));
    rail.position.set(hx,TOPY*0.62,-2.6);rail.rotation.x=-0.62;sl.add(rail);
  });
  sl.position.set(SX,0,SZ);addObj(sl);
  solid(SX-1.2,SZ-1.4,SX+1.2,SZ+2.6);
  SH2.slide={x:SX,z:SZ,topZ:SZ-2.0,top:TOPY};

  // ---- детские вещи в торговом зале ----
  for(var i=0;i<10;i++){
    var rx=2+Math.random()*(W2-4),rz=2+Math.random()*(D2-4);
    if(Math.abs(rx-W2/2)<2.0)continue;
    if(Math.hypot(rx-SX,rz-SZ)<6)continue;
    var col=new THREE.Color().setHSL(Math.random(),0.5,0.6);
    var cr=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.75,0.9),
      new THREE.MeshStandardMaterial({color:col,roughness:0.85}));
    cr.position.set(rx,0.37,rz);addObj(cr);
    solid(rx-0.6,rz-0.5,rx+0.6,rz+0.5);
  }
  // маленькие кроватки
  for(var k=0;k<4;k++){
    var bx=W2-5.5,bz=4+k*5;
    var bed=new THREE.Group();
    var m2=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.12,1.6),
      new THREE.MeshStandardMaterial({color:0xf4efe4,roughness:0.9}));
    m2.position.y=0.5;bed.add(m2);
    [[-0.45,-0.75],[0.45,-0.75],[-0.45,0.75],[0.45,0.75]].forEach(function(q){
      var lg=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.44,0.08),
        new THREE.MeshStandardMaterial({color:0xe08a90,roughness:0.7}));
      lg.position.set(q[0],0.22,q[1]);bed.add(lg);
    });
    bed.position.set(bx,0,bz);addObj(bed);
    solid(bx-0.6,bz-0.9,bx+0.6,bz+0.9);
  }

  scene.fog=new THREE.FogExp2(0xdfe6ee,0.014);
  ambientLight.intensity=0.75;sunLight.intensity=0.25;
  ambientLight.color.setHex(0xfff4e4);
}

function startShelter(){
  PHASE='shelter';
  saveAt('shelter');
  P.x=SH2.w/2;P.z=1.6;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  unstick();
  dead=false;mRun=false;syncBtn('brun',false);mCrouch=false;syncBtn('bcrouch',false);
  SH2.on=true;SH2.t=0;SH2.revealed=false;SH2.onSlide=false;
  document.getElementById('black').style.transition='opacity 1.8s';
  document.getElementById('black').style.opacity='0';
  document.getElementById('dream').style.display='none';
  setTimeout(function(){showSub('Вы','Улица... я на улице.',2.8);sayE('Улица... я на улице.');},2000);
  setTimeout(function(){showMsg('Посмотри наверх',3.0);},6000);
  setTimeout(function(){questShow('Осмотрите потолок');},6200);
}

function updateShelter(dt){
  if(!SH2.on)return;
  SH2.t+=dt;
  // мигание ламп
  SH2.flick.forEach(function(f){
    f.ph+=dt;
    var on=1;
    if(f.ph>3+Math.random()*0.02){
      on=Math.random()<0.55?0.15:1;
      if(Math.random()<0.04)f.ph=0;
    }
    f.m.material.emissiveIntensity=1.8*on;
    if(LAMPS[f.li])LAMPS[f.li][5]=0.55*on;
  });
  // разоблачение: игрок задирает голову к «небу»
  if(!SH2.revealed&&P.pitch>0.34&&SH2.t>5){
    SH2.revealed=true;questDone();
    showSub('Вы','Это... потолок. Это нарисовано.',3.6);sayE('Это... потолок. Это нарисовано.');
    sndDread();
    setTimeout(function(){
      showSub('Вы','Тут был приют? Нет... тут просто продавали детские вещи.',4.6);sayE('Тут был приют? Нет... тут просто продавали детские вещи.');
    },4200);
    setTimeout(function(){showMsg('Ты вышел из тюрьмы. Но не из магазина.',4.0);},9400);
  }
  shelterNear();
}



var nSh=null;
function shelterNear(){
  nSh=null;
  var s=SH2.slide;
  if(s&&Math.hypot(P.x-s.x,P.z-s.topZ)<2.2){
    nSh='slide';setPrompt('🛝 ЗАЛЕЗТЬ В ТРУБУ — E',true);return;
  }
  setPrompt('',false);
}
function shelterAct(){
  if(nSh==='slide'){
    if(!SH2.revealed){
      showSub('Вы','Сначала осмотрюсь.',2.0);sayE('Сначала осмотрюсь.');
      return;
    }
    setPrompt('',false);
    showSub('Вы','С этой трубой что-то не так.',2.6);sayE('С этой трубой что-то не так.');
    setTimeout(function(){
      document.getElementById('black').style.transition='opacity 0.9s';
      document.getElementById('black').style.opacity='1';
    },2400);
    setTimeout(startTube,3400);
  }
}
// ============================================================
//  ТРУБА: спуск, который не заканчивается там, где должен
//  Пятнадцать секунд. На пятой становится ясно, что это не горка.
// ============================================================
var TB={on:false,t:0,segs:[],rings:[],speed:0,roll:0,musicOn:false,done:false};
var TB_DUR=15.0;

// путь трубы: медленно закручивается и уходит вниз всё круче
function tubePoint(u){
  return {
    x: Math.sin(u*0.55)*3.2 + Math.sin(u*0.17)*6.0,
    y: -u*1.05 - u*u*0.010,
    z: Math.cos(u*0.42)*3.6 - u*0.55
  };
}

function buildTube(){
  clearScene();walls=[];LAMPS=[];TB.rings=[];
  setBounds(-9999,-9999,9999,9999);
  var N=150, R=1.35;
  var ringGeo=new THREE.TorusGeometry(R,0.10,6,14);
  var matA=new THREE.MeshStandardMaterial({color:0x3aa0d0,roughness:0.4,metalness:0.25});
  var matB=new THREE.MeshStandardMaterial({color:0xf0a03a,roughness:0.45,metalness:0.2});
  for(var i=0;i<N;i++){
    var u=i*0.9;
    var p0=tubePoint(u),p1=tubePoint(u+0.9);
    var ring=new THREE.Mesh(ringGeo,(i%2)?matA:matB);
    ring.position.set(p0.x,p0.y,p0.z);
    ring.lookAt(p1.x,p1.y,p1.z);
    addObj(ring);TB.rings.push(ring);
    // стенка между кольцами — чтобы труба читалась сплошной
    if(i%2===0){
      var seg=new THREE.Mesh(new THREE.CylinderGeometry(R,R,1.0,12,1,true),
        new THREE.MeshStandardMaterial({color:0x2b6f92,roughness:0.55,
          side:THREE.BackSide,transparent:true,opacity:0.92}));
      var mid={x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2,z:(p0.z+p1.z)/2};
      seg.position.set(mid.x,mid.y,mid.z);
      seg.lookAt(p1.x,p1.y,p1.z);
      seg.rotateX(Math.PI/2);
      addObj(seg);
    }
    if(i%7===0)LAMPS.push([p0.x,p0.y+0.9,p0.z,0xbfe4ff,5.5,0.7]);
  }
  scene.fog=new THREE.FogExp2(0x061018,0.075);
  ambientLight.intensity=0.22;sunLight.intensity=0;
}

function startTube(){
  PHASE='tube';
  buildTube();
  TB.on=true;TB.t=0;TB.speed=1.0;TB.roll=0;TB.musicOn=false;TB.done=false;
  dead=false;
  document.body.classList.add('cine');
  setPrompt('',false);
  document.getElementById('black').style.transition='opacity 0.8s';
  document.getElementById('black').style.opacity='0';
  say('Ладно... поехали.',0.9,0.6);
  setTimeout(function(){showSub('Вы','Что-то долго.',2.2);sayE('Что-то долго.');},4200);
  setTimeout(function(){showSub('Вы','Почему я всё ещё еду?!',2.6);sayE('Почему я всё ещё еду?!');},7600);
  setTimeout(function(){showSub('Вы','Зря я сюда скатился! Кажись, это не горка! Да, это не горка!!!',4.8);sayE('Зря я сюда скатился! Кажись, это не горка! Да, это не горка!!!');},11200);
}

function updateTube(dt){
  if(!TB.on)return;
  TB.t+=dt;
  var t=TB.t;
  // разгон: первые пять секунд как обычная горка, потом всё быстрее
  var accel = t<4.5 ? 1.0+t*0.22 : 2.0+(t-4.5)*0.62;
  TB.speed=accel;
  TB.u=(TB.u||0)+dt*TB.speed*1.35;

  // на пятой секунде включается музыка побега
  if(!TB.musicOn&&t>=5.0){
    TB.musicOn=true;
    Music.escape();
    sndWind();
  }
  // закрутка растёт вместе со скоростью
  TB.roll+=dt*(t<5?0.5:1.1+ (t-5)*0.16);

  var u=TB.u;
  var p=tubePoint(u), pn=tubePoint(u+0.6);
  camera.position.set(p.x,p.y,p.z);
  camera.up.set(Math.sin(TB.roll),Math.cos(TB.roll),0);
  camera.lookAt(pn.x,pn.y,pn.z);

  // Тряска начинается ровно вместе с музыкой, на пятой секунде,
  // и растёт вместе со скоростью.
  if(t>=5.0){
    var s=Math.min(0.10,(t-5)*0.014);
    camera.position.x+=(Math.random()-0.5)*s;
    camera.position.y+=(Math.random()-0.5)*s;
    camera.position.z+=(Math.random()-0.5)*s*0.5;
    TB.roll+=(Math.random()-0.5)*s*0.35;        // рывки закрутки
  }
  // края экрана сжимаются от скорости
  var vig=document.getElementById('vig');
  if(vig){
    var k=Math.min(1,Math.max(0,(t-4)/9));
    vig.style.background='radial-gradient(ellipse '+(78-k*34)+'% '+(78-k*34)+
      '% at 50% 50%,rgba(0,0,0,0) '+(44-k*22)+'%,rgba(0,0,0,'+(0.5+k*0.35).toFixed(2)+
      ') 78%,rgba(0,0,0,0.95) 100%)';
  }
  if(t>=TB_DUR&&!TB.done){
    TB.done=true;TB.on=false;
    document.body.classList.remove('cine');
    camera.up.set(0,1,0);
    if(vig)vig.style.background='';
    Music.outro();
    document.getElementById('black').style.transition='opacity 0.5s';
    document.getElementById('black').style.opacity='1';
    setTimeout(function(){startLoading(buildOldStore,startOldStore);},700);
  }
}

function sndWind(){
  var a=getAC();if(!a)return;
  var n=a.createBuffer(1,Math.floor(a.sampleRate*4),a.sampleRate),d=n.getChannelData(0);
  for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  var s=a.createBufferSource();s.buffer=n;s.loop=true;
  var f=a.createBiquadFilter();f.type='bandpass';f.Q.value=1.1;
  f.frequency.setValueAtTime(300,a.currentTime);
  f.frequency.exponentialRampToValueAtTime(1500,a.currentTime+9);
  var g=a.createGain();
  g.gain.setValueAtTime(0.0001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.16,a.currentTime+3);
  g.gain.setValueAtTime(0.16,a.currentTime+8.5);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+10.5);
  s.connect(f);f.connect(g);g.connect(a.destination);
  s.start();s.stop(a.currentTime+11);
}

// ============================================================
//  СТАРЫЙ СКЛАД: новый фонарь, батарейки и две горки с вопросом
//  (эти определения идут ПОСЛЕ tube.js и заменяют заглушку)
// ============================================================
var OS={w:30,d:24,h:4.6,on:false,t:0,
        lampMesh:null,hasLight:false,
        batteries:[],slides:[],sign:null,room:1};

// ---------- фонарь: заряд и батарейки ----------
var FL2={has:false,on:false,charge:1,drain:1/180,   // полного заряда хватает на 3 минуты
         light:null,view:null,lens:null,beam:null,
         inspect:false,inspectT:0};

function makeProTorch(){
  var g=new THREE.Group();
  var black=new THREE.MeshStandardMaterial({color:0x1c1c1e,roughness:0.35,metalness:0.75});
  var grip=new THREE.MeshStandardMaterial({color:0x121214,roughness:0.85,metalness:0.2});
  var body=new THREE.Mesh(new THREE.CylinderGeometry(0.040,0.044,0.30,16),black);
  body.rotation.x=Math.PI/2;body.position.z=0.02;g.add(body);
  var knurl=new THREE.Mesh(new THREE.CylinderGeometry(0.046,0.046,0.10,16),grip);
  knurl.rotation.x=Math.PI/2;knurl.position.z=0.07;g.add(knurl);
  var head=new THREE.Mesh(new THREE.CylinderGeometry(0.070,0.048,0.11,18),black);
  head.rotation.x=Math.PI/2;head.position.z=-0.19;g.add(head);
  var bez=new THREE.Mesh(new THREE.TorusGeometry(0.068,0.007,8,20),
    new THREE.MeshStandardMaterial({color:0x3a3a3e,roughness:0.3,metalness:0.9}));
  bez.rotation.x=Math.PI/2;bez.position.z=-0.245;g.add(bez);
  var lens=new THREE.Mesh(new THREE.CircleGeometry(0.062,20),
    new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:4.5,roughness:0.1}));
  lens.position.z=-0.248;g.add(lens);FL2.lens=lens;
  var sw=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.016,0.04),
    new THREE.MeshStandardMaterial({color:0xcc2020,roughness:0.5}));
  sw.position.set(0,0.046,0.10);g.add(sw);
  var beamM=new THREE.MeshBasicMaterial({color:0xf2f6ff,transparent:true,opacity:0.05,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  var beam=new THREE.Mesh(new THREE.ConeGeometry(1.25,7.2,18,1,true),beamM);
  beam.rotation.x=-Math.PI/2;beam.position.z=-3.85;g.add(beam);FL2.beam=beam;
  g.position.set(-0.30,-0.26,-0.50);   // ЛЕВАЯ рука: справа теперь пистолет
  g.rotation.set(0.05,0.13,-0.04);
  g.visible=false;
  return g;
}
function initTorch(){
  if(FL2.light)return;
  FL2.light=new THREE.SpotLight(0xf4f8ff,0,26,Math.PI/5.2,0.38,1.2);
  camera.add(FL2.light);
  FL2.light.position.set(0,0,0);
  FL2.light.target.position.set(0,0,-1);
  camera.add(FL2.light.target);
  if(window.DETAIL)DETAIL.setupFlashlightShadow(FL2.light);
  FL2.view=makeProTorch();
  camera.add(FL2.view);
}
function toggleTorch(){
  if(!FL2.has||FL2.inspect)return;
  if(!FL2.on&&FL2.charge<=0){showMsg('Батарея села',1.8);return;}
  FL2.on=!FL2.on;
  sndBeep(FL2.on?900:400);
  if(FL2.on){FL2.shown=true;FL2.offT=0;}
  else FL2.offT=5.0;                    // ещё пять секунд в руках, потом убираем
}
// Осмотр фонарика: подъезжает в центр экрана, крутится, светит на
// максимум — чисто показать купленный скин, на геймплей не влияет.
function fl2InspectToggle(){
  if(!FL2.has)return;
  FL2.inspect=!FL2.inspect;
  var btn=document.getElementById('fl2-inspect-btn');
  if(btn)btn.classList.toggle('on',FL2.inspect);
  if(FL2.inspect){
    FL2.inspectT=0;FL2.shown=true;
    if(window.UV&&UV.inspect)uvInspectToggle();   // осматриваем только один предмет за раз
  }
}

// Покачивание рук (фонарь + УФ-пистолет) при ходьбе/повороте — раньше
// оба предмета были жёстко прибиты к экрану (только вертикальный
// подъём/опускание при доставании). Общая функция, чтобы оба предмета
// качались одинаково и не расходились друг с другом.
var HSW={bob:0,idleT:0,prevYaw:undefined,swayX:0,bx:0,by:0};
function updateHandSway(dt){
  var moving=(Math.abs(jmx)+Math.abs(jmy)>0.08)||K['KeyW']||K['KeyS']||K['KeyA']||K['KeyD'];
  var run=mRun||K['ShiftLeft']||K['ShiftRight'];
  HSW.bob+=moving?dt*(run?11.5:7):0;
  HSW.idleT+=dt;
  if(moving){HSW.bx=Math.sin(HSW.bob)*0.016;HSW.by=Math.abs(Math.cos(HSW.bob))*0.013;}
  else{HSW.bx=Math.sin(HSW.idleT*0.7)*0.0035;HSW.by=Math.sin(HSW.idleT*1.1)*0.0025;}
  if(HSW.prevYaw===undefined)HSW.prevYaw=P.yaw;
  var yd=P.yaw-HSW.prevYaw;HSW.prevYaw=P.yaw;
  HSW.swayX=Math.max(-0.05,Math.min(0.05,HSW.swayX*0.82-yd*0.9));
}

function updateTorch(dt){
  if(!FL2.light)return;
  var ibtn=document.getElementById('fl2-inspect-btn');
  if(ibtn)ibtn.style.display=FL2.has?'block':'none';
  if(FL2.inspect){
    FL2.inspectT+=dt;
    var it=Math.min(1,FL2.inspectT/0.5);
    if(FL2.view){
      FL2.view.visible=true;
      FL2.view.position.set(-0.30+(0-(-0.30))*it,(FL2.y===undefined?-0.26:FL2.y)+(-0.05-(FL2.y===undefined?-0.26:FL2.y))*it,-0.50+(-0.38-(-0.50))*it);
      FL2.view.rotation.set(0.05+(0-0.05)*it,0.13+(0-0.13)*it+FL2.inspectT*1.0,-0.04+(0-(-0.04))*it);
      FL2.view.scale.setScalar(1+it*0.7);
    }
    FL2.light.intensity=4.2;
    if(FL2.lens)FL2.lens.material.emissiveIntensity=4.5;
    if(FL2.beam)FL2.beam.material.opacity=0.06;
    return;
  }
  if(FL2.view)FL2.view.scale.setScalar(1);
  if(FL2.on){
    FL2.charge-=dt*FL2.drain;
    if(FL2.charge<=0){FL2.charge=0;FL2.on=false;showMsg('Фонарь погас',2.2);}
  }
  // на последних процентах начинает моргать
  var weak=FL2.charge<0.18?(0.35+0.65*Math.abs(Math.sin(performance.now()*0.011))):1;
  // рядом опасность (сейчас есть числовой сигнал только в зале с
  // великанами, HL.danger 0..1) — свет начинает нервно дёргаться,
  // как будто реагирует на близость угрозы, а не только на заряд
  var nearDanger=(typeof HL!=='undefined'&&HL.danger>0.35)?HL.danger:0;
  if(nearDanger>0)weak*=(1-nearDanger*0.5*(0.5+0.5*Math.abs(Math.sin(performance.now()*0.045))));
  var lvl=FL2.on?(0.35+0.65*Math.min(1,FL2.charge*2.2))*weak:0;
  FL2.light.intensity=4.2*lvl;
  if(FL2.view){
    FL2.view.visible=FL2.has&&(FL2.y===undefined||FL2.y>-0.90);
    if(FL2.lens)FL2.lens.material.emissiveIntensity=FL2.on?4.5*weak:0.04;
    if(FL2.beam)FL2.beam.material.opacity=FL2.on?0.05*weak:0;
  }
  // пять секунд после выключения фонарь ещё в руке
  if(!FL2.on&&FL2.offT>0){FL2.offT-=dt;if(FL2.offT<=0)FL2.shown=false;}
  var tgt=FL2.shown?-0.26:-0.95;
  FL2.y=(FL2.y===undefined?tgt:FL2.y)+((tgt-(FL2.y===undefined?tgt:FL2.y))*Math.min(1,dt*7));
  if(FL2.view)FL2.view.position.set(-0.30+HSW.bx+HSW.swayX,FL2.y+HSW.by,-0.50);
  var bf=document.getElementById('batfill');
  if(bf){
    bf.style.width=(FL2.charge*100).toFixed(0)+'%';
    bf.style.background=FL2.charge>0.5?'#4ac06a':(FL2.charge>0.18?'#c9a227':'#c02020');
  }
}
function makeBatteryMesh(){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:0x2a7a3a,emissive:0x1a8a3a,
    emissiveIntensity:1.4,roughness:0.5,metalness:0.4});
  var b=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.16,10),m);
  b.position.y=0.09;g.add(b);
  var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.03,8),
    new THREE.MeshStandardMaterial({color:0xc0c0c0,roughness:0.3,metalness:0.9}));
  cap.position.y=0.18;g.add(cap);
  var pl=new THREE.PointLight(0x30d060,0.5,2.0);pl.position.y=0.12;g.add(pl);
  return g;
}

// ---------- сборка склада ----------
function buildOldStore(){
  clearScene();walls=[];LAMPS=[];
  OS.batteries=[];OS.slides=[];OS.hasLight=false;
  var W2=OS.w,D2=OS.d,HH=OS.h;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  // почти нет света — за тем и фонарь
  LAMPS.push([4,HH-0.6,4,0xffd0a0,7,0.35]);
  LAMPS.push([W2-5,HH-0.6,D2-6,0xffd0a0,7,0.30]);

  // старые стеллажи и хлам
  for(var r=0;r<3;r++){
    var zz=6+r*5.5;
    var rack=new THREE.Mesh(new THREE.BoxGeometry(11,2.6,1.0),
      new THREE.MeshStandardMaterial({color:0x4a463f,roughness:0.85,metalness:0.2}));
    rack.position.set(7,1.3,zz);addObj(rack);
    solid(1.4,zz-0.6,12.6,zz+0.6);
  }
  for(var i=0;i<14;i++){
    var cx=2+Math.random()*(W2-14),cz=2+Math.random()*(D2-4);
    if(Math.hypot(cx-16.5,cz-4.0)<3.5)continue;      // площадка появления
    if(cz<5.0&&cx>8.0&&cx<18.0)continue;             // проход к фонарю свободен
    var h2=0.5+Math.random()*0.7;
    var cr=new THREE.Mesh(new THREE.BoxGeometry(0.9,h2,0.9),
      new THREE.MeshStandardMaterial({color:0x5a4a38,roughness:0.95,map:TEX.wood}));
    cr.position.set(cx,h2/2,cz);addObj(cr);
    solid(cx-0.5,cz-0.5,cx+0.5,cz+0.5);
  }

  // ---- новый фонарь на ящике ----
  var stand=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.7,0.8),
    new THREE.MeshStandardMaterial({color:0x5a4a38,roughness:0.95,map:TEX.wood}));
  stand.position.set(9.5,0.35,3.2);addObj(stand);
  solid(9.0,2.7,10.0,3.7);
  var torch=makeProTorch();torch.visible=true;
  torch.position.set(9.5,0.78,3.2);torch.rotation.set(0,0.6,Math.PI/2);
  torch.scale.set(1.5,1.5,1.5);
  if(torch.children[torch.children.length-1])torch.children[torch.children.length-1].visible=false;
  addObj(torch);OS.lampMesh=torch;
  // Он ЛЕЖИТ ВКЛЮЧЁННЫЙ. В темноте это единственный источник света в зале,
  // и найти его невозможно не заметив — раньше игрок появлялся к нему спиной
  // и уходил вглубь склада.
  var beacon=new THREE.SpotLight(0xdce8ff,3.4,20,Math.PI/6.5,0.5,1.2);
  beacon.position.set(9.5,0.85,3.2);
  beacon.target.position.set(19.0,0.4,4.5);
  addObj(beacon);addObj(beacon.target);
  var gl=new THREE.PointLight(0xcfe0ff,1.5,6.0);gl.position.set(9.5,1.0,3.2);addObj(gl);
  // луч в пыли, чтобы было видно откуда светит
  var cone=new THREE.Mesh(new THREE.ConeGeometry(1.5,9,16,1,true),
    new THREE.MeshBasicMaterial({color:0xdce8ff,transparent:true,opacity:0.045,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  cone.position.set(9.5,0.8,3.2);
  cone.lookAt(19.0,0.5,4.5);cone.rotateX(Math.PI/2);cone.position.lerp(new THREE.Vector3(19.0,0.5,4.5),0.42);
  addObj(cone);OS.coneMesh=cone;

  // ---- батарейки по карте ----
  var bspots=[[3.0,12.0],[16.0,4.0],[6.5,20.0],[20.0,17.0],[13.0,10.0]];
  bspots.forEach(function(s){
    var g=makeBatteryMesh();g.position.set(s[0],0,s[1]);addObj(g);
    OS.batteries.push({x:s[0],z:s[1],g:g,taken:false});
  });

  // ---- две горки в дальнем конце ----
  buildChoiceSlides(W2,D2,HH);

  scene.fog=new THREE.FogExp2(0x07070a,0.075);
  ambientLight.intensity=0.055;sunLight.intensity=0;
}

function buildChoiceSlides(W2,D2,HH){
  var qz=D2-3.2, yx=W2-9.5, bx=W2-4.0;
  OS.slides=[];
  [[yx,0xe8c020,'да','yellow'],[bx,0x2a70d8,'нет','blue']].forEach(function(s){
    var g=new THREE.Group();
    var mat=new THREE.MeshStandardMaterial({color:s[1],roughness:0.4,metalness:0.25,
      emissive:s[1],emissiveIntensity:0.22});
    for(var k=0;k<4;k++){
      var seg=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,1.1,12,1,true),mat);
      seg.position.y=1.7-k*1.1;g.add(seg);
    }
    var mouth=new THREE.Mesh(new THREE.TorusGeometry(0.85,0.10,8,18),mat);
    mouth.rotation.x=Math.PI/2;mouth.position.y=2.25;g.add(mouth);
    // табличка с ответом
    var lab=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.5),
      new THREE.MeshStandardMaterial({map:makeAnswerTex(s[2],s[1]),roughness:0.8}));
    lab.position.set(0,2.9,0.9);g.add(lab);
    g.position.set(s[0],0,qz);addObj(g);
    solid(s[0]-0.95,qz-0.95,s[0]+0.95,qz+0.95);
    OS.slides.push({x:s[0],z:qz,kind:s[3]});
    LAMPS.push([s[0],HH-0.7,qz-1.5,s[1],6,0.5]);
  });
  // вопрос на стене между горками
  OS.signMesh=new THREE.Mesh(new THREE.PlaneGeometry(6.4,1.7),
    new THREE.MeshStandardMaterial({map:makeQuestionTex(1),roughness:0.85}));
  OS.signMesh.position.set((yx+bx)/2,3.1,D2-0.2);
  OS.signMesh.rotation.y=Math.PI;
  addObj(OS.signMesh);
}
function makeAnswerTex(txt,col){
  return makeTex(function(g,s){
    g.fillStyle='#101014';g.fillRect(0,0,s,s);
    g.fillStyle='#'+col.toString(16).padStart(6,'0');
    g.fillRect(6,6,s-12,s-12);
    g.fillStyle='#101014';g.font='bold '+(s*0.42)+'px monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.fillText(txt.toUpperCase(),s/2,s/2);
  },1);
}
function makeQuestionTex(room){
  var q=room===1?'МЕБЕЛЬЩИК КРУТОЙ?':'ТЫ ЧЕЛОВЕК?';
  return makeTex(function(g,s){
    g.fillStyle='#15130f';g.fillRect(0,0,s,s);
    for(var i=0;i<600;i++){
      g.fillStyle='rgba(90,84,72,'+(Math.random()*0.35).toFixed(2)+')';
      g.fillRect(Math.random()*s,Math.random()*s,2,2);
    }
    g.fillStyle='#e8e2d4';
    g.font='bold '+(s*0.115)+'px monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.fillText(q,s/2,s*0.38);
    g.font=(s*0.075)+'px monospace';
    g.fillStyle='#e8c020';g.fillText('ЖЁЛТАЯ — ДА',s*0.28,s*0.68);
    g.fillStyle='#5a95e8';g.fillText('СИНЯЯ — НЕТ',s*0.74,s*0.68);
  },1);
}

function startOldStore(){
  PHASE='oldstore';
  saveAt('oldstore');
  OS.room=1;OS.on=true;OS.t=0;
  // Раньше точка появления была ВНУТРИ стеллажа (ряд стоит на z=6),
  // защита выталкивала игрока, и он оказывался спиной к фонарю.
  P.x=16.5;P.z=4.0;P.y=0;P.vy=0;P.pitch=0;
  P.yaw=Math.atan2(-(9.5-P.x),-(3.2-P.z));      // смотрим прямо на фонарь
  camera.rotation.z=0;camera.up.set(0,1,0);     // после трубы
  unstick();
  dead=false;mRun=false;syncBtn('brun',false);mCrouch=false;syncBtn('bcrouch',false);
  initTorch();
  FL2.has=false;FL2.on=false;FL2.charge=1;FL2.shown=true;FL2.offT=0;FL2.y=-0.26;
  if(FL2.view)FL2.view.visible=false;
  document.getElementById('batwrap').style.display='none';
  document.getElementById('bfl').style.display='none';
  document.getElementById('black').style.transition='opacity 2.2s';
  document.getElementById('black').style.opacity='0';
  Music.stop();
  setTimeout(function(){showSub('Вы','Где... где я теперь.',2.8);sayE('Где... где я теперь.');},2400);
  setTimeout(function(){showMsg('Там что-то светит. Впереди.',3.2);},6200);
  setTimeout(function(){questShow('Найдите фонарь','Он светится впереди');},6400);
}

function updateOldStore(dt){
  if(!OS.on)return;
  OS.t+=dt;
  if(OS.lampMesh&&!OS.hasLight){
    OS.lampMesh.rotation.y+=dt*0.9;
    OS.lampMesh.position.y=0.78+Math.sin(OS.t*2)*0.03;
  }
  OS.batteries.forEach(function(b){
    if(b.taken)return;
    b.g.rotation.y+=dt*1.4;
    b.g.position.y=Math.sin(OS.t*2.4+b.x)*0.03;
  });
  osNear();
}

var nOs=null;
function osNear(){
  nOs=null;
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  if(!OS.hasLight&&d2(9.5,3.2)<1.6){
    nOs={t:'torch'};setPrompt('🔦 ВЗЯТЬ ФОНАРЬ — E',true);return;
  }
  for(var i=0;i<OS.batteries.length;i++){
    var b=OS.batteries[i];
    if(!b.taken&&d2(b.x,b.z)<1.2){
      nOs={t:'bat',i:i};setPrompt('🔋 БАТАРЕЙКА — E',true);return;
    }
  }
  for(var k=0;k<OS.slides.length;k++){
    var s=OS.slides[k];
    if(d2(s.x,s.z)<1.8){
      nOs={t:'slide',kind:s.kind};
      setPrompt(s.kind==='yellow'?'🟡 СПУСТИТЬСЯ — ДА':'🔵 СПУСТИТЬСЯ — НЕТ',true);
      return;
    }
  }
  setPrompt('',false);
}
function osAct(){
  if(!nOs)return;
  if(nOs.t==='torch'){
    OS.hasLight=true;FL2.has=true;FL2.on=true;FL2.charge=1;questDone();
    if(OS.lampMesh)OS.lampMesh.visible=false;
    if(OS.coneMesh)OS.coneMesh.visible=false;
    objs.forEach(function(o){if(o.isSpotLight&&o!==FL2.light)o.intensity=0;
                             if(o.isPointLight&&o.distance===6.0)o.intensity=0;});
    document.getElementById('batwrap').style.display='block';
    document.getElementById('bfl').style.display='flex';
    sndPickup();
    showSub('Вы','О! Новый фонарик! Настоящий, не то что тот, старый.',3.6);sayE('О! Новый фонарик! Настоящий, не то что тот, старый.');
    setTimeout(function(){showMsg('Батарея садится. Ищи запасные.',3.4);},3400);
  }
  else if(nOs.t==='bat'){
    var b=OS.batteries[nOs.i];
    b.taken=true;b.g.visible=false;
    FL2.charge=Math.min(1,FL2.charge+0.45);
    sndPickup();showMsg('Батарея +45%',1.8);
  }
  else if(nOs.t==='slide')chooseSlide(nOs.kind);
}

// ---------- выбор горки ----------
function chooseSlide(kind){
  OS.on=false;setPrompt('',false);
  var correct=(OS.room===1)?'yellow':'blue';   // 1-я: «да», 2-я: «нет»
  var win=(kind===correct);
  var col=kind==='yellow'?0xe8c020:0x2a70d8;
  FL2.on=false;
  document.getElementById('black').style.transition='opacity 0.8s';
  document.getElementById('black').style.opacity='1';
  setTimeout(function(){ rideChoice(col,win); },900);
}

// ---------- спуск по выбранной горке ----------
var RC={on:false,t:0,dur:6.0,u:0,roll:0,win:false,col:0,blades:[],done:false};

function buildChoiceTube(col,win){
  clearScene();walls=[];LAMPS=[];RC.blades=[];
  setBounds(-9999,-9999,9999,9999);
  var mat=new THREE.MeshStandardMaterial({color:col,roughness:0.42,metalness:0.28,
    emissive:col,emissiveIntensity:0.18,side:THREE.BackSide});
  for(var i=0;i<70;i++){
    var u=i*1.0, p=tubePoint(u), pn=tubePoint(u+1.0);
    var seg=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,1.25,14,1,true),mat);
    seg.position.set(p.x,p.y,p.z);
    seg.lookAt(pn.x,pn.y,pn.z);seg.rotateX(Math.PI/2);
    addObj(seg);
    if(i%3===0){
      var ring=new THREE.Mesh(new THREE.TorusGeometry(1.34,0.05,6,16),
        new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:0.5}));
      ring.position.set(p.x,p.y,p.z);
      ring.lookAt(pn.x,pn.y,pn.z);
      addObj(ring);
    }
    // в синей трубе на середине начинаются лезвия
    if(!win&&i>26&&i%2===0){
      var bl=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.05,0.5),
        new THREE.MeshStandardMaterial({color:0xd8dce0,roughness:0.15,metalness:0.95}));
      bl.position.set(p.x,p.y,p.z);
      bl.lookAt(pn.x,pn.y,pn.z);bl.rotateZ(i*0.7);
      addObj(bl);RC.blades.push(bl);
    }
  }
  scene.fog=new THREE.FogExp2(0x000000,0.055);
  ambientLight.intensity=0.5;sunLight.intensity=0;
}

function rideChoice(col,win){
  PHASE='ride';
  buildChoiceTube(col,win);
  RC.on=true;RC.t=0;RC.u=0;RC.roll=0;RC.win=win;RC.col=col;RC.done=false;
  RC.dur=win?6.0:3.4;                        // в ловушке всё кончается быстро
  document.getElementById('batwrap').style.display='none';
  document.getElementById('bfl').style.display='none';
  document.getElementById('black').style.transition='opacity 1.0s';
  document.getElementById('black').style.opacity='0';
  if(win)sndWind&&sndWind();
}

function updateRide(dt){
  if(!RC.on)return;
  RC.t+=dt;
  var t=RC.t;
  RC.u+=dt*(1.6+t*0.55)*1.35;
  RC.roll+=dt*0.9;
  var p=tubePoint(RC.u), pn=tubePoint(RC.u+0.6);
  camera.position.set(p.x,p.y,p.z);
  camera.up.set(Math.sin(RC.roll),Math.cos(RC.roll),0);
  camera.lookAt(pn.x,pn.y,pn.z);
  var s=Math.min(0.07,t*0.012);
  camera.position.x+=(Math.random()-0.5)*s;
  camera.position.y+=(Math.random()-0.5)*s;

  if(!RC.win&&t>2.6&&!RC.done){
    if(window.ADMIN&&ADMIN.god){RC.done=true;RC.on=false;unstick();dead=false;return;}
    RC.done=true;RC.on=false;
    sndScare();
    document.getElementById('dmg').style.opacity='1';
    var wh=document.getElementById('white');
    wh.style.transition='none';wh.style.opacity='0.85';
    setTimeout(function(){wh.style.transition='opacity 0.5s';wh.style.opacity='0';},70);
    setTimeout(function(){
      camera.up.set(0,1,0);camera.rotation.z=0;
      dead=true;
      document.getElementById('endtitle').style.color='#c02020';
      document.getElementById('endtitle').textContent='Я ПОШЁЛ НЕ В ТУ ГОРКУ';
      document.getElementById('endsub').textContent='Там были лезвия.';
      updateEndScreen();document.getElementById('endscreen').style.display='flex';
    },700);
    return;
  }
  if(RC.win&&t>=RC.dur&&!RC.done){
    RC.done=true;RC.on=false;
    camera.up.set(0,1,0);camera.rotation.z=0;
    document.getElementById('black').style.transition='opacity 0.7s';
    document.getElementById('black').style.opacity='1';
    setTimeout(function(){
      if(OS.room===1){ OS.room=2; nextRoom(); }
      else { finishOldStore(); }
    },800);
  }
}

// второй зал: тот же склад, но вопрос другой
function nextRoom(){
  buildOldStore();
  if(OS.signMesh)OS.signMesh.material.map=makeQuestionTex(2);
  // фонарь уже у нас, второй раз искать не надо
  // фонарь переносим из первого зала: второй раз искать его не надо
  OS.hasLight=FL2.has;
  if(OS.lampMesh&&FL2.has)OS.lampMesh.visible=false;
  PHASE='oldstore';OS.on=true;OS.t=0;
  P.x=5;P.z=6.4;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;
  document.getElementById('batwrap').style.display=FL2.has?'block':'none';
  document.getElementById('bfl').style.display=FL2.has?'flex':'none';
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Опять склад? Тот же самый?',2.8);sayE('Опять склад? Тот же самый?');},1800);
  setTimeout(function(){showMsg('Вопрос другой. Читай внимательно.',3.4);},5200);
}
function finishOldStore(){
  camera.up.set(0,1,0);camera.rotation.z=0;
  showSub('Вы','Ответил правильно. Значит, я не человек?',3.2);sayE('Ответил правильно. Значит, я не человек?');
  setTimeout(startGas,1600);          // скатились в комнату с газом
}
// ============================================================
//  ПРОЛОГ ЗАКАНЧИВАЕТСЯ: газ → сон → грузовик → мост → заставка
// ============================================================
var GAS={on:false,t:0,fog:null};
var DR1={on:false,t:0,hit:false,stairs:null};
var WK={on:false,t:0,truck:null,arrived:false,called:false};
var TR={on:false,t:0,phase:0,people:[],road:[],fell:false,musicMax:false};

// ---------- 1. КОМНАТА С ЗЕЛЁНЫМ ГАЗОМ ----------
function buildGas(){
  clearScene();walls=[];LAMPS=[];
  setBounds(0,0,10,10);
  var HH=3.0;
  MATS.corrFloor.map.repeat.set(10,10);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(10,10),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(5,0,5);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(10,10),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(5,HH,5);addObj(ce);
  MATS.corrWall.map.repeat.set(3,1.5);
  box(10,HH,0.3,MATS.corrWall,5,HH/2,0);
  box(10,HH,0.3,MATS.corrWall,5,HH/2,10);
  box(0.3,HH,10,MATS.corrWall,0,HH/2,5);
  box(0.3,HH,10,MATS.corrWall,10,HH/2,5);
  // форсунки по углам, из них и идёт газ
  [[1,1],[9,1],[1,9],[9,9]].forEach(function(q){
    var n=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.13,0.35,8),MATS.metal);
    n.position.set(q[0],0.18,q[1]);addObj(n);
  });
  // сам газ — несколько полупрозрачных слоёв, они поднимаются
  GAS.layers=[];
  for(var i=0;i<7;i++){
    var pl=new THREE.Mesh(new THREE.PlaneGeometry(11,11),
      new THREE.MeshBasicMaterial({color:0x6adf5a,transparent:true,opacity:0.0,
        depthWrite:false,side:THREE.DoubleSide}));
    pl.rotation.x=-Math.PI/2;pl.position.set(5,0.15+i*0.34,5);
    addObj(pl);GAS.layers.push(pl);
  }
  LAMPS.push([5,HH-0.5,5,0x9aff8a,12,0.6]);
  scene.fog=new THREE.FogExp2(0x123a10,0.06);
  ambientLight.intensity=0.30;ambientLight.color.setHex(0xa8ffa0);sunLight.intensity=0;
}
function startGas(){
  PHASE='gas';buildGas();
  P.x=5;P.z=8.0;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  dead=false;GAS.on=true;GAS.t=0;
  if(FL2.view)FL2.view.visible=false;
  document.getElementById('batwrap').style.display='none';
  document.getElementById('bfl').style.display='none';
  document.getElementById('black').style.transition='opacity 1.2s';
  document.getElementById('black').style.opacity='0';
  sndHiss();
  setTimeout(function(){showSub('Вы','Что это... газ?',2.4);sayE('Что это... газ?');},1400);
  setTimeout(function(){showSub('Вы','Не могу... стоять...',2.6);sayE('Не могу... стоять...');},5200);
}
function updateGas(dt){
  if(!GAS.on)return;
  GAS.t+=dt;var t=GAS.t;
  GAS.layers.forEach(function(pl,i){
    pl.material.opacity=Math.min(0.42,Math.max(0,(t-i*0.55)*0.09));
    pl.position.y=0.15+i*0.34+Math.sin(t*0.7+i)*0.06;
  });
  scene.fog.density=0.06+Math.min(0.28,t*0.035);
  if(t>4.5){                                    // ноги подкашиваются
    var k=Math.min(1,(t-4.5)/4.0);
    P.eye=EYE_H-(EYE_H-0.22)*k;
    P.pitch=k*0.5;
    P.yaw+=Math.sin(t*1.6)*dt*0.5*k;
  }
  if(t>9.0&&!GAS.done){
    GAS.done=true;GAS.on=false;
    document.getElementById('black').style.transition='opacity 2.0s';
    document.getElementById('black').style.opacity='1';
    setTimeout(startDream1,2200);
  }
}
function sndHiss(){
  var a=getAC();if(!a)return;
  var n=a.createBuffer(1,Math.floor(a.sampleRate*9),a.sampleRate),d=n.getChannelData(0);
  for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  var s=a.createBufferSource();s.buffer=n;
  var f=a.createBiquadFilter();f.type='bandpass';f.frequency.value=3400;f.Q.value=0.8;
  var g=a.createGain();
  g.gain.setValueAtTime(0.0001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.10,a.currentTime+1.5);
  g.gain.setValueAtTime(0.10,a.currentTime+6);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+9);
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
}

// ---------- 2. СОН: ПЕРВЫЙ ЭТАЖ ИЗ ПЕРВОЙ ЧАСТИ ----------
function buildDream1(){
  clearScene();walls=[];LAMPS=[];
  var W2=20,D2=20,HH=2.6;
  setBounds(0,0,W2,D2);
  MATS.floor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.floor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.ceil);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.wall.map.repeat.set(W2/2,HH/2);
  box(W2,HH,0.3,MATS.wall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.wall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.wall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.wall,W2,HH/2,D2/2);
  // ряды диванов, как в первой части
  for(var r=0;r<4;r++)for(var c=0;c<4;c++){
    var sx=3.5+c*4.2, sz=4.0+r*3.6;
    var g=new THREE.Group();
    var sb=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.42,0.8),MATS.sofa);sb.position.y=0.28;g.add(sb);
    var bk=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.5,0.2),MATS.sofa);bk.position.set(0,0.66,-0.32);g.add(bk);
    g.position.set(sx,0,sz);addObj(g);
    solid(sx-0.8,sz-0.5,sx+0.8,sz+0.5);
  }
  // ---- СЛОМАННАЯ ЛЕСТНИЦА ----
  var st=new THREE.Group();
  for(var i=0;i<5;i++){
    var w2=1.6-(i>2?(i-2)*0.45:0);
    var step=new THREE.Mesh(new THREE.BoxGeometry(w2,0.16,0.5),
      new THREE.MeshStandardMaterial({color:0x2f7a2f,roughness:0.75,
        emissive:0x0d3a0d,emissiveIntensity:0.5}));
    step.position.set((i>2?(i-2)*0.2:0),0.18+i*0.30,-i*0.48);
    step.rotation.z=(i>2?(i-2)*0.18:0);
    st.add(step);
  }
  // обломки на полу
  for(var k=0;k<7;k++){
    var db=new THREE.Mesh(new THREE.BoxGeometry(0.3+Math.random()*0.5,0.1,0.35),
      new THREE.MeshStandardMaterial({color:0x2f6a2f,roughness:0.85}));
    db.position.set((Math.random()-0.5)*3,0.06,-2.5-Math.random()*2.5);
    db.rotation.set(Math.random(),Math.random()*3,Math.random());
    st.add(db);
  }
  st.position.set(W2/2,0,D2-2.0);addObj(st);
  DR1.stairs={x:W2/2,z:D2-3.4};
  // светло, как во сне
  scene.fog=new THREE.FogExp2(0xe9e4da,0.020);
  ambientLight.intensity=1.10;ambientLight.color.setHex(0xfff2e0);sunLight.intensity=0.5;
  for(var lx=4;lx<W2;lx+=6)for(var lz=4;lz<D2;lz+=6){
    var pan=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.06,0.34),
      new THREE.MeshStandardMaterial({color:0xfffaf0,emissive:0xfff4dc,emissiveIntensity:1.6}));
    pan.position.set(lx,HH-0.06,lz);addObj(pan);
  }
}
function startDream1(){
  PHASE='dream1';buildDream1();
  P.x=10;P.z=3.0;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;
  unstick();
  dead=false;DR1.on=true;DR1.t=0;DR1.hit=false;
  document.getElementById('dream').style.display='block';
  document.getElementById('black').style.transition='opacity 2.4s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Стоп. Это же... первый этаж.',3.0);sayE('Стоп. Это же... первый этаж.');},2600);
  setTimeout(function(){showMsg('Лестница. Она сломана.',3.0);},7000);
}
function updateDream1(dt){
  if(!DR1.on)return;
  DR1.t+=dt;
  if(DR1.hit)return;
  var d=Math.hypot(P.x-DR1.stairs.x,P.z-DR1.stairs.z);
  if(d<2.6&&DR1.t>3){
    // РЕЗКО. Без нарастания, без предупреждения.
    DR1.hit=true;DR1.on=false;
    if(!bossMesh){bossMesh=createBossMesh();scene.add(bossMesh);}
    bossMesh.visible=true;bossMesh.scale.set(1,1,1);
    var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);
    bossMesh.position.set(P.x+fx*0.9,0,P.z+fz*0.9);
    bossMesh.rotation.set(0,P.yaw+Math.PI,0);
    bossMesh.children.forEach(function(c){
      if(c.material&&c.material.emissiveIntensity!==undefined)c.material.emissiveIntensity=9;
    });
    sndScare();
    var wh=document.getElementById('white');
    wh.style.transition='none';wh.style.opacity='0.95';
    setTimeout(function(){wh.style.transition='opacity 0.3s';wh.style.opacity='0';},50);
    document.getElementById('dmg').style.opacity='1';
    setTimeout(function(){
      document.getElementById('black').style.transition='opacity 0.25s';
      document.getElementById('black').style.opacity='1';
    },380);
    setTimeout(function(){
      if(bossMesh)bossMesh.visible=false;
      document.getElementById('dmg').style.opacity='0';
      document.getElementById('dream').style.display='none';
      startWake();
    },1500);
  }
}

// ---------- 3. ПРОБУЖДЕНИЕ И ГРУЗОВИК ----------
function makeTruck(){
  var g=new THREE.Group();
  var cabM=new THREE.MeshStandardMaterial({color:0x8a3a2a,roughness:0.7,metalness:0.35});
  var bedM=new THREE.MeshStandardMaterial({color:0x4a4438,roughness:0.85});
  var cab=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.0,2.6),cabM);
  cab.position.set(0,1.4,2.4);g.add(cab);
  var glass=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.85,0.1),
    new THREE.MeshStandardMaterial({color:0x101418,roughness:0.25,metalness:0.6}));
  glass.position.set(0,1.9,3.68);g.add(glass);
  var bed=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.2,4.4),bedM);
  bed.position.set(0,1.0,-1.4);g.add(bed);
  [-1.15,1.15].forEach(function(sx){
    var side=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.0,4.4),bedM);
    side.position.set(sx,1.9,-1.4);g.add(side);
  });
  [[-1.05,2.2],[1.05,2.2],[-1.05,-2.2],[1.05,-2.2]].forEach(function(q){
    var wh=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.32,12),
      new THREE.MeshStandardMaterial({color:0x14141a,roughness:0.95}));
    wh.rotation.z=Math.PI/2;wh.position.set(q[0],0.55,q[1]);g.add(wh);
  });
  [-0.8,0.8].forEach(function(sx){
    var hl=new THREE.Mesh(new THREE.CircleGeometry(0.24,14),
      new THREE.MeshStandardMaterial({color:0xfffbe8,emissive:0xfff4d0,emissiveIntensity:5}));
    hl.position.set(sx,1.15,3.72);g.add(hl);
    var sp=new THREE.SpotLight(0xfff0d0,4.5,26,Math.PI/6,0.5,1);
    sp.position.set(sx,1.15,3.7);sp.target.position.set(sx,0.6,14);
    g.add(sp);g.add(sp.target);
  });
  return g;
}
function startWake(){
  PHASE='wake';
  clearScene();walls=[];LAMPS=[];
  var W2=18,D2=14,HH=4.0;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  WK.rightWall=box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  LAMPS.push([4,HH-0.6,4,0xffd0a0,9,0.30]);
  scene.fog=new THREE.FogExp2(0x07070a,0.06);
  ambientLight.intensity=0.10;ambientLight.color.setHex(0xfff2e0);sunLight.intensity=0;
  P.x=5;P.z=7;P.y=0;P.vy=0;P.yaw=Math.PI/2;P.pitch=0.45;P.eye=0.34;
  camera.rotation.z=0;camera.up.set(0,1,0);
  dead=false;WK.on=true;WK.t=0;WK.arrived=false;WK.called=false;
  document.getElementById('black').style.transition='opacity 1.8s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Опять... опять этот сон.',2.8);sayE('Опять... опять этот сон.');},2200);
  setTimeout(function(){
    showSub('Вы','То, что позади — может вернуться.',3.2);sayE('То, что позади — может вернуться.');
  },6000);
}
function updateWake(dt){
  if(!WK.on)return;
  WK.t+=dt;var t=WK.t;
  if(t<4)P.eye=0.34+(EYE_H-0.34)*Math.min(1,t/4);   // встаём
  else P.eye=EYE_H;
  if(t>4&&t<5.2)P.pitch+=(0-P.pitch)*Math.min(1,dt*3);
  // ГРУЗОВИК ЛОМАЕТ СТЕНУ
  if(t>10&&!WK.arrived){
    WK.arrived=true;
    sndCrash();sndScare();
    if(WK.rightWall)WK.rightWall.visible=false;
    for(var i=0;i<16;i++){
      var db=new THREE.Mesh(new THREE.BoxGeometry(0.3+Math.random()*0.6,0.3+Math.random()*0.5,0.25),
        MATS.corrWall);
      db.position.set(17.5-Math.random()*4,0.2+Math.random()*2.2,7+(Math.random()-0.5)*5);
      db.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
      addObj(db);
    }
    WK.truck=makeTruck();
    WK.truck.position.set(20,0,7);WK.truck.rotation.y=-Math.PI/2;
    scene.add(WK.truck);objs.push(WK.truck);
    LAMPS.push([16,2.0,7,0xfff0d0,14,0.9]);
  }
  if(WK.arrived&&WK.truck&&WK.truck.position.x>13.5){
    WK.truck.position.x-=dt*5.5;
  }
  if(WK.arrived&&t>12.4&&!WK.called){
    WK.called=true;
    showSub('Водитель','Быстрее! Запрыгивай в кузов!',3.4);
    say('Быстрее! Запрыгивай в кузов!',1.15,0.9);
  }
  wakeNear();
}
var nWk=null;
function wakeNear(){
  nWk=null;
  if(!WK.arrived||!WK.truck){setPrompt('',false);return;}
  var d=Math.hypot(P.x-WK.truck.position.x,P.z-WK.truck.position.z);
  if(d<3.4){nWk='truck';setPrompt('🚚 ЗАПРЫГНУТЬ В КУЗОВ — E',true);return;}
  setPrompt('',false);
}
function wakeAct(){
  if(nWk!=='truck')return;
  WK.on=false;setPrompt('',false);
  document.getElementById('black').style.transition='opacity 0.7s';
  document.getElementById('black').style.opacity='1';
  setTimeout(startTruck,800);
}

// ---------- 4. ПОЕЗДКА В КУЗОВЕ ----------
var TR_T={line1:2.2, boost:9.0, bridge:20.0, fall:22.0, black:26.5};
function buildTruckRide(){
  clearScene();walls=[];LAMPS=[];TR.road=[];TR.people=[];
  setBounds(-9999,-9999,9999,9999);
  // борта кузова вокруг камеры
  var bedM=new THREE.MeshStandardMaterial({color:0x4a4438,roughness:0.9});
  var floorB=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.12,4.4),bedM);
  floorB.position.set(0,-0.75,0);addObj(floorB);
  [-1.2,1.2].forEach(function(sx){
    var s=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.0,4.4),bedM);
    s.position.set(sx,-0.2,0);addObj(s);
  });
  var front=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.5,0.12),bedM);
  front.position.set(0,0.05,2.2);addObj(front);
  // другие люди в кузове
  var pm=new THREE.MeshStandardMaterial({color:0x2a2a30,roughness:0.95});
  [[-0.75,-1.2],[0.75,-1.3],[-0.75,0.4],[0.8,0.6]].forEach(function(q){
    var g=new THREE.Group();
    var b=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.24,0.75,8),pm);
    b.position.y=-0.30;g.add(b);
    var h=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,7),pm);
    h.position.y=0.18;g.add(h);
    g.position.set(q[0],0,q[1]);addObj(g);TR.people.push(g);
  });
  // дорога и столбы, которые проносятся мимо
  for(var i=0;i<70;i++){
    var z=-i*6;
    [-4.5,4.5].forEach(function(sx){
      var pil=new THREE.Mesh(new THREE.BoxGeometry(0.5,7,0.5),
        new THREE.MeshStandardMaterial({color:0x3a3a42,roughness:0.9}));
      pil.position.set(sx,3.5,z);addObj(pil);TR.road.push(pil);
    });
    var rd=new THREE.Mesh(new THREE.PlaneGeometry(9,5.6),
      new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.95}));
    rd.rotation.x=-Math.PI/2;rd.position.set(0,-1.3,z);addObj(rd);TR.road.push(rd);
    if(i%2===0){
      var dash=new THREE.Mesh(new THREE.PlaneGeometry(0.24,2.2),
        new THREE.MeshStandardMaterial({color:0xd8d0a0,roughness:0.8}));
      dash.rotation.x=-Math.PI/2;dash.position.set(0,-1.28,z);addObj(dash);TR.road.push(dash);
    }
  }
  scene.fog=new THREE.FogExp2(0x05060a,0.032);
  ambientLight.intensity=0.22;ambientLight.color.setHex(0xbfd0e8);sunLight.intensity=0;
  LAMPS.push([0,4,-6,0xfff0d0,20,0.7]);
}
function startTruck(){
  PHASE='truck';buildTruckRide();
  TR.on=true;TR.t=0;TR.fell=false;TR.musicMax=false;TR.z=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  dead=false;
  document.getElementById('black').style.transition='opacity 1.2s';
  document.getElementById('black').style.opacity='0';
  Music.escape();                                  // сначала обычный побег
  setTimeout(function(){
    showSub('Водитель','Держитесь крепче! Это мой не первый раз!',3.6);
    say('Держитесь крепче! Это мой не первый раз!',1.1,0.9);
  },TR_T.line1*1000);
}
// «бас на максимум» — отдельный слой поверх музыки
function subBoom(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),o2=a.createOscillator(),g=a.createGain(),sh=a.createWaveShaper();
  var cv=new Float32Array(1024);
  for(var i=0;i<1024;i++){var x=i*2/1024-1;cv[i]=(1+12)*x/(1+12*Math.abs(x));}
  sh.curve=cv;sh.oversample='2x';
  o.type='sine';o.frequency.value=34;
  o2.type='sawtooth';o2.frequency.value=34.4;
  var lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;lp.Q.value=4;
  g.gain.setValueAtTime(0.0001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.55,a.currentTime+0.5);
  g.gain.setValueAtTime(0.55,a.currentTime+11);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+13.5);
  o.connect(sh);o2.connect(sh);sh.connect(lp);lp.connect(g);g.connect(a.destination);
  o.start();o2.start();o.stop(a.currentTime+14);o2.stop(a.currentTime+14);
  TR.subNodes=[o,o2];
}
function updateTruck(dt){
  if(!TR.on)return;
  TR.t+=dt;var t=TR.t;
  var spd = t<TR_T.boost ? 9 : 9+Math.min(46,(t-TR_T.boost)*13);
  TR.z-=spd*dt;
  // мир едет навстречу
  TR.road.forEach(function(o){
    o.position.z+=spd*dt;
    if(o.position.z>8)o.position.z-=70*6;
  });
  // РЕЗКИЙ РАЗГОН
  if(t>=TR_T.boost&&!TR.musicMax){
    TR.musicMax=true;
    // Прежняя тема уходит на задний план, вперёд выходит долбёжка
    Music.setTense(true);Music.setLevel(0.22);
    HammerMusic.start();
    subBoom();
    showMsg('!!!',1.2);
  }
  // тряска растёт со скоростью
  var sh=Math.min(0.09,Math.max(0,(spd-9)/46)*0.09);
  var bob=Math.sin(t*13)*0.02+Math.sin(t*7.3)*0.012;
  camera.position.set((Math.random()-0.5)*sh,0.15+bob+(Math.random()-0.5)*sh,0);
  camera.rotation.order='YXZ';
  camera.rotation.y=Math.sin(t*0.7)*0.06;
  camera.rotation.x=-0.04+Math.sin(t*1.9)*0.02;
  camera.rotation.z=Math.sin(t*2.3)*0.02+(Math.random()-0.5)*sh*0.5;
  TR.people.forEach(function(pp,i){
    pp.position.y=Math.abs(Math.sin(t*11+i))*0.03;
    pp.rotation.z=Math.sin(t*9+i)*0.05;
  });
  // МОСТ И ПАДЕНИЕ
  if(t>=TR_T.bridge&&!TR.bridgeSaid){
    TR.bridgeSaid=true;
    showSub('Водитель','МОСТ! ДЕРЖИСЬ!',2.0);
    say('Мост! Держись!',1.25,1.0);
  }
  if(t>=TR_T.fall&&!TR.fell){
    TR.fell=true;
    sndScare();
  }
  if(TR.fell){
    var ft=t-TR_T.fall;
    camera.position.y=0.15-ft*ft*5.5;              // падаем
    camera.rotation.x=-0.04-ft*0.85;
    camera.rotation.z+=dt*1.2;
    TR.road.forEach(function(o){o.position.y+=dt*ft*6.0;});
  }
  if(t>=TR_T.black&&!TR.done){
    TR.done=true;TR.on=false;
    Music.stop();HammerMusic.stop();
    try{if(TR.subNodes)TR.subNodes.forEach(function(o){o.stop();});}catch(e){}
    camera.rotation.z=0;camera.up.set(0,1,0);
    document.getElementById('black').style.transition='opacity 0.5s';
    document.getElementById('black').style.opacity='1';
    setTimeout(showTitle,900);
  }
}

// ---------- 5. ЗАСТАВКА: см. titlecard.js ----------
function sndTitle(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  // нарастание
  var nb=a.createBuffer(1,Math.floor(a.sampleRate*1.6),a.sampleRate),nd=nb.getChannelData(0);
  for(var i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  var ns=a.createBufferSource();ns.buffer=nb;
  var bp=a.createBiquadFilter();bp.type='bandpass';bp.Q.value=5;
  bp.frequency.setValueAtTime(180,t0);
  bp.frequency.exponentialRampToValueAtTime(3200,t0+1.5);
  var ng=a.createGain();
  ng.gain.setValueAtTime(0.0001,t0);
  ng.gain.exponentialRampToValueAtTime(0.22,t0+1.45);
  ng.gain.exponentialRampToValueAtTime(0.0001,t0+1.75);
  ns.connect(bp);bp.connect(ng);ng.connect(a.destination);ns.start(t0);
  // УДАР
  var H=t0+1.5;
  var o=a.createOscillator(),g=a.createGain();
  o.type='sine';o.frequency.setValueAtTime(110,H);
  o.frequency.exponentialRampToValueAtTime(21,H+2.0);
  g.gain.setValueAtTime(0.72,H);
  g.gain.exponentialRampToValueAtTime(0.0001,H+3.4);
  o.connect(g);g.connect(a.destination);o.start(H);o.stop(H+3.5);
  // мрачный аккорд с квинтой и тритоном
  [55,82.4,77.8].forEach(function(f,k){
    var oo=a.createOscillator(),gg=a.createGain(),lp=a.createBiquadFilter();
    oo.type='sawtooth';oo.frequency.value=f;oo.detune.value=(k-1)*8;
    lp.type='lowpass';lp.frequency.setValueAtTime(300,H);
    lp.frequency.exponentialRampToValueAtTime(1400,H+0.4);
    lp.frequency.exponentialRampToValueAtTime(240,H+4);
    gg.gain.setValueAtTime(0.0001,H);
    gg.gain.linearRampToValueAtTime(0.16,H+0.05);
    gg.gain.exponentialRampToValueAtTime(0.0001,H+4.2);
    oo.connect(lp);lp.connect(gg);gg.connect(a.destination);
    oo.start(H);oo.stop(H+4.3);
  });
  // металлический хвост
  [1,2.76,5.4].forEach(function(r,k){
    var m=a.createOscillator(),mg=a.createGain();
    m.type='sine';m.frequency.value=220*r;
    mg.gain.setValueAtTime(0.07/(k+1),H);
    mg.gain.exponentialRampToValueAtTime(0.0001,H+2.2+k*0.4);
    m.connect(mg);mg.connect(a.destination);m.start(H);m.stop(H+3.2);
  });
}
// ============================================================
//  ЗАСТАВКА — рисуется на холсте, а не CSS.
//  Стиль: облупившийся металл склада, выбитые по трафарету буквы,
//  красная двойка как штамп поверх.
// ============================================================
var TC={on:false,t:0,raf:0,cv:null};

function drawTitleCard(cv,t){
  var c=cv.getContext('2d'),W=cv.width,H=cv.height;
  c.fillStyle='#08080a';c.fillRect(0,0,W,H);
  // фон: тёмный металл с пятнами и царапинами
  var g=c.createRadialGradient(W/2,H*0.45,0,W/2,H*0.45,W*0.7);
  g.addColorStop(0,'#1c1a1c');g.addColorStop(1,'#08080a');
  c.fillStyle=g;c.fillRect(0,0,W,H);
  if(!TC.grain){
    TC.grain=document.createElement('canvas');
    TC.grain.width=W;TC.grain.height=H;
    var gc=TC.grain.getContext('2d');
    for(var i=0;i<W*H/26;i++){
      gc.fillStyle='rgba('+(90+Math.random()*70|0)+','+(84+Math.random()*60|0)+',78,'+(Math.random()*0.22).toFixed(2)+')';
      gc.fillRect(Math.random()*W,Math.random()*H,1,1);
    }
    for(var s=0;s<70;s++){
      gc.strokeStyle='rgba(150,144,132,'+(0.04+Math.random()*0.10).toFixed(2)+')';
      gc.lineWidth=Math.random()<0.8?0.6:1.4;
      var x=Math.random()*W,y=Math.random()*H,L=30+Math.random()*260,a=(Math.random()-0.5)*0.5;
      gc.beginPath();gc.moveTo(x,y);gc.lineTo(x+Math.cos(a)*L,y+Math.sin(a)*L);gc.stroke();
    }
  }
  c.drawImage(TC.grain,0,0);

  var k1=Math.max(0,Math.min(1,(t-0.15)/1.1));     // «ЗАБРОШЕННЫЙ»
  var k2=Math.max(0,Math.min(1,(t-0.45)/1.1));     // «МАГАЗИН»
  var k3=Math.max(0,Math.min(1,(t-1.45)/0.55));    // двойка
  var k4=Math.max(0,Math.min(1,(t-3.0)/1.4));      // подпись
  function ease(x){return 1-Math.pow(1-x,3);}

  var base=Math.min(W*0.088,H*0.155);
  function stencil(txt,cy,kk,size,col){
    if(kk<=0)return;
    var e=ease(kk);
    c.save();
    c.globalAlpha=e;
    c.translate(W/2,cy);
    c.scale(1+(1-e)*0.28,1+(1-e)*0.28);
    c.font='bold '+size+'px "Courier New",monospace';
    c.textAlign='center';c.textBaseline='middle';
    // тень-выдавливание
    c.fillStyle='rgba(0,0,0,0.85)';
    c.fillText(spaced(txt),3,4);
    c.fillStyle=col;
    c.fillText(spaced(txt),0,0);
    // трафаретные разрывы: стираем узкие полосы поверх букв
    c.globalCompositeOperation='destination-out';
    for(var i=0;i<4;i++){
      var yy=-size*0.42+i*size*0.26+Math.sin(i*3.1)*2;
      c.fillStyle='rgba(0,0,0,1)';
      c.fillRect(-W/2,yy,W,size*0.035);
    }
    c.globalCompositeOperation='source-over';
    c.restore();
  }
  function spaced(s2){return s2.split('').join(' ');}

  stencil('ЗАБРОШЕННЫЙ',H*0.34,k1,base*0.62,'#ded7c8');
  stencil('МАГАЗИН',    H*0.47,k2,base*0.86,'#ded7c8');

  // двойка — красный штамп, ставится с ударом
  if(k3>0){
    var e3=ease(k3);
    c.save();
    c.globalAlpha=e3;
    c.translate(W/2,H*0.655);
    c.rotate((1-e3)*0.18-0.03);
    c.scale(1+(1-e3)*1.6,1+(1-e3)*1.6);
    c.font='bold '+(base*1.5)+'px "Courier New",monospace';
    c.textAlign='center';c.textBaseline='middle';
    c.shadowColor='rgba(200,30,30,0.75)';c.shadowBlur=40*e3;
    c.fillStyle='#c22020';c.fillText('2',0,0);
    c.shadowBlur=0;
    // рваный край штампа
    c.globalCompositeOperation='destination-out';
    for(var q=0;q<26;q++){
      c.beginPath();
      c.arc((Math.random()-0.5)*base*1.1,(Math.random()-0.5)*base*1.2,
            2+Math.random()*7,0,6.283);
      c.fill();
    }
    c.globalCompositeOperation='source-over';
    c.restore();
  }
  if(k4>0){
    c.globalAlpha=ease(k4)*0.75;
    c.font=Math.max(10,base*0.14)+'px "Courier New",monospace';
    c.textAlign='center';c.fillStyle='#7a7468';
    c.fillText('П Р О Л О Г   О К О Н Ч Е Н',W/2,H*0.86);
    c.globalAlpha=1;
  }
  // виньетка и полосы развёртки
  var vg=c.createRadialGradient(W/2,H/2,H*0.25,W/2,H/2,H*0.85);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.88)');
  c.fillStyle=vg;c.fillRect(0,0,W,H);
  c.fillStyle='rgba(0,0,0,0.16)';
  for(var y2=0;y2<H;y2+=3)c.fillRect(0,y2,W,1);
}

function showTitle(){
  PHASE='title';dead=true;
  var host=document.getElementById('titlecard');
  host.innerHTML='<canvas id="tccv"></canvas>';
  host.style.cssText='display:block;position:fixed;inset:0;z-index:295;background:#08080a;';
  var cv=document.getElementById('tccv');
  cv.style.cssText='width:100%;height:100%;display:block;';
  cv.width=Math.min(1600,innerWidth*(devicePixelRatio||1));
  cv.height=Math.round(cv.width*innerHeight/innerWidth);
  TC.cv=cv;TC.on=true;TC.t=0;
  var last=performance.now();
  (function anim(now){
    if(!TC.on)return;
    TC.raf=requestAnimationFrame(anim);
    TC.t+=Math.min(0.05,(now-last)/1000);last=now;
    drawTitleCard(cv,TC.t);
  })(performance.now());
  setTimeout(sndTitle,1250);          // удар совпадает с появлением двойки
  setTimeout(function(){              // держим пять секунд и уходим дальше
    TC.on=false;
    if(TC.raf)cancelAnimationFrame(TC.raf);
    document.getElementById('black').style.transition='opacity 1.0s';
    document.getElementById('black').style.opacity='1';
    setTimeout(startCandleRoom,1200);
  },5000);
}
// ============================================================
//  ПОСЛЕ ПАДЕНИЯ: комнатка со свечами (по рисунку автора)
//  оранжевое — стены, зелёное — люк, красное — выход
// ============================================================
var CN={on:false,t:0,candles:[],hatch:null};

function makeCandle(x,y,z){
  var g=new THREE.Group();
  var wax=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.04,0.16,8),
    new THREE.MeshStandardMaterial({color:0xefe6cf,roughness:0.85}));
  wax.position.y=0.08;g.add(wax);
  var fl=new THREE.Mesh(new THREE.SphereGeometry(0.026,7,6),
    new THREE.MeshBasicMaterial({color:0xffd88a}));
  fl.scale.set(1,1.8,1);fl.position.y=0.19;g.add(fl);
  var pl=new THREE.PointLight(0xffb45a,0.75,3.4);pl.position.y=0.22;g.add(pl);
  g.position.set(x,y,z);
  g.userData.flame=fl;g.userData.light=pl;g.userData.ph=Math.random()*9;
  return g;
}

function buildCandleRoom(){
  clearScene();walls=[];LAMPS=[];CN.candles=[];
  var W2=9,D2=8,HH=2.7;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  // стены — по рисунку оранжевые, но здесь это тёплый кирпич
  var wm=new THREE.MeshStandardMaterial({color:0x8a5a30,roughness:0.95,
    map:TEX.wood,bumpMap:TEX.wood,bumpScale:0.05});
  TEX.wood.repeat.set(W2/2,HH/2);
  box(W2,HH,0.3,wm,W2/2,HH/2,0);
  box(0.3,HH,D2,wm,0,HH/2,D2/2);
  box(0.3,HH,D2,wm,W2,HH/2,D2/2);
  // дальняя стена с ВЫХОДОМ (красный на рисунке)
  box((W2-1.4)/2,HH,0.3,wm,(W2-1.4)/4,HH/2,D2);
  box((W2-1.4)/2,HH,0.3,wm,W2-(W2-1.4)/4,HH/2,D2);
  box(1.4,0.6,0.3,wm,W2/2,HH-0.3,D2);
  var door=new THREE.Mesh(new THREE.BoxGeometry(1.3,2.1,0.1),
    new THREE.MeshStandardMaterial({color:0xa02020,roughness:0.7,
      emissive:0x501010,emissiveIntensity:0.6}));
  door.position.set(W2/2,1.05,D2-0.12);addObj(door);
  CN.exit={x:W2/2,z:D2-1.0};

  // ЛЮК в полу (зелёный на рисунке)
  var hatch=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.08,1.2),
    new THREE.MeshStandardMaterial({color:0x2f9a3f,roughness:0.6,metalness:0.4,
      emissive:0x0f3a15,emissiveIntensity:0.7}));
  hatch.position.set(W2-2.2,0.04,D2-1.8);addObj(hatch);
  CN.hatch=hatch;
  var ring=new THREE.Mesh(new THREE.TorusGeometry(0.16,0.03,6,14),MATS.metal);
  ring.rotation.x=Math.PI/2;ring.position.set(W2-2.2,0.11,D2-1.8);addObj(ring);

  // столик со стульями и свечами
  var tb=new THREE.Group();
  var tp=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.08,1.0),MATS.wood);
  tp.position.y=0.74;tb.add(tp);
  [[-0.65,-0.4],[0.65,-0.4],[-0.65,0.4],[0.65,0.4]].forEach(function(q){
    var lg=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.74,0.09),MATS.wood);
    lg.position.set(q[0],0.37,q[1]);tb.add(lg);
  });
  tb.position.set(2.6,0,3.0);addObj(tb);
  solid(1.7,2.4,3.5,3.6);
  [[1.5,3.0,Math.PI/2],[3.7,3.0,-Math.PI/2]].forEach(function(s){
    var ch=new THREE.Group();
    var seat=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.07,0.45),MATS.wood);
    seat.position.y=0.44;ch.add(seat);
    var bk=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.06),MATS.wood);
    bk.position.set(0,0.72,-0.2);ch.add(bk);
    [[-0.18,-0.18],[0.18,-0.18],[-0.18,0.18],[0.18,0.18]].forEach(function(q){
      var lg2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.44,0.05),MATS.wood);
      lg2.position.set(q[0],0.22,q[1]);ch.add(lg2);
    });
    ch.position.set(s[0],0,s[1]);ch.rotation.y=s[2];addObj(ch);
    solid(s[0]-0.3,s[1]-0.3,s[0]+0.3,s[1]+0.3);
  });
  [[2.25,3.0],[2.6,2.75],[2.95,3.0]].forEach(function(c){
    var cd=makeCandle(c[0],0.78,c[1]);addObj(cd);CN.candles.push(cd);
  });
  // ещё пара свечей по углам
  [[0.9,1.0],[W2-1.0,1.2]].forEach(function(c){
    var cd=makeCandle(c[0],0.02,c[1]);addObj(cd);CN.candles.push(cd);
  });
  scene.fog=new THREE.FogExp2(0x140c06,0.10);
  ambientLight.intensity=0.07;ambientLight.color.setHex(0xffd8a0);sunLight.intensity=0;
  buildTV(0.5,3.9,1.2,Math.PI/2);
  spawnFriends();
  setTimeout(playNews,12800);
}

// ============================================================
//  ТЕЛЕВИЗОР НА БАЗЕ — Этап 27: диктор + процедурная картинка.
//  Осознанно НЕ фотореалистичные сгенерированные фото (это был бы
//  внешний ассет уровня Этапа 21 на десятки картинок, а не разовое
//  исключение) — рисуем на canvas тем же приёмом, что и все текстуры
//  игры, «ноль внешних файлов» действует и здесь.
// ============================================================
var TV_DEFS=[
  {key:'p1_mission1',name:'Игорь Соколов',age:'34 года',
   line:'В районе снова тревога. Игорь Соколов, тридцать четыре года, зашёл в старый мебельный магазин — и пропал.'},
  {key:'p1_mission2',name:'Марина Волкова',age:'27 лет',
   line:'Ещё одно исчезновение. Марина Волкова заходила в тот же магазин неделей раньше. До сих пор не найдена.'}
];
var TV_WRAP='Пропавшие, о которых мы недавно сообщали, найдены живыми. Но источники говорят — похожие случаи фиксируют и в других районах города.';
function drawNewsCanvas(missing,person){
  var c=document.createElement('canvas');c.width=256;c.height=192;
  var ctx=c.getContext('2d');
  var grad=ctx.createLinearGradient(0,0,256,140);
  grad.addColorStop(0,'#16324a');grad.addColorStop(1,'#0a1420');
  ctx.fillStyle=grad;ctx.fillRect(0,0,256,140);
  // силуэт — процедурная форма, не фото
  ctx.fillStyle='#05070a';
  ctx.beginPath();ctx.arc(60,66,20,0,Math.PI*2);ctx.fill();
  ctx.fillRect(40,86,40,56);
  ctx.strokeStyle='#c9a227';ctx.lineWidth=3;ctx.strokeRect(22,26,76,118);
  ctx.fillStyle='#8a1414';ctx.fillRect(0,140,256,52);
  ctx.fillStyle='#fff';ctx.textAlign='center';
  ctx.font='bold 15px sans-serif';
  ctx.fillText(missing?'ПРОПАЛ(А) БЕЗ ВЕСТИ':'НАЙДЕН(А) ЖИВЫМ(ОЙ)',128,160);
  ctx.font='12px sans-serif';
  ctx.fillText(person?person.name:'ГОРОДСКИЕ НОВОСТИ',128,178);
  return new THREE.CanvasTexture(c);
}
var TV_SCREEN=null;
function buildTV(cx,cz,cy,ry){
  var g=new THREE.Group();
  g.position.set(cx,cy,cz);g.rotation.y=ry;
  var bodyM=new THREE.MeshStandardMaterial({color:0x14100c,roughness:0.6});
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.46,0.08),bodyM);
  g.add(body);
  var tex=drawNewsCanvas(true,null);
  var screenM=new THREE.MeshBasicMaterial({map:tex});
  var screen=new THREE.Mesh(new THREE.PlaneGeometry(0.52,0.38),screenM);
  screen.position.z=0.041;g.add(screen);
  TV_SCREEN=screen;
  var glow=new THREE.PointLight(0x6a8ac0,0.5,2.2);glow.position.z=0.15;g.add(glow);
  addObj(g);
  return g;
}
function playNews(){
  if(!TV_SCREEN)return;
  var seg=null;
  for(var i=0;i<TV_DEFS.length;i++){
    if(!window.Progress||!Progress.isCompleteSync(TV_DEFS[i].key)){seg=TV_DEFS[i];break;}
  }
  var missing=!!seg,text=seg?seg.line:TV_WRAP,person=seg;
  if(TV_SCREEN.material.map)TV_SCREEN.material.map.dispose();
  TV_SCREEN.material.map=drawNewsCanvas(missing,person);
  TV_SCREEN.material.needsUpdate=true;
  showSub('Новости',text,4.6);
  sayE(text);
}

// ============================================================
//  ДРУЗЬЯ НА БАЗЕ — Этап 25: спасённые на 1-2 этажах part1.html
//  (Progress.p1_mission1/p1_mission2) появляются здесь. Человеческая
//  фигура, НЕ мебельщик (makeAlly()/createBossMesh() для этого не
//  годятся — они монструозного силуэта, тут нужен обратный эффект).
// ============================================================
function makeFriend(hue){
  var g=new THREE.Group();
  var skinM=new THREE.MeshStandardMaterial({color:0xc89a78,roughness:0.85});
  var clothM=new THREE.MeshStandardMaterial({color:hue,roughness:0.9});
  var torso=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.55,0.24),clothM);
  torso.position.y=1.05;g.add(torso);
  var head=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.26,0.24),skinM);
  head.position.y=1.48;g.add(head);
  [-0.12,0.12].forEach(function(dx){
    var leg=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.72,0.14),clothM);
    leg.position.set(dx,0.36,0);g.add(leg);
    var arm=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.5,0.11),skinM);
    arm.position.set(dx*2.0,1.05,0);g.add(arm);
  });
  var eyeM=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff8e0,emissiveIntensity:0.6});
  [-0.05,0.05].forEach(function(dx){
    var e=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,6),eyeM);
    e.position.set(dx,1.50,0.13);g.add(e);
  });
  return g;
}
var FRIEND_DEFS=[
  {key:'p1_mission1',name:'Игорь',color:0x5a7a3a,greet:'Спасибо, что нашёл меня там...'},
  {key:'p1_mission2',name:'Марина',color:0x8a4a6a,greet:'Даже не думала, что выберусь оттуда.'}
];
function sndCelebrate(){
  // короткий приветственный перезвон — Этап 26, отмечаем завершение
  // миссии спасения (полноценная сцена "тусовки" ещё впереди)
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  [523,659,784,1046].forEach(function(f,i){
    var o=a.createOscillator(),g=a.createGain();
    o.type='sine';o.frequency.value=f;
    var t=t0+i*0.09;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.22,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.35);
    o.connect(g);g.connect(a.destination);
    o.start(t);o.stop(t+0.36);
  });
}
function spawnFriends(){
  if(!window.Progress)return;
  var spots=[[1.2,6.6],[6.7,4.6],[7.0,1.3],[1.0,1.3]];
  var names=[],newFriends=[],i=0;
  FRIEND_DEFS.forEach(function(f){
    if(!Progress.isCompleteSync(f.key))return;
    var p=spots[i%spots.length];i++;
    var g=makeFriend(f.color);
    g.position.set(p[0],0,p[1]);
    g.rotation.y=Math.random()*6.28;
    g.userData.friendName=f.name;
    addObj(g);
    names.push(f.name);
    var celKey='celebrated_'+f.key;
    if(!Progress.isCompleteSync(celKey)){
      newFriends.push(f);
      Progress.markComplete(celKey);
    }
  });
  if(newFriends.length){
    setTimeout(function(){
      sndCelebrate();
      ReunionMusic.start();
      showMsg('🎉 '+newFriends.map(function(f){return f.name;}).join(' и ')+' теперь с тобой на базе!',3.6);
      if(window.Coins)Coins.earn(15*newFriends.length,'встреча на базе');
      newFriends.forEach(function(f,idx){
        setTimeout(function(){showSub(f.name,f.greet,3.0);},1600+idx*2600);
      });
    },9800);
  }else if(names.length){
    setTimeout(function(){showMsg('На базе '+names.join(' и ')+'.',3.0);},9800);
  }
}

// ============================================================
//  КОМПАНЬОН — общий переиспользуемый паттерн (KEN-15):
//  ВЕДЁТ / ЖДЁТ / ПРЕДУПРЕЖДАЕТ / ЗАВЕРШЕНО. Для ЭТОЙ игры, тема
//  под охранника/друзей с базы — не аквапарк (см. заметку о путанице
//  выше в этом файле). Демо-привязка — можно позвать любого друга с
//  базы следовать за собой по комнате базы; полноценное сопровождение
//  в сюжетных сценах — следующий подэтап, когда появится, куда вести.
// ============================================================
var COMPANION={active:false,mesh:null,name:'',state:'WAIT',lostT:0};
function companionSetLead(mesh,name){
  COMPANION.active=true;COMPANION.mesh=mesh;COMPANION.name=name;
  COMPANION.state='LEAD';COMPANION.lostT=0;
}
function companionStop(){
  COMPANION.active=false;COMPANION.mesh=null;COMPANION.state='WAIT';
}
function companionWarn(text){
  // ПРЕДУПРЕЖДАЕТ: компаньон стоит на месте и говорит реплику — для
  // сцен, где спутник должен предупредить об опасности впереди.
  // Общая функция, вызывать из будущих миссий с компаньоном.
  if(!COMPANION.active)return;
  COMPANION.state='WARN';
  showSub(COMPANION.name,text,3.0);
  setTimeout(function(){if(COMPANION.state==='WARN')COMPANION.state='LEAD';},3000);
}
function updateCompanion(dt){
  if(!COMPANION.active||!COMPANION.mesh||COMPANION.state==='WARN')return;
  var m=COMPANION.mesh;
  var dx=P.x-m.position.x,dz=P.z-m.position.z,d=Math.hypot(dx,dz);
  if(d>1.6){
    var sp=0.026;
    m.position.x+=dx/d*sp;m.position.z+=dz/d*sp;
    m.rotation.y=Math.atan2(dx,dz);
  }
  if(d>7&&COMPANION.lostT===0){COMPANION.lostT=1;showMsg(COMPANION.name+' отстал — подожди его.',2.4);}
  else if(d<=7)COMPANION.lostT=0;
}
function nearestFriend(){
  var best=null,bestD=1.8;
  objs.forEach(function(o){
    if(!o.userData||!o.userData.friendName||o===COMPANION.mesh)return;
    var d=Math.hypot(P.x-o.position.x,P.z-o.position.z);
    if(d<bestD){bestD=d;best=o;}
  });
  return best;
}
var nCompanionTarget=null;

function startCandleRoom(){
  PHASE='candle';buildCandleRoom();
  saveAt('candle');
  P.x=2.6;P.z=5.4;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=0.32;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;CN.on=true;CN.t=0;
  document.getElementById('titlecard').style.display='none';
  if(TC)TC.on=false;
  document.getElementById('black').style.transition='opacity 2.0s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Живой... кажется.',2.4);sayE('Живой... кажется.');},2400);
  setTimeout(function(){showSub('Вы','Свечи. Кто-то их зажёг.',2.8);sayE('Свечи. Кто-то их зажёг.');},6400);
  setTimeout(function(){questShow('Найдите выход из комнаты');},7000);
}
function updateCandleRoom(dt){
  if(!CN.on)return;
  CN.t+=dt;
  if(CN.t<3)P.eye=0.32+(EYE_H-0.32)*Math.min(1,CN.t/3);
  else P.eye=EYE_H;
  CN.candles.forEach(function(c){
    c.userData.ph+=dt*7;
    var f=0.75+Math.sin(c.userData.ph)*0.12+Math.sin(c.userData.ph*2.7)*0.06;
    c.userData.light.intensity=f;
    c.userData.flame.scale.set(1,1.8*(0.9+f*0.15),1);
  });
  cnNear();
  updateCompanion(dt);
}
var nCn=null;
function cnNear(){
  nCn=null;
  if(COMPANION.active){
    nCn='release';setPrompt('👋 ОТПУСТИТЬ '+COMPANION.name.toUpperCase()+' — E',true);return;
  }
  var frC=nearestFriend();
  if(frC){nCn='companion';nCompanionTarget=frC;setPrompt('👋 ПОЗВАТЬ С СОБОЙ — E',true);return;}
  if(Math.hypot(P.x-CN.exit.x,P.z-CN.exit.z)<1.6){
    nCn='exit';setPrompt('🚪 ВЫЙТИ — E',true);return;
  }
  if(CN.hatch&&Math.hypot(P.x-CN.hatch.position.x,P.z-CN.hatch.position.z)<1.4){
    nCn='hatch';setPrompt('Люк. Заварен намертво',false);return;
  }
  setPrompt('',false);
}
function cnAct(){
  if(nCn==='release'){
    var relName=COMPANION.name;companionStop();
    showMsg(relName+' останется здесь.',2.2);return;
  }
  if(nCn==='companion'){
    if(nCompanionTarget){
      companionSetLead(nCompanionTarget,nCompanionTarget.userData.friendName);
      showMsg(nCompanionTarget.userData.friendName+' идёт с тобой.',2.2);
    }
    return;
  }
  if(nCn!=='exit')return;
  CN.on=false;questDone();
  ReunionMusic.stop();
  document.getElementById('black').style.transition='opacity 0.9s';
  document.getElementById('black').style.opacity='1';
  setTimeout(startFork,1000);
}
// ============================================================
//  КОРИДОР С РАЗВИЛКОЙ: слева заперто, справа выход,
//  посередине — тот самый грузовик, на котором мы сюда упали
// ============================================================
var FK={on:false,t:0,truck:null,tried:false};

function buildFork(){
  clearScene();walls=[];LAMPS=[];
  var HH=3.4, LW=4.6, ARM=16;
  setBounds(-ARM-2,-3,ARM+2,12);
  // поперечный коридор (влево-вправо)
  MATS.corrFloor.map.repeat.set(ARM*2,LW);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(ARM*2,LW),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(0,0,0);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(ARM*2,LW),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(0,HH,0);addObj(ce);
  MATS.corrWall.map.repeat.set(ARM,HH/3);
  [-LW/2,LW/2].forEach(function(sz){
    // в ближней стене оставляем проём, из которого мы пришли
    if(sz>0){
      box(ARM*2*0.42,HH,0.3,MATS.corrWall,-ARM*0.58,HH/2,sz);
      box(ARM*2*0.42,HH,0.3,MATS.corrWall, ARM*0.58,HH/2,sz);
      box(2.6,0.9,0.3,MATS.corrWall,0,HH-0.45,sz);
      solid(-ARM,sz-0.25,-1.3,sz+0.25);
      solid(1.3,sz-0.25,ARM,sz+0.25);
    }else{
      box(ARM*2,HH,0.3,MATS.corrWall,0,HH/2,sz);
      solid(-ARM,sz-0.25,ARM,sz+0.25);
    }
  });
  // короткий тамбур, откуда мы вышли
  box(0.3,HH,4,MATS.corrWall,-1.4,HH/2,LW/2+2);
  box(0.3,HH,4,MATS.corrWall, 1.4,HH/2,LW/2+2);
  solid(-1.65,LW/2,-1.15,LW/2+4);
  solid(1.15,LW/2,1.65,LW/2+4);
  var fl2=new THREE.Mesh(new THREE.PlaneGeometry(2.6,4),MATS.corrFloor);
  fl2.rotation.x=-Math.PI/2;fl2.position.set(0,0,LW/2+2);addObj(fl2);
  var ce2=new THREE.Mesh(new THREE.PlaneGeometry(2.6,4),MATS.dark);
  ce2.rotation.x=Math.PI/2;ce2.position.set(0,HH,LW/2+2);addObj(ce2);

  // СЛЕВА — заблокированная дверь
  var ldoor=new THREE.Mesh(new THREE.BoxGeometry(0.2,2.4,3.0),
    new THREE.MeshStandardMaterial({color:0x3a3d42,roughness:0.6,metalness:0.6}));
  ldoor.position.set(-ARM+0.2,1.2,0);addObj(ldoor);
  for(var i=0;i<3;i++){
    var bar=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.18,3.2),
      new THREE.MeshStandardMaterial({color:0x6a4a2a,roughness:0.9}));
    bar.position.set(-ARM+0.35,0.7+i*0.75,0);bar.rotation.x=0.06*(i%2?1:-1);addObj(bar);
  }
  solid(-ARM,-1.7,-ARM+0.6,1.7);
  FK.left={x:-ARM+1.2,z:0};
  // СПРАВА — выход
  var rdoor=new THREE.Mesh(new THREE.BoxGeometry(0.2,2.5,3.2),
    new THREE.MeshStandardMaterial({color:0x2f8f4f,roughness:0.5,
      emissive:0x1a5a30,emissiveIntensity:0.9}));
  rdoor.position.set(ARM-0.2,1.25,0);addObj(rdoor);
  FK.right={x:ARM-1.2,z:0};
  LAMPS.push([-6,HH-0.6,0,0xffd0a0,11,0.45]);
  LAMPS.push([ 7,HH-0.6,0,0xd8e8ff,12,0.55]);

  // ГРУЗОВИК — разбитый, лежит поперёк
  var t=makeTruck();
  t.position.set(-1.5,0,-0.2);
  t.rotation.set(0.18,1.25,0.42);
  t.traverse(function(o){
    if(o.isSpotLight)o.intensity=0;
    if(o.material&&o.material.emissive)o.material.emissiveIntensity=0;
  });
  scene.add(t);objs.push(t);FK.truck=t;
  solid(-3.4,-1.8,0.6,1.6);
  // обломки вокруг
  for(var k=0;k<12;k++){
    var db=new THREE.Mesh(new THREE.BoxGeometry(0.2+Math.random()*0.4,0.14,0.3),
      new THREE.MeshStandardMaterial({color:0x4a4438,roughness:0.95}));
    db.position.set(-4+Math.random()*7,0.08,(Math.random()-0.5)*3.4);
    db.rotation.set(Math.random(),Math.random()*3,Math.random());addObj(db);
  }
  scene.fog=new THREE.FogExp2(0x08080b,0.055);
  ambientLight.intensity=0.10;ambientLight.color.setHex(0xfff2e0);sunLight.intensity=0;
}

function startFork(){
  PHASE='fork';buildFork();
  P.x=0;P.z=6.0;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;FK.on=true;FK.t=0;FK.tried=false;
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){
    showSub('Вы','Это же... тот самый грузовик.',3.0);sayE('Это же... тот самый грузовик.');
  },2600);
  setTimeout(function(){showMsg('Налево или направо',2.6);},6600);
  setTimeout(function(){questShow('Найдите проход дальше','Одна из дверей открыта');},6800);
}
function updateFork(dt){
  if(!FK.on)return;
  FK.t+=dt;
  fkNear();
}
var nFk=null;
function fkNear(){
  nFk=null;
  if(Math.hypot(P.x-FK.left.x,P.z-FK.left.z)<2.0){
    nFk='left';setPrompt('🔒 ЗАБЛОКИРОВАНО — E',true);return;
  }
  if(Math.hypot(P.x-FK.right.x,P.z-FK.right.z)<2.0){
    nFk='right';setPrompt('🚪 ВЫХОД — E',true);return;
  }
  setPrompt('',false);
}
function fkAct(){
  if(nFk==='left'){
    if(!FK.tried){
      FK.tried=true;
      showSub('Вы','Заперто. И заколочено снаружи.',2.8);sayE('Заперто. И заколочено снаружи.');
      sndCreak();
    }else showMsg('Не открыть',1.4);
    return;
  }
  if(nFk==='right'){
    FK.on=false;questDone();
    document.getElementById('black').style.transition='opacity 0.9s';
    document.getElementById('black').style.opacity='1';
    setTimeout(function(){startLoading(buildUVStore,startUVStore);},1000);
  }
}
// ============================================================
//  УЛЬТРАФИОЛЕТОВЫЙ ПИСТОЛЕТ
//  Правая рука — пистолет, левая — фонарь.
//  Держим кнопку: трубка раскрывается зонтом. Отпустили раскрытым —
//  выстрел ультрафиолетом. Отпустили раньше — просто закрылся.
//  Пять ламп: каждый выстрел сжигает одну, перезарядка меняет её.
// ============================================================
var UV={
  has:false, view:null, petals:[], bulbs:[], lamp:null,
  open:0,              // 0 закрыт, 1 раскрыт полностью
  holding:false, state:'idle',   // idle|open|closing|fire|reload
  loaded:5, cap:5, spare:0,
  fireT:0, reloadT:0, flash:null, cool:0,
  inspect:false, inspectT:0     // режим осмотра купленного скина
};
var OPEN_TIME=1.15;    // столько держать, чтобы раскрылся
var _uvBoltTmp=new THREE.Vector3();   // переиспользуемый вектор для молний скина "Терминатор"

// Скины УФ-пистолета (js/inventory.js, магазин):
// - "ТЕРМИНАТОР" (50 монет) — хромированный корпус, красное кольцо-акцент,
//   электрические дуги молний между лепестками и линзой.
// - "UV ELITE" (60 монет) — тёмно-фиолетовый корпус, табличка с
//   названием, боковые LED-полоски и голограмма (кольцо + волна)
//   вместо молний. Оба скина оживают при зарядке/выстреле (updateUV).
var UV_SKIN=(function(){try{return localStorage.getItem('magazin_uv_skin')||'default';}catch(e){return 'default';}})();

function makeUvPlaqueTexture(){
  var c=document.createElement('canvas');c.width=128;c.height=32;
  var g=c.getContext('2d');
  g.fillStyle='#0e0a14';g.fillRect(0,0,128,32);
  g.strokeStyle='#c86bff';g.lineWidth=2;g.strokeRect(1,1,126,30);
  g.fillStyle='#e8d8ff';g.font='bold 16px Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillText('UV ELITE',64,17);
  var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;
  return t;
}

function makeUVGun(){
  var g=new THREE.Group();
  var isTerm=UV_SKIN==='terminator', isElite=UV_SKIN==='uvelite';
  var black=isTerm?new THREE.MeshStandardMaterial({color:0x8a8f9a,roughness:0.18,metalness:0.95}):
    isElite?new THREE.MeshStandardMaterial({color:0x18121f,roughness:0.3,metalness:0.6}):
    new THREE.MeshStandardMaterial({color:0x141416,roughness:0.42,metalness:0.72});
  var grip=isTerm?new THREE.MeshStandardMaterial({color:0x1a1a1e,roughness:0.6,metalness:0.4}):
    isElite?new THREE.MeshStandardMaterial({color:0x120e18,roughness:0.55,metalness:0.35}):
    new THREE.MeshStandardMaterial({color:0x0e0e10,roughness:0.9,metalness:0.15});
  // рукоять
  var h=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.20,0.11),grip);
  h.position.set(0,-0.13,0.06);h.rotation.x=0.22;g.add(h);
  // корпус-трубка
  var body=new THREE.Mesh(new THREE.CylinderGeometry(0.048,0.052,0.34,14),black);
  body.rotation.x=Math.PI/2;body.position.z=-0.02;g.add(body);
  var ring=new THREE.Mesh(new THREE.TorusGeometry(0.055,0.008,6,16),
    new THREE.MeshStandardMaterial({color:0x2e2e34,roughness:0.3,metalness:0.9}));
  ring.rotation.x=Math.PI/2;ring.position.z=0.10;g.add(ring);
  // спусковой крючок
  var tr=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.06,0.02),black);
  tr.position.set(0,-0.06,0.02);g.add(tr);
  if(isTerm){
    // красное кольцо-акцент — собранный, "терминаторский" силуэт даже
    // когда пистолет не заряжен
    var accent=new THREE.Mesh(new THREE.TorusGeometry(0.053,0.006,6,16),
      new THREE.MeshStandardMaterial({color:0xff2020,emissive:0xa00000,
        emissiveIntensity:1.1,roughness:0.3,metalness:0.6}));
    accent.rotation.x=Math.PI/2;accent.position.z=-0.06;g.add(accent);
  }
  if(isElite){
    // табличка с названием + боковые LED-полоски — тоже видны всегда,
    // не только при выстреле
    var plaque=new THREE.Mesh(new THREE.PlaneGeometry(0.09,0.022),
      new THREE.MeshBasicMaterial({map:makeUvPlaqueTexture()}));
    plaque.position.set(0,0.018,0.02);plaque.rotation.x=-Math.PI/2;g.add(plaque);
    var ledMat=new THREE.MeshStandardMaterial({color:0xc86bff,emissive:0x8a2fd9,emissiveIntensity:1.2});
    for(var li=0;li<3;li++){
      var led=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.006,0.05),ledMat);
      led.position.set(-0.028+li*0.028,-0.005,0.14);g.add(led);
    }
    // зубцы планки Пикатинни сверху — силуэт "тактического" оружия с фото
    var railMat=new THREE.MeshStandardMaterial({color:0x0e0a14,roughness:0.4,metalness:0.7});
    for(var ri=0;ri<6;ri++){
      var tooth=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.010,0.022),railMat);
      tooth.position.set(0,0.030,0.10-ri*0.026);g.add(tooth);
    }
    // светящаяся "плазменная" сфера сбоку — как на фото, у спускового крючка
    var orb=new THREE.Mesh(new THREE.SphereGeometry(0.024,12,10),
      new THREE.MeshStandardMaterial({color:0xc86bff,emissive:0xb04fff,
        emissiveIntensity:1.4,roughness:0.15,transparent:true,opacity:0.85}));
    orb.position.set(0.032,-0.02,0.05);g.add(orb);UV.eliteOrb=orb;
    // большой передний рефлектор за лепестками — виден и когда зонт закрыт,
    // имитирует крупную светящуюся "линзу" с фото
    var reflector=new THREE.Mesh(new THREE.CircleGeometry(0.05,20),
      new THREE.MeshStandardMaterial({color:0x2a1840,emissive:0x6a2fb0,
        emissiveIntensity:0.35,roughness:0.3,side:THREE.DoubleSide}));
    reflector.position.z=-0.155;g.add(reflector);UV.eliteReflector=reflector;
  }
  // ЗОНТ: пять лепестков, на каждом своя лампа
  UV.petals=[];UV.bulbs=[];
  var bulbColor=isElite?0xd8b0ff:0xbfa8ff, bulbEmissive=isElite?0xc86bff:0x7a4aff;
  UV.bulbLitColor=bulbColor;
  for(var i=0;i<5;i++){
    var a=i/5*Math.PI*2;
    var pet=new THREE.Group();
    var blade=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.012,0.20),black);
    blade.position.z=-0.10;pet.add(blade);
    var bulb=new THREE.Mesh(new THREE.SphereGeometry(0.026,8,7),
      new THREE.MeshStandardMaterial({color:bulbColor,emissive:bulbEmissive,
        emissiveIntensity:0.5,roughness:0.25}));
    bulb.position.z=-0.20;pet.add(bulb);
    pet.position.set(Math.cos(a)*0.022,Math.sin(a)*0.022,-0.17);
    pet.userData.ang=a;
    g.add(pet);UV.petals.push(pet);UV.bulbs.push(bulb);
  }
  // центральная линза
  var lensColor=isElite?0xc86bff:0x9a7aff, lensEmissive=isElite?0xb04fff:0x6a3aff;
  var lens=new THREE.Mesh(new THREE.CircleGeometry(0.040,16),
    new THREE.MeshStandardMaterial({color:lensColor,emissive:lensEmissive,emissiveIntensity:0.8}));
  lens.position.z=-0.19;g.add(lens);g.userData.lens=lens;
  // видимый луч — фиолетовый конус в тумане, как у фонаря FL2, но
  // цветом под УФ-лампу; раньше свет был только точечным (UV.lamp),
  // без видимого "снопа" в воздухе
  var uvBeamM=new THREE.MeshBasicMaterial({color:0xb07aff,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  var uvBeam=new THREE.Mesh(new THREE.ConeGeometry(1.35,6.8,18,1,true),uvBeamM);
  uvBeam.rotation.x=-Math.PI/2;uvBeam.position.z=-3.65;g.add(uvBeam);UV.beam=uvBeam;
  if(isTerm){
    // дуги молний: ломаная линия от каждого лепестка к линзе, форма
    // трясётся каждый кадр в updateUV() — дешёвая, но убедительная
    // электрическая дуга без единого внешнего ассета.
    UV.bolts=[];
    var boltMat=new THREE.LineBasicMaterial({color:0xcfe8ff,transparent:true,
      opacity:0,blending:THREE.AdditiveBlending});
    UV.petals.forEach(function(){
      var geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(5*3),3));
      var line=new THREE.Line(geo,boltMat.clone());
      line.frustumCulled=false;
      g.add(line);UV.bolts.push(line);
    });
  }
  if(isElite){
    // голограмма над пистолетом: кольцо, которое крутится и раздувается,
    // плюс волна-осциллограф рядом — оба оживают в updateUV(), как
    // молнии у "Терминатора", просто другой рисунок эффекта.
    UV.holoRing=new THREE.Mesh(new THREE.TorusGeometry(0.05,0.004,8,24),
      new THREE.MeshBasicMaterial({color:0xc86bff,transparent:true,opacity:0,
        blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    UV.holoRing.position.set(0,0.09,-0.10);g.add(UV.holoRing);
    var waveGeo=new THREE.BufferGeometry();
    waveGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9*3),3));
    UV.holoWave=new THREE.Line(waveGeo,new THREE.LineBasicMaterial({color:0xe8d0ff,
      transparent:true,opacity:0,blending:THREE.AdditiveBlending}));
    UV.holoWave.frustumCulled=false;g.add(UV.holoWave);
  }
  g.position.set(0.30,-0.30,-0.52);
  g.rotation.set(0.04,-0.10,0.0);
  g.visible=false;
  return g;
}

function initUV(){
  if(UV.view)return;
  UV.view=makeUVGun();camera.add(UV.view);
  UV.lamp=new THREE.SpotLight(0x8a5cff,0,22,Math.PI/4.4,0.55,1.1);
  camera.add(UV.lamp);UV.lamp.position.set(0,0,0);
  UV.lamp.target.position.set(0,0,-1);camera.add(UV.lamp.target);
  if(window.DETAIL)DETAIL.setupFlashlightShadow(UV.lamp);
}

// ---------- удержание кнопки ----------
function uvDown(){
  if(!UV.has||UV.state==='reload'||UV.cool>0||UV.inspect)return;
  if(UV.loaded<=0){showMsg('Лампа перегорела. Перезарядка',2.0);sndBeep(180);return;}
  UV.holding=true;UV.state='open';
  sndUVCharge();
}
function uvUp(){
  if(!UV.has||!UV.holding)return;
  UV.holding=false;
  if(UV.open>=0.985){uvFire();}
  else {UV.state='closing';sndBeep(220);}   // не раскрылся — просто складывается
}
function uvFire(){
  UV.state='fire';UV.fireT=0;UV.cool=0.6;
  UV.loaded=Math.max(0,UV.loaded-1);
  sndUVShot();
  uvHUD();
  // вспышка засвечивает всё вокруг
  var f=document.getElementById('uvflash');
  if(f){f.style.transition='none';f.style.opacity='0.75';
    setTimeout(function(){f.style.transition='opacity 0.9s';f.style.opacity='0';},60);}
  if(typeof revealSecrets==='function')revealSecrets();
  if(typeof scareMobsUV==='function')scareMobsUV();
  if(typeof uvHouseShot==='function')uvHouseShot();
  if(typeof basementShot==='function')basementShot();
  if(typeof throneAllyShot==='function')throneAllyShot();
}
function uvReload(){
  if(!UV.has||UV.state==='reload')return;
  if(UV.loaded>=UV.cap){showMsg('Все лампы целы',1.6);return;}
  if(UV.spare<=0){showMsg('Нет запасных ламп',2.0);sndBeep(180);return;}
  UV.state='reload';UV.reloadT=0;UV.holding=false;
  sndBeep(700);
}
function uvHUD(){
  var el=document.getElementById('uvhud');
  if(!el)return;
  var btn=document.getElementById('uv-inspect-btn');
  if(btn)btn.style.display=UV.has?'block':'none';
  if(!UV.has){el.style.display='none';return;}
  el.style.display='block';
  var s='';
  for(var i=0;i<UV.cap;i++)s+='<i class="'+(i<UV.loaded?'ok':'')+'"></i>';
  el.innerHTML='<div class="lbl">УФ-ЛАМПЫ</div><div class="row">'+s+'</div>'+
               '<div class="sp">запас: '+UV.spare+'</div>';
}

// Осмотр оружия: пистолет выезжает в центр экрана, увеличивается и
// крутится, все эффекты скина идут на максимум — чисто показать
// красоту купленного скина, на геймплей не влияет.
function uvInspectToggle(){
  if(!UV.has)return;
  UV.inspect=!UV.inspect;
  var btn=document.getElementById('uv-inspect-btn');
  if(btn)btn.classList.toggle('on',UV.inspect);
  if(UV.inspect){
    UV.inspectT=0;UV.holding=false;
    if(UV.state==='fire')UV.state='idle';
    if(FL2.inspect)fl2InspectToggle();   // осматриваем только один предмет за раз
  }
}

function updateUV(dt){
  if(!UV.view)return;
  UV.view.visible=UV.has;
  if(!UV.has){if(UV.lamp)UV.lamp.intensity=0;return;}
  if(UV.cool>0)UV.cool-=dt;

  if(UV.inspect){
    // осмотр: не идёт обычная логика заряда/выстрела — зонт просто
    // держится раскрытым, чтобы было видно все детали скина
    UV.inspectT+=dt;
    UV.open=Math.min(1,UV.open+dt*1.8);
  }else if(UV.state==='open'&&UV.holding)UV.open=Math.min(1,UV.open+dt/OPEN_TIME);
  else if(UV.state==='closing'){
    UV.open=Math.max(0,UV.open-dt*2.2);
    if(UV.open<=0)UV.state='idle';
  }else if(UV.state==='fire'){
    UV.fireT+=dt;
    if(UV.fireT>0.35){UV.state='closing';}
  }else if(UV.state==='reload'){
    UV.reloadT+=dt;
    UV.open=Math.max(0,UV.open-dt*1.6);
    if(UV.reloadT>1.6){
      UV.state='idle';UV.loaded=UV.cap;UV.spare--;
      uvHUD();showMsg('Лампа заменена',1.6);sndBeep(950);
    }
  }else if(!UV.holding&&UV.open>0&&UV.state!=='fire'){
    UV.open=Math.max(0,UV.open-dt*2.2);
  }

  // раскрытие зонта
  var sp=0.022+UV.open*0.11;
  UV.petals.forEach(function(pet,i){
    var a=pet.userData.ang;
    pet.position.set(Math.cos(a)*sp,Math.sin(a)*sp,-0.17-UV.open*0.05);
    pet.rotation.z=0;
    pet.rotation.x=Math.sin(a)*UV.open*0.55;
    pet.rotation.y=-Math.cos(a)*UV.open*0.55;
    var lit=(i<UV.loaded)||UV.inspect;
    var glow=lit?(0.5+UV.open*5.5+((UV.state==='fire'||UV.inspect)?14:0)):0.02;
    UV.bulbs[i].material.emissiveIntensity=glow;
    UV.bulbs[i].material.color.setHex(lit?(UV.bulbLitColor||0xbfa8ff):0x3a3540);
  });
  if(UV.view.userData.lens)
    UV.view.userData.lens.material.emissiveIntensity=0.8+UV.open*3+((UV.state==='fire'||UV.inspect)?18:0);

  // молнии скина "Терминатор": ломаные линии от заряженных лепестков
  // к линзе, форма трясётся каждый кадр — дешёвая имитация дугового разряда
  if(UV.bolts&&UV.bolts.length){
    var lensPos=UV.view.userData.lens.position;
    var firing=(UV.state==='fire')||UV.inspect;
    var active=UV.open>0.15||firing;
    UV.bolts.forEach(function(line,i){
      var lit=(i<UV.loaded)||UV.inspect;
      if(!active||!lit){line.material.opacity=0;return;}
      var bulbPos=_uvBoltTmp;
      UV.bulbs[i].getWorldPosition(bulbPos);
      UV.view.worldToLocal(bulbPos);
      var amp=(firing?0.045:0.016)*(0.4+UV.open*0.6);
      var pos=line.geometry.attributes.position.array;
      for(var k=0;k<5;k++){
        var t=k/4;
        var jx=(k>0&&k<4)?(Math.random()-0.5)*amp:0;
        var jy=(k>0&&k<4)?(Math.random()-0.5)*amp:0;
        pos[k*3]  =bulbPos.x+(lensPos.x-bulbPos.x)*t+jx;
        pos[k*3+1]=bulbPos.y+(lensPos.y-bulbPos.y)*t+jy;
        pos[k*3+2]=bulbPos.z+(lensPos.z-bulbPos.z)*t;
      }
      line.geometry.attributes.position.needsUpdate=true;
      line.material.opacity=Math.min(1,(firing?0.9:0.35+UV.open*0.35)*(0.7+Math.random()*0.3));
    });
  }

  // голограмма скина "UV ELITE": кольцо крутится и раздувается,
  // волна рядом дрожит — та же логика активности, что у молний,
  // просто другой рисунок эффекта.
  if(UV.holoRing&&UV.holoWave){
    var eFiring=(UV.state==='fire')||UV.inspect;
    var eActive=UV.open>0.15||eFiring;
    if(!eActive){
      UV.holoRing.material.opacity=0;UV.holoWave.material.opacity=0;
    }else{
      UV.holoRing.rotation.z+=dt*(eFiring?9:3);
      var ringScale=1+Math.sin(performance.now()*0.006)*0.08+(eFiring?0.3:0);
      UV.holoRing.scale.setScalar(ringScale);
      UV.holoRing.material.opacity=Math.min(1,(eFiring?0.9:0.4+UV.open*0.4));
      var wpos=UV.holoWave.geometry.attributes.position.array;
      var amp2=(eFiring?0.05:0.02)*(0.4+UV.open*0.6);
      for(var wk=0;wk<9;wk++){
        wpos[wk*3]  =0.03+wk*0.012;
        wpos[wk*3+1]=0.09+(wk%2?1:-1)*amp2*(0.5+Math.random()*0.5);
        wpos[wk*3+2]=-0.10;
      }
      UV.holoWave.geometry.attributes.position.needsUpdate=true;
      UV.holoWave.material.opacity=Math.min(1,(eFiring?0.9:0.35+UV.open*0.35)*(0.7+Math.random()*0.3));
    }
  }
  if(UV.eliteOrb){
    var pulse=0.5+Math.sin(performance.now()*0.004)*0.5;
    UV.eliteOrb.material.emissiveIntensity=1.0+pulse*0.8+(eFiring?1.2:0);
  }
  if(UV.eliteReflector)
    UV.eliteReflector.material.emissiveIntensity=0.3+UV.open*1.2+(eFiring?1.5:0);

  // свет от пистолета: слабый при раскрытии, мощный в момент выстрела
  var li=UV.open*1.4;
  if(UV.state==='fire')li=16*Math.max(0,1-UV.fireT/0.35);
  UV.lamp.intensity=li;
  if(UV.beam)UV.beam.material.opacity=Math.min(0.09,li*0.012);

  if(UV.inspect){
    // на экран, крупнее, крутится вокруг своей оси — витрина скина
    var it=Math.min(1,UV.inspectT/0.5);
    UV.view.position.set(0.30+(0-0.30)*it,-0.30+(-0.05-(-0.30))*it,-0.52+(-0.42-(-0.52))*it);
    UV.view.rotation.set(0.04+(0-0.04)*it,-0.10+(0-(-0.10))*it+UV.inspectT*1.0,0);
    UV.view.scale.setScalar(1+it*0.7);
  }else{
    UV.view.scale.setScalar(1);
    // при перезарядке ствол уходит вниз
    var rk=(UV.state==='reload')?Math.sin(Math.min(1,UV.reloadT/1.6)*Math.PI):0;
    UV.view.position.set(0.30+HSW.bx+HSW.swayX,-0.30-rk*0.16+HSW.by,-0.52+rk*0.05);
    UV.view.rotation.set(0.04+rk*0.5,-0.10,rk*0.35+HSW.swayX*0.4);
  }
}

// ---------- звуки ----------
function sndUVCharge(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain();
  o.type='sawtooth';
  o.frequency.setValueAtTime(120,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(1500,a.currentTime+OPEN_TIME);
  var f=a.createBiquadFilter();f.type='bandpass';f.Q.value=5;
  f.frequency.setValueAtTime(300,a.currentTime);
  f.frequency.exponentialRampToValueAtTime(2600,a.currentTime+OPEN_TIME);
  g.gain.setValueAtTime(0.0001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.09,a.currentTime+OPEN_TIME*0.9);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+OPEN_TIME+0.25);
  o.connect(f);f.connect(g);g.connect(a.destination);
  o.start();o.stop(a.currentTime+OPEN_TIME+0.3);
  UV.chargeOsc=o;
  // щелчки раскрывающихся лепестков
  for(var i=0;i<5;i++){
    var t=a.currentTime+0.15+i*(OPEN_TIME*0.17);
    var c=a.createOscillator(),cg=a.createGain();
    c.type='square';c.frequency.value=2400+i*260;
    cg.gain.setValueAtTime(0.035,t);
    cg.gain.exponentialRampToValueAtTime(0.0001,t+0.04);
    c.connect(cg);cg.connect(a.destination);c.start(t);c.stop(t+0.05);
  }
}
function sndUVShot(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  // резкий разряд
  var nb=a.createBuffer(1,Math.floor(a.sampleRate*0.5),a.sampleRate),nd=nb.getChannelData(0);
  for(var i=0;i<nd.length;i++){var x=i/a.sampleRate;nd[i]=(Math.random()*2-1)*Math.exp(-x*13);}
  var ns=a.createBufferSource();ns.buffer=nb;
  var hp=a.createBiquadFilter();hp.type='highpass';hp.frequency.value=1800;
  var ng=a.createGain();ng.gain.value=0.30;
  ns.connect(hp);hp.connect(ng);ng.connect(a.destination);ns.start(t0);
  // электрический «взвизг» вверх
  var o=a.createOscillator(),g=a.createGain();
  o.type='square';
  o.frequency.setValueAtTime(900,t0);
  o.frequency.exponentialRampToValueAtTime(5200,t0+0.09);
  o.frequency.exponentialRampToValueAtTime(400,t0+0.5);
  g.gain.setValueAtTime(0.16,t0);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.55);
  o.connect(g);g.connect(a.destination);o.start(t0);o.stop(t0+0.6);
  // низ, чтобы чувствовался удар
  var s=a.createOscillator(),sg=a.createGain();
  s.type='sine';s.frequency.setValueAtTime(180,t0);
  s.frequency.exponentialRampToValueAtTime(40,t0+0.3);
  sg.gain.setValueAtTime(0.4,t0);
  sg.gain.exponentialRampToValueAtTime(0.0001,t0+0.4);
  s.connect(sg);sg.connect(a.destination);s.start(t0);s.stop(t0+0.45);
  // звон стекла — лампа сгорела
  [1,2.4,4.1].forEach(function(r,k){
    var m=a.createOscillator(),mg=a.createGain();
    m.type='sine';m.frequency.value=2600*r;
    mg.gain.setValueAtTime(0.05/(k+1),t0+0.05);
    mg.gain.exponentialRampToValueAtTime(0.0001,t0+0.6+k*0.2);
    m.connect(mg);mg.connect(a.destination);m.start(t0+0.05);m.stop(t0+1.0);
  });
}
// ============================================================
//  СКЛАД С ПЛАКАТОМ: здесь выдают ультрафиолетовый пистолет
// ============================================================
var US={w:30,d:22,h:5.0,on:false,t:0,
        poster:null,gunBox:null,bulbs:[],secrets:[],taken:false};

function texPoster(){
  return makeTex(function(g,s){
    g.fillStyle='#e8dfc8';g.fillRect(0,0,s,s);
    for(var i=0;i<900;i++){
      g.fillStyle='rgba(140,124,96,'+(Math.random()*0.22).toFixed(2)+')';
      g.fillRect(Math.random()*s,Math.random()*s,2,2);
    }
    g.fillStyle='#5a1010';g.fillRect(0,0,s,s*0.16);
    g.fillStyle='#f4ecd8';g.font='bold '+(s*0.085)+'px monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.fillText('УФ-ИЗЛУЧАТЕЛЬ',s/2,s*0.08);
    g.fillStyle='#20201c';g.font='bold '+(s*0.062)+'px monospace';
    g.fillText('ОНИ БОЯТСЯ',s/2,s*0.28);
    g.fillText('УЛЬТРАФИОЛЕТА',s/2,s*0.36);
    // схема пистолета
    g.strokeStyle='#2a2a26';g.lineWidth=3;
    g.beginPath();g.moveTo(s*0.30,s*0.55);g.lineTo(s*0.62,s*0.55);g.stroke();
    for(var k=0;k<5;k++){
      var a=k/5*Math.PI*2;
      g.beginPath();g.moveTo(s*0.62,s*0.55);
      g.lineTo(s*0.62+Math.cos(a)*s*0.10,s*0.55+Math.sin(a)*s*0.10);g.stroke();
      g.fillStyle='#7a4aff';g.beginPath();
      g.arc(s*0.62+Math.cos(a)*s*0.10,s*0.55+Math.sin(a)*s*0.10,s*0.016,0,6.283);g.fill();
    }
    g.fillStyle='#20201c';g.font=(s*0.036)+'px monospace';
    g.fillText('ЗАЖМИ — РАСКРОЕТСЯ',s/2,s*0.74);
    g.fillText('ОТПУСТИ — ВЫСТРЕЛ',s/2,s*0.79);
    g.fillText('5 ЛАМП. МЕНЯЙ ПЕРЕГОРЕВШИЕ.',s/2,s*0.84);
    g.strokeStyle='#8a1010';g.lineWidth=4;g.strokeRect(6,6,s-12,s-12);
  },1);
}
// невидимые надписи: проступают только под ультрафиолетом
var SECRET_TEXTS=['ОНИ НЕ ВСЕГДА БЫЛИ ТАКИМИ',
                  'НЕ ВЕРЬ ВЫВЕСКАМ',
                  'ПОДВАЛ — ЭТО НЕ НИЗ',
                  'Я ТОЖЕ ТУТ РАБОТАЛ'];
function texSecret(txt){
  return makeTex(function(g,s){
    g.clearRect(0,0,s,s);
    g.fillStyle='#c8a0ff';
    g.font='bold '+(s*0.085)+'px monospace';
    g.textAlign='center';g.textBaseline='middle';
    // «от руки»: буквы чуть пляшут
    var ch=txt.split('');
    var w=s*0.055;
    var x0=s/2-(ch.length-1)*w/2;
    ch.forEach(function(c,i){
      g.save();
      g.translate(x0+i*w,s/2+Math.sin(i*1.7)*s*0.02);
      g.rotate((Math.random()-0.5)*0.16);
      g.fillText(c,0,0);
      g.restore();
    });
  },1);
}
function makeBulbPickup(){
  var g=new THREE.Group();
  var b=new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),
    new THREE.MeshStandardMaterial({color:0xbfa8ff,emissive:0x7a4aff,
      emissiveIntensity:2.0,roughness:0.25}));
  b.position.y=0.16;g.add(b);
  var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.045,0.07,8),MATS.metal);
  cap.position.y=0.06;g.add(cap);
  var pl=new THREE.PointLight(0x8a5cff,0.6,2.4);pl.position.y=0.16;g.add(pl);
  return g;
}

function buildUVStore(){
  clearScene();walls=[];LAMPS=[];US.bulbs=[];US.secrets=[];US.taken=false;
  var W2=US.w,D2=US.d,HH=US.h;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  LAMPS.push([6,HH-0.8,5,0xffd0a0,10,0.35]);
  LAMPS.push([W2-7,HH-0.8,D2-6,0xffd0a0,10,0.30]);

  for(var r=0;r<3;r++){
    var zz=6+r*5.5;
    var rack=new THREE.Mesh(new THREE.BoxGeometry(12,3.0,1.0),
      new THREE.MeshStandardMaterial({color:0x4a463f,roughness:0.85,metalness:0.2}));
    rack.position.set(9,1.5,zz);addObj(rack);
    solid(2.9,zz-0.6,15.1,zz+0.6);
  }
  for(var i=0;i<16;i++){
    var cx=2+Math.random()*(W2-4),cz=2+Math.random()*(D2-4);
    if(Math.hypot(cx-3.0,cz-2.5)<4)continue;
    var h2=0.5+Math.random()*0.7;
    var cr=new THREE.Mesh(new THREE.BoxGeometry(0.9,h2,0.9),
      new THREE.MeshStandardMaterial({color:0x5a4a38,roughness:0.95,map:TEX.wood}));
    cr.position.set(cx,h2/2,cz);addObj(cr);
    solid(cx-0.5,cz-0.5,cx+0.5,cz+0.5);
  }
  // ---- ПЛАКАТ ----
  US.poster=new THREE.Mesh(new THREE.PlaneGeometry(2.6,2.6),
    new THREE.MeshStandardMaterial({map:texPoster(),roughness:0.85,
      emissive:0x221c14,emissiveIntensity:0.5}));
  US.poster.position.set(W2-0.35,2.2,7.0);US.poster.rotation.y=-Math.PI/2;
  addObj(US.poster);
  LAMPS.push([W2-2.0,3.4,7.0,0xffe0b0,6,0.55]);
  US.posterAt={x:W2-1.8,z:7.0};
  // ---- ЯЩИК С ПИСТОЛЕТОМ ----
  var bx=new THREE.Group();
  var base=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.5,0.7),
    new THREE.MeshStandardMaterial({color:0x2a2f36,roughness:0.5,metalness:0.6}));
  base.position.y=0.25;bx.add(base);
  var lid=new THREE.Mesh(new THREE.BoxGeometry(1.12,0.09,0.72),
    new THREE.MeshStandardMaterial({color:0x3a4048,roughness:0.45,metalness:0.65}));
  lid.position.y=0.53;bx.add(lid);
  var glow=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.16),
    new THREE.MeshStandardMaterial({color:0x7a4aff,emissive:0x7a4aff,emissiveIntensity:2.5}));
  glow.position.set(0,0.35,0.36);bx.add(glow);
  bx.position.set(W2-2.6,0,7.0);addObj(bx);
  solid(W2-3.2,6.5,W2-2.0,7.5);
  US.gunBox=bx;US.gunAt={x:W2-2.6,z:7.0};
  var gp=new THREE.PointLight(0x8a5cff,0.9,4);gp.position.set(W2-2.6,0.7,7.0);addObj(gp);
  // ---- ЗАПАСНЫЕ ЛАМПЫ ----
  [[3.5,4.0],[17.0,3.0],[5.0,18.0],[22.0,16.0],[12.0,12.0],[26.0,19.0]].forEach(function(s){
    var g=makeBulbPickup();g.position.set(s[0],0,s[1]);addObj(g);
    US.bulbs.push({x:s[0],z:s[1],g:g,taken:false});
  });
  // ---- ТАЙНЫЕ НАДПИСИ ----
  [[1.0,5.0,Math.PI/2,0],[1.0,15.0,Math.PI/2,1],
   [W2/2,0.35,0,2],[W2/2,D2-0.35,Math.PI,3]].forEach(function(s){
    var m=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),
      new THREE.MeshBasicMaterial({map:texSecret(SECRET_TEXTS[s[3]]),transparent:true,
        opacity:0,depthWrite:false}));
    m.position.set(s[0],2.0,s[1]);m.rotation.y=s[2];
    addObj(m);US.secrets.push({m:m,x:s[0],z:s[1],seen:false,fade:0});
  });
  scene.fog=new THREE.FogExp2(0x07070a,0.070);
  ambientLight.intensity=0.06;ambientLight.color.setHex(0xfff2e0);sunLight.intensity=0;
}

function startUVStore(){
  PHASE='uvstore';
  saveAt('uvstore');
  US.on=true;US.t=0;
  P.x=3.0;P.z=2.5;P.y=0;P.vy=0;P.pitch=0;
  P.yaw=Math.atan2(-(US.w-2.6-P.x),-(7.0-P.z));
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();
  document.getElementById('batwrap').style.display=FL2.has?'block':'none';
  document.getElementById('bfl').style.display=FL2.has?'flex':'none';
  uvHUD();
  document.getElementById('black').style.transition='opacity 1.6s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Ещё один склад. Сколько их тут.',3.0);sayE('Ещё один склад. Сколько их тут.');},2200);
  setTimeout(function(){showMsg('Там что-то светится фиолетовым',3.2);},6200);
  setTimeout(function(){questShow('Найдите УФ-излучатель','Он светится фиолетовым');},6400);
}

function updateUVStore(dt){
  if(!US.on)return;
  US.t+=dt;
  if(typeof updateHunt==='function')updateHunt(dt);
  US.bulbs.forEach(function(b){
    if(b.taken)return;
    b.g.rotation.y+=dt*1.5;
    b.g.position.y=Math.sin(US.t*2.3+b.x)*0.04;
  });
  // тайные надписи медленно гаснут
  US.secrets.forEach(function(s){
    if(s.fade>0){
      s.fade=Math.max(0,s.fade-dt*0.28);
      s.m.material.opacity=Math.min(1,s.fade);
    }
  });
  usNear();
}
function revealSecrets(){
  var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);
  var found=0;
  US.secrets.forEach(function(s){
    var dx=s.x-P.x,dz=s.z-P.z,d=Math.hypot(dx,dz);
    if(d>13)return;
    var dot=(dx/d)*fx+(dz/d)*fz;
    if(dot<0.35)return;                      // должна быть перед нами
    s.fade=3.2;
    if(!s.seen){s.seen=true;found++;}
  });
  if(found>0){
    showMsg('Надпись проступила',2.6);
    say('Тут что-то написано.',0.85,0.55);
  }
}
function scareMobsUV(){
  // на этом складе их пока нет, но механика уже готова
  if(typeof WH!=='undefined'&&WH.mobs)WH.mobs.forEach(function(m){m.alert=0;});
}

var nUs=null;
function usNear(){
  nUs=null;
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  if(typeof huntNear==='function'&&HN.armed){
    var hh=huntNear();
    if(hh){
      nUs={t:'hunt',h:hh};
      setPrompt({ladder:'🪜 ВЗЯТЬ ЛЕСТНИЦУ — E',driver:'🪛 ВЗЯТЬ ОТВЁРТКУ — E',
                 place:'🪜 ПРИСТАВИТЬ ЛЕСТНИЦУ — E',unscrew:'🪛 ОТКРУТИТЬ РЕШЁТКУ — E',
                 climb:'⬆ ЗАЛЕЗТЬ В ВЕНТИЛЯЦИЮ — E'}[hh.t],true);
      return;
    }
  }
  if(!US.taken&&d2(US.gunAt.x,US.gunAt.z)<1.8){
    nUs={t:'gun'};setPrompt('🔫 ВЗЯТЬ УФ-ИЗЛУЧАТЕЛЬ — E',true);return;
  }
  if(d2(US.posterAt.x,US.posterAt.z)<2.2){
    nUs={t:'poster'};setPrompt('📄 ПРОЧИТАТЬ ПЛАКАТ — E',true);return;
  }
  for(var i=0;i<US.bulbs.length;i++){
    var b=US.bulbs[i];
    if(!b.taken&&d2(b.x,b.z)<1.3){
      nUs={t:'bulb',i:i};setPrompt('💡 ВЗЯТЬ ЛАМПУ — E',true);return;
    }
  }
  setPrompt('',false);
}
function usAct(){
  if(!nUs)return;
  if(nUs.t==='hunt'){huntAct(nUs.h);return;}
  if(nUs.t==='gun'){
    US.taken=true;UV.has=true;UV.loaded=UV.cap;UV.spare=0;questDone();
    if(US.gunBox)US.gunBox.visible=false;
    uvHUD();sndPickup();
    document.getElementById('buv').style.display='flex';
    document.getElementById('brel').style.display='flex';
    showSub('Вы','Вот он. УФ-излучатель.',2.8);sayE('Вот он. УФ-излучатель.');
    setTimeout(function(){showMsg('Зажми 🔫 — раскроется. Отпусти — выстрел.',4.0);},3000);
    setTimeout(huntSetup,6500);        // дальше начинается поиск и ожидание гостя
  }
  else if(nUs.t==='poster'){
    showSub('Плакат','«Они боятся ультрафиолета. 5 ламп. Меняй перегоревшие.»',4.4);
  }
  else if(nUs.t==='bulb'){
    var b=US.bulbs[nUs.i];
    b.taken=true;b.g.visible=false;UV.spare++;
    uvHUD();sndPickup();showMsg('Запасная лампа: '+UV.spare,1.8);
  }
}
// ============================================================
//  СКЛАД: через 200 секунд после пистолета приходит Мебельщик
//  Он слышит, но не видит. Ищем лестницу и отвёртку.
// ============================================================
var HN={armed:false,t:0,came:false,mob:null,alert:0,
        ladder:null,driver:null,hasLadder:false,hasDriver:false,
        vent:null,ventOpen:false,placed:false,stage:0};
var HN_DELAY=200;      // столько секунд спокойствия после находки пистолета

function glowWhite(mesh){
  var pl=new THREE.PointLight(0xffffff,0.9,3.2);
  pl.position.y=0.35;mesh.add(pl);
  return mesh;
}
function makeLadder(){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:0xdfe4ea,roughness:0.35,metalness:0.55,
    emissive:0x8a94a4,emissiveIntensity:1.1});
  [-0.25,0.25].forEach(function(sx){
    var r=new THREE.Mesh(new THREE.BoxGeometry(0.07,3.2,0.07),m);
    r.position.set(sx,1.6,0);g.add(r);
  });
  for(var i=0;i<9;i++){
    var st=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.05,0.05),m);
    st.position.set(0,0.3+i*0.35,0);g.add(st);
  }
  g.rotation.z=0.12;
  return glowWhite(g);
}
function makeDriver(){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:0xe8ecf2,roughness:0.3,metalness:0.7,
    emissive:0x9aa4b4,emissiveIntensity:1.2});
  var rod=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.26,8),m);
  rod.position.y=0.20;g.add(rod);
  var tip=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.05,0.012),m);
  tip.position.y=0.06;g.add(tip);
  var hand=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.038,0.14,10),
    new THREE.MeshStandardMaterial({color:0xd83a3a,roughness:0.55,
      emissive:0x7a1a1a,emissiveIntensity:0.9}));
  hand.position.y=0.40;g.add(hand);
  return glowWhite(g);
}

function huntSetup(){
  // раскладываем предметы по складу
  HN.ladder=makeLadder();
  HN.ladder.position.set(6.0,0,16.5);addObj(HN.ladder);
  HN.ladderAt={x:6.0,z:16.5};
  HN.driver=makeDriver();
  HN.driver.position.set(24.0,0.7,4.5);addObj(HN.driver);
  HN.driverAt={x:24.0,z:4.5};
  // вентиляция высоко на стене — без лестницы не достать
  var vg=new THREE.Group();
  var fr=new THREE.Mesh(new THREE.BoxGeometry(1.3,1.0,0.1),MATS.metal);vg.add(fr);
  for(var i=0;i<6;i++){
    var sl=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.07,0.06),MATS.dark);
    sl.position.set(0,-0.38+i*0.15,0.06);vg.add(sl);
  }
  [[-0.56,-0.42],[0.56,-0.42],[-0.56,0.42],[0.56,0.42]].forEach(function(q){
    var sc=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.07,6),MATS.metal);
    sc.rotation.x=Math.PI/2;sc.position.set(q[0],q[1],0.07);vg.add(sc);
  });
  vg.position.set(US.w/2,3.3,0.3);addObj(vg);
  HN.vent=vg;HN.ventAt={x:US.w/2,z:1.5};
  HN.armed=true;HN.t=0;HN.came=false;HN.stage=1;
  HN.hasLadder=false;HN.hasDriver=false;HN.placed=false;HN.ventOpen=false;
  questShow('Найдите лестницу и отвёртку','Оба предмета светятся белым');
}

function huntArrive(){
  HN.came=true;
  // ГРОХОТ и он входит
  sndCrash();sndDread();
  var wh=document.getElementById('white');
  if(wh){wh.style.transition='none';wh.style.opacity='0.5';
    setTimeout(function(){wh.style.transition='opacity 0.6s';wh.style.opacity='0';},60);}
  HN.mob=createBossMesh();
  HN.mob.position.set(US.w-1.5,0,US.d-1.5);
  scene.add(HN.mob);objs.push(HN.mob);
  HN.mx=US.w-1.5;HN.mz=US.d-1.5;HN.alert=0;HN.tx=HN.mx;HN.tz=HN.mz;HN.wait=0;
  setTimeout(function(){
    showSub('Мебельщик','Я чую. Я думал, он здесь.',3.6);
    sayE('Я чую. Я думал, он здесь.');
  },900);
  setTimeout(function(){showMsg('Он слышит. Иди сидя.',3.0);},4600);
}

function huntNoise(){
  var mag=Math.hypot(jmx,jmy);
  var kb=(K['KeyW']||K['KeyS']||K['KeyA']||K['KeyD'])?1:0;
  var moving=Math.max(mag,kb)>0.08;
  var run=mRun||K['ShiftLeft']||K['ShiftRight'];
  var cr=mCrouch||K['ControlLeft']||K['ControlRight'];
  if(!moving)return 0.02;
  if(cr)return 0.12;
  if(run)return 1.0;
  return 0.5;
}

function updateHunt(dt){
  if(!HN.armed)return;
  HN.t+=dt;
  if(!HN.came&&HN.t>=HN_DELAY)huntArrive();
  if(HN.ladder&&!HN.hasLadder){
    HN.ladder.rotation.y+=dt*0.7;
    HN.ladder.position.y=Math.sin(HN.t*1.7)*0.04;
  }
  if(HN.driver&&!HN.hasDriver){
    HN.driver.rotation.y+=dt*1.5;
    HN.driver.position.y=0.7+Math.sin(HN.t*2.2)*0.04;
  }
  if(!HN.came)return;

  // ---- он ходит и слушает ----
  var noise=huntNoise();
  var dx=P.x-HN.mx,dz=P.z-HN.mz,d=Math.hypot(dx,dz)||0.001;
  var hearR=1.5+noise*17;
  if(d<hearR)HN.alert+=dt*(0.4+noise*1.7)*(1-d/hearR);
  HN.alert-=dt*0.26;
  if(HN.alert<0)HN.alert=0;
  if(HN.alert>1.5)HN.alert=1.5;
  var spd;
  if(HN.alert>=1.0){spd=0.048;HN.tx=P.x;HN.tz=P.z;}
  else if(HN.alert>=0.45){spd=0.028;if(HN.wait<=0){HN.tx=P.x;HN.tz=P.z;HN.wait=1.5;}}
  else{
    spd=0.017;HN.wait-=dt;
    if(HN.wait<=0){
      HN.tx=2+Math.random()*(US.w-4);HN.tz=2+Math.random()*(US.d-4);
      HN.wait=4+Math.random()*5;
    }
  }
  HN.wait-=dt;
  var tdx=HN.tx-HN.mx,tdz=HN.tz-HN.mz,td=Math.hypot(tdx,tdz)||1;
  var nx=HN.mx+tdx/td*spd,nz=HN.mz+tdz/td*spd;
  if(!blocked(nx,HN.mz,0.5))HN.mx=nx;
  if(!blocked(HN.mx,nz,0.5))HN.mz=nz;
  HN.mob.position.set(HN.mx,0,HN.mz);
  HN.mob.rotation.y=Math.atan2(tdx,tdz);
  if(window.ADMIN)HN.mob.scale.setScalar(ADMIN.mobScale());
  var e=HN.alert>=1?7:(HN.alert>=0.45?3.5:1.2);
  HN.mob.children.forEach(function(c){
    if(c.material&&c.material.emissiveIntensity!==undefined)c.material.emissiveIntensity=e;
  });
  var dmg=document.getElementById('dmg');
  if(dmg)dmg.style.opacity=HN.alert>0.4?Math.min(0.8,(HN.alert-0.4)*0.9).toFixed(2):'0';
  if(d<0.95*(window.ADMIN?ADMIN.mobScale():1)&&HN.alert>=1.0)huntCaught();
}
function huntCaught(){
  if(window.ADMIN&&ADMIN.god)return;
  HN.armed=false;dead=true;US.on=false;
  document.getElementById('dmg').style.opacity='1';
  addShake(0.30);
  sndScare();
  setTimeout(function(){
    document.getElementById('endtitle').style.color='#c02020';
    document.getElementById('endtitle').textContent='ОН УСЛЫШАЛ';
    document.getElementById('endsub').textContent='Надо было идти тише.';
    updateEndScreen();document.getElementById('endscreen').style.display='flex';
  },800);
}

// ---- взаимодействие ----
function huntNear(){
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  if(!HN.hasLadder&&d2(HN.ladderAt.x,HN.ladderAt.z)<1.6)return {t:'ladder'};
  if(!HN.hasDriver&&d2(HN.driverAt.x,HN.driverAt.z)<1.6)return {t:'driver'};
  if(HN.hasLadder&&!HN.placed&&d2(HN.ventAt.x,HN.ventAt.z)<2.2)return {t:'place'};
  if(HN.placed&&!HN.ventOpen&&HN.hasDriver&&d2(HN.ventAt.x,HN.ventAt.z)<2.2)return {t:'unscrew'};
  if(HN.ventOpen&&d2(HN.ventAt.x,HN.ventAt.z)<2.2)return {t:'climb'};
  return null;
}
function huntAct(n){
  if(n.t==='ladder'){
    HN.hasLadder=true;HN.ladder.visible=false;sndPickup();
    showMsg('Лестница',1.6);huntCheck();
  }
  else if(n.t==='driver'){
    HN.hasDriver=true;HN.driver.visible=false;sndPickup();
    showMsg('Отвёртка',1.6);huntCheck();
  }
  else if(n.t==='place'){
    HN.placed=true;
    HN.ladder.visible=true;HN.ladder.rotation.set(0,0,0.10);
    HN.ladder.position.set(HN.ventAt.x-0.35,0,HN.ventAt.z-0.4);
    sndCreak();showMsg('Лестница приставлена',2.0);
  }
  else if(n.t==='unscrew'){
    HN.ventOpen=true;
    if(HN.vent){HN.vent.rotation.z=0.55;HN.vent.position.y=2.9;}
    sndCreak();questDone();
    showSub('Вы','Открутил. Лезу.',2.2);sayE('Открутил. Лезу.');
    setTimeout(function(){questShow('Заберитесь в вентиляцию');},2100);
  }
  else if(n.t==='climb'){
    HN.armed=false;US.on=false;questDone();
    // лестница падает с грохотом
    setTimeout(function(){
      if(HN.ladder){HN.ladder.rotation.z=1.5;HN.ladder.position.y=0.1;}
      sndCrash();
      showSub('Вы','Лестница!.. Обратно уже не выйти.',3.0);sayE('Лестница!.. Обратно уже не выйти.');
    },700);
    document.getElementById('black').style.transition='opacity 1.4s';
    setTimeout(function(){document.getElementById('black').style.opacity='1';},1600);
    setTimeout(function(){startStation();},3200);
  }
}
function huntCheck(){
  if(HN.stage===1&&HN.hasLadder&&HN.hasDriver){
    HN.stage=2;questDone();
    setTimeout(function(){
      questShow('Приставьте лестницу к вентиляции и открутите её','Вентиляция высоко на дальней стене');
    },2100);
  }
}
// ============================================================
//  СТАНЦИЯ В ГОРЕ И ВАГОНЕТКА
// ============================================================
var ST={on:false,t:0,cart:null,doors:[],boarded:false};

function buildStation(){
  clearScene();walls=[];LAMPS=[];
  var W2=20,D2=16,HH=6.0;
  setBounds(0,0,W2,D2);
  // грубый камень
  var rock=new THREE.MeshStandardMaterial({color:0x4a4038,roughness:1.0,
    map:TEX.wallClean,bumpMap:TEX.wallClean,bumpScale:0.12});
  TEX.wallClean.repeat.set(W2/3,HH/3);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),rock);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  box(W2,HH,0.4,rock,W2/2,HH/2,0);
  box(W2,HH,0.4,rock,W2/2,HH/2,D2);
  box(0.4,HH,D2,rock,0,HH/2,D2/2);
  box(0.4,HH,D2,rock,W2,HH/2,D2/2);
  // «гора» — наваленные глыбы
  for(var i=0;i<26;i++){
    var s=0.8+Math.random()*2.2;
    var b=new THREE.Mesh(new THREE.BoxGeometry(s,s*0.8,s),rock);
    b.position.set(1+Math.random()*(W2-2),s*0.3,D2-1-Math.random()*4);
    b.rotation.set(Math.random(),Math.random()*3,Math.random());addObj(b);
  }
  // рельсы уходят в тоннель
  for(var z=D2-3;z>-1;z-=1.2){
    [-0.6,0.6].forEach(function(sx){
      var r=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,1.1),MATS.metal);
      r.position.set(W2/2+sx,0.05,z);addObj(r);
    });
    var tie=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.07,0.22),MATS.wood);
    tie.position.set(W2/2,0.03,z);addObj(tie);
  }
  // тоннель
  var tun=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,3,14,1,true),rock);
  tun.rotation.x=Math.PI/2;tun.position.set(W2/2,2.2,-0.5);addObj(tun);
  // ВАГОНЕТКА
  var c=new THREE.Group();
  var body=new THREE.Mesh(new THREE.BoxGeometry(2.0,1.5,3.0),
    new THREE.MeshStandardMaterial({color:0x6a4a2a,roughness:0.7,metalness:0.4}));
  body.position.y=1.1;c.add(body);
  var win=new THREE.Mesh(new THREE.BoxGeometry(1.85,0.6,0.06),
    new THREE.MeshStandardMaterial({color:0x101418,roughness:0.3,metalness:0.6}));
  win.position.set(0,1.5,1.53);c.add(win);
  ST.doors=[];
  [-1,1].forEach(function(s){
    var dr=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.4,0.08),
      new THREE.MeshStandardMaterial({color:0x8a6a3a,roughness:0.6,metalness:0.4}));
    dr.position.set(s*0.48,1.05,-1.53);c.add(dr);ST.doors.push(dr);
  });
  [[-0.85,1.0],[0.85,1.0],[-0.85,-1.0],[0.85,-1.0]].forEach(function(q){
    var wh=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.16,10),
      new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.8,metalness:0.6}));
    wh.rotation.z=Math.PI/2;wh.position.set(q[0],0.32,q[1]);c.add(wh);
  });
  var lamp=new THREE.Mesh(new THREE.CircleGeometry(0.16,12),
    new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xffd090,emissiveIntensity:3.5}));
  lamp.position.set(0,1.6,1.56);c.add(lamp);
  c.position.set(W2/2,0,D2/2+1.5);addObj(c);
  ST.cart=c;ST.cartAt={x:W2/2,z:D2/2+1.5};
  solid(W2/2-1.2,D2/2+0.2,W2/2+1.2,D2/2+2.8);
  LAMPS.push([W2/2,HH-1.2,D2/2+4,0xffd0a0,14,0.5]);
  LAMPS.push([W2/2,3.0,1.5,0xbfd8ff,10,0.45]);
  scene.fog=new THREE.FogExp2(0x0a0a0c,0.055);
  ambientLight.intensity=0.10;ambientLight.color.setHex(0xdfe4f0);sunLight.intensity=0;
}
function startStation(){
  PHASE='station';buildStation();
  saveAt('station');
  P.x=10;P.z=13.5;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;ST.on=true;ST.t=0;ST.boarded=false;
  mCrouch=false;syncBtn('bcrouch',false);
  document.getElementById('black').style.transition='opacity 1.8s';
  document.getElementById('black').style.opacity='0';
  document.getElementById('dmg').style.opacity='0';
  questHide();
  setTimeout(function(){showSub('Вы','Это что, станция? Внутри горы?',3.2);sayE('Это что, станция? Внутри горы?');},2400);
  setTimeout(function(){questShow('Сядьте в вагонетку');},5600);
}
function updateStation(dt){
  if(!ST.on)return;
  ST.t+=dt;
  stNear();
}
var nSt=null;
function stNear(){
  nSt=null;
  if(Math.hypot(P.x-ST.cartAt.x,P.z-ST.cartAt.z)<2.6){
    nSt='cart';setPrompt('🚃 СЕСТЬ В ВАГОНЕТКУ — E',true);return;
  }
  setPrompt('',false);
}
function stAct(){
  if(nSt!=='cart'||ST.boarded)return;
  ST.boarded=true;ST.on=false;questDone();
  setPrompt('',false);
  showSub('Вы','Поехали.',1.8);sayE('Поехали.');
  // двери закрываются
  var t0=performance.now();
  (function close(){
    var k=Math.min(1,(performance.now()-t0)/1200);
    ST.doors[0].position.x=-0.48+k*0.44;
    ST.doors[1].position.x= 0.48-k*0.44;
    if(k<1)requestAnimationFrame(close);
    else{
      sndCreak();
      document.getElementById('black').style.transition='opacity 1.2s';
      document.getElementById('black').style.opacity='1';
      setTimeout(function(){startLoading(buildDome,startDome);},1400);
    }
  })();
}
// ============================================================
//  ДОМА В КУПОЛЕ
//  Купол становится хабом: у каждого дома имя, нужный светится
//  белым, внутрь заходим по заданию.
// ============================================================
var HS={
  cur:0,          // индекс текущей цели
  list:[
    {id:'toys',   name:'ДОМ ИГРУШЕК', open:true,
     task:'Пойдите в дом игрушек', hint:'Он светится белым'},
    {id:'uv',     name:'УФ-ДОМ',       open:true,
     task:'Пойдите в УФ-дом',     hint:'Там видно только через ультрафиолет'}
    // ШКОЛА, СТОЛОВАЯ и МЕДПУНКТ появятся здесь, когда будут построены.
    // Держать их в списке нельзя: тогда шнуров нужно больше, чем можно достать,
    // и тронный зал становится недосягаем.
  ],
  done:{},        // пройденные дома
  meshes:[],      // домики в куполе
  labels:[]
};
var DECOR_NAMES=['ШКОЛА','СТОЛОВАЯ','МЕДПУНКТ','ПРАЧЕЧНАЯ','КОТЕЛЬНАЯ','АРХИВ','ДУШЕВЫЕ','КЛАДОВАЯ'];

function texSign(txt,bright){
  return makeTex(function(g,s){
    g.fillStyle=bright?'#f4efdf':'#2a2620';g.fillRect(0,0,s,s);
    g.strokeStyle=bright?'#8a7a50':'#4a443a';g.lineWidth=6;g.strokeRect(5,5,s-10,s-10);
    g.fillStyle=bright?'#20201c':'#8a8478';
    var size=txt.length>10?s*0.105:s*0.135;
    g.font='bold '+size+'px monospace';
    g.textAlign='center';g.textBaseline='middle';
    var words=txt.split(' ');
    if(words.length>1){
      g.fillText(words[0],s/2,s*0.42);
      g.fillText(words.slice(1).join(' '),s/2,s*0.60);
    } else g.fillText(txt,s/2,s/2);
    for(var i=0;i<260;i++){
      g.fillStyle='rgba(60,54,44,'+(Math.random()*0.18).toFixed(2)+')';
      g.fillRect(Math.random()*s,Math.random()*s,2,2);
    }
  },1);
}

// строим домики по кругу — 4 сюжетных и 6 для вида
function buildHouses(R){
  HS.meshes=[];HS.labels=[];
  var total=10;
  for(var i=0;i<total;i++){
    var a=i/total*Math.PI*2;
    var hx=Math.cos(a)*(R*0.72),hz=Math.sin(a)*(R*0.72);
    var story=i<HS.list.length;
    var name=story?HS.list[i].name:DECOR_NAMES[(i-HS.list.length)%DECOR_NAMES.length];
    var col=new THREE.Color().setHSL(i/total,0.45,story?0.58:0.40);
    var g=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(3.0,2.5,3.0),
      new THREE.MeshStandardMaterial({color:col,roughness:0.85}));
    body.position.y=1.25;g.add(body);
    var roof=new THREE.Mesh(new THREE.ConeGeometry(2.4,1.5,4),
      new THREE.MeshStandardMaterial({color:story?0xb04030:0x6a4038,roughness:0.85}));
    roof.position.y=3.25;roof.rotation.y=Math.PI/4;g.add(roof);
    // дверь
    var door=new THREE.Mesh(new THREE.BoxGeometry(1.0,1.9,0.12),
      new THREE.MeshStandardMaterial({color:0x4a3524,roughness:0.8}));
    door.position.set(0,0.95,1.52);g.add(door);
    // табличка с названием
    var sign=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.9),
      new THREE.MeshStandardMaterial({map:texSign(name,story),roughness:0.85}));
    sign.position.set(0,2.45,1.55);g.add(sign);
    // окошки
    [-0.85,0.85].forEach(function(sx){
      var w=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.7),
        new THREE.MeshStandardMaterial({color:0x1a1e26,roughness:0.4,
          emissive:story?0x2a3a4a:0x101418,emissiveIntensity:0.6}));
      w.position.set(sx,1.4,1.53);g.add(w);
    });
    g.position.set(hx,0,hz);g.rotation.y=-a+Math.PI/2;
    addObj(g);
    solid(hx-1.7,hz-1.7,hx+1.7,hz+1.7);
    var rec={g:g,x:hx,z:hz,story:story,idx:i,name:name,
             id:story?HS.list[i].id:null,glow:null};
    if(story){
      var gl=new THREE.PointLight(0xffffff,0,7);
      gl.position.set(hx,3.4,hz);addObj(gl);rec.glow=gl;
      rec.body=body;rec.roof=roof;
    }
    HS.meshes.push(rec);
  }
}

function houseTarget(){
  return HS.cur<HS.list.length?HS.list[HS.cur]:null;
}
function updateHouses(dt,t){
  var tgt=houseTarget();
  HS.meshes.forEach(function(m){
    if(!m.story||!m.glow)return;
    var isTarget=tgt&&m.id===tgt.id&&!HS.done[m.id];
    var want=isTarget?(1.6+Math.sin(t*2.2)*0.6):0;
    m.glow.intensity+=(want-m.glow.intensity)*Math.min(1,dt*4);
    if(m.body&&m.body.material.emissive){
      m.body.material.emissive.setHex(isTarget?0x8a8a8a:0x000000);
      m.body.material.emissiveIntensity=isTarget?(0.35+Math.sin(t*2.2)*0.15):0;
    }
  });
}
function houseNear(){
  for(var i=0;i<HS.meshes.length;i++){
    var m=HS.meshes[i];
    var d=Math.hypot(P.x-m.x,P.z-m.z);
    if(d<2.9){
      if(!m.story)return {t:'locked',name:m.name};
      if(HS.done[m.id])return {t:'done',name:m.name};
      var tgt=houseTarget();
      if(tgt&&m.id===tgt.id)return {t:'enter',id:m.id,name:m.name};
      return {t:'notyet',name:m.name};
    }
  }
  return null;
}
function houseAct(n){
  if(n.t==='locked'){showMsg(n.name+' — заперто',1.8);return;}
  if(n.t==='done'){showMsg(n.name+' — уже пройдено',1.8);return;}
  if(n.t==='notyet'){showMsg('Сначала — '+houseTarget().name,2.2);return;}
  if(n.t==='enter'){
    DM.on=false;questDone();
    document.getElementById('black').style.transition='opacity 0.8s';
    document.getElementById('black').style.opacity='1';
    var id=n.id;
    setTimeout(function(){ enterHouse(id); },900);
  }
}
function houseComplete(id){
  HS.done[id]=true;
  HS.cur++;
  document.getElementById('black').style.transition='opacity 0.8s';
  document.getElementById('black').style.opacity='1';
  setTimeout(function(){
    buildDome();          // БЕЗ этого игрок оказывался в координатах купола,
    startDome(true);      // но внутри геометрии дома — и проваливался за карту
    var tgt=houseTarget();
    setTimeout(function(){
      if(tgt)questShow(tgt.task,tgt.hint);
      else{
        questShow('Вернитесь в центр купола','Все дома пройдены');
      }
    },2200);
  },900);
}
// ============================================================
//  ШНУРЫ: в каждом пройденном доме включается электричество.
//  Оттуда надо донести шнур до центра купола и воткнуть.
// ============================================================
var CORD={carrying:null,plugged:0,need:2,   // ровно столько домов сейчас построено
          mesh:null,view:null,hub:null};

function makeCordCoil(col){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:col,roughness:0.55,
    emissive:col,emissiveIntensity:0.5});
  for(var i=0;i<5;i++){
    var r=new THREE.Mesh(new THREE.TorusGeometry(0.26-i*0.03,0.045,7,16),m);
    r.rotation.x=Math.PI/2;r.position.y=0.06+i*0.055;g.add(r);
  }
  var plug=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.10,0.18),
    new THREE.MeshStandardMaterial({color:0x2a2a30,roughness:0.5,metalness:0.5}));
  plug.position.set(0.30,0.10,0);g.add(plug);
  var pl=new THREE.PointLight(col,0.8,3.0);pl.position.y=0.2;g.add(pl);
  return g;
}
// шнур в руках — видно, что несём
function makeCordView(col){
  var g=new THREE.Group();
  var m=new THREE.MeshStandardMaterial({color:col,roughness:0.5,
    emissive:col,emissiveIntensity:0.7});
  for(var i=0;i<3;i++){
    var r=new THREE.Mesh(new THREE.TorusGeometry(0.09-i*0.014,0.018,6,12),m);
    r.rotation.x=Math.PI/2;r.position.set(0,0.014*i,0);g.add(r);
  }
  g.position.set(-0.30,-0.44,-0.46);
  g.rotation.set(0.3,0,0.2);
  return g;
}
function cordSpawn(col,x,z){
  CORD.mesh=makeCordCoil(col);
  CORD.mesh.position.set(x,0,z);
  addObj(CORD.mesh);
  CORD.at={x:x,z:z,col:col};
}
function cordTake(){
  CORD.carrying=CORD.at.col;
  if(CORD.mesh){scene.remove(CORD.mesh);CORD.mesh=null;}
  if(!CORD.view){CORD.view=makeCordView(CORD.carrying);camera.add(CORD.view);}
  CORD.view.visible=true;
  CORD.view.children.forEach(function(c){
    if(c.material){c.material.color.setHex(CORD.carrying);c.material.emissive.setHex(CORD.carrying);}
  });
  sndPickup();
  showSub('Вы','Шнур. Надо дотащить его до центра.',3.0);sayE('Шнур. Надо дотащить его до центра.');
  questShow('Донесите шнур в центр купола','Он питает сердце приюта');
}
// узел в центре купола
function buildCordHub(){
  var g=new THREE.Group();
  for(var i=0;i<CORD.need;i++){
    var a=i/CORD.need*Math.PI*2;
    var soc=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.30,0.16),
      new THREE.MeshStandardMaterial({color:0x22262c,roughness:0.5,metalness:0.55}));
    soc.position.set(Math.cos(a)*1.45,0.9,Math.sin(a)*1.45);
    soc.rotation.y=-a;g.add(soc);
    var led=new THREE.Mesh(new THREE.PlaneGeometry(0.11,0.05),
      new THREE.MeshStandardMaterial({color:0x200,emissive:0xcc2020,emissiveIntensity:1.6}));
    led.position.set(Math.cos(a)*1.54,1.02,Math.sin(a)*1.54);
    led.rotation.y=-a+Math.PI/2;g.add(led);
    g.userData['led'+i]=led;
  }
  addObj(g);CORD.hub=g;
  cordHubRefresh();
}
function cordHubRefresh(){
  if(!CORD.hub)return;
  for(var i=0;i<CORD.need;i++){
    var led=CORD.hub.userData['led'+i];
    if(!led)continue;
    var on=i<CORD.plugged;
    led.material.emissive.setHex(on?0x20cc40:0xcc2020);
    led.material.emissiveIntensity=on?2.4:1.4;
  }
}
function cordPlug(){
  CORD.plugged++;
  CORD.carrying=null;
  if(CORD.view)CORD.view.visible=false;
  cordHubRefresh();
  sndSafe();
  // во второй части такой функции нет — проверяем безопасно
  if(typeof flash==='function')flash(0.25,220);
  showSub('Вы','Один есть. Осталось '+(CORD.need-CORD.plugged)+'.',3.0);
  questDone();
  setTimeout(function(){
    if(CORD.plugged>=CORD.need){
      questShow('Сердце приюта запитано');
      setTimeout(voiceOfMany,2200);          // голос, который меняется
      setTimeout(function(){
        DomeMusic.stop();Music.escape();Music.setLevel(0.5);
        showMsg('Открылась огромная дверь',3.2);
        questShow('Идите к двери');
      },10500);
      setTimeout(function(){
        DM.on=false;
        document.getElementById('black').style.transition='opacity 1.6s';
        document.getElementById('black').style.opacity='1';
        setTimeout(startThrone,1800);
      },15500);
    }else{
      var tgt=houseTarget();
      if(tgt)questShow(tgt.task,tgt.hint);
    }
  },2200);
}
function cordNearHub(){
  return CORD.carrying&&Math.hypot(P.x,P.z)<3.6;
}
// ============================================================
//  ДОМ ИГРУШЕК
//  Кнопки в полу нажимаются слишком туго — руками не выйдет.
//  Спускаемся в яму, заводим машинку, она едет и давит кнопку.
// ============================================================
var TH={on:false,t:0,pits:[],pressed:0,need:2,exitOpen:false,inPit:-1,exitAt:null};

function makeToyCar(col){
  var g=new THREE.Group();
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.16,0.66),
    new THREE.MeshStandardMaterial({color:col,roughness:0.4,metalness:0.25,
      emissive:col,emissiveIntensity:0.15}));
  body.position.y=0.14;g.add(body);
  var cab=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.14,0.3),
    new THREE.MeshStandardMaterial({color:0xe8f0f8,roughness:0.3,metalness:0.4}));
  cab.position.set(0,0.28,-0.04);g.add(cab);
  [[-0.22,0.22],[0.22,0.22],[-0.22,-0.22],[0.22,-0.22]].forEach(function(q){
    var w=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.06,10),
      new THREE.MeshStandardMaterial({color:0x1a1a1e,roughness:0.9}));
    w.rotation.z=Math.PI/2;w.position.set(q[0],0.09,q[1]);g.add(w);
  });
  // заводной ключик сзади
  var key=new THREE.Mesh(new THREE.TorusGeometry(0.06,0.016,6,12),
    new THREE.MeshStandardMaterial({color:0xd8c060,roughness:0.35,metalness:0.8}));
  key.position.set(0,0.18,-0.36);key.rotation.y=Math.PI/2;g.add(key);
  g.userData.key=key;
  return g;
}
function makeBigButton(col){
  var g=new THREE.Group();
  var base=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.46,0.12,16),
    new THREE.MeshStandardMaterial({color:0x3a3f46,roughness:0.6,metalness:0.5}));
  base.position.y=0.06;g.add(base);
  var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.16,16),
    new THREE.MeshStandardMaterial({color:col,roughness:0.45,
      emissive:col,emissiveIntensity:0.5}));
  cap.position.y=0.19;g.add(cap);
  g.userData.cap=cap;
  return g;
}

function buildToyHouse(){
  clearScene();walls=[];LAMPS=[];TH.pits=[];TH.pressed=0;TH.exitOpen=false;TH.inPit=-1;
  var W2=22,D2=16,HH=4.2;
  setBounds(0,0,W2,D2);
  MATS.floor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),
    new THREE.MeshStandardMaterial({color:0xc8bfae,roughness:0.75,map:TEX.tile}));
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  if(!TEX.kid)TEX.kid=texKidWall();
  TEX.kid.repeat.set(W2/4,HH/4);
  var kid=new THREE.MeshStandardMaterial({map:TEX.kid,roughness:0.9,
    bumpMap:TEX.kid,bumpScale:0.03});
  box(W2,HH,0.3,kid,W2/2,HH/2,0);
  box(W2,HH,0.3,kid,W2/2,HH/2,D2);
  box(0.3,HH,D2,kid,0,HH/2,D2/2);
  box(0.3,HH,D2,kid,W2,HH/2,D2/2);
  for(var lx=5;lx<W2;lx+=7){
    LAMPS.push([lx,HH-0.8,D2/2,0xffe0b0,13,0.45]);
    var em=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.07,0.35),
      new THREE.MeshStandardMaterial({color:0xfff2d8,emissive:0xffe0b0,emissiveIntensity:1.6}));
    em.position.set(lx,HH-0.1,D2/2);addObj(em);
  }
  // разбросанные игрушки для настроения
  for(var i=0;i<18;i++){
    var tx=1.5+Math.random()*(W2-3),tz=1.5+Math.random()*(D2-3);
    if(Math.abs(tz-D2/2)<3.2&&tx>4&&tx<18)continue;
    var c=new THREE.Color().setHSL(Math.random(),0.6,0.55);
    var t=new THREE.Mesh(
      Math.random()<0.5?new THREE.BoxGeometry(0.3,0.3,0.3):new THREE.SphereGeometry(0.18,8,7),
      new THREE.MeshStandardMaterial({color:c,roughness:0.8}));
    t.position.set(tx,0.16,tz);t.rotation.set(Math.random(),Math.random(),0);addObj(t);
  }
  // ---- ДВЕ ЯМЫ с машинками ----
  [[6.5,0xd83a3a],[15.5,0x3a7ad8]].forEach(function(s,k){
    var px=s[0],pz=D2/2,PW=3.6,PD=3.0,DEEP=1.6;
    // стенки ямы
    var pm=new THREE.MeshStandardMaterial({color:0x4a453c,roughness:0.95});
    var bottom=new THREE.Mesh(new THREE.PlaneGeometry(PW,PD),pm);
    bottom.rotation.x=-Math.PI/2;bottom.position.set(px,-DEEP,pz);addObj(bottom);
    [[0,-PD/2],[0,PD/2]].forEach(function(o){
      var w=new THREE.Mesh(new THREE.BoxGeometry(PW,DEEP,0.12),pm);
      w.position.set(px+o[0],-DEEP/2,pz+o[1]);addObj(w);
    });
    [[-PW/2,0],[PW/2,0]].forEach(function(o){
      var w=new THREE.Mesh(new THREE.BoxGeometry(0.12,DEEP,PD),pm);
      w.position.set(px+o[0],-DEEP/2,pz+o[1]);addObj(w);
    });
    // жёлтая разметка по краю
    var mark=new THREE.Mesh(new THREE.RingGeometry(2.3,2.6,20),
      new THREE.MeshStandardMaterial({color:0xe8c020,roughness:0.7,side:THREE.DoubleSide}));
    mark.rotation.x=-Math.PI/2;mark.position.set(px,0.02,pz);addObj(mark);
    // рельс на дне
    var rail=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.04,2.4),
      new THREE.MeshStandardMaterial({color:0x8a8a92,roughness:0.4,metalness:0.6}));
    rail.position.set(px,-DEEP+0.02,pz);addObj(rail);
    // машинка
    var car=makeToyCar(s[1]);
    car.position.set(px,-DEEP,pz-1.05);addObj(car);
    // кнопка в конце пути
    var btn=makeBigButton(s[1]);
    btn.position.set(px,-DEEP,pz+1.15);addObj(btn);
    TH.pits.push({x:px,z:pz,deep:DEEP,car:car,btn:btn,launched:false,done:false,
                  t:0,carZ:pz-1.05,col:s[1]});
  });
  // ---- ВЫХОД ----
  var ex=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.3,0.18),
    new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.6,metalness:0.5}));
  ex.position.set(W2/2,1.15,D2-0.25);addObj(ex);
  TH.exitMesh=ex;TH.exitAt={x:W2/2,z:D2-1.3};
  scene.fog=new THREE.FogExp2(0x1a1814,0.035);
  ambientLight.intensity=0.42;ambientLight.color.setHex(0xfff0dc);sunLight.intensity=0.1;
}

function startToyHouse(){
  PHASE='house';TH.on=true;TH.t=0;
  P.x=11;P.z=2.0;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();syncGear();
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Игрушки. Все на местах.',2.6);sayE('Игрушки. Все на местах.');},1800);
  setTimeout(function(){questShow('Спуститесь в яму','Кнопку руками не продавить');},4200);
}

function updateToyHouse(dt){
  if(!TH.on)return;
  TH.t+=dt;
  // падение в яму и подъём
  var inside=-1;
  TH.pits.forEach(function(p2,i){
    if(Math.abs(P.x-p2.x)<1.7&&Math.abs(P.z-p2.z)<1.4)inside=i;
  });
  if(inside>=0){
    var p3=TH.pits[inside];
    P.floorY=-p3.deep;
    if(TH.inPit!==inside){
      TH.inPit=inside;
      if(!p3.done&&QT.cur&&QT.cur.indexOf('яму')>=0)questDone();
      setTimeout(function(){
        if(TH.on&&!p3.done)questShow('Запустите машинку','Она нажмёт кнопку за вас');
      },900);
    }
  }else{P.floorY=0;TH.inPit=-1;}
  // машинка едет
  TH.pits.forEach(function(p2){
    if(!p2.launched||p2.done)return;
    p2.t+=dt;
    p2.carZ+=dt*1.15;
    p2.car.position.z=p2.carZ;
    if(p2.car.userData.key)p2.car.userData.key.rotation.x+=dt*9;
    if(p2.carZ>=p2.z+0.95){
      p2.done=true;TH.pressed++;
      p2.btn.userData.cap.position.y=0.10;
      p2.btn.userData.cap.material.emissiveIntensity=2.2;
      sndPress();
      showMsg('Кнопка нажата: '+TH.pressed+' из '+TH.need,2.4);
      questDone();
      if(TH.pressed>=TH.need)setTimeout(toyOpenExit,1400);
      else setTimeout(function(){
        if(TH.on)questShow('Спуститесь во вторую яму','Кнопок две');
      },1800);
    }
  });
  thNear();
}
function toyOpenExit(){
  TH.exitOpen=true;
  if(TH.exitMesh){
    TH.exitMesh.material.color.setHex(0x2f8f4f);
    TH.exitMesh.material.emissive=new THREE.Color(0x1a5a30);
    TH.exitMesh.material.emissiveIntensity=1.2;
  }
  sndCreak();
  showSub('Вы','Открылось. И свет загорелся.',3.2);sayE('Открылось. И свет загорелся.');
  cordSpawn(0xd83a3a,11,12.5);          // включилось электричество — есть шнур
  setTimeout(function(){
    if(TH.on)questShow('Заберите шнур','Он появился, когда дали электричество');
  },2600);
}
var nTh=null;
function thNear(){
  nTh=null;
  for(var i=0;i<TH.pits.length;i++){
    var p2=TH.pits[i];
    if(TH.inPit===i&&!p2.done&&!p2.launched&&
       Math.hypot(P.x-p2.car.position.x,P.z-p2.car.position.z)<1.3){
      nTh={t:'car',i:i};setPrompt('🔑 ЗАВЕСТИ МАШИНКУ — E',true);return;
    }
    if(TH.inPit===i&&!p2.done&&
       Math.hypot(P.x-p2.btn.position.x,P.z-p2.btn.position.z)<1.1){
      nTh={t:'btn'};setPrompt('Кнопка не поддаётся',false);return;
    }
  }
  if(TH.exitOpen&&CORD.at&&!CORD.carrying&&CORD.mesh&&
     Math.hypot(P.x-CORD.at.x,P.z-CORD.at.z)<1.6){
    nTh={t:'cord'};setPrompt('🔌 ВЗЯТЬ ШНУР — E',true);return;
  }
  if(TH.exitOpen&&Math.hypot(P.x-TH.exitAt.x,P.z-TH.exitAt.z)<1.8){
    nTh={t:'exit'};
    setPrompt(CORD.carrying?'🚪 ВЫЙТИ — E':'Сначала возьмите шнур',!!CORD.carrying);return;
  }
  setPrompt('',false);
}
function thAct(){
  if(!nTh)return;
  if(nTh.t==='car'){
    var p2=TH.pits[nTh.i];
    p2.launched=true;p2.t=0;
    sndWind2();
    showSub('Вы','Поехала!',1.6);sayE('Поехала!');
  }
  else if(nTh.t==='cord'){cordTake();}
  else if(nTh.t==='exit'){
    if(!CORD.carrying){showMsg('Без шнура нет смысла возвращаться',2.0);return;}
    TH.on=false;
    houseComplete('toys');
  }
}
function sndPress(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain();
  o.type='square';o.frequency.setValueAtTime(180,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(90,a.currentTime+0.12);
  g.gain.setValueAtTime(0.13,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.3);
  o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+0.32);
  var b=a.createBuffer(1,Math.floor(a.sampleRate*0.2),a.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<d.length;i++){var x=i/a.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-x*24);}
  var s=a.createBufferSource();s.buffer=b;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=800;
  var g2=a.createGain();g2.gain.value=0.28;
  s.connect(f);f.connect(g2);g2.connect(a.destination);s.start();
}
function sndWind2(){
  var a=getAC();if(!a)return;
  for(var i=0;i<14;i++){
    var t=a.currentTime+i*0.045;
    var o=a.createOscillator(),g=a.createGain();
    o.type='square';o.frequency.value=900+i*40;
    g.gain.setValueAtTime(0.03,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.035);
    o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+0.04);
  }
}
function enterHouse(id){
  if(id==='uv'){buildUVHouse();startUVHouse();return;}
  buildToyHouse();startToyHouse();
}
// ============================================================
//  УЛЬТРАФИОЛЕТОВЫЙ ДОМ
//  Две головоломки: засветить скрытые метки и толкнуть куб лучом.
// ============================================================
var UH={on:false,t:0,marks:[],lit:0,need:3,
        cube:null,cubeX:0,plate:null,pushed:false,
        innerOpen:false,exitOpen:false,exitAt:null,cordDone:false};

function texUVMark(sym){
  return makeTex(function(g,s){
    g.clearRect(0,0,s,s);
    g.strokeStyle='#c8a0ff';g.lineWidth=s*0.05;
    g.lineCap='round';
    var c=s/2,r=s*0.28;
    if(sym===0){                       // круг
      g.beginPath();g.arc(c,c,r,0,6.283);g.stroke();
    }else if(sym===1){                 // треугольник
      g.beginPath();g.moveTo(c,c-r);g.lineTo(c+r,c+r*0.8);g.lineTo(c-r,c+r*0.8);
      g.closePath();g.stroke();
    }else{                             // крест
      g.beginPath();g.moveTo(c-r,c-r);g.lineTo(c+r,c+r);
      g.moveTo(c+r,c-r);g.lineTo(c-r,c+r);g.stroke();
    }
    for(var i=0;i<120;i++){
      g.fillStyle='rgba(200,160,255,'+(Math.random()*0.3).toFixed(2)+')';
      g.fillRect(Math.random()*s,Math.random()*s,2,2);
    }
  },1);
}

function buildUVHouse(){
  clearScene();walls=[];LAMPS=[];UH.marks=[];UH.lit=0;
  UH.innerOpen=false;UH.exitOpen=false;UH.pushed=false;UH.cordDone=false;
  var W2=24,D2=14,HH=4.0;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  // почти без света — тут работает только ультрафиолет
  LAMPS.push([3,HH-0.7,D2/2,0x8090b0,7,0.22]);
  LAMPS.push([W2-3,HH-0.7,D2/2,0x8090b0,7,0.20]);

  // ---- ПЕРЕГОРОДКА с внутренней дверью ----
  var MX=11.0;
  box(0.35,HH,(D2-1.6)/2,MATS.corrWall,MX,HH/2,(D2-1.6)/4);
  box(0.35,HH,(D2-1.6)/2,MATS.corrWall,MX,HH/2,D2-(D2-1.6)/4);
  box(0.35,1.2,1.6,MATS.corrWall,MX,HH-0.6,D2/2);
  var idoor=new THREE.Mesh(new THREE.BoxGeometry(0.22,2.3,1.5),
    new THREE.MeshStandardMaterial({color:0x3a3f46,roughness:0.55,metalness:0.6}));
  idoor.position.set(MX,1.15,D2/2);addObj(idoor);
  UH.innerDoor=idoor;
  UH.innerWall={x1:MX-0.3,z1:D2/2-0.9,x2:MX+0.3,z2:D2/2+0.9};
  walls.push(UH.innerWall);

  // ---- ТРИ СКРЫТЫЕ МЕТКИ в первой половине ----
  var spots=[[0.4,3.5,Math.PI/2,0],[0.4,10.5,Math.PI/2,1],[5.5,0.4,0,2]];
  spots.forEach(function(s,i){
    var m=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),
      new THREE.MeshBasicMaterial({map:texUVMark(s[3]),transparent:true,
        opacity:0,depthWrite:false}));
    m.position.set(s[0]===0.4&&s[2]?0.36:s[0], 1.9, s[1]===0.4?0.36:s[1]);
    if(s[2]===0){m.position.set(s[0],1.9,0.36);m.rotation.y=0;}
    else {m.position.set(0.36,1.9,s[1]);m.rotation.y=Math.PI/2;}
    addObj(m);
    UH.marks.push({m:m,x:m.position.x,z:m.position.z,lit:false,fade:0});
  });

  // ---- ВТОРАЯ ПОЛОВИНА: куб и плита ----
  var cube=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,1.1),
    new THREE.MeshStandardMaterial({color:0x6a5cff,roughness:0.35,metalness:0.3,
      emissive:0x2a1c8a,emissiveIntensity:0.6}));
  cube.position.set(13.5,0.55,D2/2);addObj(cube);
  UH.cube=cube;UH.cubeX=13.5;UH.cubeZ=D2/2;
  // Раньше у куба не было столкновения — игрок проходил сквозь него.
  // Храним САМ объект, а не индекс: индексы сдвигаются, когда
  // из walls убирают внутреннюю дверь, и столкновение уезжало не туда.
  UH.cubeWall={x1:13.5-0.62,z1:D2/2-0.62,x2:13.5+0.62,z2:D2/2+0.62};
  walls.push(UH.cubeWall);
  var plate=new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.0,0.10,18),
    new THREE.MeshStandardMaterial({color:0x3a3f46,roughness:0.6,metalness:0.5,
      emissive:0x501010,emissiveIntensity:0.8}));
  plate.position.set(21.0,0.05,D2/2);addObj(plate);
  UH.plate=plate;UH.plateX=21.0;
  // направляющие, чтобы было понятно, куда толкать
  [-0.75,0.75].forEach(function(sz){
    var rail=new THREE.Mesh(new THREE.BoxGeometry(9,0.07,0.1),
      new THREE.MeshStandardMaterial({color:0x5a5a64,roughness:0.5,metalness:0.6}));
    rail.position.set(17.2,0.04,D2/2+sz);addObj(rail);
  });
  // ---- ВЫХОД ----
  var ex=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.3,0.18),
    new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.6,metalness:0.5}));
  ex.position.set(W2-0.3,1.15,D2/2);ex.rotation.y=Math.PI/2;addObj(ex);
  UH.exitMesh=ex;UH.exitAt={x:W2-1.4,z:D2/2};
  scene.fog=new THREE.FogExp2(0x08080e,0.075);
  ambientLight.intensity=0.05;ambientLight.color.setHex(0xc0c8e0);sunLight.intensity=0;
}

function startUVHouse(){
  PHASE='house';UH.on=true;UH.t=0;
  P.x=2.0;P.z=7.0;P.y=0;P.vy=0;P.yaw=-Math.PI/2;P.pitch=0;P.eye=EYE_H;P.floorY=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();syncGear();
  document.getElementById('black').style.transition='opacity 1.4s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Тут ничего не видно. Совсем.',2.8);sayE('Тут ничего не видно. Совсем.');},1800);
  setTimeout(function(){questShow('Засветите три метки','Стреляйте ультрафиолетом в стены');},4000);
}

// вызывается из выстрела пистолета
function uvHouseShot(){
  if(!UH.on)return;
  var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);
  // 1) метки
  UH.marks.forEach(function(k){
    var dx=k.x-P.x,dz=k.z-P.z,d=Math.hypot(dx,dz);
    if(d>9)return;
    var dot=(dx/d)*fx+(dz/d)*fz;
    if(dot<0.55)return;
    k.fade=6;
    if(!k.lit){
      k.lit=true;UH.lit++;
      sndBeep(1100);
      showMsg('Метка засветилась: '+UH.lit+' из '+UH.need,2.2);
      if(UH.lit>=UH.need)setTimeout(uvOpenInner,900);
    }
  });
  // 2) куб — луч толкает его
  if(UH.cube&&!UH.pushed&&P.x<UH.cubeX){
    var cdx=UH.cubeX-P.x,cdz=(UH.cube.position.z)-P.z,cd=Math.hypot(cdx,cdz);
    if(cd<11){
      var cdot=(cdx/cd)*fx+(cdz/cd)*fz;
      if(cdot>0.55){
        UH.cubeX=Math.min(UH.plateX,UH.cubeX+1.35);
        UH.cube.position.x=UH.cubeX;
        if(UH.cubeWall){UH.cubeWall.x1=UH.cubeX-0.62;UH.cubeWall.x2=UH.cubeX+0.62;}
        sndPress();
        if(UH.cubeX>=UH.plateX-0.15&&!UH.pushed){
          UH.pushed=true;
          UH.plate.material.emissive.setHex(0x105010);
          UH.plate.material.emissiveIntensity=2.2;
          setTimeout(uvOpenExit,700);
        }else{
          showMsg('Толкнул. Ещё',1.4);
        }
      }
    }
  }
}
function uvOpenInner(){
  if(UH.innerOpen)return;
  UH.innerOpen=true;
  if(UH.innerDoor){UH.innerDoor.position.y=3.4;}
  var wi=walls.indexOf(UH.innerWall);
  if(wi>=0)walls.splice(wi,1);
  sndCreak();questDone();
  showSub('Вы','Метки сошлись. Дверь поднялась.',3.0);sayE('Метки сошлись. Дверь поднялась.');
  setTimeout(function(){
    if(UH.on)questShow('Дотолкайте куб до плиты','Луч ультрафиолета толкает его');
  },2400);
}
function uvOpenExit(){
  UH.exitOpen=true;
  if(UH.exitMesh){
    UH.exitMesh.material.color.setHex(0x2f8f4f);
    UH.exitMesh.material.emissive=new THREE.Color(0x1a5a30);
    UH.exitMesh.material.emissiveIntensity=1.2;
  }
  sndCreak();questDone();
  showSub('Вы','Плита сработала. И свет дали.',3.0);sayE('Плита сработала. И свет дали.');
  cordSpawn(0x6a5cff,20.0,4.0);
  setTimeout(function(){
    if(UH.on)questShow('Заберите шнур');
  },2600);
}
function updateUVHouse(dt){
  if(!UH.on)return;
  UH.t+=dt;
  UH.marks.forEach(function(k){
    if(k.fade>0){k.fade=Math.max(0,k.fade-dt*0.5);}
    k.m.material.opacity=k.lit?Math.max(0.35,Math.min(1,k.fade)):Math.min(1,k.fade);
  });
  if(UH.cube)UH.cube.rotation.y+=dt*0.3;
  uhNear();
}
var nUh=null;
function uhNear(){
  nUh=null;
  if(UH.exitOpen&&CORD.at&&!CORD.carrying&&CORD.mesh&&
     Math.hypot(P.x-CORD.at.x,P.z-CORD.at.z)<1.6){
    nUh={t:'cord'};setPrompt('🔌 ВЗЯТЬ ШНУР — E',true);return;
  }
  if(UH.exitOpen&&Math.hypot(P.x-UH.exitAt.x,P.z-UH.exitAt.z)<1.8){
    nUh={t:'exit'};
    setPrompt(CORD.carrying?'🚪 ВЫЙТИ — E':'Сначала возьмите шнур',!!CORD.carrying);return;
  }
  setPrompt('',false);
}
function uhAct(){
  if(!nUh)return;
  if(nUh.t==='cord')cordTake();
  else if(nUh.t==='exit'){
    if(!CORD.carrying){showMsg('Без шнура нет смысла',1.8);return;}
    UH.on=false;houseComplete('uv');
  }
}
// ============================================================
//  ФИНАЛ ГЛАВЫ: голос, тронный зал, синий Мебельщик, база
// ============================================================
var TR2={on:false,t:0,boss:null,ally:null,step:0,walking:false};

// голос, который меняется — как будто говорит тот, кто умеет всё
function sayMulti(parts){
  if(!window.speechSynthesis)return;
  parts.forEach(function(p,i){
    setTimeout(function(){
      try{
        var u=new SpeechSynthesisUtterance(p.t);
        u.lang='ru-RU';u.rate=p.r;u.pitch=p.p;u.volume=1;
        speechSynthesis.speak(u);
      }catch(e){}
    },p.d);
  });
}
function voiceOfMany(){
  showSub('???','Подключились провода...',3.0);
  sayMulti([
    {t:'Подключились',      r:1.25,p:1.9, d:0},      // детский
    {t:'провода',           r:0.62,p:0.15,d:900},    // низкий рык
    {t:'Эх',                r:1.0, p:1.0, d:1900},   // обычный
    {t:'ты даже не знаешь', r:0.72,p:0.35,d:2500},   // хриплый
    {t:'для какой ты цели', r:1.35,p:1.75,d:4300},   // визгливый
    {t:'это делаешь',       r:0.55,p:0.1, d:5600}    // почти инфразвук
  ]);
  setTimeout(function(){
    showSub('???','Эх, ты даже не знаешь, для какой цели ты это делаешь.',5.0);
  },1900);
}

function makeThroneBoss(){
  var g=new THREE.Group();
  var dark=new THREE.MeshStandardMaterial({color:0x241a24,roughness:0.9});
  var flesh=new THREE.MeshStandardMaterial({color:0x3a1c2c,roughness:0.75});
  // основание — как гора сложенной мебели
  var base=new THREE.Mesh(new THREE.BoxGeometry(4.2,2.6,3.0),dark);
  base.position.y=1.3;g.add(base);
  var torso=new THREE.Mesh(new THREE.BoxGeometry(3.0,2.8,2.2),flesh);
  torso.position.y=3.9;g.add(torso);
  var shoulders=new THREE.Mesh(new THREE.BoxGeometry(4.6,0.7,2.4),dark);
  shoulders.position.y=5.2;g.add(shoulders);
  // голова: касса, но огромная и перекошенная
  var head=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.3,1.5),dark);
  head.position.y=6.2;head.rotation.z=0.08;g.add(head);
  g.userData.head=head;
  var em=new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xffc060,emissiveIntensity:6});
  [-0.45,0.45].forEach(function(dx){
    var e=new THREE.Mesh(new THREE.SphereGeometry(0.19,10,8),em);
    e.position.set(dx,6.25,0.78);g.add(e);
  });
  // корона из ножек стульев
  for(var c=0;c<9;c++){
    var a=(c/9-0.5)*2.4;
    var sp=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.9+Math.random()*0.5,0.11),dark);
    sp.position.set(Math.sin(a)*0.85,7.1,Math.cos(a)*0.5-0.1);
    sp.rotation.z=-a*0.5;g.add(sp);
  }
  // ЩУПАЛЬЦА из сегментов
  g.userData.tents=[];
  for(var i=0;i<8;i++){
    var ang=(i/8)*Math.PI*2;
    var t=new THREE.Group();
    var segs=[];
    var parent=t;
    for(var s=0;s<7;s++){
      var seg=new THREE.Group();
      var mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.26-s*0.028,0.22-s*0.026,0.75,8),flesh);
      mesh.position.y=-0.38;seg.add(mesh);
      seg.position.y=(s===0)?0:-0.72;
      parent.add(seg);parent=seg;segs.push(seg);
    }
    t.position.set(Math.cos(ang)*1.7,3.4,Math.sin(ang)*1.1+0.4);
    t.rotation.z=Math.cos(ang)*0.5;
    t.rotation.x=Math.sin(ang)*0.4;
    g.add(t);
    g.userData.tents.push({segs:segs,ph:i*0.8,ang:ang});
  }
  return g;
}
function makeAlly(){
  var g=createBossMesh();
  g.scale.set(0.92,0.92,0.92);
  g.traverse(function(o){
    if(o.material&&o.material.color){
      o.material=o.material.clone();
      o.material.color.setHex(0x2a5aa8);
      if(o.material.emissive)o.material.emissive.setHex(0x1a3a7a);
    }
    if(o.isPointLight)o.color.setHex(0x4a8aff);
  });
  return g;
}

function buildThrone(){
  clearScene();walls=[];LAMPS=[];
  var W2=34,D2=44,HH=14;
  setBounds(0,0,W2,D2);
  MATS.floor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),
    new THREE.MeshStandardMaterial({color:0x2a2028,roughness:0.6,map:TEX.tile,metalness:0.15}));
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.4,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.4,MATS.corrWall,W2/2,HH/2,D2);
  box(0.4,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.4,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  // колонны вдоль зала
  for(var z=6;z<D2-4;z+=7){
    [6,W2-6].forEach(function(cx){
      var col=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.2,HH,14),
        new THREE.MeshStandardMaterial({color:0x3a2f38,roughness:0.9}));
      col.position.set(cx,HH/2,z);addObj(col);
      solid(cx-1.2,z-1.2,cx+1.2,z+1.2);
      LAMPS.push([cx,7,z,0xff9a50,16,0.5]);
      var br=new THREE.Mesh(new THREE.SphereGeometry(0.32,10,8),
        new THREE.MeshStandardMaterial({color:0xffb060,emissive:0xff8030,emissiveIntensity:3}));
      br.position.set(cx,7,z);addObj(br);
    });
  }
  // красная дорожка к трону
  var rug=new THREE.Mesh(new THREE.PlaneGeometry(4.5,D2-8),
    new THREE.MeshStandardMaterial({color:0x6a1418,roughness:0.9}));
  rug.rotation.x=-Math.PI/2;rug.position.set(W2/2,0.02,D2/2-2);addObj(rug);
  // ступени и трон
  for(var s=0;s<4;s++){
    var st=new THREE.Mesh(new THREE.BoxGeometry(12-s*1.6,0.45,2.2-s*0.3),
      new THREE.MeshStandardMaterial({color:0x3a2f38,roughness:0.9}));
    st.position.set(W2/2,0.22+s*0.45,D2-6+s*0.9);addObj(st);
  }
  var thr=new THREE.Group();
  var seat=new THREE.Mesh(new THREE.BoxGeometry(5.0,0.7,3.4),
    new THREE.MeshStandardMaterial({color:0x2a1f28,roughness:0.85}));
  seat.position.y=2.2;thr.add(seat);
  var back=new THREE.Mesh(new THREE.BoxGeometry(5.0,7.0,0.7),
    new THREE.MeshStandardMaterial({color:0x241a22,roughness:0.9}));
  back.position.set(0,5.6,1.5);thr.add(back);
  for(var k=0;k<7;k++){
    var sp2=new THREE.Mesh(new THREE.BoxGeometry(0.22,2.2+Math.random()*1.6,0.22),
      new THREE.MeshStandardMaterial({color:0x1a1218,roughness:0.9}));
    sp2.position.set(-2.0+k*0.67,9.4,1.5);thr.add(sp2);
  }
  thr.position.set(W2/2,0,D2-3.2);addObj(thr);
  solid(W2/2-3,D2-5,W2/2+3,D2-1.5);
  // БОСС на троне
  TR2.boss=makeThroneBoss();
  TR2.boss.position.set(W2/2,2.3,D2-3.6);
  TR2.boss.rotation.y=Math.PI;
  scene.add(TR2.boss);objs.push(TR2.boss);
  LAMPS.push([W2/2,9,D2-6,0xffb060,22,0.9]);
  scene.fog=new THREE.FogExp2(0x140c10,0.030);
  ambientLight.intensity=0.16;ambientLight.color.setHex(0xffd0a0);sunLight.intensity=0;
}

var TT={line1:3.2, rise:6.4, walk:7.6, shot:12.4, fall:12.7,
        jump:14.6, look:16.2, q1:18.6, q2:21.6, follow:25.0};
function startThrone(){
  PHASE='throne';buildThrone();
  P.x=17;P.z=6;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;P.floorY=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  TR2.on=true;TR2.t=0;TR2.step=0;TR2.walking=false;
  saveAt('throne');
  questHide();
  document.getElementById('black').style.transition='opacity 2.4s';
  document.getElementById('black').style.opacity='0';
  Music.escape();Music.setLevel(0.42);
  setTimeout(function(){showSub('Вы','Это... тронный зал?',2.6);sayE('Это... тронный зал?');},2200);
}
function updateThrone(dt){
  if(!TR2.on)return;
  if(SECRET2.on&&SECRET2.stage===1){updateSecretCollapse(dt);return;}
  TR2.t+=dt;var t=TR2.t;
  // щупальца шевелятся
  if(TR2.boss&&TR2.boss.userData.tents){
    TR2.boss.userData.tents.forEach(function(tt){
      tt.ph+=dt*0.9;
      tt.segs.forEach(function(sg,i){
        sg.rotation.x=Math.sin(tt.ph+i*0.5)*0.16;
        sg.rotation.z=Math.cos(tt.ph*0.7+i*0.4)*0.13;
      });
    });
    TR2.boss.userData.head.rotation.y=Math.sin(t*0.5)*0.15;
  }
  if(t>TT.line1&&TR2.step===0){
    TR2.step=1;
    showSub('Босс','Ну что ж. Наконец-то я смогу тебя словить.',4.4);
    sayMulti([{t:'Ну что ж.',r:0.6,p:0.15,d:0},
              {t:'Наконец-то я смогу тебя словить.',r:0.55,p:0.1,d:1400}]);
  }
  // 1. ВСТАЁТ С ТРОНА
  if(t>TT.rise&&TR2.step===1){
    TR2.step=2;TR2.bz=TR2.boss.position.z;
    sndSteel&&sndSteel();
  }
  if(TR2.step===2){
    var kr=Math.min(1,(t-TT.rise)/1.2);
    TR2.boss.position.y=2.3+kr*0.9;                 // поднимается
    TR2.boss.rotation.x=-kr*0.06;
    if(t>TT.walk)TR2.step=3;
  }
  // 2. ИДЁТ НА НАС
  if(TR2.step===3){
    TR2.boss.position.z-=dt*2.35;
    TR2.boss.position.y=3.2+Math.abs(Math.sin(t*3.1))*0.16;   // тяжёлая поступь
    TR2.boss.rotation.z=Math.sin(t*3.1)*0.035;
    if(!TR2.stepT2)TR2.stepT2=0;
    TR2.stepT2-=dt;
    if(TR2.stepT2<=0){TR2.stepT2=0.62;if(typeof sndSteel==='function')sndSteel();}
    if(t>TT.shot)TR2.step=4;
  }
  // 3. ВЫСТРЕЛ СПРАВА
  if(TR2.step===4){
    TR2.step=5;
    TR2.ally=makeAlly();
    TR2.ally.position.set(29,0,TR2.boss.position.z+1.5);
    TR2.ally.rotation.y=-Math.PI/2;
    scene.add(TR2.ally);objs.push(TR2.ally);
    // ствол и вспышка
    var flash2=new THREE.Mesh(new THREE.SphereGeometry(0.5,10,8),
      new THREE.MeshBasicMaterial({color:0x8adfff,transparent:true,opacity:0.9}));
    flash2.position.set(27.6,1.9,TR2.boss.position.z+1.5);
    scene.add(flash2);objs.push(flash2);TR2.flash=flash2;
    var beam=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.16,12,8),
      new THREE.MeshBasicMaterial({color:0x8adfff,transparent:true,opacity:0.7,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    beam.rotation.z=Math.PI/2;
    beam.position.set(21.5,1.9,TR2.boss.position.z+1.2);
    scene.add(beam);objs.push(beam);TR2.beam=beam;
    sndAllyShot();
    var wh2=document.getElementById('white');
    if(wh2){wh2.style.transition='none';wh2.style.opacity='0.45';
      setTimeout(function(){wh2.style.transition='opacity 0.5s';wh2.style.opacity='0';},60);}
  }
  if(TR2.flash){
    TR2.flash.scale.multiplyScalar(1+dt*6);
    TR2.flash.material.opacity=Math.max(0,TR2.flash.material.opacity-dt*3.2);
  }
  if(TR2.beam)TR2.beam.material.opacity=Math.max(0,TR2.beam.material.opacity-dt*2.2);
  // 4. ПАДАЕТ
  if(t>TT.fall&&TR2.step===5){TR2.step=6;TR2.fallT=0;}
  if(TR2.step===6){
    TR2.fallT+=dt;
    var kf=Math.min(1,TR2.fallT/1.5);
    TR2.boss.rotation.x=-kf*1.45;                    // валится назад
    TR2.boss.position.y=3.2-kf*2.9;
    TR2.boss.children.forEach(function(c){
      if(c.material&&c.material.emissiveIntensity!==undefined)
        c.material.emissiveIntensity=6*(1-kf);
    });
    if(kf>=1&&!TR2.fell2){
      TR2.fell2=true;sndCrash();
      if(typeof flash==='function'){}
    }
    if(t>TT.jump)TR2.step=7;
  }
  // 5. СИНИЙ ПРЫГАЕТ К НАМ
  if(TR2.step===7){
    if(!TR2.jumpT)TR2.jumpT=0;
    TR2.jumpT+=dt;
    var kj=Math.min(1,TR2.jumpT/1.4);
    var sx2=29,sz2=TR2.boss.position.z+1.5;
    TR2.ally.position.x=sx2+(P.x-sx2)*kj;
    TR2.ally.position.z=sz2+((P.z+3.0)-sz2)*kj;
    TR2.ally.position.y=Math.sin(kj*Math.PI)*1.4;    // прыжок дугой
    TR2.ally.rotation.y=Math.atan2(P.x-TR2.ally.position.x,P.z-TR2.ally.position.z);
    if(kj>=1&&t>TT.look)TR2.step=8;
  }
  if(t>TT.look&&TR2.step===8){
    TR2.step=9;
    TR2.ally.position.y=0;
    showSub('Вы','Ты точно мебельщик?',2.6);sayE('Ты точно мебельщик?');
  }
  if(t>TT.q1&&TR2.step===9){
    TR2.step=10;
    showSub('Синий','Да. Я один из мебельщиков.',3.0);
    sayE('Да. Я один из мебельщиков.');
  }
  if(t>TT.q2&&TR2.step===10){
    TR2.step=11;
    showSub('Синий','И я буду твоим союзником. Я знаю, куда идти.',4.0);
    sayE('И я буду твоим союзником. Я знаю куда идти.');
  }
  if(t>TT.follow&&TR2.step===11){
    TR2.step=12;TR2.walking=true;
    questShow('Идите за союзником','Он ведёт в безопасное место');
  }
  // ведёт нас к выходу
  if(TR2.walking&&TR2.ally){
    var tz=TR2.ally.position.z-dt*1.6;
    if(tz>2.5){
      TR2.ally.position.z=tz;
      TR2.ally.position.x=17+Math.sin(t*1.2)*0.25;
    }else if(!TR2.asked){
      TR2.asked=true;
      askQuestion();
    }
  }
  if(TR2.walking&&TR2.ally){
    var far=Math.hypot(P.x-TR2.ally.position.x,P.z-TR2.ally.position.z);
    if(far>9&&!TR2.warned2){TR2.warned2=true;showMsg('Не отставай',2.0);}
  }
}

function sndAllyShot(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  var o=a.createOscillator(),g=a.createGain();
  o.type='sawtooth';
  o.frequency.setValueAtTime(2600,t0);
  o.frequency.exponentialRampToValueAtTime(140,t0+0.35);
  g.gain.setValueAtTime(0.4,t0);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.45);
  o.connect(g);g.connect(a.destination);o.start(t0);o.stop(t0+0.5);
  var s=a.createOscillator(),sg=a.createGain();
  s.type='sine';s.frequency.setValueAtTime(150,t0);
  s.frequency.exponentialRampToValueAtTime(38,t0+0.4);
  sg.gain.setValueAtTime(0.55,t0);
  sg.gain.exponentialRampToValueAtTime(0.0001,t0+0.55);
  s.connect(sg);sg.connect(a.destination);s.start(t0);s.stop(t0+0.6);
  var nb=a.createBuffer(1,Math.floor(a.sampleRate*0.35),a.sampleRate),nd=nb.getChannelData(0);
  for(var i=0;i<nd.length;i++){var x=i/a.sampleRate;nd[i]=(Math.random()*2-1)*Math.exp(-x*14);}
  var ns=a.createBufferSource();ns.buffer=nb;
  var hp=a.createBiquadFilter();hp.type='highpass';hp.frequency.value=1400;
  var ng=a.createGain();ng.gain.value=0.32;
  ns.connect(hp);hp.connect(ng);ng.connect(a.destination);ns.start(t0);
}

// ============================================================
//  СЕКРЕТНАЯ КОНЦОВКА ЧАСТИ II
//  Вместо того чтобы просто идти за синим союзником в тронном зале,
//  можно посветить на него УФ-пистолетом. Он падает — и вместо
//  обычной ветки (askQuestion → goToBase) начинается отдельная:
//  забираем ключ у упавшего → грузовик → кузов → секретная дверь →
//  комната со Стеллажником → союзник оказывается предателем.
//  Всё, что здесь начато, полностью заменяет обычный финал тронного
//  зала — TR2.asked=true гасит обычную ветку насовсем.
// ============================================================
var SECRET2={on:false,stage:0,t:0,fell:false,truck:null,glassBroken:false,rearGlassBroken:false,monster:null};

function throneAllyShot(){
  if(!(TR2.walking&&TR2.ally)||TR2.asked||SECRET2.on)return;
  var dx=TR2.ally.position.x-P.x,dz=TR2.ally.position.z-P.z,d=Math.hypot(dx,dz)||1;
  if(d>9)return;
  var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);
  var dot=(dx/d)*fx+(dz/d)*fz;
  if(dot<0.5)return;                       // должны целиться примерно на него
  startSecretCollapse();
}
function startSecretCollapse(){
  SECRET2.on=true;SECRET2.stage=1;SECRET2.t=0;SECRET2.fell=false;
  TR2.walking=false;TR2.asked=true;
  sndScare();
  showSub('Синий','А-а!',1.4);sayE('А-а!');
}
function updateSecretCollapse(dt){
  SECRET2.t+=dt;
  var kf=Math.min(1,SECRET2.t/1.3);
  if(TR2.ally){
    TR2.ally.rotation.x=-kf*1.35;
    TR2.ally.position.y=Math.max(0,1.4-kf*1.4);
  }
  if(kf>=1&&!SECRET2.fell){
    SECRET2.fell=true;SECRET2.stage=2;
    if(typeof sndCrash==='function')sndCrash();
    showSub('Вы','Что... что я наделал?',3.0);sayE('Что... что я наделал?');
    setTimeout(function(){showSub('Вы','У него на поясе два ключа. Этот — не мой размер, не берётся.',4.4);sayE('У него на поясе два ключа. Этот — не мой размер, не берётся.');},3200);
    setTimeout(function(){showSub('Вы','А вот этот, поменьше — беру.',3.0);sayE('А вот этот, поменьше — беру.');},8000);
    setTimeout(startSecretTruck,11500);
  }
}

function makeSecTruck(){
  var g=new THREE.Group();
  var body=new THREE.MeshStandardMaterial({color:0x2a4a3a,roughness:0.75,metalness:0.2});
  var dark=new THREE.MeshStandardMaterial({color:0x141414,roughness:0.9});
  var glassM=new THREE.MeshStandardMaterial({color:0x9adfff,roughness:0.15,metalness:0.3,
    transparent:true,opacity:0.55});
  // кабина
  var cab=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.9,2.4),body);
  cab.position.set(0,1.35,3.0);g.add(cab);
  var glass=new THREE.Mesh(new THREE.PlaneGeometry(1.4,0.9),glassM);
  glass.position.set(0,1.75,4.21);g.add(glass);g.userData.glass=glass;
  // заднее окошко кабины — второй рубеж на пути из кабины в кузов
  var glassRear=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.7),glassM);
  glassRear.position.set(0,1.7,1.79);glassRear.rotation.y=Math.PI;g.add(glassRear);g.userData.glassRear=glassRear;
  // кузов
  var bed=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.0,5.2),dark);
  bed.position.set(0,1.4,-0.2);g.add(bed);
  // колёса
  var wheelM=new THREE.MeshStandardMaterial({color:0x0a0a0a,roughness:0.95});
  [[1.25,3.2],[-1.25,3.2],[1.35,-1.8],[-1.35,-1.8]].forEach(function(p){
    var w=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.4,14),wheelM);
    w.rotation.z=Math.PI/2;w.position.set(p[0],0.5,p[1]);g.add(w);
  });
  return g;
}
function buildSecretTruck(){
  clearScene();walls=[];LAMPS=[];
  var W3=12,D3=14,HH=3.6;
  setBounds(0,0,W3,D3);
  var wallM=new THREE.MeshStandardMaterial({color:0x2a2822,roughness:1.0,map:TEX.wallClean});
  TEX.wallClean.repeat.set(W3/3,HH/2);
  MATS.corrFloor.map.repeat.set(W3,D3);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W3,D3),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W3/2,0,D3/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W3,D3),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W3/2,HH,D3/2);addObj(ce);
  box(W3,HH,0.3,wallM,W3/2,HH/2,0);
  box(W3,HH,0.3,wallM,W3/2,HH/2,D3);
  box(0.3,HH,D3,wallM,0,HH/2,D3/2);
  box(0.3,HH,D3,wallM,W3,HH/2,D3/2);
  SECRET2.truck=makeSecTruck();
  SECRET2.truck.position.set(W3/2,0,D3/2);
  scene.add(SECRET2.truck);objs.push(SECRET2.truck);
  solid(W3/2-1.5,D3/2-3.0,W3/2+1.5,D3/2+3.0);
  // завал слева от входа — путь налево закрыт, только направо, мимо
  // кабины (тот самый "другой грузовик" блокирует проход собой)
  box(3.6,2.6,3.2,wallM,2.2,1.3,10.5,0.28);
  box(1.6,1.2,1.4,MATS.dark,3.1,2.9,10.2,-0.4);
  solid(0,9.0,3.8,14);
  P.x=W3/2;P.z=D3-1.6;P.y=0;P.yaw=Math.PI;P.pitch=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
}
function startSecretTruck(){
  PHASE='secret2';SECRET2.stage=3;SECRET2.glassBroken=false;
  Music.stop();
  startLoading(buildSecretTruck,function(){
    PHASE='secret2';
    document.getElementById('black').style.transition='opacity 1.8s';
    document.getElementById('black').style.opacity='0';
    setTimeout(function(){showMsg('Слева — завал. Дальше не пройти.',2.8);},1600);
    setTimeout(function(){showMsg('Разве что через грузовик. Направо.',3.2);},4600);
    setTimeout(function(){questShow('Найти путь через грузовик','Разбейте стекло кабины');},6200);
  });
}
var nSec2=null;
function secretNear(){
  nSec2=null;
  if(!SECRET2.truck)return;
  var tx=SECRET2.truck.position.x,tz=SECRET2.truck.position.z;
  if(SECRET2.stage===3){
    var target=SECRET2.glassBroken?[tx,tz+2.6]:[tx,tz+4.0];
    var d=Math.hypot(P.x-target[0],P.z-target[1]);
    if(d<1.8)nSec2=SECRET2.glassBroken?{t:'climb'}:{t:'glass'};
  }else if(SECRET2.stage===3.5){
    var d15=Math.hypot(P.x-tx,P.z-(tz+1.9));
    if(d15<1.6)nSec2=SECRET2.rearGlassBroken?{t:'intoBed'}:{t:'rearglass'};
  }else if(SECRET2.stage===4){
    var d2=Math.hypot(P.x-tx,P.z-(tz-2.4));
    if(d2<1.8)nSec2={t:'door'};
  }
  if(nSec2){
    setPrompt({glass:'👊 РАЗБИТЬ СТЕКЛО — E',climb:'⬆ ЗАЛЕЗТЬ В КАБИНУ — E',
      rearglass:'👊 РАЗБИТЬ ЗАДНЕЕ СТЕКЛО — E',intoBed:'⬆ ПЕРЕЛЕЗТЬ В КУЗОВ — E',
      door:'🚪 ОТКРЫТЬ ДВЕРЬ — E'}[nSec2.t],true);
  }else setPrompt('',false);
}
function secret2Act(){
  if(!nSec2)return;
  if(nSec2.t==='glass'){
    SECRET2.glassBroken=true;
    if(SECRET2.truck.userData.glass)SECRET2.truck.userData.glass.visible=false;
    if(typeof sndCrash==='function')sndCrash();
    showMsg('Стекло разбито',1.8);setPrompt('',false);
  }else if(nSec2.t==='climb'){
    SECRET2.stage=3.5;
    P.x=SECRET2.truck.position.x;P.z=SECRET2.truck.position.z+2.6;P.yaw=Math.PI;
    showSub('Вы','Залез в кабину. Дальше — через кузов.',2.8);sayE('Залез в кабину. Дальше — через кузов.');
    setPrompt('',false);
  }else if(nSec2.t==='rearglass'){
    SECRET2.rearGlassBroken=true;
    if(SECRET2.truck.userData.glassRear)SECRET2.truck.userData.glassRear.visible=false;
    if(typeof sndCrash==='function')sndCrash();
    showMsg('Заднее стекло разбито',1.8);setPrompt('',false);
  }else if(nSec2.t==='intoBed'){
    SECRET2.stage=4;
    P.x=SECRET2.truck.position.x;P.z=SECRET2.truck.position.z-1.6;P.yaw=Math.PI;
    showMsg('Внутри кузова темно... а вот и дверь.',2.8);setPrompt('',false);
    questShow('Найти секретную дверь','Она в конце кузова');
  }else if(nSec2.t==='door'){
    setPrompt('',false);
    showSub('Вы','Это какая-то дверь. Может быть, подойдёт мой ключ, который я взял?',4.4);
    sayE('Это какая-то дверь. Может быть, подойдёт мой ключ, который я взял?');
    setTimeout(startSecretRoom,3600);
  }
}
function updateSecret2(dt){
  secretNear();
  if(SECRET2.stage>=6&&SECRET2.monster){
    SECRET2.t+=dt;
    SECRET2.monster.rotation.y=Math.PI+Math.sin(SECRET2.t*0.4)*0.15;
    if(SECRET2.monster.userData.scan)SECRET2.monster.userData.scan.forEach(function(s,i){
      s.material.emissiveIntensity=1.5+Math.sin(SECRET2.t*3+i*1.4)*1.2;
    });
  }
}

function makeStellazhnik(){
  // 2.9 метра, из старых стеллажей и электроники — тот же принцип,
  // что и у обычных мебельщиков (createBossMesh в part1.html), только
  // выше и из другого "материала": полки/ящики вместо диванов,
  // тонкие лестничные рамы вместо сплошных рук-коробок.
  var g=new THREE.Group();
  var frameM=new THREE.MeshStandardMaterial({color:0x1c1712,roughness:0.9,metalness:0.3});
  var shelfM=new THREE.MeshStandardMaterial({color:0x5a4a32,roughness:0.92});
  var tanM=new THREE.MeshStandardMaterial({color:0x8a7a54,roughness:0.9});
  function ladderLimb(len){
    var limb=new THREE.Group();
    var rail=new THREE.BoxGeometry(0.10,len,0.10);
    [-0.11,0.11].forEach(function(dx){
      var r=new THREE.Mesh(rail,frameM);r.position.x=dx;limb.add(r);
    });
    var rungs=Math.max(3,Math.floor(len/0.28));
    for(var i=0;i<rungs;i++){
      var rung=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.05,0.05),frameM);
      rung.position.y=len/2-0.14-i*(len-0.28)/Math.max(1,rungs-1);
      limb.add(rung);
    }
    return limb;
  }
  // ноги — на шарнире от бедра
  g.userData.legs=[];
  [-0.24,0.24].forEach(function(dx){
    var piv=new THREE.Group();piv.position.set(dx,1.55,0);
    var leg=ladderLimb(1.55);leg.position.y=-0.775;piv.add(leg);
    g.add(piv);g.userData.legs.push(piv);
  });
  // торс — стопка ящиков/полок разной ширины (1.55 .. 2.55)
  var t1=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.55,0.42),shelfM);
  t1.position.y=1.83;g.add(t1);
  var t2=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.45,0.40),tanM);
  t2.position.y=2.28;g.add(t2);
  var t3=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.35,0.36),shelfM);
  t3.position.y=2.63;g.add(t3);
  // полки открыты спереди — намёк рамкой потемнее
  var slot=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.16,0.02),
    new THREE.MeshStandardMaterial({color:0x0e0c08,roughness:1.0}));
  slot.position.set(0,1.9,0.22);g.add(slot);
  // руки — тоже лестничные рамы, на шарнире от плеча
  g.userData.arms=[];
  [-0.62,0.62].forEach(function(dx){
    var piv=new THREE.Group();piv.position.set(dx,2.5,0);
    var arm=ladderLimb(1.35);arm.position.y=-0.675;piv.add(arm);
    g.add(piv);g.userData.arms.push(piv);
  });
  // голова — электронная панель со сканирующими полосками вместо глаз
  var head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.30,0.34),
    new THREE.MeshStandardMaterial({color:0x141210,roughness:0.6,metalness:0.4}));
  head.position.y=2.86;g.add(head);
  var scanM=new THREE.MeshStandardMaterial({color:0xffb040,emissive:0xff8a10,emissiveIntensity:2.0});
  g.userData.scan=[];
  [-0.13,0,0.13].forEach(function(dx){
    var s=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.05,0.02),scanM);
    s.position.set(dx,2.90,0.18);g.add(s);g.userData.scan.push(s);
  });
  var redM=new THREE.MeshStandardMaterial({color:0xc02020,emissive:0x900000,emissiveIntensity:1.0});
  var indicator=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02),redM);
  indicator.position.set(0,2.78,0.18);g.add(indicator);
  var pl=new THREE.PointLight(0xffa040,0.7,5);pl.position.set(0,2.86,0.3);g.add(pl);
  return g;
}
function buildSecretRoom(){
  clearScene();walls=[];LAMPS=[];
  var W4=11,D4=13,HH=4.2;
  setBounds(0,0,W4,D4);
  var wallM=new THREE.MeshStandardMaterial({color:0x201d18,roughness:1.0,map:TEX.wallClean});
  TEX.wallClean.repeat.set(W4/3,HH/2);
  MATS.corrFloor.map.repeat.set(W4,D4);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W4,D4),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W4/2,0,D4/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W4,D4),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W4/2,HH,D4/2);addObj(ce);
  box(W4,HH,0.3,wallM,W4/2,HH/2,0);
  box(W4,HH,0.3,wallM,W4/2,HH/2,D4);
  box(0.3,HH,D4,wallM,0,HH/2,D4/2);
  box(0.3,HH,D4,wallM,W4,HH/2,D4/2);
  // ряды старых стеллажей вдоль стен — атмосфера склада
  var rackM=new THREE.MeshStandardMaterial({color:0x352c1e,roughness:0.95});
  for(var rx=1.2;rx<W4-1;rx+=2.2){
    var rack=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.6,0.5),rackM);
    rack.position.set(rx,1.3,0.5);addObj(rack);
    solid(rx-0.7,0.25,rx+0.7,0.75);
  }
  SECRET2.monster=makeStellazhnik();
  SECRET2.monster.position.set(W4/2,0,D4-2.6);
  SECRET2.monster.rotation.y=Math.PI;
  scene.add(SECRET2.monster);objs.push(SECRET2.monster);
  P.x=W4/2;P.z=2.0;P.y=0;P.yaw=Math.PI;P.pitch=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
}
function startSecretRoom(){
  SECRET2.stage=5;
  startLoading(buildSecretRoom,function(){
    PHASE='secret2';SECRET2.stage=6;SECRET2.t=0;
    document.getElementById('black').style.transition='opacity 2.0s';
    document.getElementById('black').style.opacity='0';
    setTimeout(function(){showMsg('ОН СЛЕДИТ ЗА ТОБОЙ.',3.0);},800);
    setTimeout(function(){showSub('Вы','Что это...',2.4);sayE('Что это...');},2200);
    setTimeout(function(){showMsg('Он сканирует, а не смотрит. Не шуми.',3.4);},5200);
    setTimeout(triggerBetrayal,9500);
  });
}
function sndBetrayHit(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  var o=a.createOscillator(),g=a.createGain();
  o.type='square';o.frequency.setValueAtTime(180,t0);
  o.frequency.exponentialRampToValueAtTime(40,t0+0.3);
  g.gain.setValueAtTime(0.5,t0);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.4);
  o.connect(g);g.connect(a.destination);o.start(t0);o.stop(t0+0.4);
  var nb=a.createBuffer(1,Math.floor(a.sampleRate*0.4),a.sampleRate),nd=nb.getChannelData(0);
  for(var i=0;i<nd.length;i++){var x=i/a.sampleRate;nd[i]=(Math.random()*2-1)*Math.exp(-x*9);}
  var ns=a.createBufferSource();ns.buffer=nb;
  var ng=a.createGain();ng.gain.value=0.5;
  ns.connect(ng);ng.connect(a.destination);ns.start(t0);
}
function triggerBetrayal(){
  if(dead)return;
  SECRET2.stage=7;
  var ally2=makeAlly();
  ally2.position.set(P.x,0,P.z+2.4);
  ally2.rotation.y=Math.PI;
  scene.add(ally2);objs.push(ally2);
  showSub('Синий','Вот ты и попался.',3.0);
  sayE('Вот ты и попался.');
  if(typeof sndScare==='function')sndScare();
  setTimeout(function(){
    var d=document.getElementById('dmg');if(d)d.style.opacity='1';
    addShake(0.30);
    sndBetrayHit();
    if(typeof flash==='function')flash(0.9,300);
    setTimeout(function(){
      dead=true;
      if(window.Coins&&window.Progress&&!Progress.isCompleteSync('part2_secret_reward'))
        Coins.earn(200,'секретная концовка части II');
      if(window.Progress){Progress.markComplete('part2_secret');Progress.markComplete('part2_secret_reward');}
      document.getElementById('endtitle').style.color='#c02020';
      document.getElementById('endtitle').textContent='ТЫ ПОПАЛСЯ';
      document.getElementById('endsub').textContent='Синий не был тем, кем казался.';
      updateEndScreen();
      document.getElementById('endscreen').style.display='flex';
    },900);
  },3200);
}

// ---------- выбор ответа ----------
function askQuestion(){
  showSub('Синий','Что ты делаешь в заброшенном магазине?',4.0);
  sayE('Что ты делаешь в заброшенном магазине?');
  setTimeout(function(){
    showChoice([
      {t:'Я пришёл узнать, что здесь произошло',f:answerA},
      {t:'Я сам жалею, что сюда пришёл',      f:answerB}
    ]);
  },3800);
}
function answerA(){
  showSub('Вы','Я пришёл узнать, что здесь произошло.',3.0);sayE('Я пришёл узнать, что здесь произошло.');
  setTimeout(function(){
    showSub('Синий','Зачем?',2.0);sayE('Зачем?');
  },3200);
  setTimeout(function(){
    showSub('Вы','Сотрудники здесь пропали. Мне нужно узнать, что произошло.',4.2);sayE('Сотрудники здесь пропали. Мне нужно узнать, что произошло.');
  },5400);
  setTimeout(function(){
    showSub('Синий','Всё. Хорошо.',2.4);sayE('Всё. Хорошо.');
  },9800);
  setTimeout(goToBase,12800);
}
function answerB(){
  showSub('Вы','Я сам жалею, что сюда пришёл.',3.0);sayE('Я сам жалею, что сюда пришёл.');
  setTimeout(function(){
    showSub('Синий','А почему ты не догадывался?',3.0);
    sayE('А почему ты не догадывался?');
  },3200);
  setTimeout(function(){
    showSub('','...',2.6);      // молчим
  },6600);
  setTimeout(function(){
    showSub('Синий','Понятно.',1.8);sayE('Понятно.');
  },9400);
  setTimeout(goToBase,11800);
}
function showChoice(opts){
  var el=document.getElementById('choice');
  el.innerHTML='';
  opts.forEach(function(o){
    var b=document.createElement('button');
    b.className='chbtn';b.textContent=o.t;
    b.onclick=function(){el.classList.remove('show');setTimeout(function(){el.style.display='none';},400);o.f();};
    el.appendChild(b);
  });
  el.style.display='flex';
  setTimeout(function(){el.classList.add('show');},30);
}

// ---------- база ----------
function goToBase(){
  TR2.on=false;TR2.walking=false;questDone();
  Music.outro();
  document.getElementById('black').style.transition='opacity 1.6s';
  document.getElementById('black').style.opacity='1';
  // возвращаемся туда, где была комната со свечами
  setTimeout(startCandleReturn,1900);
}
function buildBase(){
  clearScene();walls=[];LAMPS=[];
  var W2=20,D2=16,HH=3.6;
  setBounds(0,0,W2,D2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.dark);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  MATS.corrWall.map.repeat.set(W2/3,HH/3);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,0);
  box(W2,HH,0.3,MATS.corrWall,W2/2,HH/2,D2);
  box(0.3,HH,D2,MATS.corrWall,0,HH/2,D2/2);
  box(0.3,HH,D2,MATS.corrWall,W2,HH/2,D2/2);
  // мешки, ящики, лампы — обжитое место
  for(var i=0;i<14;i++){
    var bx=2+Math.random()*(W2-4),bz=2+Math.random()*(D2-4);
    if(Math.hypot(bx-W2/2,bz-3)<3)continue;
    var h2=0.5+Math.random()*0.6;
    var c=new THREE.Mesh(new THREE.BoxGeometry(0.9,h2,0.9),
      new THREE.MeshStandardMaterial({color:0x5a5040,roughness:0.95,map:TEX.wood}));
    c.position.set(bx,h2/2,bz);addObj(c);
    solid(bx-0.5,bz-0.5,bx+0.5,bz+0.5);
  }
  // стол с картой и лампой
  var tb=new THREE.Group();
  var tp=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.1,1.3),MATS.wood);tp.position.y=0.9;tb.add(tp);
  [[-1.15,-0.55],[1.15,-0.55],[-1.15,0.55],[1.15,0.55]].forEach(function(q){
    var lg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.9,0.1),MATS.wood);
    lg.position.set(q[0],0.45,q[1]);tb.add(lg);
  });
  var lamp=new THREE.Mesh(new THREE.ConeGeometry(0.3,0.35,12,1,true),
    new THREE.MeshStandardMaterial({color:0x3a3a42,roughness:0.6,metalness:0.5,side:THREE.DoubleSide}));
  lamp.position.set(0.8,1.5,0);lamp.rotation.x=Math.PI;tb.add(lamp);
  tb.position.set(W2/2,0,D2-4);addObj(tb);
  solid(W2/2-1.4,D2-4.8,W2/2+1.4,D2-3.2);
  LAMPS.push([W2/2,1.5,D2-4,0xffd8a0,7,0.9]);
  LAMPS.push([4,HH-0.6,4,0xffd0a0,9,0.4]);
  scene.fog=new THREE.FogExp2(0x0d0b0a,0.06);
  ambientLight.intensity=0.14;ambientLight.color.setHex(0xfff0dc);sunLight.intensity=0;
}
function startBase(){
  PHASE='base';
  P.x=10;P.z=2.5;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;P.floorY=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;
  initTorch();initUV();syncGear();
  if(TR2.ally){scene.remove(TR2.ally);}
  var ally=makeAlly();ally.position.set(10,0,11);ally.rotation.y=0;
  scene.add(ally);objs.push(ally);
  document.getElementById('black').style.transition='opacity 2.0s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Синий','Здесь нас не найдут. Пока что.',3.4);sayE('Здесь нас не найдут. Пока что.');},2400);
  setTimeout(function(){showSub('Вы','База... Значит, вас тут несколько.',3.2);sayE('База... Значит, вас тут несколько.');},6600);
  setTimeout(function(){showMsg('ПРОДОЛЖЕНИЕ СЛЕДУЕТ',4.0);},10500);
}
// ============================================================
//  ВОЗВРАТ К СВЕЧАМ, КЛЮЧ ОТ ЛЮКА И ПОДВАЛ
// ============================================================
var CN2={on:false,t:0,ally:null,step:0,hasKey:false,opened:false};

function startCandleReturn(){
  PHASE='candle2';
  buildCandleRoom();
  P.x=2.6;P.z=5.4;P.y=0;P.vy=0;P.yaw=Math.PI;P.pitch=0;P.eye=EYE_H;P.floorY=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();syncGear();
  CN2.on=true;CN2.t=0;CN2.step=0;CN2.hasKey=false;CN2.opened=false;
  saveAt('candle2');
  // союзник рядом
  CN2.ally=makeAlly();
  CN2.ally.position.set(4.2,0,5.0);CN2.ally.rotation.y=-0.8;
  scene.add(CN2.ally);objs.push(CN2.ally);
  document.getElementById('black').style.transition='opacity 1.8s';
  document.getElementById('black').style.opacity='0';
  questHide();
  setTimeout(function(){
    showSub('Вы','Это же та комната. Со свечами.',3.0);sayE('Это же та комната. Со свечами.');
  },2200);
}
var CT2={l1:6.0,l2:10.0,l3:14.5,l4:19.0,key:23.0};
function updateCandleReturn(dt){
  if(!CN2.on)return;
  CN2.t+=dt;var t=CN2.t;
  CN.candles.forEach(function(c){
    c.userData.ph+=dt*7;
    var f=0.75+Math.sin(c.userData.ph)*0.12;
    c.userData.light.intensity=f;
  });
  if(CN2.ally){
    CN2.ally.rotation.y=Math.atan2(P.x-CN2.ally.position.x,P.z-CN2.ally.position.z);
  }
  if(t>CT2.l1&&CN2.step===0){
    CN2.step=1;
    showSub('Вы','Стоп. Лестница же упала. Обратно через вентиляцию не выйти.',4.4);sayE('Стоп. Лестница же упала. Обратно через вентиляцию не выйти.');
  }
  if(t>CT2.l2&&CN2.step===1){
    CN2.step=2;
    showSub('Синий','Ты — нет. Я пойду другим путём.',3.2);
    sayE('Ты нет. Я пойду другим путём.');
  }
  if(t>CT2.l3&&CN2.step===2){
    CN2.step=3;
    showSub('Синий','Там охрана. Наши. Тебя убьют, как только увидят.',4.4);
    sayE('Там охрана. Наши. Тебя убьют как только увидят.');
  }
  if(t>CT2.l4&&CN2.step===3){
    CN2.step=4;
    showSub('Синий','Я пройду и подставлю тебе лестницу. Спустишься.',4.2);
    sayE('Я пройду и подставлю тебе лестницу.');
  }
  if(t>CT2.key&&CN2.step===4){
    CN2.step=5;CN2.hasKey=true;
    sndPickup();
    showSub('Синий','Держи. Это от люка. Он тут, в полу.',4.0);
    sayE('Держи. Это от люка.');
    setTimeout(function(){
      if(CN2.on)questShow('Откройте люк','Ключ у вас');
    },3600);
  }
  cn2Near();
  updateCompanion(dt);
}
var nCn2=null;
function cn2Near(){
  nCn2=null;
  if(COMPANION.active){
    nCn2='release';setPrompt('👋 ОТПУСТИТЬ '+COMPANION.name.toUpperCase()+' — E',true);return;
  }
  var frC2=nearestFriend();
  if(frC2){nCn2='companion';nCompanionTarget=frC2;setPrompt('👋 ПОЗВАТЬ С СОБОЙ — E',true);return;}
  if(!CN.hatch)return;
  var d=Math.hypot(P.x-CN.hatch.position.x,P.z-CN.hatch.position.z);
  if(d<1.6){
    if(!CN2.hasKey){nCn2='locked';setPrompt('Люк заперт',false);return;}
    nCn2='hatch';setPrompt('🔑 ОТКРЫТЬ ЛЮК — E',true);return;
  }
  setPrompt('',false);
}
function cn2Act(){
  if(nCn2==='release'){
    var relName2=COMPANION.name;companionStop();
    showMsg(relName2+' останется здесь.',2.2);return;
  }
  if(nCn2==='companion'){
    if(nCompanionTarget){
      companionSetLead(nCompanionTarget,nCompanionTarget.userData.friendName);
      showMsg(nCompanionTarget.userData.friendName+' идёт с тобой.',2.2);
    }
    return;
  }
  if(nCn2!=='hatch'||CN2.opened)return;
  CN2.opened=true;CN2.on=false;questDone();
  ReunionMusic.stop();
  sndCreak();
  if(CN.hatch){CN.hatch.rotation.z=-1.1;CN.hatch.position.y=0.35;}
  showSub('Вы','Открылся. Там темно.',2.8);sayE('Открылся. Там темно.');
  setTimeout(function(){
    document.getElementById('black').style.transition='opacity 1.2s';
    document.getElementById('black').style.opacity='1';
  },2600);
  setTimeout(function(){startLoading(buildBasement,startBasement);},3900);
}

// ============================================================
//  ПОДВАЛ
// ============================================================
var BS={on:false,t:0,cube:null,cubeX:0,cubeZ:0,plate:null,pushed:false,
        wall:null,bulbs:[],bats:[],exitOpen:false,exitAt:null};

function buildBasement(){
  clearScene();walls=[];LAMPS=[];BS.bulbs=[];BS.bats=[];BS.pushed=false;BS.exitOpen=false;
  var W2=26,D2=18,HH=3.0;
  setBounds(0,0,W2,D2);
  var rough=new THREE.MeshStandardMaterial({color:0x3a352e,roughness:1.0,
    map:TEX.wallClean,bumpMap:TEX.wallClean,bumpScale:0.10});
  TEX.wallClean.repeat.set(W2/3,HH/2);
  MATS.corrFloor.map.repeat.set(W2,D2);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),MATS.corrFloor);
  fl.rotation.x=-Math.PI/2;fl.position.set(W2/2,0,D2/2);addObj(fl);
  var ce=new THREE.Mesh(new THREE.PlaneGeometry(W2,D2),rough);
  ce.rotation.x=Math.PI/2;ce.position.set(W2/2,HH,D2/2);addObj(ce);
  box(W2,HH,0.35,rough,W2/2,HH/2,0);
  box(W2,HH,0.35,rough,W2/2,HH/2,D2);
  box(0.35,HH,D2,rough,0,HH/2,D2/2);
  box(0.35,HH,D2,rough,W2,HH/2,D2/2);
  // опорные столбы
  for(var cx=5;cx<W2-3;cx+=6)for(var cz=5;cz<D2-3;cz+=7){
    var col=new THREE.Mesh(new THREE.BoxGeometry(0.8,HH,0.8),rough);
    col.position.set(cx,HH/2,cz);addObj(col);
    solid(cx-0.5,cz-0.5,cx+0.5,cz+0.5);
  }
  // хлам
  for(var i=0;i<16;i++){
    var bx=2+Math.random()*(W2-4),bz=2+Math.random()*(D2-4);
    if(Math.hypot(bx-3,bz-D2/2)<3.5)continue;
    var h2=0.4+Math.random()*0.7;
    var c=new THREE.Mesh(new THREE.BoxGeometry(0.9,h2,0.9),
      new THREE.MeshStandardMaterial({color:0x4a4034,roughness:0.98,map:TEX.wood}));
    c.position.set(bx,h2/2,bz);addObj(c);
    solid(bx-0.5,bz-0.5,bx+0.5,bz+0.5);
  }
  // лестница, которую подставил союзник
  var lad=makeLadder();
  lad.position.set(2.2,0,D2/2-0.6);lad.rotation.z=0.10;addObj(lad);
  // ---- КУБ И ПЛИТА ----
  var cube=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,1.1),
    new THREE.MeshStandardMaterial({color:0x6a5cff,roughness:0.35,metalness:0.3,
      emissive:0x2a1c8a,emissiveIntensity:0.6}));
  BS.cubeX=9.0;BS.cubeZ=D2/2;
  cube.position.set(BS.cubeX,0.55,BS.cubeZ);addObj(cube);
  BS.cube=cube;
  BS.wall={x1:BS.cubeX-0.62,z1:BS.cubeZ-0.62,x2:BS.cubeX+0.62,z2:BS.cubeZ+0.62};
  walls.push(BS.wall);
  BS.plateX=21.5;
  var plate=new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.0,0.10,18),
    new THREE.MeshStandardMaterial({color:0x3a3f46,roughness:0.6,metalness:0.5,
      emissive:0x501010,emissiveIntensity:0.8}));
  plate.position.set(BS.plateX,0.05,BS.cubeZ);addObj(plate);BS.plate=plate;
  [-0.8,0.8].forEach(function(sz){
    var rail=new THREE.Mesh(new THREE.BoxGeometry(13,0.07,0.1),
      new THREE.MeshStandardMaterial({color:0x5a5a64,roughness:0.5,metalness:0.6}));
    rail.position.set(15.2,0.04,BS.cubeZ+sz);addObj(rail);
  });
  // ---- ЛАМПЫ ДЛЯ ПИСТОЛЕТА И БАТАРЕЙКИ ДЛЯ ФОНАРЯ ----
  [[6.0,3.0],[17.0,4.0],[23.0,9.0],[13.0,15.0],[4.5,14.0]].forEach(function(s){
    var g=makeBulbPickup();g.position.set(s[0],0,s[1]);addObj(g);
    BS.bulbs.push({x:s[0],z:s[1],g:g,taken:false});
  });
  [[8.0,15.5],[19.5,14.5],[11.0,3.5],[24.0,16.0]].forEach(function(s){
    var g=makeBatteryMesh();g.position.set(s[0],0,s[1]);addObj(g);
    BS.bats.push({x:s[0],z:s[1],g:g,taken:false});
  });
  // ---- ВЫХОД ----
  var ex=new THREE.Mesh(new THREE.BoxGeometry(0.18,2.3,1.5),
    new THREE.MeshStandardMaterial({color:0x2a2a2e,roughness:0.6,metalness:0.5}));
  ex.position.set(W2-0.3,1.15,BS.cubeZ);addObj(ex);
  BS.exitMesh=ex;BS.exitAt={x:W2-1.5,z:BS.cubeZ};
  LAMPS.push([2.2,HH-0.5,D2/2,0xbfd8ff,5,0.35]);   // свет из открытого люка
  scene.fog=new THREE.FogExp2(0x060608,0.085);
  ambientLight.intensity=0.045;ambientLight.color.setHex(0xc0c8e0);sunLight.intensity=0;
}
function startBasement(){
  PHASE='basement';BS.on=true;BS.t=0;
  P.x=3.0;P.z=9.0;P.y=0;P.vy=0;P.yaw=-Math.PI/2;P.pitch=0;P.eye=EYE_H;P.floorY=0;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();syncGear();
  if(FL2.has)FL2.on=true;
  document.getElementById('black').style.transition='opacity 2.0s';
  document.getElementById('black').style.opacity='0';
  setTimeout(function(){showSub('Вы','Подвал. Тут ничего не видно.',3.0);sayE('Подвал. Тут ничего не видно.');},2200);
  setTimeout(function(){
    questShow('Дотолкайте куб до плиты','Луч ультрафиолета его двигает');
  },5200);
  setTimeout(function(){showMsg('По подвалу разбросаны лампы и батарейки',3.6);},8600);
}
function updateBasement(dt){
  if(!BS.on)return;
  BS.t+=dt;
  if(BS.cube)BS.cube.rotation.y+=dt*0.3;
  BS.bulbs.forEach(function(b){
    if(b.taken)return;
    b.g.rotation.y+=dt*1.5;b.g.position.y=Math.sin(BS.t*2.3+b.x)*0.04;
  });
  BS.bats.forEach(function(b){
    if(b.taken)return;
    b.g.rotation.y+=dt*1.3;b.g.position.y=Math.sin(BS.t*2.0+b.z)*0.035;
  });
  bsNear();
}
// вызывается из выстрела пистолета
function basementShot(){
  if(!BS.on||BS.pushed)return;
  var fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);
  if(P.x>=BS.cubeX)return;
  var dx=BS.cubeX-P.x,dz=BS.cubeZ-P.z,d=Math.hypot(dx,dz);
  if(d>11)return;
  var dot=(dx/d)*fx+(dz/d)*fz;
  if(dot<0.55)return;
  BS.cubeX=Math.min(BS.plateX,BS.cubeX+1.35);
  BS.cube.position.x=BS.cubeX;
  if(BS.wall){BS.wall.x1=BS.cubeX-0.62;BS.wall.x2=BS.cubeX+0.62;}
  sndPress();
  if(BS.cubeX>=BS.plateX-0.15){
    BS.pushed=true;
    BS.plate.material.emissive.setHex(0x105010);
    BS.plate.material.emissiveIntensity=2.2;
    setTimeout(bsOpenExit,700);
  }else showMsg('Толкнул. Ещё',1.4);
}
function bsOpenExit(){
  BS.exitOpen=true;
  if(BS.exitMesh){
    BS.exitMesh.material.color.setHex(0x2f8f4f);
    BS.exitMesh.material.emissive=new THREE.Color(0x1a5a30);
    BS.exitMesh.material.emissiveIntensity=1.2;
  }
  sndCreak();questDone();
  showSub('Вы','Открылось. Дальше — вниз.',3.0);sayE('Открылось. Дальше — вниз.');
  setTimeout(function(){ if(BS.on)questShow('Идите к выходу'); },2400);
}
var nBs=null;
function bsNear(){
  nBs=null;
  function d2(x,z){return Math.hypot(P.x-x,P.z-z);}
  for(var i=0;i<BS.bulbs.length;i++){
    var b=BS.bulbs[i];
    if(!b.taken&&d2(b.x,b.z)<1.3){nBs={t:'bulb',i:i};setPrompt('💡 ВЗЯТЬ ЛАМПУ — E',true);return;}
  }
  for(var k=0;k<BS.bats.length;k++){
    var t2=BS.bats[k];
    if(!t2.taken&&d2(t2.x,t2.z)<1.3){nBs={t:'bat',i:k};setPrompt('🔋 БАТАРЕЙКА — E',true);return;}
  }
  if(BS.exitOpen&&d2(BS.exitAt.x,BS.exitAt.z)<1.8){
    nBs={t:'exit'};setPrompt('🚪 ДАЛЬШЕ — E',true);return;
  }
  setPrompt('',false);
}
function bsAct(){
  if(!nBs)return;
  if(nBs.t==='bulb'){
    var b=BS.bulbs[nBs.i];b.taken=true;b.g.visible=false;
    UV.spare++;uvHUD();sndPickup();showMsg('Запасная лампа: '+UV.spare,1.8);
  }else if(nBs.t==='bat'){
    var t2=BS.bats[nBs.i];t2.taken=true;t2.g.visible=false;
    FL2.charge=Math.min(1,FL2.charge+0.45);sndPickup();showMsg('Батарея +45%',1.8);
  }else if(nBs.t==='exit'){
    BS.on=false;questDone();
    Music.outro&&Music.outro();
    // Это пока единственная точка, до которой дописан сюжет части II
    // (дальше — клиффхэнгер), поэтому засчитываем прохождение здесь.
    if(window.Coins&&window.Progress&&!Progress.isCompleteSync('part2_reward'))Coins.earn(150,'финал части II');
    if(window.Progress){Progress.markComplete('part2');Progress.markComplete('part2_reward');}
    document.getElementById('black').style.transition='opacity 1.6s';
    document.getElementById('black').style.opacity='1';
    setTimeout(function(){
      dead=true;
      document.getElementById('endtitle').style.color='#3fa85f';
      document.getElementById('endtitle').textContent='ПРОДОЛЖЕНИЕ СЛЕДУЕТ';
      document.getElementById('endsub').textContent='Подвал был только началом.';
      updateEndScreen();
      document.getElementById('endscreen').style.display='flex';
    },1800);
  }
}
// ============================================================
//  КУПОЛ: круглый детский приют под землёй.
//  Наверху ходит что-то железное. Музыка тихая, но страшная.
// ============================================================
var nDome=null;
var DM={on:false,t:0,R:22,h:11,core:null,spider:null,reached:false,step:0};

function buildDome(){
  clearScene();walls=[];LAMPS=[];
  var R=DM.R,HH=DM.h;
  setBounds(-R,-R,R,R);
  // пол
  MATS.floor.map.repeat.set(R,R);
  var fl=new THREE.Mesh(new THREE.CircleGeometry(R,48),
    new THREE.MeshStandardMaterial({color:0xd8d0c0,roughness:0.7,map:TEX.tile}));
  fl.rotation.x=-Math.PI/2;addObj(fl);
  // сам купол изнутри — детское небо, как в приюте
  if(!TEX.sky)TEX.sky=texSky();
  var dome=new THREE.Mesh(new THREE.SphereGeometry(R,40,24,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshStandardMaterial({map:TEX.sky,side:THREE.BackSide,roughness:0.95,
      emissive:0x33506a,emissiveIntensity:0.30}));
  dome.scale.y=HH/R;addObj(dome);
  // дорожка от края к центру
  var path=new THREE.Mesh(new THREE.PlaneGeometry(2.6,R),
    new THREE.MeshStandardMaterial({color:0xe0bc58,roughness:0.75}));
  path.rotation.x=-Math.PI/2;path.position.set(0,0.01,R/2);addObj(path);
  buildHouses(R);
  // ЦЕНТР — «сердце приюта»
  var core=new THREE.Group();
  var base=new THREE.Mesh(new THREE.CylinderGeometry(3.0,3.4,0.4,24),
    new THREE.MeshStandardMaterial({color:0x3a3f48,roughness:0.6,metalness:0.5}));
  base.position.y=0.2;core.add(base);
  var col2=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,2.6,18),
    new THREE.MeshStandardMaterial({color:0x2a2f38,roughness:0.5,metalness:0.65}));
  col2.position.y=1.6;core.add(col2);
  // кольцо экранов
  for(var s=0;s<8;s++){
    var sa=s/8*Math.PI*2;
    var scr=new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.5),
      new THREE.MeshStandardMaterial({color:0x0a1a12,emissive:0x2aa85a,
        emissiveIntensity:1.4,roughness:0.4}));
    scr.position.set(Math.cos(sa)*1.35,2.2,Math.sin(sa)*1.35);
    scr.rotation.y=-sa+Math.PI/2;core.add(scr);
  }
  var orb=new THREE.Mesh(new THREE.SphereGeometry(0.75,18,14),
    new THREE.MeshStandardMaterial({color:0x8adfff,emissive:0x2a9adf,
      emissiveIntensity:2.6,roughness:0.2}));
  orb.position.y=3.5;core.add(orb);core.userData.orb=orb;
  var cl=new THREE.PointLight(0x6adfff,1.6,14);cl.position.y=3.5;core.add(cl);
  addObj(core);DM.core=core;
  buildCordHub();
  solid(-3.2,-3.2,3.2,3.2);
  // ЖЕЛЕЗНЫЙ ПАУК снаружи купола — виден силуэтом сквозь «небо»
  var sp=new THREE.Group();
  var bod=new THREE.Mesh(new THREE.SphereGeometry(1.7,12,10),
    new THREE.MeshBasicMaterial({color:0x0a0a10,transparent:true,opacity:0.55}));
  bod.scale.set(1,0.65,1.3);sp.add(bod);
  for(var L=0;L<8;L++){
    var la=L/8*Math.PI*2;
    var leg=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.22,5.5),
      new THREE.MeshBasicMaterial({color:0x0a0a10,transparent:true,opacity:0.5}));
    leg.position.set(Math.cos(la)*2.6,-0.6,Math.sin(la)*2.6);
    leg.rotation.y=-la;leg.rotation.x=0.5;sp.add(leg);
  }
  sp.position.set(0,HH*0.92,0);addObj(sp);DM.spider=sp;
  scene.fog=new THREE.FogExp2(0x9aa8bc,0.010);
  ambientLight.intensity=0.55;ambientLight.color.setHex(0xdfe8f4);sunLight.intensity=0.15;
}

function startDome(back){
  PHASE='dome';
  if(!back)saveAt('dome');
  DM.on=true;DM.t=0;DM.reached=false;DM.step=0;
  P.x=0;P.z=DM.R-3;P.y=0;P.vy=0;P.yaw=0;P.pitch=0;P.eye=EYE_H;
  camera.rotation.z=0;camera.up.set(0,1,0);
  unstick();dead=false;mRun=false;syncBtn('brun',false);
  initTorch();initUV();syncGear();
  document.getElementById('black').style.transition='opacity 2.2s';
  document.getElementById('black').style.opacity='0';
  DomeMusic.start();
  if(!back){
    setTimeout(function(){showSub('Вы','Опять приют. Только... под землёй.',3.4);sayE('Опять приют. Только... под землёй.');},2600);
    setTimeout(function(){
      showSub('Вы','Наверху что-то ходит. Железное.',3.2);sayE('Наверху что-то ходит. Железное.');
      sndSteel();
    },7200);
  }
  if(back){
    document.getElementById('black').style.opacity='0';
    P.x=0;P.z=DM.R-3;DM.reached=true;
  } else {
    setTimeout(function(){questShow('Пройдите в центр купола');},10500);
  }
}
function updateDome(dt){
  if(!DM.on)return;
  DM.t+=dt;
  if(DM.core&&DM.core.userData.orb){
    DM.core.userData.orb.position.y=3.5+Math.sin(DM.t*1.1)*0.10;
    DM.core.userData.orb.rotation.y+=dt*0.5;
  }
  // паук ползает по куполу снаружи
  if(DM.spider){
    var a=DM.t*0.11;
    DM.spider.position.set(Math.cos(a)*DM.R*0.55,DM.h*0.90,Math.sin(a)*DM.R*0.55);
    DM.spider.rotation.y=-a;
    DM.spider.children.forEach(function(c,i){
      if(i>0)c.rotation.x=0.5+Math.sin(DM.t*2.4+i)*0.16;
    });
  }
  updateHouses(dt,DM.t);
  if(!DM.stepT)DM.stepT=0;
  DM.stepT-=dt;
  if(DM.stepT<=0){DM.stepT=2.6+Math.random()*2.4;sndSteel();}
  // подходы к домам
  var hn=(typeof houseNear==='function')?houseNear():null;
  if(cordNearHub()){
    nDome={t:'plug'};setPrompt('🔌 ВОТКНУТЬ ШНУР — E',true);
    updateHouses(dt,DM.t);
    if(!DM.stepT)DM.stepT=0;
    return;
  }
  nDome=hn;
  if(hn){
    setPrompt({enter:'🚪 ВОЙТИ — '+hn.name,locked:'🔒 '+hn.name+' — заперто',
               done:'✅ '+hn.name,notyet:'Сначала другой дом'}[hn.t],hn.t==='enter');
  } else if(DM.reached) setPrompt('',false);
  if(!DM.reached&&Math.hypot(P.x,P.z)<4.2&&DM.t>4){
    DM.reached=true;questDone();
    showSub('Вы','Это сердце приюта. Отсюда управляют всем.',4.0);sayE('Это сердце приюта. Отсюда управляют всем.');
    setTimeout(function(){
      var tgt=houseTarget();
      if(tgt)questShow(tgt.task,tgt.hint);
      else questShow('Все дома пройдены');
    },4600);
  }
}
// далёкий железный шаг по куполу
function sndSteel(){
  var a=getAC();if(!a)return;
  var t0=a.currentTime;
  var o=a.createOscillator(),g=a.createGain(),f=a.createBiquadFilter();
  o.type='triangle';
  o.frequency.setValueAtTime(90+Math.random()*40,t0);
  o.frequency.exponentialRampToValueAtTime(30,t0+0.5);
  f.type='lowpass';f.frequency.value=420;
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(0.16,t0+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.9);
  o.connect(f);f.connect(g);g.connect(a.destination);o.start(t0);o.stop(t0+1.0);
  [1,2.7,4.9].forEach(function(r,k){
    var m=a.createOscillator(),mg=a.createGain();
    m.type='sine';m.frequency.value=520*r;
    mg.gain.setValueAtTime(0.028/(k+1),t0);
    mg.gain.exponentialRampToValueAtTime(0.0001,t0+0.7+k*0.3);
    m.connect(mg);mg.connect(a.destination);m.start(t0);m.stop(t0+1.4);
  });
}
// ============================================================
//  ЗАДАНИЯ: табличка в правом верхнем углу
//  Выезжает, висит, при выполнении ставит птичку и уезжает.
// ============================================================
var QT={cur:null,timer:null};

function questShow(text,sub){
  var el=document.getElementById('quest');
  if(!el)return;
  QT.cur=text;
  el.innerHTML='<div class="qt">ЗАДАНИЕ</div>'+
               '<div class="qx"><span class="qbox"></span><span class="qtxt">'+text+'</span></div>'+
               (sub?'<div class="qs">'+sub+'</div>':'');
  el.classList.remove('done');
  el.classList.add('show');
  sndQuest(700);
}
function questDone(){
  var el=document.getElementById('quest');
  if(!el)return;
  if(!el.classList.contains('show'))return;   // нечего отмечать
  if(el.classList.contains('done'))return;    // уже отмечено
  el.classList.add('done');
  sndQuest(1150);
  clearTimeout(QT.timer);
  QT.timer=setTimeout(function(){
    el.classList.remove('show');
    el.classList.remove('done');
    QT.cur=null;
  },2600);
}
function questHide(){
  var el=document.getElementById('quest');
  if(!el)return;
  el.classList.remove('show');QT.cur=null;
}
function sndQuest(f){
  var a=getAC();if(!a)return;
  [0,0.09].forEach(function(dt,i){
    var o=a.createOscillator(),g=a.createGain();
    o.type='sine';o.frequency.value=f*(i?1.5:1);
    g.gain.setValueAtTime(0.045,a.currentTime+dt);
    g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dt+0.22);
    o.connect(g);g.connect(a.destination);
    o.start(a.currentTime+dt);o.stop(a.currentTime+dt+0.25);
  });
}
// ============================================================
//  СОХРАНЕНИЕ
//  Живёт в памяти вкладки: браузерное хранилище в этом окне
//  недоступно. Внутри одной сессии работает полностью.
// ============================================================
var SAVE={has:false,id:null,name:'',inv:null};

var CHECKPOINTS={
  warehouse:{name:'Склад с картой',  start:function(){startLoading(buildWarehouse,startWarehouse);}},
  hall:     {name:'Огромный коридор',start:function(){startHall();}},
  shelter:  {name:'Приют',           start:function(){startLoading(buildShelter,startShelter);}},
  oldstore: {name:'Старый склад',    start:function(){startLoading(buildOldStore,startOldStore);}},
  candle:   {name:'Комната со свечами',start:function(){startCandleRoom();}},
  uvstore:  {name:'Склад с УФ',      start:function(){startLoading(buildUVStore,startUVStore);}},
  station:  {name:'Станция в горе',  start:function(){startStation();}},
  dome:     {name:'Купол',           start:function(){startLoading(buildDome,startDome);}},
  throne:   {name:'Тронный зал',     start:function(){startThrone();}},
  candle2:  {name:'Комната со свечами',start:function(){startCandleReturn();}},
  basement: {name:'Подвал',          start:function(){startLoading(buildBasement,startBasement);}}
};

function saveAt(id){
  var cp=CHECKPOINTS[id];if(!cp)return;
  SAVE.has=true;SAVE.id=id;SAVE.name=cp.name;
  SAVE.inv={
    torch:!!FL2.has, charge:FL2.charge,
    uv:!!UV.has, loaded:UV.loaded, spare:UV.spare
  };
  showSaved();
  // Раньше SAVE жил только в памяти вкладки и терялся при перезагрузке —
  // теперь то же самое, что кладём в SAVE, уходит в профиль (слот 2),
  // поэтому "ПРОДОЛЖИТЬ" переживает закрытие вкладки и работает
  // с другого устройства под тем же ником.
  if(window.Profile)Profile.save(2,{id:SAVE.id,name:SAVE.name,inv:SAVE.inv});
}
function showSaved(){
  var el=document.getElementById('savedmsg');
  if(!el)return;
  el.textContent='💾 СОХРАНЕНО — '+SAVE.name;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(function(){el.classList.remove('show');},2600);
}
function loadSave(){
  if(!SAVE.has)return false;
  var cp=CHECKPOINTS[SAVE.id];if(!cp)return false;
  // сбрасываем всё, что могло остаться от прошлой попытки
  dead=false;
  document.getElementById('endscreen').style.display='none';
  document.getElementById('dmg').style.opacity='0';
  document.getElementById('white').style.opacity='0';
  document.getElementById('titlecard').style.display='none';
  document.getElementById('load').style.display='none';
  questHide();
  if(typeof HN!=='undefined')HN.armed=false;
  if(typeof CH!=='undefined')CH.on=false;
  if(typeof WH!=='undefined')WH.caught=true;
  if(typeof HL!=='undefined')HL.on=false;
  if(typeof US!=='undefined')US.on=false;
  if(typeof DM!=='undefined')DM.on=false;
  if(typeof TC!=='undefined')TC.on=false;
  [Music,SearchMusic,HammerMusic,DomeMusic].forEach(function(m){try{m.stop();}catch(e){}});
  camera.rotation.z=0;camera.up.set(0,1,0);
  mRun=false;syncBtn('brun',false);mCrouch=false;syncBtn('bcrouch',false);
  // возвращаем снаряжение
  initTorch();initUV();
  var iv=SAVE.inv||{};
  FL2.has=!!iv.torch;FL2.charge=iv.charge===undefined?1:iv.charge;
  FL2.on=false;FL2.shown=FL2.has;FL2.offT=0;FL2.y=-0.26;
  UV.has=!!iv.uv;UV.loaded=iv.loaded===undefined?5:iv.loaded;UV.spare=iv.spare||0;
  document.getElementById('batwrap').style.display=FL2.has?'block':'none';
  document.getElementById('bfl').style.display=FL2.has?'flex':'none';
  document.getElementById('buv').style.display=UV.has?'flex':'none';
  document.getElementById('brel').style.display=UV.has?'flex':'none';
  uvHUD();
  document.getElementById('black').style.transition='opacity 0.3s';
  document.getElementById('black').style.opacity='1';
  setTimeout(cp.start,400);
  return true;
}
function updateEndScreen(){
  var btn=document.getElementById('bload');
  if(!btn)return;
  btn.style.display=SAVE.has?'block':'none';
  var lbl=document.getElementById('bloadlbl');
  if(lbl)lbl.textContent=SAVE.has?('С СОХРАНЕНИЯ — '+SAVE.name):'';
}
// ============================================================
//  ЗВУК И МУЗЫКА
// ============================================================
var AC=null;
function getAC(){
  if(!AC)try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}
  if(AC&&AC.state==='suspended')try{AC.resume();}catch(e){}
  return AC;
}
function addShake(amt){P.shake=Math.min(0.4,(P.shake||0)+amt);}
// Заранее сгенерированные реплики (Fish Audio S2.1 Pro) — см. MASTERPLAN.md,
// осознанное исключение из «ноль внешних файлов», как и icons/skins/*.png (Этап 21).
// Ключ — точный текст, который передаётся в sayE(); новых реплик без записи
// в этой таблице озвучка не коснётся — упадёт на старый speechSynthesis.
var VOICE_LINES={
  'О, куда ты пошёл? Давай я с тобой.':'furnitureman_01',
  'Ты думал, ты убежал?':'furnitureman_02',
  'Я чую. Я думал, он здесь.':'furnitureman_03',
  'Да. Я один из мебельщиков.':'siniy_01',
  'И я буду твоим союзником. Я знаю куда идти.':'siniy_02',
  'А-а!':'siniy_03',
  'Что ты делаешь в заброшенном магазине?':'siniy_04',
  'Зачем?':'siniy_05',
  'Всё. Хорошо.':'siniy_06',
  'А почему ты не догадывался?':'siniy_07',
  'Понятно.':'siniy_08',
  'Здесь нас не найдут. Пока что.':'siniy_09',
  'Ты нет. Я пойду другим путём.':'siniy_10',
  'Там охрана. Наши. Тебя убьют как только увидят.':'siniy_11',
  'Я пройду и подставлю тебе лестницу.':'siniy_12',
  'Держи. Это от люка.':'siniy_13',
  'Вот ты и попался.':'siniy_14',
  'Да, я охранник. Что-то случилось?':'you_01',
  'Да... реально пахнет как мясо.':'you_02',
  'Фух... убежал.':'you_03',
  'Ключ. Прямо у решётки. Он что, обронил?':'you_04',
  'Маленький ключик. В книге вырезана дырка.':'you_05',
  'Просто книги.':'you_06',
  'Почему он так любит сейфы?':'you_07',
  'Отвёртка. Он держал в сейфе... отвёртку.':'you_08',
  'Открылось.':'you_09',
  'Где я...':'you_10',
  'Он ходит там. Надо тихо.':'you_11',
  'Там что-то шевелится.':'you_12',
  'Ненавижу пауков.':'you_13',
  'Сколько же их...':'you_14',
  'Теперь понятно, куда идти.':'you_15',
  'Какой высокий...':'you_16',
  'Их что, двое? И они... огромные.':'you_17',
  'Улица... я на улице.':'you_18',
  'Это... потолок. Это нарисовано.':'you_19',
  'Тут был приют? Нет... тут просто продавали детские вещи.':'you_20',
  'Сначала осмотрюсь.':'you_21',
  'С этой трубой что-то не так.':'you_22',
  'Что-то долго.':'you_23',
  'Почему я всё ещё еду?!':'you_24',
  'Зря я сюда скатился! Кажись, это не горка! Да, это не горка!!!':'you_25',
  'Где... где я теперь.':'you_26',
  'О! Новый фонарик! Настоящий, не то что тот, старый.':'you_27',
  'Опять склад? Тот же самый?':'you_28',
  'Ответил правильно. Значит, я не человек?':'you_29',
  'Что это... газ?':'you_30',
  'Не могу... стоять...':'you_31',
  'Стоп. Это же... первый этаж.':'you_32',
  'Опять... опять этот сон.':'you_33',
  'То, что позади — может вернуться.':'you_34',
  'Живой... кажется.':'you_35',
  'Свечи. Кто-то их зажёг.':'you_36',
  'Это же... тот самый грузовик.':'you_37',
  'Заперто. И заколочено снаружи.':'you_38',
  'Ещё один склад. Сколько их тут.':'you_39',
  'Вот он. УФ-излучатель.':'you_40',
  'Открутил. Лезу.':'you_41',
  'Лестница!.. Обратно уже не выйти.':'you_42',
  'Это что, станция? Внутри горы?':'you_43',
  'Поехали.':'you_44',
  'Шнур. Надо дотащить его до центра.':'you_45',
  'Игрушки. Все на местах.':'you_46',
  'Открылось. И свет загорелся.':'you_47',
  'Поехала!':'you_48',
  'Тут ничего не видно. Совсем.':'you_49',
  'Метки сошлись. Дверь поднялась.':'you_50',
  'Плита сработала. И свет дали.':'you_51',
  'Это... тронный зал?':'you_52',
  'Ты точно мебельщик?':'you_53',
  'Что... что я наделал?':'you_54',
  'У него на поясе два ключа. Этот — не мой размер, не берётся.':'you_55',
  'А вот этот, поменьше — беру.':'you_56',
  'Что это...':'you_57',
  'Я пришёл узнать, что здесь произошло.':'you_58',
  'Сотрудники здесь пропали. Мне нужно узнать, что произошло.':'you_59',
  'Я сам жалею, что сюда пришёл.':'you_60',
  'База... Значит, вас тут несколько.':'you_61',
  'Это же та комната. Со свечами.':'you_62',
  'Стоп. Лестница же упала. Обратно через вентиляцию не выйти.':'you_63',
  'Открылся. Там темно.':'you_64',
  'Подвал. Тут ничего не видно.':'you_65',
  'Открылось. Дальше — вниз.':'you_66',
  'Опять приют. Только... под землёй.':'you_67',
  'Наверху что-то ходит. Железное.':'you_68',
  'Это сердце приюта. Отсюда управляют всем.':'you_69',
  'Залез в кабину. Дальше — через кузов.':'you_70',
  'Это какая-то дверь. Может быть, подойдёт мой ключ, который я взял?':'you_71',
  'В районе снова тревога. Игорь Соколов, тридцать четыре года, зашёл в старый мебельный магазин — и пропал.':'diktor_01',
  'Ещё одно исчезновение. Марина Волкова заходила в тот же магазин неделей раньше. До сих пор не найдена.':'diktor_02',
  'Пропавшие, о которых мы недавно сообщали, найдены живыми. Но источники говорят — похожие случаи фиксируют и в других районах города.':'diktor_03'
};
var VOICE_CACHE={};
function sayE(txt){
  var id=VOICE_LINES[txt];
  if(id){
    try{
      var a=VOICE_CACHE[id];
      if(!a){a=new Audio('audio/voice/part2/'+id+'.mp3');VOICE_CACHE[id]=a;}
      else{a.pause();a.currentTime=0;}
      var p=a.play();
      if(p&&p.catch)p.catch(function(){sayEFallback(txt);});
      return;
    }catch(e){}
  }
  sayEFallback(txt);
}
function sayEFallback(txt){
  if(!window.speechSynthesis)return;
  try{var u=new SpeechSynthesisUtterance(txt);u.lang='ru-RU';u.rate=0.72;u.pitch=0.1;speechSynthesis.speak(u);}catch(e){}
}
function sndScare(){
  var a=getAC();if(!a)return;
  var o=a.createOscillator(),g=a.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(900,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(60,a.currentTime+0.5);
  g.gain.setValueAtTime(0.5,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+0.6);
  o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+0.65);
}
var _stepBuf=null;
function sndStep(run){
  var a=getAC();if(!a)return;
  if(!_stepBuf){   // раньше буфер шума пересоздавался на КАЖДЫЙ шаг
    _stepBuf=a.createBuffer(1,Math.floor(a.sampleRate*0.09),a.sampleRate);
    var d=_stepBuf.getChannelData(0);
    for(var i=0;i<d.length;i++){var x=i/a.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-x*40);}
  }
  var s=a.createBufferSource();s.buffer=_stepBuf;
  var f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=run?1400:900;
  var g=a.createGain();g.gain.value=run?0.16:0.09;
  s.connect(f);f.connect(g);g.connect(a.destination);s.start();
}
// ============================================================
//  ТЕМА ФИНАЛЬНОГО БОССА — «МУЗЫКА ДЛЯ ПОБЕГА» — отложена автором для второй части
//
//  Третья попытка, и на этот раз без единого экзотического API.
//  Нет OfflineAudioContext, нет WaveShaper, нет компрессора,
//  нет промисов, нет планировщика. Сэмплы считаются математикой
//  прямо в массив, массив кладётся в AudioBuffer, играет один
//  зацикленный источник. Используются только createBuffer,
//  createBufferSource и createGain — это есть везде.
// ============================================================
var Music=(function(){
  var A=null,master=null,gCalm=null,gTense=null,srcCalm=null,srcTense=null;
  var bufCalm=null,bufTense=null;
  var playing=false,live=false,ready=false,tense=false,level=0.55,err='';
  var BPM=132, S16=60/BPM/4, BARS=16, BARDUR=16*S16, ROOT=146.83;

  function hz(s){return ROOT*Math.pow(2,s/12);}
  function soft(x){return x/(1+Math.abs(x));}
  function saw(ph){return 2*(ph-Math.floor(ph))-1;}

  var MOTIF_A=[[0,12,2],[3,15,1],[4,19,2],[7,18,1],[8,19,2],[11,15,1],[12,12,3]];
  var MOTIF_B=[[0,12,2],[3,15,1],[4,22,2],[7,21,1],[8,19,2],[11,15,1],[12,14,1],[14,12,2]];
  var MOTIF_C=[[0,19,2],[3,22,1],[4,24,2],[7,23,1],[8,22,2],[11,19,1],[12,15,3]];
  var BASS_A =[[0,0,4],[4,0,2],[6,3,2],[8,-2,4],[12,-4,2],[14,-1,2]];
  var BASS_B =[[0,-2,4],[4,-2,2],[6,1,2],[8,-4,4],[12,-5,2],[14,-2,2]];

  function vKick(d,sr,t,v){
    var n=Math.floor(0.30*sr),i0=Math.floor(t*sr),ph=0;
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var x=i/sr, f=41+114*Math.exp(-x*38);
      ph+=f/sr;
      d[k]+=soft(Math.sin(ph*6.283185)*2.2)*Math.exp(-x*13)*v;
    }
  }
  function vSnare(d,sr,t,v){
    var n=Math.floor(0.20*sr),i0=Math.floor(t*sr),lp=0,ph=0;
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var x=i/sr, e=Math.exp(-x*22), nz=Math.random()*2-1;
      lp+=(nz-lp)*0.45;
      ph+=(215*Math.exp(-x*18)+110)/sr;
      d[k]+=((nz-lp)+Math.sin(ph*6.283185)*0.45)*e*v;
    }
  }
  function vHat(d,sr,t,v,open){
    var dur=open?0.12:0.030,n=Math.floor(dur*sr),i0=Math.floor(t*sr),prev=0;
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var nz=Math.random()*2-1, hp=nz-prev; prev=nz;
      d[k]+=hp*Math.exp(-(i/sr)*(open?26:95))*v*0.5;
    }
  }
  function vBass(d,sr,t,dur,semi,v,bright){
    var f=hz(semi-12),n=Math.floor((dur+0.05)*sr),i0=Math.floor(t*sr);
    var ph=0,ph2=0,lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.012?x/0.012:(x>dur*0.72?Math.max(0,1-(x-dur*0.72)/(dur*0.28+1e-6)):1);
      ph+=f/sr; ph2+=f/sr;
      var cut=0.05+0.30*Math.sin(Math.PI*Math.min(1,x/dur))*(bright?1.5:1);
      lp+=(saw(ph2)-lp)*Math.min(0.9,cut);
      d[k]+=(Math.sin(ph*6.283185)*0.85+soft(lp*2.6)*(bright?0.62:0.5))*e*v;
    }
  }
  function vPulse(d,sr,t,semi,v,cut){
    var n=Math.floor(0.11*sr),i0=Math.floor(t*sr),ph=0,lp=0,bp=0,f=hz(semi);
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var x=i/sr, e=x<0.004?x/0.004:Math.exp(-(x-0.004)*42);
      ph+=f/sr;
      lp+=(saw(ph)-lp)*Math.min(0.85,cut*Math.exp(-x*10));
      bp+=(lp-bp)*0.55;
      d[k]+=(lp-bp*0.55)*e*v;
    }
  }
  function vLead(d,sr,t,dur,semi,v,bright){
    var n=Math.floor((dur+0.05)*sr),i0=Math.floor(t*sr),f=hz(semi);
    var p1=0,p2=0,p3=0,lp=0;
    var f1=f*Math.pow(2,-9/1200), f3=f*Math.pow(2,9/1200);
    for(var i=0;i<n;i++){
      var k=i0+i; if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.014?x/0.014:(x>dur*0.6?Math.max(0,1-(x-dur*0.6)/(dur*0.4+1e-6)):1);
      p1+=f1/sr;p2+=f/sr;p3+=f3/sr;
      var raw=(saw(p1)+saw(p2)+saw(p3))/3;
      lp+=(raw-lp)*Math.min(0.9,0.10+0.42*Math.exp(-x*9)*(bright?1.35:1));
      d[k]+=soft(lp*3.4)*e*v;
    }
  }

  function renderPCM(isTense,sr){
    var loopLen=Math.floor(BARS*BARDUR*sr), tailLen=Math.floor(BARDUR*sr);
    var d=new Float32Array(loopLen+tailLen), i;
    for(var b=0;b<BARS;b++){
      var half=(b>=8)?1:0;
      var bl=half?BASS_B:BASS_A;
      var mt=half?MOTIF_C:((b%2===0)?MOTIF_A:MOTIF_B);
      for(var s=0;s<16;s++){
        var t=(b*16+s)*S16, m;
        if(s===0||s===8)vKick(d,sr,t,0.95);
        if(s===6||s===14)vKick(d,sr,t,0.5);
        if(isTense&&(s===4||s===12))vKick(d,sr,t,0.7);
        if(s===4||s===12)vSnare(d,sr,t,0.55);
        if(s%2===0)vHat(d,sr,t,0.22,false);
        if(half&&s%2===1)vHat(d,sr,t,0.11,false);
        if(s===14)vHat(d,sr,t,0.30,true);
        if(isTense&&s%2===1)vHat(d,sr,t,0.10,false);
        for(m=0;m<bl.length;m++)if(bl[m][0]===s)vBass(d,sr,t,bl[m][2]*S16,bl[m][1],0.40,isTense);
        if(s%2===0)vPulse(d,sr,t,[0,3,7,10][(s/2)%4],0.16,(half?0.42:0.34)*(isTense?1.6:1));
        for(m=0;m<mt.length;m++)if(mt[m][0]===s)vLead(d,sr,t,mt[m][2]*S16*0.95,mt[m][1],0.26,isTense);
        if(isTense&&s===0)vBass(d,sr,t,S16*16,6,0.14,false);
        if(isTense&&s===8)vBass(d,sr,t,S16*8,1,0.11,false);
      }
    }
    for(i=0;i<tailLen;i++)d[i]+=d[loopLen+i];    // хвосты — в начало, стык без обрыва
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var peak=0;
    for(i=0;i<loopLen;i++){var a2=out[i]<0?-out[i]:out[i];if(a2>peak)peak=a2;}
    if(peak>0){var g=0.82/peak;for(i=0;i<loopLen;i++)out[i]*=g;}
    return out;
  }

  function makeBuf(isTense){
    var sr=A.sampleRate, pcm=renderPCM(isTense,sr);
    var b=A.createBuffer(1,pcm.length,sr);
    b.getChannelData(0).set(pcm);
    return b;
  }
  function prepare(cb){
    if(ready){if(cb)cb();return;}
    A=getAC(); if(!A){err='нет аудио'; if(cb)cb(); return;}
    try{ bufCalm=makeBuf(false); bufTense=makeBuf(true); ready=true; err=''; }
    catch(e){ err=(e&&e.message)?e.message:'ошибка синтеза'; }
    if(cb)cb();
  }
  function launch(){
    if(live||!ready||!A)return;
    try{
      master=A.createGain(); master.gain.value=0.0001; master.connect(A.destination);
      gCalm=A.createGain();  gCalm.gain.value = tense?0.0001:1; gCalm.connect(master);
      gTense=A.createGain(); gTense.gain.value= tense?1:0.0001; gTense.connect(master);
      srcCalm=A.createBufferSource();  srcCalm.buffer=bufCalm;   srcCalm.loop=true;  srcCalm.connect(gCalm);
      srcTense=A.createBufferSource(); srcTense.buffer=bufTense; srcTense.loop=true; srcTense.connect(gTense);
      var t=A.currentTime+0.05;
      srcCalm.start(t); srcTense.start(t);
      master.gain.setValueAtTime(0.0001,t);
      master.gain.exponentialRampToValueAtTime(level,t+1.4);
      srcCalm.onended=function(){live=false;};
      live=true; err='';
    }catch(e){ err=(e&&e.message)?e.message:'ошибка запуска'; live=false; }
  }
  function start(){
    A=getAC(); if(!A)return;
    if(playing&&live)return;
    playing=true;
    
    if(!ready)prepare();
    launch();
  }
  function stop(){
    playing=false;
    try{if(srcCalm)srcCalm.stop();}catch(e){}
    try{if(srcTense)srcTense.stop();}catch(e){}
    srcCalm=srcTense=null; live=false;
    
  }
  function setLevel(v){
    level=v;
    if(master&&A&&live){
      master.gain.cancelScheduledValues(A.currentTime);
      master.gain.setValueAtTime(Math.max(0.0001,master.gain.value),A.currentTime);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001,level),A.currentTime+1.0);
    }
  }
  function setTense(v){
    v=!!v; if(v===tense)return; tense=v;
    if(!gCalm||!gTense||!A)return;
    var t=A.currentTime;
    function ramp(g,val){
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001,g.gain.value),t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001,val),t+1.1);
    }
    ramp(gCalm, tense?0.0001:1);
    ramp(gTense,tense?1:0.0001);
  }
  function pump(){
    if(!playing||!A)return;
    if(A.state==='suspended'){try{A.resume();}catch(e){}}
    if(!live){ if(!ready)prepare(); launch(); }
    if(live&&master&&master.gain.value<0.02){
      master.gain.cancelScheduledValues(A.currentTime);
      master.gain.setValueAtTime(0.02,A.currentTime);
      master.gain.exponentialRampToValueAtTime(level,A.currentTime+0.5);
    }
  }
  function stats(){
    return {on:playing,live:live,ready:ready,mode:tense?'тревога':'обычный',
            ctx:A?A.state:'нет',vol:master?Math.round(master.gain.value*100)/100:0,err:err};
  }
  // Для второй части: побег — сразу плотный слой, концовка — мягкий уход
  function escape(){ level=0.62; start(); setTense(true); }
  function outro(){
    if(!master||!A)return;
    master.gain.cancelScheduledValues(A.currentTime);
    master.gain.setValueAtTime(Math.max(0.0001,master.gain.value),A.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+2.4);
    setTimeout(stop,2500);
  }
  return {start:start,stop:stop,setTense:setTense,setLevel:setLevel,escape:escape,
          outro:outro,pump:pump,prepare:prepare,stats:stats,isOn:function(){return playing;}};
})();
// ============================================================
//  МУЗЫКА ПОИСКА — играет, пока ищем коробки на складе
//  Не погоня и не бой: тихое напряжение, тиканье, чувство,
//  что времени мало. Оригинальная, синтез сэмплов.
// ============================================================
var SearchMusic=(function(){
  var A=null,src=null,gain=null,buf=null,playing=false,ready=false,err='';
  var BPM=68, BEAT=60/BPM, BARS=8, BAR=4*BEAT;      // ~28 секунд
  var ROOT=97.999;                                   // соль большой октавы

  function soft(x){return x/(1+Math.abs(x));}
  function saw(p){return 2*(p-Math.floor(p))-1;}
  function hz(s){return ROOT*Math.pow(2,s/12);}

  // низкий дрон — фундамент, на нём всё держится
  function vDrone(d,sr,t,dur,semi,v){
    var f=hz(semi),n=Math.floor((dur+1.2)*sr),i0=Math.floor(t*sr),p1=0,p2=0,lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.9?x/0.9:(x>dur?Math.max(0,1-(x-dur)/1.2):1);
      p1+=f/sr;p2+=f*1.0031/sr;                      // лёгкая расстройка — «дышит»
      lp+=((Math.sin(p1*6.283185)+saw(p2)*0.35)-lp)*0.05;
      d[k]+=lp*e*v;
    }
  }
  // тиканье: сухой высокий щелчок, как метроном в пустом зале
  function vTick(d,sr,t,v,bright){
    var n=Math.floor(0.05*sr),i0=Math.floor(t*sr),prev=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var nz=Math.random()*2-1,hp=nz-prev;prev=nz;
      d[k]+=hp*Math.exp(-(i/sr)*(bright?140:200))*v;
    }
  }
  // глухой удар сердца
  function vPulse(d,sr,t,v){
    var n=Math.floor(0.4*sr),i0=Math.floor(t*sr),ph=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;ph+=(34+26*Math.exp(-x*26))/sr;
      d[k]+=soft(Math.sin(ph*6.283185)*1.6)*Math.exp(-x*9)*v;
    }
  }
  // редкий тревожный подъём: два тона в полутоне друг от друга
  function vSwell(d,sr,t,dur,semi,v){
    var n=Math.floor((dur+0.8)*sr),i0=Math.floor(t*sr);
    var f1=hz(semi),f2=hz(semi)*1.0595,p1=0,p2=0,lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<dur*0.6?x/(dur*0.6):Math.max(0,1-(x-dur*0.6)/(dur*0.4+0.8));
      p1+=f1/sr;p2+=f2/sr;
      lp+=((saw(p1)+saw(p2))*0.5-lp)*0.035;
      d[k]+=soft(lp*1.7)*e*v;
    }
  }
  // призвук металла на стеллажах
  function vClink(d,sr,t,v){
    var i0=Math.floor(t*sr);
    [1,2.41,4.17].forEach(function(r,q){
      var f=1180*r,n=Math.floor(0.5*sr),ph=0;
      for(var i=0;i<n;i++){
        var k=i0+i;if(k>=d.length)break;
        ph+=f/sr;
        d[k]+=Math.sin(ph*6.283185)*Math.exp(-(i/sr)*(9+q*4))*v/(q+1.4);
      }
    });
  }

  function render(sr){
    var loopLen=Math.floor(BARS*BAR*sr),tail=Math.floor(BAR*sr);
    var d=new Float32Array(loopLen+tail),i;
    var chords=[0,0,-2,-2,-5,-5,-3,-4];              // медленный спуск вниз
    for(var b=0;b<BARS;b++){
      var t0=b*BAR;
      vDrone(d,sr,t0,BAR,chords[b],0.34);
      vDrone(d,sr,t0,BAR,chords[b]+7,0.13);          // квинта сверху
      for(var beat=0;beat<4;beat++){
        var t=t0+beat*BEAT;
        vTick(d,sr,t,0.13,beat===0);                 // метроном
        if(beat===0)vPulse(d,sr,t,0.42);
        if(beat===2)vPulse(d,sr,t,0.20);
        if(beat===1||beat===3)vTick(d,sr,t+BEAT*0.5,0.05,false);
      }
      if(b===3||b===7)vSwell(d,sr,t0+BEAT*2,BAR*0.9,chords[b]+12,0.16);
      if(b%2===1)vClink(d,sr,t0+BEAT*(1+Math.random()*2),0.05);
    }
    for(i=0;i<tail;i++)d[i]+=d[loopLen+i];
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var sum=0;for(i=0;i<loopLen;i++)sum+=out[i]*out[i];
    var g=Math.sqrt(sum/loopLen); g=g>0?0.085/g:1;   // тише музыки побега: это фон
    for(i=0;i<loopLen;i++){
      var x=out[i]*g,ax=x<0?-x:x;
      if(ax>0.8)x=(x<0?-1:1)*(0.8+soft((ax-0.8)*4)*0.15);
      out[i]=x;
    }
    return out;
  }

  function prepare(){
    if(ready)return;
    A=getAC();if(!A){err='нет аудио';return;}
    try{
      var pcm=render(A.sampleRate);
      buf=A.createBuffer(1,pcm.length,A.sampleRate);
      buf.getChannelData(0).set(pcm);
      ready=true;err='';
    }catch(e){err=(e&&e.message)||'ошибка синтеза';}
  }
  function start(){
    A=getAC();if(!A)return;
    if(playing)return;
    if(!ready)prepare();
    if(!ready)return;
    try{
      gain=A.createGain();gain.gain.value=0.0001;gain.connect(A.destination);
      src=A.createBufferSource();src.buffer=buf;src.loop=true;src.connect(gain);
      var t=A.currentTime+0.05;
      src.start(t);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.85,t+3.0);   // вползает незаметно
      playing=true;
    }catch(e){err=(e&&e.message)||'ошибка запуска';}
  }
  function stop(){
    if(!playing||!A)return;
    playing=false;
    var s=src;
    if(gain){
      gain.gain.cancelScheduledValues(A.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001,gain.gain.value),A.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+2.6);  // уходит мягко
    }
    setTimeout(function(){try{if(s)s.stop();}catch(e){}},2800);
    src=null;
  }
  function pump(){
    if(!playing||!A)return;
    if(A.state==='suspended'){try{A.resume();}catch(e){}}
  }
  function stats(){return {on:playing,ready:ready,err:err};}
  return {prepare:prepare,start:start,stop:stop,pump:pump,stats:stats,
          isOn:function(){return playing;}};
})();
// ============================================================
//  «ДОЛБЁЖКА» — то, что включается на разгоне грузовика.
//  Бочка в каждую долю, перегруженный бас-удар, шестнадцатые хэты.
// ============================================================
var HammerMusic=(function(){
  var A=null,src=null,gain=null,buf=null,playing=false,ready=false,err='';
  var BPM=152, BEAT=60/BPM, S16=BEAT/4, BARS=4, BAR=4*BEAT;   // ~6.3 с
  var ROOT=48.999;                                            // соль контроктавы

  function soft(x){return x/(1+Math.abs(x));}
  function saw(p){return 2*(p-Math.floor(p))-1;}
  function hz(s){return ROOT*Math.pow(2,s/12);}

  function vKick(d,sr,t,v){
    var n=Math.floor(0.26*sr),i0=Math.floor(t*sr),ph=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;ph+=(44+180*Math.exp(-x*46))/sr;
      d[k]+=soft(Math.sin(ph*6.283185)*3.2)*Math.exp(-x*15)*v;   // жёсткая, с перегрузом
    }
  }
  function vStab(d,sr,t,dur,semi,v){
    var f=hz(semi),n=Math.floor((dur+0.05)*sr),i0=Math.floor(t*sr);
    var p1=0,p2=0,p3=0,lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.004?x/0.004:Math.exp(-(x-0.004)*11);
      p1+=f/sr;p2+=f*1.007/sr;p3+=f*0.5/sr;
      var raw=saw(p1)+saw(p2)+Math.sin(p3*6.283185)*1.2;
      lp+=(raw-lp)*Math.min(0.9,0.16+0.5*Math.exp(-x*16));
      d[k]+=soft(lp*2.6)*e*v;
    }
  }
  function vHat(d,sr,t,v,open){
    var dur=open?0.10:0.026,n=Math.floor(dur*sr),i0=Math.floor(t*sr),prev=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var nz=Math.random()*2-1,hp=nz-prev;prev=nz;
      d[k]+=hp*Math.exp(-(i/sr)*(open?28:110))*v*0.55;
    }
  }
  function vSnare(d,sr,t,v){
    var n=Math.floor(0.16*sr),i0=Math.floor(t*sr),lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr,nz=Math.random()*2-1;
      lp+=(nz-lp)*0.42;
      d[k]+=(nz-lp)*Math.exp(-x*26)*v;
    }
  }
  // сирена, которая ползёт вверх весь луп — от неё и «прёт»
  function vSiren(d,sr,v){
    var n=d.length,ph=0;
    for(var i=0;i<n;i++){
      var x=i/sr, k=x/(BARS*BAR);
      var f=180+520*k;
      ph+=f/sr;
      d[i]+=saw(ph)*0.5*v*(0.25+0.75*k)*(0.5+0.5*Math.sin(x*9));
    }
  }

  function render(sr){
    var loopLen=Math.floor(BARS*BAR*sr),tail=Math.floor(BAR*sr);
    var d=new Float32Array(loopLen+tail),i;
    var notes=[0,0,-2,-4];
    for(var b=0;b<BARS;b++){
      var t0=b*BAR;
      for(var s=0;s<16;s++){
        var t=t0+s*S16;
        if(s%4===0)vKick(d,sr,t,1.0);              // В КАЖДУЮ ДОЛЮ
        if(s===14)vKick(d,sr,t,0.55);
        if(s===4||s===12)vSnare(d,sr,t,0.42);
        vHat(d,sr,t,s%2===0?0.15:0.09,s===14);
        if(s%4===2)vStab(d,sr,t,S16*1.6,notes[b],0.52);
        if(s===7||s===15)vStab(d,sr,t,S16*1.2,notes[b]+7,0.34);
      }
    }
    vSiren(d,sr,0.10);
    for(i=0;i<tail;i++)d[i]+=d[loopLen+i];
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var sum=0;for(i=0;i<loopLen;i++)sum+=out[i]*out[i];
    var g=Math.sqrt(sum/loopLen);g=g>0?0.30/g:1;   // громко: это кульминация
    for(i=0;i<loopLen;i++){
      var x=out[i]*g,ax=x<0?-x:x;
      if(ax>0.86)x=(x<0?-1:1)*(0.86+soft((ax-0.86)*5)*0.13);
      out[i]=x;
    }
    return out;
  }
  function prepare(){
    if(ready)return;
    A=getAC();if(!A){err='нет аудио';return;}
    try{var pcm=render(A.sampleRate);
      buf=A.createBuffer(1,pcm.length,A.sampleRate);
      buf.getChannelData(0).set(pcm);ready=true;err='';}
    catch(e){err=(e&&e.message)||'ошибка синтеза';}
  }
  function start(){
    A=getAC();if(!A||playing)return;
    if(!ready)prepare();
    if(!ready)return;
    try{
      gain=A.createGain();gain.gain.value=0.0001;gain.connect(A.destination);
      src=A.createBufferSource();src.buffer=buf;src.loop=true;src.connect(gain);
      var t=A.currentTime+0.02;
      src.start(t);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(1.0,t+0.35);   // врубается почти мгновенно
      playing=true;
    }catch(e){err=(e&&e.message)||'ошибка запуска';}
  }
  function stop(){
    if(!playing||!A)return;playing=false;
    var s=src;
    if(gain){
      gain.gain.cancelScheduledValues(A.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001,gain.gain.value),A.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+0.9);
    }
    setTimeout(function(){try{if(s)s.stop();}catch(e){}},1000);
    src=null;
  }
  function pump(){if(playing&&A&&A.state==='suspended'){try{A.resume();}catch(e){}}}
  function stats(){return {on:playing,ready:ready,err:err};}
  return {prepare:prepare,start:start,stop:stop,pump:pump,stats:stats,
          isOn:function(){return playing;}};
})();
// ============================================================
//  МУЗЫКА КУПОЛА — тихая, но страшная. Не долбит.
//  Высокий висящий диссонанс, очень низкий гул, редкий скрежет.
// ============================================================
var DomeMusic=(function(){
  var A=null,src=null,gain=null,buf=null,playing=false,ready=false,err='';
  var BARS=8, BAR=5.4, ROOT=61.735;      // очень медленно, си контроктавы
  function soft(x){return x/(1+Math.abs(x));}
  function saw(p){return 2*(p-Math.floor(p))-1;}
  function hz(s){return ROOT*Math.pow(2,s/12);}

  // подземный гул — почти инфразвук
  function vSub(d,sr,t,dur,semi,v){
    var f=hz(semi-12),n=Math.floor((dur+2)*sr),i0=Math.floor(t*sr),p=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<1.6?x/1.6:(x>dur?Math.max(0,1-(x-dur)/2):1);
      p+=f/sr;
      d[k]+=Math.sin(p*6.283185)*e*v;
    }
  }
  // высокий висящий диссонанс — от него неуютно
  function vHigh(d,sr,t,dur,semi,v){
    var n=Math.floor((dur+2.5)*sr),i0=Math.floor(t*sr);
    var f1=hz(semi+24),f2=hz(semi+24)*1.0182;   // почти в унисон — биения
    var p1=0,p2=0,lp=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<2.0?x/2.0:(x>dur?Math.max(0,1-(x-dur)/2.5):1);
      p1+=f1/sr;p2+=f2/sr;
      lp+=((saw(p1)+saw(p2))*0.5-lp)*0.020;
      d[k]+=soft(lp*1.4)*e*v;
    }
  }
  // редкий скрежет металла где-то далеко
  function vScrape(d,sr,t,v){
    var n=Math.floor(1.6*sr),i0=Math.floor(t*sr),ph=0,prev=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=Math.sin(Math.PI*Math.min(1,x/1.6));
      ph+=(320+180*Math.sin(x*3.1))/sr;
      var nz=Math.random()*2-1,hp=nz-prev;prev=nz;
      d[k]+=(Math.sin(ph*6.283185)*0.4+hp*0.5)*e*v;
    }
  }
  // капля где-то в темноте
  function vDrip(d,sr,t,v){
    var n=Math.floor(0.5*sr),i0=Math.floor(t*sr),ph=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      ph+=(1400-700*x*2)/sr;
      d[k]+=Math.sin(ph*6.283185)*Math.exp(-x*13)*v;
    }
  }

  function render(sr){
    var loopLen=Math.floor(BARS*BAR*sr),tail=Math.floor(BAR*sr);
    var d=new Float32Array(loopLen+tail),i;
    var low=[0,0,-3,-3,-5,-5,-7,-4];
    var hi =[7,8,7,6,8,7,6,7];
    for(var b=0;b<BARS;b++){
      var t=b*BAR;
      vSub(d,sr,t,BAR*1.1,low[b],0.34);
      vHigh(d,sr,t,BAR*1.05,hi[b],0.052);
      if(b%3===1)vScrape(d,sr,t+BAR*0.4,0.045);
      if(b%2===0)vDrip(d,sr,t+BAR*(0.2+Math.random()*0.6),0.055);
    }
    for(i=0;i<tail;i++)d[i]+=d[loopLen+i];
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var sum=0;for(i=0;i<loopLen;i++)sum+=out[i]*out[i];
    var g=Math.sqrt(sum/loopLen);g=g>0?0.062/g:1;    // очень тихо: это тревога, не бой
    for(i=0;i<loopLen;i++){
      var x=out[i]*g,ax=x<0?-x:x;
      if(ax>0.8)x=(x<0?-1:1)*(0.8+soft((ax-0.8)*4)*0.15);
      out[i]=x;
    }
    return out;
  }
  function prepare(){
    if(ready)return;
    A=getAC();if(!A){err='нет аудио';return;}
    try{var pcm=render(A.sampleRate);
      buf=A.createBuffer(1,pcm.length,A.sampleRate);
      buf.getChannelData(0).set(pcm);ready=true;err='';}
    catch(e){err=(e&&e.message)||'ошибка синтеза';}
  }
  function start(){
    A=getAC();if(!A||playing)return;
    if(!ready)prepare();
    if(!ready)return;
    try{
      gain=A.createGain();gain.gain.value=0.0001;gain.connect(A.destination);
      src=A.createBufferSource();src.buffer=buf;src.loop=true;src.connect(gain);
      var t=A.currentTime+0.05;src.start(t);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.9,t+5.0);   // вползает очень медленно
      playing=true;
    }catch(e){err=(e&&e.message)||'ошибка запуска';}
  }
  function stop(){
    if(!playing||!A)return;playing=false;
    var s=src;
    if(gain){
      gain.gain.cancelScheduledValues(A.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001,gain.gain.value),A.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+3.0);
    }
    setTimeout(function(){try{if(s)s.stop();}catch(e){}},3200);src=null;
  }
  function pump(){if(playing&&A&&A.state==='suspended'){try{A.resume();}catch(e){}}}
  function stats(){return {on:playing,ready:ready,err:err};}
  return {prepare:prepare,start:start,stop:stop,pump:pump,stats:stats,
          isOn:function(){return playing;}};
})();
// ============================================================
//  МУЗЫКА ГЛАВНОГО МЕНЮ
//  Медленная, минорная, с простой запоминающейся темой.
// ============================================================
var MenuMusic=(function(){
  var A=null,src=null,gain=null,buf=null,playing=false,ready=false,err='';
  var BPM=64, BEAT=60/BPM, BARS=8, BAR=4*BEAT, ROOT=110.0;   // ля большой октавы
  function soft(x){return x/(1+Math.abs(x));}
  function saw(p){return 2*(p-Math.floor(p))-1;}
  function hz(s){return ROOT*Math.pow(2,s/12);}

  function vPad(d,sr,t,dur,semis,v){
    var n=Math.floor((dur+1.6)*sr),i0=Math.floor(t*sr),ph=[],j,lp=0;
    for(j=0;j<semis.length;j++)ph.push(Math.random());
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<1.2?x/1.2:(x>dur?Math.max(0,1-(x-dur)/1.6):1);
      var raw=0;
      for(j=0;j<semis.length;j++){
        var f=hz(semis[j]);ph[j]+=f/sr;
        raw+=saw(ph[j])+saw(ph[j]*1.0016);
      }
      raw/=(semis.length*2);
      lp+=(raw-lp)*0.045;
      d[k]+=lp*e*v;
    }
  }
  // тема: несколько нот, которые запоминаются
  function vBell(d,sr,t,semi,v){
    var n=Math.floor(2.6*sr),i0=Math.floor(t*sr),f=hz(semi+12);
    var p1=0,p2=0,p3=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      p1+=f/sr;p2+=f*2.01/sr;p3+=f*3.02/sr;
      var e=Math.exp(-x*1.5);
      d[k]+=(Math.sin(p1*6.283185)+Math.sin(p2*6.283185)*0.35+Math.sin(p3*6.283185)*0.16)*e*v;
    }
  }
  function vBass(d,sr,t,dur,semi,v){
    var f=hz(semi-24),n=Math.floor((dur+0.6)*sr),i0=Math.floor(t*sr),p=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.15?x/0.15:(x>dur?Math.max(0,1-(x-dur)/0.6):1);
      p+=f/sr;
      d[k]+=soft(Math.sin(p*6.283185)*1.3)*e*v;
    }
  }
  function vAir(d,sr,v){
    var prev=0,lp=0;
    for(var i=0;i<d.length;i++){
      var nz=Math.random()*2-1,hp=nz-prev;prev=nz;
      lp+=(hp-lp)*0.02;
      d[i]+=lp*v*(0.6+0.4*Math.sin(i/44100*0.35));
    }
  }
  function render(sr){
    var loopLen=Math.floor(BARS*BAR*sr),tail=Math.floor(BAR*sr);
    var d=new Float32Array(loopLen+tail),i;
    var chords=[[0,3,7],[0,3,7],[-4,0,3],[-4,0,3],[-5,-1,2],[-5,-1,2],[-7,-4,0],[-2,1,5]];
    var mel  =[12,null,15,null,19,18,15,12];
    for(var b=0;b<BARS;b++){
      var t=b*BAR;
      vPad(d,sr,t,BAR*1.05,chords[b],0.14);
      vBass(d,sr,t,BAR*0.9,chords[b][0],0.30);
      if(mel[b]!==null)vBell(d,sr,t+BEAT*0.5,mel[b],0.13);
      if(b===7)vBell(d,sr,t+BEAT*2.5,10,0.10);
    }
    vAir(d,sr,0.030);
    for(i=0;i<tail;i++)d[i]+=d[loopLen+i];
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var sum=0;for(i=0;i<loopLen;i++)sum+=out[i]*out[i];
    var g=Math.sqrt(sum/loopLen);g=g>0?0.095/g:1;
    for(i=0;i<loopLen;i++){
      var x=out[i]*g,ax=x<0?-x:x;
      if(ax>0.82)x=(x<0?-1:1)*(0.82+soft((ax-0.82)*4)*0.14);
      out[i]=x;
    }
    return out;
  }
  function prepare(){
    if(ready)return;
    A=getAC();if(!A){err='нет аудио';return;}
    try{var pcm=render(A.sampleRate);
      buf=A.createBuffer(1,pcm.length,A.sampleRate);
      buf.getChannelData(0).set(pcm);ready=true;err='';}
    catch(e){err=(e&&e.message)||'ошибка синтеза';}
  }
  function start(){
    A=getAC();if(!A||playing)return;
    if(!ready)prepare();
    if(!ready)return;
    try{
      gain=A.createGain();gain.gain.value=0.0001;gain.connect(A.destination);
      src=A.createBufferSource();src.buffer=buf;src.loop=true;src.connect(gain);
      var t=A.currentTime+0.05;src.start(t);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.9,t+2.2);
      playing=true;
    }catch(e){err=(e&&e.message)||'ошибка запуска';}
  }
  function stop(){
    if(!playing||!A)return;playing=false;
    var s=src;
    if(gain){
      gain.gain.cancelScheduledValues(A.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001,gain.gain.value),A.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+1.4);
    }
    setTimeout(function(){try{if(s)s.stop();}catch(e){}},1600);src=null;
  }
  function pump(){if(playing&&A&&A.state==='suspended'){try{A.resume();}catch(e){}}}
  return {prepare:prepare,start:start,stop:stop,pump:pump,isOn:function(){return playing;}};
})();
// ============================================================
//  МУЗЫКА ВСТРЕЧИ НА БАЗЕ — Этап 26: та же формула, что у MenuMusic
//  (pad+bell+bass), но мажорные трезвучия вместо минорных и темп
//  чуть живее — тепло, а не тревожно. Играет с момента, когда на
//  базе появляется НОВЫЙ друг (celebrated-момент, sndCelebrate()),
//  останавливается при выходе с базы (cnAct()/cn2Act()). Полноценная
//  сцена "тусовки" с несколькими танцующими NPC — отдельный будущий
//  подэтап, здесь только сама дорожка.
// ============================================================
var ReunionMusic=(function(){
  var A=null,src=null,gain=null,buf=null,playing=false,ready=false,err='';
  var BPM=88, BEAT=60/BPM, BARS=8, BAR=4*BEAT, ROOT=130.81;   // до малой октавы — светлее MenuMusic
  function soft(x){return x/(1+Math.abs(x));}
  function saw(p){return 2*(p-Math.floor(p))-1;}
  function hz(s){return ROOT*Math.pow(2,s/12);}
  function vPad(d,sr,t,dur,semis,v){
    var n=Math.floor((dur+1.6)*sr),i0=Math.floor(t*sr),ph=[],j,lp=0;
    for(j=0;j<semis.length;j++)ph.push(Math.random());
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<1.2?x/1.2:(x>dur?Math.max(0,1-(x-dur)/1.6):1);
      var raw=0;
      for(j=0;j<semis.length;j++){
        var f=hz(semis[j]);ph[j]+=f/sr;
        raw+=saw(ph[j])+saw(ph[j]*1.0016);
      }
      raw/=(semis.length*2);
      lp+=(raw-lp)*0.045;
      d[k]+=lp*e*v;
    }
  }
  function vBell(d,sr,t,semi,v){
    var n=Math.floor(2.6*sr),i0=Math.floor(t*sr),f=hz(semi+12);
    var p1=0,p2=0,p3=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      p1+=f/sr;p2+=f*2.01/sr;p3+=f*3.02/sr;
      var e=Math.exp(-x*1.5);
      d[k]+=(Math.sin(p1*6.283185)+Math.sin(p2*6.283185)*0.35+Math.sin(p3*6.283185)*0.16)*e*v;
    }
  }
  function vBass(d,sr,t,dur,semi,v){
    var f=hz(semi-24),n=Math.floor((dur+0.6)*sr),i0=Math.floor(t*sr),p=0;
    for(var i=0;i<n;i++){
      var k=i0+i;if(k>=d.length)break;
      var x=i/sr;
      var e=x<0.15?x/0.15:(x>dur?Math.max(0,1-(x-dur)/0.6):1);
      p+=f/sr;
      d[k]+=soft(Math.sin(p*6.283185)*1.3)*e*v;
    }
  }
  function vAir(d,sr,v){
    var prev=0,lp=0;
    for(var i=0;i<d.length;i++){
      var nz=Math.random()*2-1,hp=nz-prev;prev=nz;
      lp+=(hp-lp)*0.02;
      d[i]+=lp*v*(0.6+0.4*Math.sin(i/44100*0.35));
    }
  }
  function render(sr){
    var loopLen=Math.floor(BARS*BAR*sr),tail=Math.floor(BAR*sr);
    var d=new Float32Array(loopLen+tail),i;
    // мажорные трезвучия (0,4,7 — большая терция) вместо минорных у
    // MenuMusic (0,3,7) — та же прогрессия по ступеням, светлее внутри
    var chords=[[0,4,7],[0,4,7],[5,9,12],[5,9,12],[-2,2,5],[-2,2,5],[3,7,10],[0,4,7]];
    var mel   =[12,15,19,15,17,19,15,12];    // восходящая тема, разрешается вниз к тонике
    for(var b=0;b<BARS;b++){
      var t=b*BAR;
      vPad(d,sr,t,BAR*1.05,chords[b],0.14);
      vBass(d,sr,t,BAR*0.9,chords[b][0],0.28);
      vBell(d,sr,t+BEAT*0.5,mel[b],0.15);
    }
    vAir(d,sr,0.024);
    for(i=0;i<tail;i++)d[i]+=d[loopLen+i];
    var out=new Float32Array(loopLen);
    for(i=0;i<loopLen;i++)out[i]=d[i];
    var sum=0;for(i=0;i<loopLen;i++)sum+=out[i]*out[i];
    var g=Math.sqrt(sum/loopLen);g=g>0?0.10/g:1;
    for(i=0;i<loopLen;i++){
      var x=out[i]*g,ax=x<0?-x:x;
      if(ax>0.82)x=(x<0?-1:1)*(0.82+soft((ax-0.82)*4)*0.14);
      out[i]=x;
    }
    return out;
  }
  function prepare(){
    if(ready)return;
    A=getAC();if(!A){err='нет аудио';return;}
    try{var pcm=render(A.sampleRate);
      buf=A.createBuffer(1,pcm.length,A.sampleRate);
      buf.getChannelData(0).set(pcm);ready=true;err='';}
    catch(e){err=(e&&e.message)||'ошибка синтеза';}
  }
  function start(){
    A=getAC();if(!A||playing)return;
    if(!ready)prepare();
    if(!ready)return;
    try{
      gain=A.createGain();gain.gain.value=0.0001;gain.connect(A.destination);
      src=A.createBufferSource();src.buffer=buf;src.loop=true;src.connect(gain);
      var t=A.currentTime+0.05;src.start(t);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.85,t+2.4);
      playing=true;
    }catch(e){err=(e&&e.message)||'ошибка запуска';}
  }
  function stop(){
    if(!playing||!A)return;playing=false;
    var s=src;
    if(gain){
      gain.gain.cancelScheduledValues(A.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001,gain.gain.value),A.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+1.6);
    }
    setTimeout(function(){try{if(s)s.stop();}catch(e){}},1800);src=null;
  }
  function pump(){if(playing&&A&&A.state==='suspended'){try{A.resume();}catch(e){}}}
  return {prepare:prepare,start:start,stop:stop,pump:pump,isOn:function(){return playing;}};
})();
// ============================================================
//  УПРАВЛЕНИЕ
// ============================================================
var K={},jmx=0,jmy=0,mRun=false,mCrouch=false,mJump=false;
document.addEventListener('keydown',function(e){
  if(window.CONTROLS&&CONTROLS.settingsOpen())return;
  if(dead)return;
  // Физическая клавиша переводится в ту, которую ждёт игра.
  // Игрок переназначил вперёд на стрелку — сюда придёт 'KeyW'.
  var c=window.CONTROLS?CONTROLS.canon(e.code):e.code;
  K[c]=true;
  if(c==='KeyE')actPress();

  if(c==='KeyF')toggleTorch();
  if(c==='KeyR')uvReload();
  if(c==='KeyQ'&&!K.__uv){K.__uv=true;uvDown();}
  if(c==='Space')e.preventDefault();
});
document.addEventListener('keyup',function(e){
  var c=window.CONTROLS?CONTROLS.canon(e.code):e.code;
  K[c]=false;if(c==='KeyQ'){K.__uv=false;uvUp();}
});

var jz=document.getElementById('jzone'),jk=document.getElementById('jknob');
var jOn=false,jId=null,jcx=0,jcy=0;
function jFind(l,id){for(var i=0;i<l.length;i++)if(l[i].identifier===id)return l[i];return null;}
function jStart(e){
  getAC();if(jOn)return;
  var t;
  if(e.changedTouches){t=e.changedTouches[0];jId=t.identifier;}else{t=e;jId=null;}
  jOn=true;var r=jz.getBoundingClientRect();jcx=r.left+r.width/2;jcy=r.top+r.height/2;jCalc(t);
}
function jMov(e){
  if(!jOn)return;var t;
  if(e.changedTouches){t=jFind(e.changedTouches,jId);if(!t)return;}
  else{if(jId!==null)return;t=e;}
  jCalc(t);
}
function jCalc(t){
  var dx=t.clientX-jcx,dy=t.clientY-jcy,d=Math.hypot(dx,dy),r=50;
  if(d>r){dx=dx/d*r;dy=dy/d*r;}
  jmx=dx/r;jmy=dy/r;jk.style.left=(38+dx)+'px';jk.style.top=(38+dy)+'px';
}
function jEnd(e){
  if(e&&e.changedTouches&&!jFind(e.changedTouches,jId))return;
  jOn=false;jId=null;jmx=0;jmy=0;jk.style.left='38px';jk.style.top='38px';
}
jz.addEventListener('touchstart',jStart,{passive:true});
jz.addEventListener('touchmove',jMov,{passive:true});
jz.addEventListener('touchend',jEnd);jz.addEventListener('touchcancel',jEnd);
jz.addEventListener('mousedown',jStart);
document.addEventListener('mousemove',jMov);document.addEventListener('mouseup',jEnd);

var lOn=false,lId=-1,llx=0,lly=0;
function isJoy(x,y){var r=jz.getBoundingClientRect();return x>=r.left-24&&x<=r.right+24&&y>=r.top-24&&y<=r.bottom+24;}
// Кроме круглых кнопок действий (.btn) сюда же попадают все остальные
// плавающие кнопки интерфейса — раньше на них не было общей метки,
// и палец, коснувшийся, например, "рюкзака" или "осмотра", ОДНОВРЕМЕННО
// начинал поворот камеры (эти кнопки не входят в зону джойстика).
function isBtn(t){
  if(!t)return false;
  if(t.classList&&(t.classList.contains('btn')||t.classList.contains('touchui')))return true;
  var el=t.closest?t.closest('#inv-btn,#mg-gear,#adm-panel,#inv-panel,#mg-set'):null;
  return !!el;
}
document.addEventListener('touchstart',function(e){
  getAC();
  for(var i=0;i<e.changedTouches.length;i++){
    var t=e.changedTouches[i];
    if(isJoy(t.clientX,t.clientY)||isBtn(t.target))continue;
    if(lOn)continue;
    lOn=true;lId=t.identifier;llx=t.clientX;lly=t.clientY;
  }
},{passive:true});
document.addEventListener('touchmove',function(e){
  if(!lOn||dead)return;
  for(var i=0;i<e.changedTouches.length;i++){
    var t=e.changedTouches[i];if(t.identifier!==lId)continue;
    // Та же чувствительность/инверсия, что и у мыши (из настроек), только
    // с поправкой — палец на экране физически двигается меньше, чем мышь.
    var tsx=(window.CONTROLS?CONTROLS.mouseX():0.002)*2.5;
    var tsy=(window.CONTROLS?CONTROLS.mouseY():0.002)*2.0;
    P.yaw-=(t.clientX-llx)*tsx;
    P.pitch=Math.max(-0.6,Math.min(0.6,P.pitch-(t.clientY-lly)*tsy));
    llx=t.clientX;lly=t.clientY;
  }
},{passive:true});
document.addEventListener('touchend',function(e){
  for(var i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===lId){lOn=false;lId=-1;}
});
document.addEventListener('mousemove',function(e){
  if(!document.pointerLockElement||dead)return;
  // Чувствительность и инверсия берутся из настроек.
  var sx=window.CONTROLS?CONTROLS.mouseX():0.002;
  var sy=window.CONTROLS?CONTROLS.mouseY():0.002;
  P.yaw-=e.movementX*sx;
  P.pitch=Math.max(-0.6,Math.min(0.6,P.pitch-e.movementY*sy));
});
// Захват указателя: без него мышь упирается в край экрана.
if(window.CONTROLS){
  CONTROLS.enablePointerLock(document.getElementById('renderer'));
  if(!CONTROLS.isTouch())CONTROLS.addGear();
}
renderer&&0;
function mkbtn(id,dn,up){
  var el=document.getElementById(id);if(!el)return;
  function d(e){if(e){e.stopPropagation();if(e.cancelable)e.preventDefault();}getAC();el.classList.add('pressed');dn&&dn();}
  function u(e){if(e){e.stopPropagation();}el.classList.remove('pressed');up&&up();}
  el.addEventListener('touchstart',d,{passive:false});el.addEventListener('touchend',u);
  el.addEventListener('mousedown',d);el.addEventListener('mouseup',u);
}
function mktoggle(id,fn){
  var el=document.getElementById(id);if(!el)return;
  function d(e){if(e){e.stopPropagation();if(e.cancelable)e.preventDefault();}getAC();
    var on=fn();if(on)el.classList.add('pressed');else el.classList.remove('pressed');}
  el.addEventListener('touchstart',d,{passive:false});el.addEventListener('mousedown',d);
}
function syncBtn(id,on){var el=document.getElementById(id);if(!el)return;if(on)el.classList.add('pressed');else el.classList.remove('pressed');}
mktoggle('brun',function(){mRun=!mRun;if(mRun){mCrouch=false;syncBtn('bcrouch',false);}return mRun;});
mktoggle('bcrouch',function(){mCrouch=!mCrouch;if(mCrouch){mRun=false;syncBtn('brun',false);}return mCrouch;});
mkbtn('bjump',function(){mJump=true;},null);
mkbtn('bfl',toggleTorch,null);
mkbtn('buv',uvDown,uvUp);            // зажал — раскрывается, отпустил — выстрел
mkbtn('brel',uvReload,null);
mkbtn('bact',actPress,null);


// ============================================================
//  КНОПКА ДЕЙСТВИЯ
//  Раньше фазы без своего обработчика проваливались в doAct(),
//  а там оставалась старая цель из магазина — и игра начиналась заново.
//  Теперь у каждой фазы свой обработчик, остальные просто молчат.
// ============================================================
function actPress(){
  if(dead)return;
  switch(PHASE){
    case 'store': case 'follow': doAct(); break;
    case 'prison':    prAct();      break;
    case 'vent':      ventHit();    break;
    case 'warehouse': whAct();      break;
    case 'hall':      hallAct();    break;
    case 'shelter':   shelterAct(); break;
    case 'oldstore':  osAct();      break;
    case 'wake':      wakeAct();    break;
    case 'candle':    cnAct();      break;
    case 'fork':      fkAct();      break;
    case 'uvstore':   usAct();      break;
    case 'station':   stAct();      break;
    case 'dome':
      if(nDome&&nDome.t==='plug')cordPlug();
      else if(nDome)houseAct(nDome);
      break;
    case 'house':     if(UH.on)uhAct(); else thAct(); break;
    case 'candle2':   cn2Act();     break;
    case 'basement':  bsAct();      break;
    case 'secret2':   secret2Act(); break;
    // gas, dream1, bed, ride, truck, title, loading, dome — действий нет
  }
}

// ============================================================
//  ОБНОВЛЕНИЕ
// ============================================================
var stepT=0;
var GEAR_PHASES={throne:1,base:1,candle2:1,basement:1,store:1,follow:1,prison:1,vent:1,warehouse:1,hall:1,shelter:1,
                 oldstore:1,wake:1,candle:1,fork:1,uvstore:1,station:1,dome:1,house:1};
function syncGear(){
  var f=document.getElementById('bfl'), u=document.getElementById('buv'),
      r=document.getElementById('brel'), bw=document.getElementById('batwrap');
  var hasT=(typeof FL2!=='undefined')&&FL2.has, hasU=(typeof UV!=='undefined')&&UV.has;
  if(f)f.style.display=hasT?'flex':'none';
  if(bw)bw.style.display=hasT?'block':'none';
  if(u)u.style.display=hasU?'flex':'none';
  if(r)r.style.display=hasU?'flex':'none';
}
function update(ts){
  var dt=Math.min((ts-lastT)/1000,0.05);lastT=ts;
  if(!started)return;
  if(PHASE==='loading'){updateLoading(dt);return;}
  updateHandSway(dt);
  // Снаряжение живёт во всех игровых фазах. Раньше пистолет обновлялся
  // только на том складе, где его нашли, и дальше не раскрывался вообще.
  if(GEAR_PHASES[PHASE]){
    if(typeof updateTorch==='function')updateTorch(dt);
    if(typeof updateUV==='function')updateUV(dt);
    syncGear();
  }
  if(PHASE==='bed'){updateShock(dt);applyCamera();return;}
  if(PHASE==='ride'){updateRide(dt);return;}
  if(PHASE==='truck'){updateTruck(dt);return;}
  if(PHASE==='title')return;
  if(KP.on||WP.active){applyCamera();return;}
  if(dead){applyCamera();return;}

  if(PHASE==='store'||PHASE==='follow')updateShadows(dt,ts);
  if(PHASE==='follow')updateFollow(dt);
  if(PHASE==='corridor')updateCorridor(dt);
  if(PHASE==='room'){updateRoom(dt);}
  if(PHASE==='prison')updatePrison(dt);
  if(PHASE==='vent')updateVent(dt);
  if(PHASE==='warehouse')updateWarehouse(dt);
  if(PHASE==='hall')updateHall(dt);
  if(PHASE==='shelter')updateShelter(dt);
  if(PHASE==='oldstore')updateOldStore(dt);
  if(PHASE==='gas')updateGas(dt);
  if(PHASE==='dream1')updateDream1(dt);
  if(PHASE==='wake')updateWake(dt);
  if(PHASE==='candle')updateCandleRoom(dt);
  if(PHASE==='fork')updateFork(dt);
  if(PHASE==='uvstore')updateUVStore(dt);
  if(PHASE==='station')updateStation(dt);
  if(PHASE==='dome')updateDome(dt);
  if(PHASE==='house'){
    if(UH.on)updateUVHouse(dt); else updateToyHouse(dt);
  }
  if(PHASE==='throne')updateThrone(dt);
  if(PHASE==='candle2')updateCandleReturn(dt);
  if(PHASE==='basement')updateBasement(dt);
  if(PHASE==='secret2')updateSecret2(dt);
  if(PHASE==='tube'){updateTube(dt);return;}

  var run=mRun||K['ShiftLeft']||K['ShiftRight'];
  var cr=mCrouch||K['ControlLeft']||K['ControlRight'];
  var fwd=(K['KeyW']?1:0)-(K['KeyS']?1:0)+(-jmy);
  var str=(K['KeyD']?1:0)-(K['KeyA']?1:0)+(jmx);
  // Разгон и торможение вместо мгновенной скорости — тот же приём, что и в part1:
  // нажал — секунду набирает ход, отпустил — не встаёт как вкопанный.
  var movingNow=(Math.abs(fwd)>0.03)||(Math.abs(str)>0.03);
  if(P.moveRamp===undefined)P.moveRamp=0;
  var rampTarget=movingNow?1:0;
  P.moveRamp+=(rampTarget-P.moveRamp)*(rampTarget>P.moveRamp?0.16:0.26);
  var spd=(run?0.098:0.058)*(cr?0.52:1)*dt*60*P.moveRamp*(window.ADMIN?ADMIN.speedMul():1);

  var dirFX=-Math.sin(P.yaw),dirFZ=-Math.cos(P.yaw);
  var dirRX=Math.cos(P.yaw), dirRZ=-Math.sin(P.yaw);
  var moved=false;
  var eyeH=cr?CROUCH_H:EYE_H;
  var NC=!!(window.ADMIN&&ADMIN.noclip);

  function tryMove(nx,nz){
    if(NC)return true;
    if(PHASE==='corridor'){
      if(Math.abs(nx)>CW/2-0.32)return false;
      if(nz>4.2||nz<-CL+4)return false;
      if(obstacleBlocks(nx,nz,eyeH+P.y))return false;
      return true;
    }
    if(PHASE==='vent'){
      if(Math.abs(nx)>0.48)return false;
      if(nz>0.9||nz<-VT.len+1.6)return false;
      if(VT.spider&&!VT.dead&&nz<VT.spider.position.z+0.55)return false;  // паук не пускает
      return true;
    }
    return !blocked(nx,nz,0.30);
  }
  if(Math.abs(fwd)>0.03){
    var nx=P.x+dirFX*fwd*spd,nz=P.z+dirFZ*fwd*spd;
    if(tryMove(nx,P.z))P.x=nx;
    if(tryMove(P.x,nz))P.z=nz;
    moved=true;
  }
  if(Math.abs(str)>0.03){
    var nx2=P.x+dirRX*str*spd,nz2=P.z+dirRZ*str*spd;
    if(tryMove(nx2,P.z))P.x=nx2;
    if(tryMove(P.x,nz2))P.z=nz2;
    moved=true;
  }
  // прыжок
  if(NC){
    // Админ-панель: полёт вместо прыжка — Space вверх, Ctrl вниз, без гравитации.
    var flyUp=(mJump||K['Space'])?1:0, flyDown=cr?1:0;
    P.y+=(flyUp-flyDown)*0.14*dt*60;
    P.vy=0;P.onGround=true;
  } else {
    if((mJump||K['Space'])&&P.onGround){P.vy=JUMP_V*(window.ADMIN?ADMIN.jumpMul():1);P.onGround=false;}
    P.vy-=0.0052*dt*60;
    P.y+=P.vy*dt*60;
    // Пол может быть ниже нуля — в доме игрушек мы спускаемся в ямы
    var fy=(P.floorY===undefined)?0:P.floorY;
    if(P.y<=fy){
      if(P.vy<-0.03)P.landKick=Math.min(0.09,Math.abs(P.vy)*1.1);
      P.y=fy;P.vy=0;P.onGround=true;
    }
  }
  mJump=false;

  // шаги
  if(moved&&P.onGround){
    stepT-=dt*(run?2.6:1.6);
    if(stepT<=0){stepT=1;sndStep(run);}
  }
  P.eye=eyeH;
  applyCamera(moved,run);
  if(PHASE==='store'||PHASE==='follow')checkNear();
}
function applyCamera(moved,run){
  var bob=0;
  if(moved)bob=Math.sin(performance.now()*(run?0.014:0.009))*(run?0.022:0.013);
  // FOV на беге — расширяется на бегу, плавно возвращается на ходьбе/
  // стоянии; ощущение скорости чувствуется сразу, каждый раз при беге.
  if(P.fov===undefined)P.fov=74;
  var targetFov=(run&&moved)?81:74;
  P.fov+=(targetFov-P.fov)*0.08;
  if(Math.abs(camera.fov-P.fov)>0.05){camera.fov=P.fov;camera.updateProjectionMatrix();}
  P.landKick=(P.landKick||0)*0.82;
  if(P.landKick<0.001)P.landKick=0;
  // Тряска камеры при уроне — сейчас была только красная вспышка dmg
  // на экране, без позиционного удара. addShake() зовётся из мест
  // поимки/урона, здесь только гаснет и применяется.
  P.shake=(P.shake||0)*0.88;if(P.shake<0.002)P.shake=0;
  var shX=0,shY=0,shR=0;
  if(P.shake>0){
    shX=(Math.random()-0.5)*P.shake*0.35;
    shY=(Math.random()-0.5)*P.shake*0.35;
    shR=(Math.random()-0.5)*P.shake*0.06;
  }
  camera.position.set(P.x+shX,(P.eye||EYE_H)+P.y+bob-P.landKick+shY,P.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=P.yaw;camera.rotation.x=P.pitch;
  // ВАЖНО: после спуска по трубе камера оставалась накрененной по Z,
  // и весь мир выглядел перевёрнутым. Сбрасываем крен и «верх» всегда —
  // shR (тряска от урона) намеренно мизерный, так не возвращается.
  camera.rotation.z=shR;
  if(camera.up.x!==0||camera.up.y!==1)camera.up.set(0,1,0);
}

function loop(ts){
  update(ts);
  updateLights();
  // Размытие в движении при спринте — тот же приём, что и в первой части.
  var blurT=(!dead&&(mRun||K['ShiftLeft']||K['ShiftRight']))?0.5:0;
  if(window.DETAIL)DETAIL.tick(ts,P.x,P.y,P.z,blurT);   // пыль, зерно, автокачество, размытие
  if(window.CONTROLS)CONTROLS.tickPad(P,K,0.016);  // геймпад
  // Флаг для авто-обновления: пока идёт игра, страницу не перезагружаем
  // молча — вместо этого внизу появится полоска «ОБНОВИТЬ».
  window.MAGAZIN_IN_GAME=started&&!dead;
  if(Music&&Music.pump)Music.pump();
  if(window.SearchMusic)SearchMusic.pump();
  if(window.HammerMusic)HammerMusic.pump();
  if(window.DomeMusic)DomeMusic.pump();
  if(window.MenuMusic)MenuMusic.pump();
  renderer.render(scene,camera);
  if(bloomCtx&&(!window.DETAIL||DETAIL.wantBloom())){
    try{bloomCtx.drawImage(renderer.domElement,0,0,bloomCv.width,bloomCv.height);}catch(e){}
  }
  requestAnimationFrame(loop);
}

var menuAudioArmed=false;
function menuOpen(){
  document.getElementById('start').style.display='flex';
  var c=document.getElementById('mcont');
  if(c){c.disabled=!SAVE.has;}
  var hint=document.getElementById('mhint');
  if(hint)hint.textContent=SAVE.has?('Сохранение: '+SAVE.name):'Сохранение появится на первом складе';
  // Браузер не даёт включить звук до первого касания. Раньше музыка
  // «стартовала» в заблокированный контекст, громкость выставлялась
  // по замороженному времени и оставалась в нуле — тишина навсегда.
  armMenuAudio();
}
function armMenuAudio(){
  if(menuAudioArmed)return;
  menuAudioArmed=true;
  var note=document.getElementById('mnote');
  if(note)note.textContent='Коснитесь экрана, чтобы включить звук';
  function kick(){
    document.removeEventListener('pointerdown',kick,true);
    document.removeEventListener('touchstart',kick,true);
    document.removeEventListener('keydown',kick,true);
    unlockSpeech();unlockVoiceAudio();
    var a=getAC();
    if(!a)return;
    function go(){
      if(note)note.textContent='';
      if(document.getElementById('start').style.display==='none')return;
      MenuMusic.prepare();MenuMusic.start();
    }
    if(a.state==='suspended'){
      try{ var r=a.resume(); if(r&&r.then)r.then(go); else setTimeout(go,60); }
      catch(e){ setTimeout(go,60); }
    } else go();
  }
  document.addEventListener('pointerdown',kick,true);
  document.addEventListener('touchstart',kick,true);
  document.addEventListener('keydown',kick,true);
}
function menuNewGame(){
  MenuMusic.stop();
  document.getElementById('start').style.display='none';
  unlockSpeech();unlockVoiceAudio();getAC();started=true;lastT=performance.now();
  setTimeout(function(){Music.prepare();SearchMusic.prepare();HammerMusic.prepare();
                        DomeMusic.prepare();},80);
  showMsg('Обычный день. Обычная смена.',3.2);
  setTimeout(function(){showMsg('Кажется, кто-то хочет что-то спросить.',3.0);},4200);
  setTimeout(function(){questShow('Поговорите с покупателем','Он ждёт у кассы');},5200);
}
function menuContinue(){
  if(!SAVE.has)return;
  MenuMusic.stop();
  document.getElementById('start').style.display='none';
  unlockSpeech();unlockVoiceAudio();getAC();started=true;lastT=performance.now();
  setTimeout(function(){Music.prepare();SearchMusic.prepare();HammerMusic.prepare();
                        DomeMusic.prepare();},80);
  loadSave();
}
function startGame(){menuNewGame();}
function restartGame(){
  location.reload();
}

(function(){
  var g=document.getElementById('kpgrid');
  ['1','2','3','4','5','6','7','8','9','C','0','←'].forEach(function(d){
    var b=document.createElement('button');b.textContent=d;
    b.onclick=function(){ if(d==='C')kpClear(); else if(d==='←'){KP.buf=KP.buf.slice(0,-1);kpDraw();} else kpPress(d); };
    g.appendChild(b);
  });
})();

// ---------- ЗАПУСК ----------
initThree();
buildTextures();
buildMaterials();
buildStore();
menuOpen();
// Сохранение из профиля (слот 2) подтягивается отдельно, в колбэке
// Profile.init выше — оно обновит кнопку "ПРОДОЛЖИТЬ" сразу же,
// как только станет известно, есть оно или нет.
requestAnimationFrame(loop);
