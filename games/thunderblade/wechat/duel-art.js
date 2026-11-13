(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
  const ease = n => 1 - Math.pow(1 - clamp(n), 3);
  const phaseOf = pose => pose && pose.duration > 0 ? clamp(pose.age / pose.duration) : 1;
  const noise = (seed, index) => { const n = Math.sin((Number(seed) || 1) * 12.9898 + index * 78.233) * 43758.5453; return n - Math.floor(n); };
  function path(c, points, fill, stroke, width = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function line(c, points, color, width = 2) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
  }
  function oval(c, x, y, rx, ry, fill, stroke, width = 1) {
    c.save(); c.translate(x, y); c.scale(1, ry / Math.max(1, rx)); c.beginPath(); c.arc(0, 0, Math.max(.1, rx), 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } c.restore();
  }
  function sword(c, x, y, angle, length, heavy, glow) {
    c.save(); c.translate(x, y); c.rotate(angle);
    if (glow) { c.strokeStyle = glow; c.lineWidth = heavy ? 10 : 7; c.globalAlpha *= .24; c.beginPath(); c.moveTo(0, 8); c.lineTo(0, -length); c.stroke(); c.globalAlpha /= .24; }
    if (heavy) {
      path(c, [[-5, -21], [-8, -length + 12], [15, -length - 7], [28, -length + 4], [24, -38], [7, -14]], '#c5d2bb', '#f0e4bb', 2);
      path(c, [[1, -24], [1, -length + 8], [12, -length - 2], [13, -35]], '#eaf0d1');
      line(c, [[18, -length + 12], [13, -40]], '#6d8b7e', 2);
    } else {
      path(c, [[-3, -13], [0, -length - 8], [5, -length], [4, -12]], '#eaf5dc', '#8abfb1', 1);
      line(c, [[1, -16], [2, -length]], '#fffde2', 1.4);
    }
    line(c, [[0, -12], [0, 17]], '#917e54', heavy ? 7 : 5);
    line(c, [[-11, -10], [13, -10]], '#e0c18a', heavy ? 5 : 3);
    line(c, [[-2, -1], [2, 2], [-2, 5], [2, 8], [-2, 11]], '#b8bea0', 1.5);
    c.restore();
  }
  function arm(c, sx, sy, handX, handY, coat, trim, width) {
    const bend = handX > sx ? -1 : 1;
    const ex = (sx + handX) * .5 + bend * 6, ey = (sy + handY) * .5 + 8;
    line(c, [[sx, sy], [ex, ey]], '#0b252c', width + 4);
    line(c, [[sx, sy], [ex, ey]], coat, width);
    line(c, [[ex, ey], [handX, handY]], trim, width * .62);
    oval(c, handX, handY, width * .34, width * .34, '#e6d5ad');
  }
  function marker(c, x, y, danger, size = 15) {
    c.save(); c.translate(x, y);
    if (danger) { path(c, [[0, -size], [size * .85, size * .6], [-size * .85, size * .6]], '#3e2026dd', '#f5ad98', 2); line(c, [[0, -size * .5], [0, size * .05]], '#ffe0c6', 2); oval(c, 0, size * .3, 1.5, 1.5, '#ffe0c6'); }
    else { path(c, [[0, -size], [size * .7, 0], [0, size], [-size * .7, 0]], '#403a26dd', '#f3dca0', 2); line(c, [[0, -6], [0, 6]], '#fff1be', 2); }
    c.restore();
  }
  function drawRanger(g) {
    const c = g.ctx, b = g.boss, a = g.attack, pose = g.bossPose || {}, u = phaseOf(pose);
    const wind = a ? clamp(a.elapsed / a.duration) : 0, broken = g.broken > 0;
    const recoil = pose.action === 'recoil' && u < 1 ? (1 - ease(u)) * 8 : 0;
    const release = !a && (pose.action === 'volley' || pose.action === 'sidestep') && u < 1 ? Math.sin(u * Math.PI) : 0;
    const facing = a ? a.angle : b.angle, sway = Math.sin(g.clock * 3) * 2;
    c.save(); c.translate(b.x, b.y);
    oval(c, 0, 13, 42, 16, '#00000060');
    c.rotate(facing + Math.PI / 2); c.translate(0, sway + recoil);
    c.rotate(broken ? .25 : -wind * .07);
    // A long hood, narrow limbs and a tall recurved bow distinguish the ranger from the armored swordsman.
    path(c, [[-19,-22],[-26,4],[-38,56],[-9,42],[0,57],[18,39],[35,48],[23,-17]], '#263d31', '#90a780', 1.5);
    line(c, [[-11,17],[-17,40],[-22,51]], '#162f2e', 10);
    line(c, [[12,17],[17,37],[26,47]], '#162f2e', 10);
    line(c, [[-23,51],[-12,51]], '#adbc94', 5); line(c, [[23,47],[32,48]], '#adbc94', 5);
    path(c, [[-17,-22],[12,-24],[19,14],[0,27],[-21,12]], b.flash > 0 ? '#f3e2b7' : '#809273', '#b7be8a', 1.5);
    path(c, [[-14,-20],[-5,5],[-18,28],[-25,41],[-24,5]], '#abc69b');
    line(c, [[-20,10],[18,9]], '#3f5140', 6);
    // Quiver and arrow fletchings remain visible behind the shoulder.
    line(c, [[-19,-5],[-31,-47]], '#644e34', 10);
    for (const dx of [-5,0,5]) { line(c, [[-25+dx,-29],[-33+dx,-58]], '#c8c393', 1.5); path(c, [[-33+dx,-59],[-39+dx,-54],[-33+dx,-48],[-29+dx,-55]], '#85ad8f'); }
    const handY = -22 - wind * 4, drawY = handY + 17 + wind * 23 - release * 18;
    arm(c, -13,-15,31,drawY,'#829571','#bdd0a5',10);
    arm(c, 13,-16,31,handY,'#829571','#bdd0a5',10);
    // Bow limbs bend as the string is drawn; the arrow points along the locked firing direction.
    c.save(); c.translate(31,handY); c.rotate(-Math.PI/2 + release * .13);
    line(c, [[-6,-61],[11,-42],[16,-17],[16,17],[9,43],[-6,61]], '#443f2d', 8);
    line(c, [[-6,-61],[10,-40],[14,0],[8,42],[-6,61]], '#d4b77a', 3);
    line(c, [[-6,-60],[-17-wind*23,0],[-6,60]], '#d9e2b4', 1.5);
    if (a || release < .2) {
      line(c, [[-17-wind*23,0],[45,0]], '#f2deb1', 2);
      path(c, [[45,0],[35,-4],[37,0],[35,4]], a && wind > .76 ? '#fff2b5' : '#e7c792');
    }
    c.restore();
    oval(c, 0,-31,13,17,'#d1c5a0','#20362f',1.5);
    path(c, [[-15,-33],[-15,-45],[0,-56],[17,-44],[19,-27],[9,-37],[0,-40],[-8,-34]], '#2d4e3e', '#a9b68c', 1.5);
    path(c, [[-13,-28],[13,-29],[8,-15],[-3,-18]], '#38644f');
    line(c, [[-8,-31],[1,-32],[8,-31]], broken ? '#a6f8db' : '#f4dc9c', 2);
    const scarf = Math.sin(g.clock*4)*5;
    path(c, [[-10,-23],[-32,-8],[-49-scarf,8],[-35,11],[-15,-9]], '#819c70', '#b1bd89', 1);
    if (broken) { c.setLineDash([6,7]); g.circle(0,0,62,null,'#ffe0a4',3); c.setLineDash([]); }
    c.restore();
  }
  function drawColossus(g) {
    const c = g.ctx, b = g.boss, a = g.attack, pose = g.bossPose || {}, u = phaseOf(pose);
    const t = a ? clamp(a.elapsed / a.duration) : 0, broken = g.broken > 0, open = g.armorOpen > 0;
    const smashing = !a && /^(cleave|geyser|leap|ring)$/.test(pose.action) && u < 1;
    const lift = a && a.type === 'leap' ? Math.sin(t*Math.PI)*15 : 0;
    const recoil = pose.action === 'recoil' && u < 1 ? (1-ease(u))*7 : 0;
    const glow = open || broken ? '#b8f9dd' : '#f2b56e';
    const stone = b.flash > 0 ? '#ebd2ab' : open ? '#465852' : '#5d5a50';
    const plate = b.flash > 0 ? '#f7deb2' : '#787363';
    c.save(); c.translate(b.x, b.y + Math.sin(g.clock*1.8)*1.1 - lift + recoil);
    oval(c, 0,28,81,28,'#00000070');
    c.rotate(broken ? -.1 : smashing ? Math.sin(u*Math.PI)*.12 : a ? -t*.045 : 0);
    for (const side of [-1,1]) {
      path(c, [[side*12,18],[side*42,17],[side*48,57],[side*25,70],[side*9,48]], stone, '#ada184', 2);
      path(c, [[side*18,53],[side*49,51],[side*58,73],[side*16,76]], '#474d48', '#9d967e', 2);
      line(c, [[side*30,29],[side*26,46],[side*36,56]], '#c2865480', 2);
    }
    path(c, [[-43,-41],[0,-57],[47,-41],[57,12],[31,42],[-33,43],[-58,10]], stone, '#b8a589', 2.5);
    // The exposed furnace core is always visible. Each intact rune slab covers one side.
    path(c, [[0,-36],[24,-12],[14,22],[0,35],[-18,19],[-22,-12]], open ? '#4b796c' : '#674c37', glow, 2);
    path(c, [[0,-19],[10,-3],[0,17],[-10,-3]], glow, '#f9e4b3', 1);
    const armor = Number.isFinite(g.armor) ? g.armor : 2;
    for (let i=0;i<2;i++) {
      const side=i===0?-1:1;
      if (i < armor && !open) {
        path(c, [[side*5,-29],[side*31,-35],[side*40,-13],[side*30,19],[side*7,25]], plate, '#c4b48f', 2);
        line(c, [[side*15,-20],[side*24,-10],[side*14,3],[side*26,10]], glow, 3);
      } else {
        line(c, [[side*14,-29],[side*23,-15],[side*12,-4],[side*26,15]], open ? '#9febcf' : '#db9b66', 2);
      }
    }
    for (const side of [-1,1]) {
      path(c, [[side*31,-43],[side*62,-36],[side*77,-4],[side*46,6]], plate, '#b3a286', 2);
      line(c, [[side*46,-31],[side*62,-13]], '#d6bd8d', 2);
    }
    const windup = a ? ease(t) : smashing ? 1-ease(u) : 0;
    const hammerTurn = -.25 - windup*1.7 + (smashing ? ease(u)*1.1 : 0);
    const handX = 48 - windup*11, handY=-2-windup*25;
    arm(c,44,-15,handX,handY,stone,'#a39a80',25);
    arm(c,-44,-13,-51+windup*42,16-windup*40,stone,'#a39a80',23);
    c.save(); c.translate(handX,handY); c.rotate(hammerTurn);
    line(c, [[0,30],[0,-90]], '#302f2a', 13); line(c, [[-3,20],[-3,-89]], '#a39778', 3);
    path(c, [[-35,-106],[31,-110],[47,-92],[35,-65],[-34,-64],[-46,-83]], '#4f5550', '#c3af8e', 2.5);
    path(c, [[-29,-101],[26,-103],[34,-90],[24,-73],[-28,-72],[-36,-84]], '#787569', '#b29b7a', 1);
    line(c, [[-18,-91],[0,-85],[19,-91]], glow, a && t>.76 ? 5 : 2.5);
    c.restore();
    path(c, [[-22,-68],[-12,-80],[17,-79],[29,-61],[19,-39],[-18,-40],[-30,-58]], '#414b47', '#b4a085', 2);
    path(c, [[-19,-63],[0,-70],[20,-61],[12,-46],[-12,-47]], '#6e6c5c', '#ae9d7e', 1.5);
    line(c, [[-16,-58],[-5,-56]],glow,4); line(c, [[6,-56],[18,-59]],glow,4);
    for (const side of [-1,1]) path(c, [[side*16,-75],[side*28,-91],[side*34,-73],[side*26,-63]], '#a59a7f', '#dcc39b', 1.5);
    if (open || broken) { c.setLineDash([7,8]); g.circle(0,0,84,null,glow,2.5); c.setLineDash([]); }
    c.restore();
  }
  function install(Nightfall) {
    if (!Nightfall || Nightfall.prototype.__duelArt) return;
    const proto = Nightfall.prototype;
    Object.defineProperty(proto, '__duelArt', { value: true });
    const originalArena = proto.drawArena;
    proto.drawArena = function () {
      if (this.sceneId !== 'bamboo' && this.sceneId !== 'forge') { if (originalArena) originalArena.call(this); return; }
      const c=this.ctx, forge=this.sceneId==='forge';
      const bg=c.createRadialGradient(360,350,80,360,360,515);
      bg.addColorStop(0,forge?'#39392f':'#304337'); bg.addColorStop(.72,forge?'#211f20':'#152e29'); bg.addColorStop(1,forge?'#110e16':'#071e22');
      c.fillStyle=bg;c.fillRect(0,0,720,720);
      if(forge) {
        // Lava stays outside the walkable platform, so the red attack warnings retain clear contrast.
        for(let i=0;i<12;i++) {
          const ang=i*TAU/12, r=325+(i%3)*13, x=360+Math.cos(ang)*r,y=363+Math.sin(ang)*r;
          line(c,[[x-25,y-8],[x+9,y+4],[x+22,y+32]],'#9c4e2b',11);
          line(c,[[x-25,y-8],[x+9,y+4],[x+22,y+32]],'#d48a43',3);
        }
        for(const x of [48,672]) for(const y of [145,580]) {
          path(c,[[x-19,y-23],[x+19,y-23],[x+25,y+32],[x-26,y+32]],'#161b1d','#8e7958',2);
          oval(c,x,y-24,20,9,'#d68b45','#f3c376',2);
          path(c,[[x-11,y-25],[x-5,y-48],[x+1,y-39],[x+9,y-55],[x+13,y-25]],'#f1bb65');
        }
      } else {
        this.circle(568,85,48,'#cddcaf0c','#c4d2af17');
        for(const side of [-1,1]) for(let i=0;i<7;i++) {
          const x=side<0?25+i*11:695-i*11,y=(i*89)%720, lean=(i%2?1:-1)*12;
          line(c,[[x,y-280],[x+lean,y+300]],i%2?'#244d3a':'#31563c',8);
          for(let j=-2;j<=2;j++) { const yy=y+j*96;line(c,[[x-5,yy],[x+7,yy-1]],'#71916a',2); }
          for(let j=0;j<3;j++) {
            const yy=y-100+j*110, inward=side<0?1:-1;
            line(c,[[x,yy],[x+inward*39,yy-29]],'#3d6949',2);
            path(c,[[x+inward*12,yy-9],[x+inward*31,yy-37],[x+inward*25,yy-15]],'#477c53');
            path(c,[[x+inward*22,yy-15],[x+inward*51,yy-24],[x+inward*35,yy-9]],'#3e6e4d');
          }
        }
      }
      this.circle(360,363,306,forge?'#3b38324d':'#7d91681a',forge?'#b697644d':'#a3b98540',2.5);
      this.circle(360,363,291,forge?'#2c2c2a':'#293c32',forge?'#c0a47655':'#8ba77845',2);
      this.circle(360,363,248,null,forge?'#c7ae6925':'#b6c49b18');
      if(forge) {
        for(let i=0;i<10;i++) {
          const a=i*TAU/10;
          line(c,[[360+Math.cos(a)*90,363+Math.sin(a)*90],[360+Math.cos(a)*279,363+Math.sin(a)*279]],'#aaa17e12',1);
          const x=360+Math.cos(a)*271,y=363+Math.sin(a)*271;
          c.save();c.translate(x,y);c.rotate(a);path(c,[[-6,-14],[6,-14],[10,0],[0,15],[-10,0]],null,'#b0945f65',2);c.restore();
        }
        this.circle(360,363,92,null,'#a9956720',2);
      } else {
        // Wooden seams in the quiet clearing do not masquerade as solid obstacles.
        for(let y=140;y<620;y+=48) { const half=Math.sqrt(Math.max(0,275*275-(y-363)*(y-363)));line(c,[[360-half,y],[360+half,y]],'#b0bd8c13',1); }
        for(let i=0;i<10;i++) {const a=i*TAU/10+.3,x=360+Math.cos(a)*278,y=363+Math.sin(a)*278;path(c,[[x-5,y],[x+8,y-4],[x+2,y+3]],'#8aa27447');}
      }
      if(this.options.effects!==false) {
        for(let i=0;i<15;i++) {
          const y=(i*83+(forge?-1:1)*this.clock*(forge?18:23)+1440)%720,x=(i*137+Math.sin(this.clock+i)*17)%720;
          if(forge) this.circle(x,y,1.2+(i%2)*.5,'#ecc27b55');
          else { c.save();c.translate(x,y);c.rotate(this.clock*.3+i);path(c,[[-4,0],[5,-2],[1,3]],'#8aa46c45');c.restore(); }
        }
      }
    };
    proto.drawPlayer = function (p, ghost = false) {
      if (ghost) {
        if (this.options.effects === false) return;
        const trail = this.ctx; trail.save(); trail.translate(p.x, p.y); trail.rotate(p.angle + Math.PI / 2); trail.scale(1.2, 1.2);
        path(trail, [[-10, -15], [10, -15], [14, 5], [21, 33], [1, 22], [-17, 35], [-14, 2]], '#a4f8df');
        oval(trail, 0, -20, 8, 9, '#d7ffdf'); line(trail, [[14, 2], [31, -33]], '#c7ffe4', 3);
        trail.restore(); return;
      }
      const c = this.ctx, pose = !ghost ? this.actor || {} : {}, u = phaseOf(pose), action = pose.action || 'idle';
      const moving = !ghost && this.input && Math.hypot(this.input.x, this.input.y) > .1;
      const stride = moving ? Math.sin(this.clock * 18) : Math.sin(this.clock * 2.4) * .12;
      const charge = !ghost && this.attackHeld ? clamp(this.chargeTime / .52) : 0;
      const dashing = ghost || p.dash > 0 || action === 'dash' && u < 1;
      const injured = action === 'hurt' && u < 1;
      const slashing = /^(light1|light2|finisher|heavy|execute)$/.test(action) && u < 1;
      const parry = action === 'parry' && u < 1;
      const guarding = !ghost && p.guard > 0;
      const breath = Math.sin(this.clock * 3.8) * .7;
      let lean = dashing ? -.38 : injured ? .32 * (1 - u) : charge ? -.12 : stride * .055;
      let swing = -.25, handX = 18, handY = -1, bodyTurn = 0, lift = 0;
      if (injured) { swing = .55; handX = 15; handY = 8; bodyTurn = .22 * (1 - u); }
      else if (charge) { swing = -1.95 + charge * .25; handX = 9; handY = -20; lift = charge * 3; }
      else if (guarding || parry) { swing = -.72; handX = 12; handY = -18; lean = -.1; }
      else if (slashing) {
        const t = ease(u);
        if (action === 'light1') { swing = -2.2 + t * 3.0; bodyTurn = -.25 + t * .5; handX = 12 + Math.sin(t * Math.PI) * 12; handY = -8; }
        if (action === 'light2') { swing = 1.35 - t * 3.2; bodyTurn = .24 - t * .46; handX = -7 + Math.cos(t * Math.PI) * 17; handY = -9; }
        if (action === 'finisher') { swing = -2.5 + t * 4.9; bodyTurn = -.45 + t * .95; handX = 14; handY = -10 - Math.sin(t * Math.PI) * 8; lean -= Math.sin(t * Math.PI) * .14; }
        if (action === 'heavy') { swing = -1.75 + t * 2.8; handX = 4 + t * 12; handY = -25 + t * 26; lean = -.24 + t * .43; lift = Math.sin(u * Math.PI) * 4; }
        if (action === 'execute') { swing = -2.25 + t * 4.6; bodyTurn = -.4 + t * .85; handX = 14; handY = -26 + t * 29; lean = -.3 + t * .45; lift = Math.sin(u * Math.PI) * 7; }
      }
      if (dashing) { handX = 12; handY = 10; swing = .6; }
      c.save(); c.translate(p.x, p.y);
      if (!ghost) {
        oval(c, 0, 10, dashing ? 35 : 27, 11, '#00000068');
        oval(c, 0, 2, 27, 27, '#a5fbe50a', this.riposte > 0 ? '#c9ffd585' : '#a5fbe53a', this.riposte > 0 ? 2 : 1.5);
      }
      c.rotate((slashing && Number.isFinite(pose.angle) ? pose.angle : p.angle) + Math.PI / 2);
      c.scale(1.2, 1.2);
      c.translate(injured ? Math.sin(u * Math.PI) * 5 : 0, breath - lift);
      c.rotate(lean + bodyTurn);
      const cloth = ghost ? '#a8f7df' : injured ? '#efc6b7' : '#e3ead6';
      const dark = ghost ? '#5cbca8' : '#274e4b';
      const hemWave = Math.sin(this.clock * 8 + p.x * .01) * (moving || dashing ? 5 : 2);
      const capeLength = dashing ? 46 : charge ? 25 : 29;
      path(c, [[-13, -5], [-19 - hemWave, 19], [-8, capeLength], [3, 22], [19 + hemWave, capeLength - 5], [12, -7]], dark, '#79a99260', 1);
      // Feet move independently beneath the split robe.
      line(c, [[-7, 10], [-10 - stride * 3, 22 + stride * 7]], '#0b272e', 8);
      line(c, [[7, 10], [10 + stride * 3, 22 - stride * 7]], '#0b272e', 8);
      line(c, [[-10 - stride * 3, 22 + stride * 7], [-8 - stride * 3, 26 + stride * 7]], '#a9b9a2', 5);
      line(c, [[10 + stride * 3, 22 - stride * 7], [12 + stride * 3, 26 - stride * 7]], '#a9b9a2', 5);
      path(c, [[-11, -13], [10, -14], [15, 5], [21 + hemWave * .3, 24], [4, 17], [0, 9], [-5, 21], [-18, 26], [-13, 2]], cloth, '#789e8c', 1.1);
      path(c, [[-5, -12], [-2, 7], [-10, 20], [-9, -4]], '#eff3dc');
      path(c, [[9, -10], [11, 6], [18, 22], [4, 14]], '#bccdb8');
      line(c, [[-13, 3], [14, 3]], dark, 5);
      line(c, [[-2, 6], [-5 + hemWave, 24]], '#b2ba85', 2);
      // The rear arm braces or follows the opposite shoulder, instead of a rigid sprite.
      const rearX = guarding || charge || action === 'heavy' || action === 'execute' ? handX - 8 : -19 - stride * 4;
      const rearY = guarding || charge || action === 'heavy' || action === 'execute' ? handY + 5 : 4 + stride * 3;
      arm(c, -10, -9, rearX, rearY, cloth, '#a8c1ad', 7);
      arm(c, 10, -10, handX, handY, cloth, '#a8c1ad', 8);
      sword(c, handX, handY, swing, action === 'execute' ? 63 : 48, false, !ghost && (charge >= 1 || parry || this.riposte > 0) ? '#fff0a7' : null);
      // Head, tied hair and scarf remain legible at a 320px phone viewport.
      oval(c, 0, -18, 9, 10, ghost ? '#c6ffea' : '#e6d7b4', '#1b3d3d', 1.5);
      path(c, [[-9, -22], [-6, -29], [5, -29], [10, -20], [3, -22], [-4, -20]], '#0c282e');
      oval(c, 1, -30, 4, 4, '#0a222a');
      line(c, [[-9, -19], [8, -20]], '#4e8270', 3);
      const scarf = dashing ? 23 : 13 + Math.abs(stride) * 4;
      line(c, [[-7, -17], [-17, -12], [-25 - scarf, -6 + hemWave], [-17 - scarf, 1 + hemWave]], '#71b39e', 4);
      if (guarding || parry) line(c, [[-13, -12], [14, -10]], '#f9e1a4', parry ? 3 : 1.5);
      c.restore();
      if (ghost) return;
      if (guarding) {
        c.save(); c.globalAlpha = .65;
        c.beginPath(); c.arc(p.x, p.y, 40, p.angle - .95, p.angle + .95); c.strokeStyle = '#ffe2a0'; c.lineWidth = 4; c.stroke();
        c.restore();
      }
      if (charge > 0) {
        this.circle(p.x, p.y, 38, null, '#78988b55', 2);
        c.beginPath(); c.arc(p.x, p.y, 38, -Math.PI / 2, -Math.PI / 2 + TAU * charge); c.strokeStyle = charge >= 1 ? '#ffe2a0' : '#a1ead8'; c.lineWidth = 4; c.stroke();
        if (charge >= 1) { const a = this.clock * 3; for (let i = 0; i < 3; i++) this.circle(p.x + Math.cos(a + i * TAU / 3) * 42, p.y + Math.sin(a + i * TAU / 3) * 42, 2.4, '#ffe6ac'); }
      }
    };
    proto.drawBoss = function () {
      if (this.bossId === 'archer') { drawRanger(this); return; }
      if (this.bossId === 'colossus') { drawColossus(this); return; }
      const c = this.ctx, b = this.boss, a = this.attack, pose = this.bossPose || {}, u = phaseOf(pose), broken = this.broken > 0;
      const t = a ? clamp(a.elapsed / a.duration) : 0;
      const facing = a ? a.angle : Number.isFinite(pose.angle) && u < 1 ? pose.angle : b.angle;
      const breath = Math.sin(this.clock * 2.1) * 1.7;
      const recoil = pose.action === 'recoil' && u < 1 ? (1 - ease(u)) * 10 : 0;
      const striking = !a && /^(sweep|rush|leap|ring|thrust|cleave|cross|feint|geyser)$/.test(pose.action) && u < 1;
      const style = this.style && this.style.id || 'hunter';
      const idle = !a && !striking && !broken && recoil === 0;
      let lean = broken ? .18 : a ? -.08 - t * .07 : striking ? Math.sin(u * Math.PI) * .15 : idle ? style === 'hunter' ? -.12 : style === 'warden' ? .015 : -.04 + Math.sin(this.clock * 1.8) * .02 : 0;
      let lift = a && a.type === 'leap' ? Math.sin(t * Math.PI) * 11 : 0;
      let weaponTurn = idle ? style === 'hunter' ? -1.38 : style === 'warden' ? -.28 : -2.3 : .12;
      if (a) {
        if (a.type === 'rush' || a.type === 'thrust') weaponTurn = -.12;
        else if (a.type === 'ring' || a.type === 'geyser') weaponTurn = -2.65 + t * .2;
        else if (a.type === 'leap') weaponTurn = -2.35 + t * .1;
        else if (a.type === 'feint') weaponTurn = t < .42 ? -.4 - ease(t / .42) * 1.7 : -2.1 + Math.max(0, t - .76) * 1.8;
        else weaponTurn = -.5 - ease(t) * 1.65;
      } else if (striking) weaponTurn = -2.0 + ease(u) * 3.7;
      if (broken) weaponTurn = 1.0;
      const accent = broken ? '#acebda' : this.phase === 3 ? '#e6a187' : this.phase === 2 ? '#d7b676' : '#aebc94';
      c.save(); c.translate(b.x - Math.cos(facing) * recoil, b.y - Math.sin(facing) * recoil);
      oval(c, 0, 19, 64, 24, '#00000064');
      if (this.phase > 1 && this.options.effects !== false) {
        c.save(); c.globalAlpha = broken ? .18 : .1;
        for (let i = 0; i < (this.phase === 3 ? 7 : 4); i++) {
          const ang = i * TAU / (this.phase === 3 ? 7 : 4) + this.clock * .18;
          const len = 18 + 12 * Math.sin(this.clock * 2 + i);
          line(c, [[Math.cos(ang) * 53, Math.sin(ang) * 22 + 20], [Math.cos(ang + .1) * (65 + len), Math.sin(ang + .1) * (28 + len * .3) + 18]], accent, 3);
        } c.restore();
      }
      c.translate(0, breath - lift); c.rotate(lean);
      const footMotion = striking && pose.action === 'rush' ? Math.sin(u * Math.PI) * 17 : a ? t * 5 : Math.sin(this.clock * (style === 'hunter' ? 3.3 : 1.8)) * (style === 'warden' ? .25 : style === 'hunter' ? 2.4 : 1.6);
      const footing = idle ? style === 'warden' ? 7 : style === 'hunter' ? 3 : -2 : 0;
      line(c, [[-17, 16], [-27 - footMotion * .3 - footing, 49], [-23 - footMotion - footing, 64]], '#102b2e', 18);
      line(c, [[17, 16], [28 + footMotion * .3 + footing, 49], [35 + footMotion + footing, 61]], '#102b2e', 18);
      path(c, [[-35 - footing, 50], [-19 - footing, 50], [-16 - footing, 67], [-42 - footMotion * .25 - footing, 67]], '#718578', '#abaf89', 1.5);
      path(c, [[21 + footing, 48], [38 + footing, 48], [48 + footMotion * .25 + footing, 65], [21 + footing, 64]], '#718578', '#abaf89', 1.5);
      const cloak = Math.sin(this.clock * 3.4) * 5 + (a ? t * 6 : 0);
      path(c, [[-33, -26], [-43 - cloak, 24], [-52, 64], [-17, 45], [-1, 67], [23, 48], [48 + cloak, 61], [37, -22]], '#0b232a', '#496a6138', 2);
      for (let i = -1; i <= 1; i++) line(c, [[i * 19, 6], [i * 30 + cloak * .3, 52]], '#62776238', 2);
      const plate = b.flash > 0 ? '#e6dfb7' : broken ? '#607e70' : '#536f63';
      path(c, [[0, -44], [39, -26], [33, 24], [0, 42], [-33, 24], [-39, -26]], plate, '#bac39a', 2);
      path(c, [[0, -34], [25, -22], [20, 13], [0, 25], [-20, 13], [-25, -22]], '#27463f', '#a8b18a', 1.3);
      for (let y = -15; y <= 21; y += 10) {
        path(c, [[-29, y], [0, y + 4], [29, y], [25, y + 7], [0, y + 12], [-25, y + 7]], b.flash > 0 ? '#c6d3af' : '#3a5a50', '#9aa7827a', 1);
      }
      path(c, [[-8, -24], [0, -33], [8, -24], [0, -13]], '#b6b78b', accent, 1);
      for (const side of [-1, 1]) {
        path(c, [[side * 17, -33], [side * 45, -31], [side * 59, -10], [side * 30, -5]], plate, '#aab58d', 2);
        line(c, [[side * 27, -25], [side * 46, -20]], '#d8ce9e', 1.5);
      }
      const swordWorld = facing + Math.PI / 2 + weaponTurn;
      const handX = idle && style === 'warden' ? 28 : idle && style === 'trickster' ? 48 : 34 + Math.cos(swordWorld + .4) * 15;
      const handY = idle && style === 'warden' ? 5 : idle && style === 'trickster' ? -10 : -4 + Math.sin(swordWorld + .4) * 16;
      arm(c, 33, -14, handX, handY, plate, '#87977d', 19);
      if (idle && style === 'warden' || a && /^(leap|ring|geyser|cleave)$/.test(a.type) || striking && pose.action === 'leap') arm(c, -32, -15, handX - 14, handY + 4, plate, '#87977d', 17);
      else arm(c, -32, -15, -43 - Math.cos(this.clock * 2) * 3, 14 + t * 3, plate, '#87977d', 17);
      sword(c, handX, handY, swordWorld, 98, true, a && t > .76 ? a.red ? '#f5a280' : '#ffe4a1' : null);
      // Layered tide-mask, mobile-sized eye slits and horns.
      c.save(); c.translate(broken ? -5 : 0, broken ? 8 : 0); c.rotate(broken ? -.2 : a ? -.04 * t : 0);
      path(c, [[-24, -54], [-14, -67], [14, -67], [24, -54], [18, -26], [0, -18], [-18, -26]], '#142f34', '#abb58d', 2);
      path(c, [[-18, -49], [0, -56], [18, -49], [13, -31], [0, -26], [-13, -31]], '#23473f', '#7f9c83', 1.2);
      for (const side of [-1, 1]) {
        path(c, [[side * 14, -55], [side * 40, -84], [side * 34, -56], [side * 21, -43]], '#c9c09a', '#5d7967', 1.2);
        line(c, [[side * 28, -64], [side * 35, -77]], '#f0dcaa', 1.5);
      }
      line(c, [[-15, -42], [-5, -39]], accent, 3.5); line(c, [[15, -42], [5, -39]], accent, 3.5);
      path(c, [[-4, -39], [0, -44], [4, -39], [0, -28]], '#c3c397');
      line(c, [[-9, -29], [0, -26], [9, -29]], '#b9b892', 2);
      c.restore();
      if (broken) { c.save(); c.setLineDash([6, 9]); this.circle(0, 0, 74, null, '#ffe0a4', 3); c.setLineDash([]); this.text('破', 0, -101, 28, '#ffe0a4'); c.restore(); }
      c.restore();
    };
    proto.drawTell = function (a) {
      const c = this.ctx, t = clamp(a.elapsed / a.duration), color = a.red ? '#f19a82' : '#f0d294';
      const active = t > .76;
      c.save(); c.lineWidth = 2; c.strokeStyle = color;
      if (['sweep', 'twin', 'cross', 'cleave', 'feint'].includes(a.type)) {
        const radius = a.radius || (a.type === 'cleave' ? 235 : 216), half = a.halfAngle || (a.type === 'cleave' ? 1.8 : 1.4);
        c.beginPath(); c.moveTo(a.x, a.y); c.arc(a.x, a.y, radius, a.angle - half, a.angle + half); c.closePath();
        c.fillStyle = a.red ? `rgba(224,111,86,${.07 + t * .13})` : `rgba(235,190,112,${.06 + t * .09})`; c.fill(); c.stroke();
        c.beginPath(); c.arc(a.x, a.y, radius, a.angle - half, a.angle - half + 2 * half * t); c.strokeStyle = active ? '#fff0c2' : color; c.lineWidth = active ? 7 : 5; c.stroke();
        // Radial hatching gives red unguardable attacks a distinct shape, not just a color.
        if (a.red) for (let i = 0; i < 7; i++) { const ang = a.angle - half + .15 + i * (2 * half - .3) / 6; line(c, [[a.x + Math.cos(ang) * (radius - 19), a.y + Math.sin(ang) * (radius - 19)], [a.x + Math.cos(ang) * radius, a.y + Math.sin(ang) * radius]], '#ffc0a5', 2); }
      } else if (a.type === 'volley' || a.type === 'sidestep') {
        for(const lane of a.lanes || []) {
          const angle=Math.atan2(lane.ey-lane.y,lane.ex-lane.x),half=a.halfWidth || 23;
          const dx=Math.sin(angle)*half,dy=-Math.cos(angle)*half;
          c.beginPath();c.moveTo(lane.x+dx,lane.y+dy);c.lineTo(lane.ex+dx,lane.ey+dy);
          c.arc(lane.ex,lane.ey,half,angle-Math.PI/2,angle+Math.PI/2);
          c.lineTo(lane.x-dx,lane.y-dy);c.arc(lane.x,lane.y,half,angle+Math.PI/2,angle+Math.PI*1.5);c.closePath();
          c.fillStyle='#eac77d16';c.fill();c.strokeStyle=color;c.lineWidth=1.5;c.stroke();
          line(c,[[lane.x,lane.y],[lane.x+(lane.ex-lane.x)*t,lane.y+(lane.ey-lane.y)*t]],active?'#fff3b8':color,active?4:2);
          const arrowX=lane.x+(lane.ex-lane.x)*t,arrowY=lane.y+(lane.ey-lane.y)*t;
          line(c,[[arrowX-Math.cos(angle-.55)*11,arrowY-Math.sin(angle-.55)*11],[arrowX,arrowY],[arrowX-Math.cos(angle+.55)*11,arrowY-Math.sin(angle+.55)*11]],'#f7e3ad',2);
        }
      } else if (a.type === 'rush' || a.type === 'thrust') {
        const half = a.halfWidth || (a.width ? a.width / 2 : a.type === 'thrust' ? 30 : 54), length = a.length || (a.type === 'thrust' ? 270 : 340);
        const ex = Number.isFinite(a.ex) ? a.ex : a.x + Math.cos(a.angle) * length, ey = Number.isFinite(a.ey) ? a.ey : a.y + Math.sin(a.angle) * length;
        const dx = Math.sin(a.angle) * half, dy = -Math.cos(a.angle) * half;
        // segmentDistance hits a capsule: include the full rounded end caps in the warning.
        c.beginPath(); c.moveTo(a.x + dx, a.y + dy); c.lineTo(ex + dx, ey + dy);
        c.arc(ex, ey, half, a.angle - Math.PI / 2, a.angle + Math.PI / 2);
        c.lineTo(a.x - dx, a.y - dy); c.arc(a.x, a.y, half, a.angle + Math.PI / 2, a.angle + Math.PI * 1.5);
        c.closePath(); c.fillStyle = '#eac77d1d'; c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.stroke();
        line(c, [[a.x, a.y], [a.x + (ex - a.x) * t, a.y + (ey - a.y) * t]], active ? '#fff0be' : color, active ? 6 : 4);
        const endAngle = a.angle + Math.PI; line(c, [[ex + Math.cos(endAngle - .5) * 19, ey + Math.sin(endAngle - .5) * 19], [ex, ey], [ex + Math.cos(endAngle + .5) * 19, ey + Math.sin(endAngle + .5) * 19]], color, 3);
      } else if (a.type === 'leap' || a.type === 'geyser') {
        const points = a.points && a.points.length ? a.points : [{ x: a.tx, y: a.ty }], radius = a.radius || (a.type === 'geyser' ? 78 : 116);
        for (const point of points) {
          this.circle(point.x, point.y, radius, '#de785b16', color, 2);
          this.circle(point.x, point.y, Math.max(1, radius * t), '#de785b23', color, active ? 3 : 1.5);
          marker(c, point.x, point.y, true, a.type === 'geyser' ? 17 : 22);
          for (let i = 0; i < 4; i++) { const q = i * Math.PI / 2; line(c, [[point.x + Math.cos(q) * (radius - 10), point.y + Math.sin(q) * (radius - 10)], [point.x + Math.cos(q) * (radius + 2), point.y + Math.sin(q) * (radius + 2)]], color, 2); }
        }
      } else if (a.type === 'ring') {
        const radius = a.radius || 105; this.circle(a.x, a.y, radius, '#df765b12', color, 2);
        this.circle(a.x, a.y, radius * (.4 + t * .6), null, color, 3);
        marker(c, a.x, a.y - radius - 18, true, 16);
        for (let i = 0; i < 8; i++) { const ang = i * TAU / 8; line(c, [[a.x + Math.cos(ang) * (radius - 10), a.y + Math.sin(ang) * (radius - 10)], [a.x + Math.cos(ang) * (radius + 4), a.y + Math.sin(ang) * (radius + 4)]], color, 2); }
      }
      if (a.comboTotal > 1 || a.type === 'twin' || a.type === 'cross') {
        const total = a.comboTotal || 2, index = a.comboIndex || (a.follow ? 2 : 1);
        for (let i = 0; i < total; i++) { const x = this.boss.x + (i - (total - 1) / 2) * 13; marker(c, x, this.boss.y - 103, false, i < index ? 5 : 3); }
      } else if (active && a.type !== 'leap' && a.type !== 'geyser' && a.type !== 'ring') marker(c, this.boss.x, this.boss.y - 105, a.red, 12);
      c.restore();
    };
    proto.drawEffects = function () {
      const c = this.ctx, reduced = this.options.effects === false;
      for (const e of (this.effects || []).slice(-48)) {
        const t = clamp(1 - e.life / (e.max || 1)), fade = clamp(e.life / (e.max || 1));
        if (reduced && e.kind === 'sparks') continue;
        c.save(); c.globalAlpha = Math.min(1, fade * 1.8);
        if (e.kind === 'slash') {
          c.translate(e.x, e.y); c.rotate(e.angle); const side = e.side || 1, radius = e.radius || 145;
          c.scale(1, side);
          const start = -1.25 + ease(t) * .65, end = .75 + ease(t) * .65;
          if (!reduced) { c.beginPath(); c.arc(0, 0, radius * (.71 + t * .28), start, end); c.strokeStyle = e.color || '#b2ffeb'; c.lineWidth = (e.heavy ? 25 : 13) * (1 - t) + 1; c.globalAlpha *= .3; c.stroke(); c.globalAlpha /= .3; }
          c.beginPath(); c.arc(0, 0, radius * (.72 + t * .28), start, end); c.strokeStyle = e.color || '#b2ffeb'; c.lineWidth = (e.heavy ? 10 : 5) * (1 - t) + 1; c.stroke();
          c.beginPath(); c.arc(0, 0, radius * (.72 + t * .28) + 4, start + .2, end); c.strokeStyle = '#fff9d4'; c.lineWidth = 1.8; c.stroke();
          if (e.heavy && !reduced) for (let i = 0; i < 3; i++) { const a = start + i * .5; line(c, [[Math.cos(a) * radius * .8, Math.sin(a) * radius * .8], [Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05]], '#e9f1c1', 1.5); }
        } else if (e.kind === 'line') {
          if (!reduced) line(c, [[e.x, e.y], [e.ex, e.ey]], '#e9bc752c', 42 * fade);
          line(c, [[e.x, e.y], [e.ex, e.ey]], '#ffe4ac', Math.max(1, 11 * fade));
          line(c, [[e.x, e.y], [e.ex, e.ey]], '#fff5d0', 2);
        } else if (e.kind === 'burst' || e.kind === 'impact') {
          const radius = e.radius || 60, color = e.color || '#e9d197';
          oval(c, e.x, e.y, radius * (.5 + t * .7), radius * (.3 + t * .45), null, color, Math.max(1, 6 * fade));
          if (!reduced) for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + .2, d = radius * (.45 + ease(t) * .7);
            path(c, [[e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .65], [e.x + Math.cos(a + .045) * (d + 10), e.y + Math.sin(a + .045) * (d + 10) * .65], [e.x + Math.cos(a - .05) * (d + 6), e.y + Math.sin(a - .05) * (d + 6) * .65]], color);
          }
        } else if (e.kind === 'sparks') {
          const count = Math.min(16, e.count || 10), seed = e.seed || e.x * .13 + e.y;
          for (let i = 0; i < count; i++) {
            const spread = (noise(seed, i) - .5) * 2.5, a = (e.angle || 0) + spread;
            const speed = 34 + noise(seed, i + 30) * 75, d = ease(t) * speed;
            const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d + t * t * 20;
            const trail = (1 - t) * (7 + noise(seed, i + 60) * 12);
            line(c, [[x, y], [x - Math.cos(a) * trail, y - Math.sin(a) * trail]], i % 3 ? e.color || '#f5d391' : '#fff8cd', i % 4 ? 1.7 : 3);
          }
        } else if (e.kind === 'execute') {
          c.translate(e.x, e.y); c.rotate(-.43);
          const reach = 90 + ease(t) * 200;
          if (!reduced) line(c, [[-reach, reach * .85], [reach, -reach * .85]], '#efc17938', 47 * fade);
          line(c, [[-reach, reach * .85], [reach, -reach * .85]], '#ffe4aa', 19 * fade + 2);
          line(c, [[-reach, reach * .85], [reach, -reach * .85]], '#fffbe1', 4 * fade + 1);
          if (t > .2) line(c, [[-reach * .6, -reach * .65], [reach * .6, reach * .65]], '#d9ffe0', 5 * fade);
          oval(c, 0, 0, 35 + ease(t) * 180, 18 + ease(t) * 95, null, '#f4daa0', 2.5);
        }
        c.restore();
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = install;
  root.NightfallArt = install;
})(typeof globalThis !== 'undefined' ? globalThis : this);
