/**
 * Client-only particle & decal system.
 *
 * Purely cosmetic: driven by real frame time (not the simulation tick) and never sent
 * over the network. Particles live in a fixed-size pool and draw straight to the 2D
 * canvas with pre-rendered textures, so a rocket barrage costs a few hundred drawImage
 * calls instead of hundreds of gradient allocations.
 *
 * Public helpers take world units (metres, like the physics); everything inside is pixels.
 */
function ParticleSystem(max) {
    this.max = max;
    this.pool = [];
    this.layers = {ground: [], air: [], ui: []};
    this.decals = [];
    this.textures = {};
    this.lastUpdate = null;
    this.ambientTimer = 0;
    for (var i = 0; i < max; i++) this.pool.push({});
}

ParticleSystem.prototype.setup = function () {
    this.textures.glow = this._texture(64, function (ctx, s) {
        var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
    });
    this.textures.smoke = this._texture(64, function (ctx, s) {
        // A few overlapping soft blobs read as a puff rather than a perfect disc.
        var blobs = [[0.5, 0.5, 0.42], [0.36, 0.42, 0.26], [0.64, 0.4, 0.24], [0.45, 0.64, 0.26], [0.62, 0.62, 0.22]];
        for (var i = 0; i < blobs.length; i++) {
            var b = blobs[i];
            var g = ctx.createRadialGradient(b[0] * s, b[1] * s, 0, b[0] * s, b[1] * s, b[2] * s);
            g.addColorStop(0, 'rgba(255,255,255,0.55)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        }
    });
    this.textures.petal = this._texture(24, function (ctx, s) {
        ctx.translate(s / 2, s / 2);
        ctx.fillStyle = '#ffb6c9';
        ctx.strokeStyle = '#e0607e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.4, s * 0.22, 0, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(-s * 0.1, -s * 0.05, s * 0.15, s * 0.07, 0, 0, TWO_PI);
        ctx.fill();
    });
    this.textures.splat = this._texture(64, function (ctx, s) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s * 0.22, 0, TWO_PI);
        ctx.fill();
        for (var i = 0; i < 9; i++) {
            var a = i / 9 * TWO_PI + Math.random() * 0.5, d = s * (0.22 + Math.random() * 0.2);
            ctx.beginPath();
            ctx.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.04 + Math.random() * 0.06), 0, TWO_PI);
            ctx.fill();
        }
    });
    this.textures.scorch = this._texture(128, function (ctx, s) {
        var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(20,12,8,0.85)');
        g.addColorStop(0.55, 'rgba(30,20,10,0.5)');
        g.addColorStop(1, 'rgba(30,20,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(10,6,4,0.6)';
        ctx.lineWidth = 2;
        for (var i = 0; i < 12; i++) {
            var a = i / 12 * TWO_PI + Math.random() * 0.3;
            ctx.beginPath();
            ctx.moveTo(s / 2 + Math.cos(a) * s * 0.15, s / 2 + Math.sin(a) * s * 0.15);
            ctx.lineTo(s / 2 + Math.cos(a) * s * (0.3 + Math.random() * 0.15), s / 2 + Math.sin(a) * s * (0.3 + Math.random() * 0.15));
            ctx.stroke();
        }
    });
    this._tinted = {};
};
ParticleSystem.prototype._texture = function (size, paint) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    return c;
};
// Colour-tinted copy of a white texture, cached per colour.
ParticleSystem.prototype._tint = function (name, rgb) {
    var key = name + rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    var t = this._tinted[key];
    if (t) return t;
    var src = this.textures[name];
    t = document.createElement('canvas');
    t.width = src.width;
    t.height = src.height;
    var ctx = t.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    ctx.fillRect(0, 0, t.width, t.height);
    this._tinted[key] = t;
    return t;
};
ParticleSystem.prototype.spawn = function (layer, props) {
    if (!CFG.PARTICLES.ENABLED) return null;
    var p = this.pool.pop();
    if (!p) return null;
    p.x = props.x;
    p.y = props.y;
    p.vx = props.vx || 0;
    p.vy = props.vy || 0;
    p.life = 0;
    p.maxLife = props.life || 0.5;
    p.size = props.size || 10;
    p.endSize = props.endSize != null ? props.endSize : p.size;
    p.alpha = props.alpha != null ? props.alpha : 1;
    p.endAlpha = props.endAlpha != null ? props.endAlpha : 0;
    p.drag = props.drag || 0;
    p.gravity = props.gravity || 0;
    p.rot = props.rot || 0;
    p.vrot = props.vrot || 0;
    p.kind = props.kind || 'glow';
    p.color = props.color || [255, 255, 255];
    p.endColor = props.endColor || null;
    p.additive = !!props.additive;
    p.text = props.text || null;
    p.width = props.width || 2;
    p.wobble = props.wobble || 0;
    this.layers[layer].push(p);
    return p;
};
ParticleSystem.prototype.decal = function (kind, x, y, size, color, alpha) {
    if (this.decals.length > 80) this.decals.shift();
    this.decals.push({
        kind: kind, x: x * SCALE, y: y * SCALE, size: size, color: color, alpha: alpha,
        rot: Math.random() * TWO_PI, born: Date.now(), life: 25000
    });
};
ParticleSystem.prototype.update = function () {
    var now = performance.now();
    var dt = this.lastUpdate === null ? 0 : Math.min(0.05, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;
    for (var name in this.layers) {
        var list = this.layers[name];
        for (var i = list.length - 1; i >= 0; i--) {
            var p = list[i];
            p.life += dt;
            if (p.life >= p.maxLife) {
                list[i] = list[list.length - 1];
                list.pop();
                this.pool.push(p);
                continue;
            }
            var damp = Math.max(0, 1 - p.drag * dt);
            p.vx *= damp;
            p.vy = p.vy * damp + p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            if (p.wobble) p.x += Math.sin(p.life * 4 + p.rot) * p.wobble * dt;
        }
    }
    this.updateAmbient(dt);
};
ParticleSystem.prototype.draw = function (layer) {
    var ctx = drawingContext;
    var list = this.layers[layer];
    var view = renderEngine.view;
    ctx.save();
    for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || p.y < view.y0 - 100 || p.y > view.y1 + 100) continue;
        var t = p.life / p.maxLife;
        var size = p.size + (p.endSize - p.size) * t;
        var alpha = p.alpha + (p.endAlpha - p.alpha) * t;
        if (alpha <= 0.01 || size <= 0.1) continue;
        var color = p.color;
        if (p.endColor) {
            color = [
                Math.round(p.color[0] + (p.endColor[0] - p.color[0]) * t),
                Math.round(p.color[1] + (p.endColor[1] - p.color[1]) * t),
                Math.round(p.color[2] + (p.endColor[2] - p.color[2]) * t)
            ];
            // Quantise so the tint cache stays small.
            color[0] = color[0] & 0xF0;
            color[1] = color[1] & 0xF0;
            color[2] = color[2] & 0xF0;
        }
        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = alpha;
        switch (p.kind) {
            case 'spark':
                var len = Math.max(2, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.03 * (1 - t * 0.5));
                var ang = Math.atan2(p.vy, p.vx);
                ctx.strokeStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
                ctx.lineWidth = p.width;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                break;
            case 'debris':
                ctx.save();
                ctx.fillStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-size / 2, -size / 4, size, size / 2);
                ctx.restore();
                break;
            case 'ring':
                ctx.strokeStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
                ctx.lineWidth = p.width * (1 - t) + 1;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, TWO_PI);
                ctx.stroke();
                break;
            case 'text':
                ctx.font = 'bold ' + Math.round(size) + 'px Chewy, sans-serif';
                ctx.textAlign = 'center';
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(40,0,0,0.9)';
                ctx.strokeText(p.text, p.x, p.y);
                ctx.fillStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
                ctx.fillText(p.text, p.x, p.y);
                break;
            case 'petal':
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.scale(1, 0.6 + 0.4 * Math.sin(p.life * 5 + p.rot));
                ctx.drawImage(this.textures.petal, -size / 2, -size / 2, size, size);
                ctx.restore();
                break;
            default:
                var tex = this._tint(p.kind, color);
                ctx.drawImage(tex, p.x - size / 2, p.y - size / 2, size, size);
        }
    }
    ctx.restore();
};
ParticleSystem.prototype.drawDecals = function () {
    var ctx = drawingContext, now = Date.now(), view = renderEngine.view;
    ctx.save();
    for (var i = this.decals.length - 1; i >= 0; i--) {
        var d = this.decals[i];
        var age = now - d.born;
        if (age > d.life) {
            this.decals.splice(i, 1);
            continue;
        }
        if (d.x < view.x0 - 100 || d.x > view.x1 + 100 || d.y < view.y0 - 100 || d.y > view.y1 + 100) continue;
        ctx.globalAlpha = d.alpha * Math.min(1, (d.life - age) / 4000);
        var tex = d.color ? this._tint(d.kind, d.color) : this.textures[d.kind];
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.drawImage(tex, -d.size / 2, -d.size / 2, d.size, d.size);
        ctx.rotate(-d.rot);
        ctx.translate(-d.x, -d.y);
    }
    ctx.restore();
};
ParticleSystem.prototype.clear = function () {
    for (var name in this.layers) {
        var list = this.layers[name];
        while (list.length) this.pool.push(list.pop());
    }
    this.decals = [];
};

// ---------------------------------------------------------------- emitters
ParticleSystem.prototype.muzzle = function (x, y, angle, color) {
    x *= SCALE;
    y *= SCALE;
    this.spawn('air', {x: x, y: y, life: 0.07, size: 46, endSize: 30, kind: 'glow', color: color, additive: true, alpha: 0.9});
    this.spawn('air', {x: x, y: y, life: 0.05, size: 18, endSize: 10, kind: 'glow', color: [255, 255, 255], additive: true});
    for (var i = 0; i < 4; i++) {
        var a = angle + (Math.random() - 0.5) * 0.7, s = 300 + Math.random() * 400;
        this.spawn('air', {x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.12 + Math.random() * 0.08,
            kind: 'spark', color: color, additive: true, drag: 8, width: 2});
    }
    this.spawn('air', {x: x, y: y, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40, life: 0.5, size: 14, endSize: 34,
        kind: 'smoke', color: [210, 210, 210], alpha: 0.25, drag: 2});
};
ParticleSystem.prototype.impact = function (x, y, angle, color) {
    x *= SCALE;
    y *= SCALE;
    this.spawn('air', {x: x, y: y, life: 0.1, size: 30, endSize: 10, kind: 'glow', color: color, additive: true});
    for (var i = 0; i < 6; i++) {
        var a = angle + PI + (Math.random() - 0.5) * 2.2, s = 120 + Math.random() * 380;
        this.spawn('air', {x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.15 + Math.random() * 0.2,
            kind: 'spark', color: color, additive: true, drag: 6, width: 1.5});
    }
    this.spawn('ground', {x: x, y: y, life: 0.6, size: 10, endSize: 28, kind: 'smoke', color: [190, 180, 160], alpha: 0.35, drag: 1});
};
ParticleSystem.prototype.blood = function (x, y, count) {
    x *= SCALE;
    y *= SCALE;
    for (var i = 0; i < count; i++) {
        var a = Math.random() * TWO_PI, s = 60 + Math.random() * 220;
        this.spawn('air', {x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3,
            size: 5 + Math.random() * 6, endSize: 2, kind: 'glow', color: [200, 20, 30], alpha: 0.95, endAlpha: 0.2, drag: 5});
    }
    this.spawn('air', {x: x, y: y, life: 0.25, size: 26, endSize: 60, kind: 'glow', color: [255, 60, 60], additive: true, alpha: 0.5});
    if (Math.random() < 0.6) this.decal('splat', x / SCALE + (Math.random() - 0.5) * 0.3, y / SCALE + (Math.random() - 0.5) * 0.3, 30 + Math.random() * 25, [150, 15, 25], 0.55);
};
ParticleSystem.prototype.death = function (x, y) {
    this.blood(x, y, 30);
    var px = x * SCALE, py = y * SCALE;
    this.spawn('air', {x: px, y: py, life: 0.5, size: 30, endSize: 140, kind: 'ring', color: [255, 90, 90], width: 8, alpha: 0.8});
    for (var i = 0; i < 12; i++) {
        var a = Math.random() * TWO_PI, s = 40 + Math.random() * 120;
        this.spawn('air', {x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9 + Math.random() * 0.6,
            size: 18, endSize: 46, kind: 'smoke', color: [120, 110, 110], alpha: 0.5, drag: 2});
    }
    this.decal('splat', x, y, 90, [140, 10, 20], 0.6);
};
ParticleSystem.prototype.explosion = function (x, y) {
    var px = x * SCALE, py = y * SCALE, i, a, s;
    this.spawn('air', {x: px, y: py, life: 0.18, size: 260, endSize: 320, kind: 'glow', color: [255, 240, 200], additive: true, alpha: 0.9});
    this.spawn('air', {x: px, y: py, life: 0.45, size: 40, endSize: 240, kind: 'ring', color: [255, 220, 160], width: 10, alpha: 0.7});
    for (i = 0; i < 18; i++) {
        a = Math.random() * TWO_PI;
        s = 60 + Math.random() * 260;
        this.spawn('air', {x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.35,
            size: 40 + Math.random() * 40, endSize: 10, kind: 'glow', color: [255, 200, 80], endColor: [200, 40, 0],
            additive: true, drag: 4});
    }
    for (i = 0; i < 16; i++) {
        a = Math.random() * TWO_PI;
        s = 30 + Math.random() * 140;
        this.spawn('air', {x: px + Math.cos(a) * 20, y: py + Math.sin(a) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
            life: 1.2 + Math.random() * 1.2, size: 40, endSize: 120, kind: 'smoke', color: [90, 85, 80],
            alpha: 0.55, drag: 2, rot: Math.random() * TWO_PI, vrot: (Math.random() - 0.5) * 2});
    }
    for (i = 0; i < 26; i++) {
        a = Math.random() * TWO_PI;
        s = 300 + Math.random() * 700;
        this.spawn('air', {x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.4,
            kind: 'spark', color: [255, 210, 120], additive: true, drag: 5, width: 2.5});
    }
    for (i = 0; i < 10; i++) {
        a = Math.random() * TWO_PI;
        s = 150 + Math.random() * 350;
        this.spawn('air', {x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5,
            size: 6 + Math.random() * 8, kind: 'debris', color: [70, 55, 40], alpha: 1, endAlpha: 0.6, drag: 4,
            rot: Math.random() * TWO_PI, vrot: (Math.random() - 0.5) * 20});
    }
    this.decal('scorch', x, y, 170 + Math.random() * 40, null, 0.75);
};
ParticleSystem.prototype.dust = function (x, y, count) {
    x *= SCALE;
    y *= SCALE;
    for (var i = 0; i < count; i++) {
        var a = Math.random() * TWO_PI, s = 10 + Math.random() * (count > 1 ? 90 : 25);
        this.spawn('ground', {x: x + (Math.random() - 0.5) * 20, y: y + 10 + (Math.random() - 0.5) * 20,
            vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, size: 10, endSize: 26,
            kind: 'smoke', color: [205, 190, 150], alpha: 0.35, drag: 3});
    }
};
ParticleSystem.prototype.trail = function (type, x, y, angle) {
    x *= SCALE;
    y *= SCALE;
    var bx = x - Math.cos(angle) * 18, by = y - Math.sin(angle) * 18;
    switch (type) {
        case 'rocket':
            this.spawn('air', {x: bx, y: by, life: 0.12, size: 26, endSize: 10, kind: 'glow', color: [255, 170, 60], additive: true});
            this.spawn('air', {x: bx, y: by, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
                life: 0.8 + Math.random() * 0.5, size: 12, endSize: 46, kind: 'smoke', color: [200, 200, 200], alpha: 0.4, drag: 1.5});
            break;
        case 'curve':
            this.spawn('air', {x: x, y: y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
                life: 0.35, size: 16, endSize: 2, kind: 'glow', color: [120, 255, 160], additive: true});
            break;
        case 'arrow':
            if (Math.random() < 0.5)
                this.spawn('air', {x: bx, y: by, life: 0.25, size: 6, endSize: 2, kind: 'glow', color: [255, 255, 255], alpha: 0.5, additive: true});
            break;
    }
};
ParticleSystem.prototype.respawn = function (x, y) {
    x *= SCALE;
    y *= SCALE;
    this.spawn('air', {x: x, y: y, life: 0.6, size: 20, endSize: 130, kind: 'ring', color: [120, 220, 255], width: 6});
    this.spawn('air', {x: x, y: y, life: 0.4, size: 160, endSize: 60, kind: 'glow', color: [120, 220, 255], additive: true, alpha: 0.8});
    for (var i = 0; i < 24; i++) {
        var a = Math.random() * TWO_PI, r = Math.random() * 40;
        this.spawn('air', {x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 30, vy: -60 - Math.random() * 120,
            life: 0.6 + Math.random() * 0.6, size: 10, endSize: 2, kind: 'glow', color: [170, 235, 255], additive: true, drag: 1});
    }
};
ParticleSystem.prototype.pickup = function (x, y, color) {
    x *= SCALE;
    y *= SCALE;
    color = color || [255, 230, 140];
    this.spawn('air', {x: x, y: y, life: 0.45, size: 16, endSize: 90, kind: 'ring', color: color, width: 6});
    for (var i = 0; i < 16; i++) {
        var a = i / 16 * TWO_PI, s = 120 + Math.random() * 120;
        this.spawn('air', {x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3,
            size: 12, endSize: 2, kind: 'glow', color: color, additive: true, drag: 4});
    }
};
ParticleSystem.prototype.sparkle = function (x, y, color) {
    x = x * SCALE + (Math.random() - 0.5) * 50;
    y = y * SCALE + (Math.random() - 0.5) * 50;
    this.spawn('air', {x: x, y: y, vy: -25, life: 0.6, size: 4, endSize: 14, alpha: 0.9, kind: 'glow', color: color || [255, 255, 200], additive: true});
};
ParticleSystem.prototype.aura = function (x, y, color) {
    var a = Math.random() * TWO_PI, r = 25 + Math.random() * 15;
    this.spawn('air', {x: x * SCALE + Math.cos(a) * r, y: y * SCALE + Math.sin(a) * r, vy: -40, life: 0.5,
        size: 10, endSize: 2, kind: 'glow', color: color, additive: true});
};
ParticleSystem.prototype.damageNumber = function (x, y, amount) {
    if (!amount) return;
    this.spawn('ui', {x: x * SCALE + (Math.random() - 0.5) * 30, y: y * SCALE, vx: (Math.random() - 0.5) * 40, vy: -90,
        life: 0.9, size: 22 + Math.min(18, amount * 0.6), endSize: 18, kind: 'text', text: '-' + amount,
        color: amount >= 20 ? [255, 220, 60] : [255, 255, 255], alpha: 1, endAlpha: 0, drag: 2});
};
// Cherry-blossom petals drifting across the screen - matches the map's sakura trees.
ParticleSystem.prototype.updateAmbient = function (dt) {
    var view = renderEngine.view;
    if (!view || !view.x1) return;
    this.ambientTimer += dt;
    var interval = renderEngine.ambient === 'snow' ? 0.04 : 0.25;
    while (this.ambientTimer > interval) {
        this.ambientTimer -= interval;
        var x = view.x0 + Math.random() * (view.x1 - view.x0 + 200) - 200;
        var y = view.y0 - 20 + Math.random() * (view.y1 - view.y0) * 0.3;
        if (renderEngine.ambient === 'snow') {
            this.spawn('ui', {x: x, y: y, vx: 30 + Math.random() * 30, vy: 50 + Math.random() * 50, life: 6, size: 5 + Math.random() * 6,
                kind: 'glow', color: [255, 255, 255], alpha: 0.85, endAlpha: 0.6, wobble: 30});
        } else if (renderEngine.ambient === 'dust') {
            this.spawn('ui', {x: x, y: y + (view.y1 - view.y0) * 0.4 * Math.random(), vx: 160 + Math.random() * 80, vy: 10 + Math.random() * 20,
                life: 4, size: 40 + Math.random() * 40, endSize: 90, kind: 'smoke', color: [230, 200, 140], alpha: 0.12, endAlpha: 0});
        } else {
            this.spawn('ui', {x: x, y: y, vx: 40 + Math.random() * 40, vy: 40 + Math.random() * 30, life: 7, size: 12 + Math.random() * 6,
                kind: 'petal', alpha: 0.9, endAlpha: 0.7, rot: Math.random() * TWO_PI, vrot: (Math.random() - 0.5) * 3, wobble: 40});
        }
    }
};

var particles = new ParticleSystem(CFG.PARTICLES.MAX);
