function RenderEngine() {
    this.buffered_animations = [];
    this.tileSet = {};
    this.bottomLayers = [];
    this.topLayers = [];
    this.view = {x0: 0, y0: 0, x1: 0, y1: 0};
    this.shakeAmount = 0;
    this.shakeOffset = {x: 0, y: 0};
    this.damageFlash = 0;
    this.outsideTile = null;
    this.ambient = 'petals';
    this.vignette = null;
    this.crosshair = null;
}
RenderEngine.prototype.setup = function () {
    var map = gameEngine.map;
    this.bottomLayers = _findByKey(map.layers, 'properties.zIndex', 0, true);
    this.topLayers = _findByKey(map.layers, 'properties.zIndex', 1, true);
    this.tileSet = {};
    var props = map.properties || {};
    this.ambient = props.ambient || 'petals';
    this.outsideTile = props.outsideTile != null ? +props.outsideTile : 40;
    this.background = props.backgroundColor || '#339eff';

    // Every tileset of the map (Tiled "firstgid" ranges); the classic map only has one.
    for (var t = 0; t < map.tilesets.length; t++) {
        var tileset = map.tilesets[t];
        var sheet = TILESET_IMAGES[tileset.image];
        var margin = tileset.margin || 0;
        var columns = tileset.columns || Math.floor((tileset.imagewidth - margin * 2) / tileset.tilewidth);
        var count = tileset.tilecount || columns * Math.floor((tileset.imageheight - margin * 2) / tileset.tileheight);
        for (var tileIndex = 0; tileIndex < count; tileIndex++) {
            this.tileSet[tileset.firstgid + tileIndex] = {
                sheet: sheet,
                x: tileIndex % columns * tileset.tilewidth + margin + CFG.MAP_TEARING_X,
                y: Math.floor(tileIndex / columns) * tileset.tileheight + margin + CFG.MAP_TEARING_X,
                w: tileset.tilewidth + CFG.MAP_TEARING_Y,
                h: tileset.tileheight + CFG.MAP_TEARING_Y
            };
        }
        var tiles = tileset.tiles || {};
        for (var key in tiles) {
            var tile = tiles[key];
            if (!tile || !tile.animation) continue;
            var frames = [];
            for (var i = 0; i < tile.animation.length; i++) {
                var rt = this.tileSet[tileset.firstgid + tile.animation[i].tileid];
                frames.push({
                    frame: {w: rt.w, h: rt.h, x: rt.x, y: rt.y},
                    pivot: {x: 0, y: 0}
                });
            }
            this.tileSet[tileset.firstgid + (+key)].animation = new Animation({
                sheet: sheet,
                stepTime: tile.animation[0].duration,
                frames: frames
            });
        }
    }
    particles.clear();
    this.crosshair = select('#crosshair');
    this.chunkCache = {bottom: {}, top: {}};
    this.chunkFrame = 0;
    this.animatedTiles = [];
    for (var gid in this.tileSet) if (this.tileSet[gid].animation) this.animatedTiles.push(this.tileSet[gid]);
};
RenderEngine.CHUNK = 10;          // tiles per chunk side
RenderEngine.MAX_CHUNKS = 48;     // per layer set; LRU beyond this (48 x 4 MB)
// Pre-render a CHUNK x CHUNK block of the given layers into an offscreen canvas. Chunks
// that contain animated tiles are re-rendered whenever the animation frame changes.
RenderEngine.prototype.renderChunk = function (layers, cx, cy, animKey) {
    var size = RenderEngine.CHUNK, tw = CFG.TILE_WIDTH, th = CFG.TILE_HEIGHT;
    var canvas = document.createElement('canvas');
    canvas.width = size * tw;
    canvas.height = size * th;
    var ctx = canvas.getContext('2d');
    var animated = false;
    var x1 = Math.min(CFG.MAP_WIDTH, (cx + 1) * size), y1 = Math.min(CFG.MAP_HEIGHT, (cy + 1) * size);
    for (var l = 0; l < layers.length; l++) {
        var data = layers[l].data;
        for (var y = cy * size; y < y1; y++) {
            for (var x = cx * size; x < x1; x++) {
                var tileId = data[y * CFG.MAP_WIDTH + x];
                if (!tileId) continue;
                var tile = this.tileSet[tileId];
                if (!tile) continue;
                var src = tile;
                if (tile.animation) {
                    animated = true;
                    var frame = tile.animation.frames[tile.animation.activeFrame].frame;
                    src = {sheet: tile.sheet, x: frame.x, y: frame.y, w: frame.w, h: frame.h};
                }
                ctx.drawImage(src.sheet.canvas, src.x, src.y, src.w, src.h, (x - cx * size) * tw, (y - cy * size) * th, tw, th);
            }
        }
    }
    return {canvas: canvas, animated: animated, animKey: animKey, used: 0};
};
RenderEngine.prototype.drawChunks = function (set, layers) {
    var size = RenderEngine.CHUNK, tw = CFG.TILE_WIDTH, th = CFG.TILE_HEIGHT;
    var cache = this.chunkCache[set];
    var animKey = '';
    for (var i = 0; i < this.animatedTiles.length; i++) animKey += this.animatedTiles[i].animation.activeFrame + ',';
    var cx0 = Math.max(0, Math.floor(this.view.x0 / (tw * size))), cx1 = Math.min(Math.ceil(CFG.MAP_WIDTH / size) - 1, Math.floor(this.view.x1 / (tw * size)));
    var cy0 = Math.max(0, Math.floor(this.view.y0 / (th * size))), cy1 = Math.min(Math.ceil(CFG.MAP_HEIGHT / size) - 1, Math.floor(this.view.y1 / (th * size)));
    var ctx = drawingContext;
    var count = 0;
    for (var key in cache) count++;
    for (var cy = cy0; cy <= cy1; cy++) {
        for (var cx = cx0; cx <= cx1; cx++) {
            var key = cx + ',' + cy;
            var chunk = cache[key];
            if (!chunk || (chunk.animated && chunk.animKey !== animKey)) {
                if (!chunk && count >= RenderEngine.MAX_CHUNKS) {
                    var oldest = null;
                    for (var k in cache) if (!oldest || cache[k].used < cache[oldest].used) oldest = k;
                    delete cache[oldest];
                    count--;
                }
                if (!chunk) count++;
                chunk = cache[key] = this.renderChunk(layers, cx, cy, animKey);
            }
            chunk.used = this.chunkFrame;
            ctx.drawImage(chunk.canvas, cx * size * tw, cy * size * th);
        }
    }
};
RenderEngine.prototype.drawTile = function (tile, xd, yd) {
    if (tile.animation) {
        tile.animation.animate(xd || 0.0001, yd || 0.0001);
    } else {
        image(tile.sheet, tile.x, tile.y, tile.w, tile.h, xd, yd, CFG.TILE_WIDTH, CFG.TILE_HEIGHT);
    }
};
// Only walks the tiles that are on screen instead of the whole layer every frame.
RenderEngine.prototype.renderLayer = function (layer) {
    var tw = CFG.TILE_WIDTH, th = CFG.TILE_HEIGHT;
    var cx0 = Math.max(0, Math.floor(this.view.x0 / tw)), cx1 = Math.min(CFG.MAP_WIDTH - 1, Math.floor(this.view.x1 / tw));
    var cy0 = Math.max(0, Math.floor(this.view.y0 / th)), cy1 = Math.min(CFG.MAP_HEIGHT - 1, Math.floor(this.view.y1 / th));
    var data = layer.data;
    for (var y = cy0; y <= cy1; y++) {
        for (var x = cx0; x <= cx1; x++) {
            var tileId = data[y * CFG.MAP_WIDTH + x];
            if (!tileId) continue;
            var tile = this.tileSet[tileId];
            if (tile) this.drawTile(tile, x * tw, y * th);
        }
    }
};
// Endless sea around the island instead of a flat colour.
RenderEngine.prototype.renderOutside = function () {
    var tile = this.tileSet[this.outsideTile];
    if (!tile) return;
    var tw = CFG.TILE_WIDTH, th = CFG.TILE_HEIGHT;
    var cx0 = Math.floor(this.view.x0 / tw), cx1 = Math.floor(this.view.x1 / tw);
    var cy0 = Math.floor(this.view.y0 / th), cy1 = Math.floor(this.view.y1 / th);
    for (var y = cy0; y <= cy1; y++) {
        for (var x = cx0; x <= cx1; x++) {
            if (x >= 0 && y >= 0 && x < CFG.MAP_WIDTH && y < CFG.MAP_HEIGHT) continue;
            this.drawTile(tile, x * tw, y * th);
        }
    }
};
RenderEngine.prototype.render = function (entities, drawDebug) {
    clear();
    background(this.background);
    this.updateShake();
    var camX = Math.round(CAMERA_POS.x + this.shakeOffset.x), camY = Math.round(CAMERA_POS.y + this.shakeOffset.y);
    this.view.x0 = -camX;
    this.view.y0 = -camY;
    this.view.x1 = -camX + width;
    this.view.y1 = -camY + height;
    particles.update();
    this.chunkFrame++;
    for (var i = 0; i < this.animatedTiles.length; i++) this.animatedTiles[i].animation.tick();

    try {
        push();
        translate(camX, camY);

        this.renderOutside();
        this.drawChunks('bottom', this.bottomLayers);
        particles.drawDecals();
        particles.draw('ground');

        var sortedEnt = _sortByKey(entities, 'zIndex');
        var margin = 150;
        for (var i = 0; i < sortedEnt.length; i++) {
            var ent = sortedEnt[i];
            if (ent._killed || ent.draw === Entity.prototype.draw || ent.draw === Obstacle.prototype.draw) continue;
            var ex = ent.position.x * SCALE, ey = ent.position.y * SCALE;
            if (ex < this.view.x0 - margin || ex > this.view.x1 + margin ||
                ey < this.view.y0 - margin || ey > this.view.y1 + margin) continue;
            ent.draw();
        }
        for (var i = this.buffered_animations.length - 1; i >= 0; i--) {
            var ani = this.buffered_animations[i];
            if (ani.maxLoops && ani.maxLoops <= ani.currentLoop) {
                this.buffered_animations.splice(i, 1);
                continue;
            }
            ani.animate();
        }
        particles.draw('air');

        this.drawChunks('top', this.topLayers);
        particles.draw('ui');
        if (drawDebug) physicsEngine.world.DrawDebugData();
        pop();

        this.drawScreenEffects();
        interface.draw();
        this.updateCrosshair();
    } catch (ex) {
        if (ex.error)
            ex.error();
        else throw ex;
    }
};
RenderEngine.prototype.addAnimation = function (anim) {
    this.buffered_animations.push(anim);
};

// ---------------------------------------------------------------- effects helpers
RenderEngine.prototype.drawShadow = function (px, py, radius, alpha, offset) {
    if (radius <= 0) return;
    var ctx = drawingContext;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0, alpha) + ')';
    ctx.beginPath();
    ctx.ellipse(px + 6 + offset * 0.5, py + 10 + offset, radius, radius * 0.7, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
};
// Additive glow; colour as [r, g, b], alpha 0..1.
RenderEngine.prototype.drawGlow = function (px, py, size, color, alpha) {
    var ctx = drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha == null ? 1 : Math.max(0, Math.min(1, alpha));
    ctx.drawImage(particles._tint('glow', color), px - size / 2, py - size / 2, size, size);
    ctx.restore();
};
RenderEngine.prototype.shake = function (amount) {
    this.shakeAmount = Math.min(30, Math.max(this.shakeAmount, amount));
};
// Shake scaled by distance to the local player (far explosions barely move the camera).
RenderEngine.prototype.shakeAt = function (x, y, amount) {
    var lp = gameEngine.players[gameEngine.local_player];
    if (!lp) return;
    var dx = lp.position.x - x, dy = lp.position.y - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    this.shake(amount * Math.max(0, 1 - d / 9));
};
RenderEngine.prototype.updateShake = function () {
    if (this.shakeAmount < 0.3) {
        this.shakeAmount = 0;
        this.shakeOffset.x = this.shakeOffset.y = 0;
        return;
    }
    this.shakeOffset.x = (Math.random() * 2 - 1) * this.shakeAmount;
    this.shakeOffset.y = (Math.random() * 2 - 1) * this.shakeAmount;
    this.shakeAmount *= 0.85;
};
RenderEngine.prototype.onLocalDamage = function (amount) {
    this.damageFlash = Math.min(1, this.damageFlash + 0.25 + amount / 40);
    this.shake(3 + amount * 0.3);
};
RenderEngine.prototype.buildVignette = function () {
    var c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    var ctx = c.getContext('2d');
    var r = Math.sqrt(width * width + height * height) / 2;
    var g = ctx.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    this.vignette = c;
    var red = document.createElement('canvas');
    red.width = width;
    red.height = height;
    var rctx = red.getContext('2d');
    rctx.drawImage(c, 0, 0);
    rctx.globalCompositeOperation = 'source-in';
    rctx.fillStyle = 'rgb(210,0,0)';
    rctx.fillRect(0, 0, width, height);
    this.redVignette = red;
};
RenderEngine.prototype.drawScreenEffects = function () {
    if (!this.vignette || this.vignette.width != width || this.vignette.height != height) this.buildVignette();
    var ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(this.vignette, 0, 0, width, height);
    var lp = gameEngine.players[gameEngine.local_player];
    var lowHealth = lp && !lp.isDead && lp.health / lp.maxHealth < 0.3 ? (0.25 + 0.15 * Math.sin(Date.now() / 150)) : 0;
    var red = Math.max(this.damageFlash, lowHealth);
    if (red > 0.01) {
        ctx.globalAlpha = Math.min(1, red);
        ctx.drawImage(this.redVignette, 0, 0, width, height);
    }
    ctx.restore();
    this.damageFlash *= 0.9;
};
RenderEngine.prototype.updateCrosshair = function () {
    if (!this.crosshair) return;
    var lp = gameEngine.players[gameEngine.local_player];
    var show = lp && !lp.isDead;
    this.crosshair.style('display', show ? 'block' : 'none');
    document.body.classList.toggle('in-game', !!show);
    if (show) this.crosshair.position(mouseX - 16, mouseY - 16);
};

var renderEngine = new RenderEngine();
