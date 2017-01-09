function RenderEngine() {
    this.buffered_animations = [];
    this.tileSet = {};
    this.mapLayers = [];
}
RenderEngine.prototype.setup = function () {
    this.mapLayers = findByKey(gameEngine.map.layers, 'type', 'tilelayer');
    var tileset = gameEngine.map.tilesets[0];
    var columns = Math.floor(tileset.imagewidth / CFG.TILE_WIDTH);
    var rows = Math.floor(tileset.imageheight / CFG.TILE_HEIGHT);
    for (var tileIndex = 0; tileIndex <= columns * rows; tileIndex++) {
        this.tileSet[tileIndex] = {
            x: tileIndex % columns * CFG.TILE_WIDTH,
            y: Math.floor(tileIndex / columns) * CFG.TILE_HEIGHT
        };
    }
    for (var tileIndex = 0; tileIndex <= columns * rows; tileIndex++) {
        var tile = tileset.tiles[tileIndex];
        if (!tile) continue;
        if (!tile.animation) continue;
        var frames = [];
        for (var i = 0; i < tile.animation.length; i++) {
            var rt = this.tileSet[tile.animation[i].tileid];
            frames.push({
                frame: {
                    w: CFG.TILE_WIDTH + CFG.MAP_TEARING_Y,
                    h: CFG.TILE_HEIGHT + CFG.MAP_TEARING_Y,
                    x: rt.x + CFG.MAP_MARGIN + CFG.MAP_TEARING_X,
                    y: rt.y + CFG.MAP_MARGIN + CFG.MAP_TEARING_X
                },
                pivot: {x: 0, y: 0}
            });
        }
        this.tileSet[tileIndex].animation = new Animation({
            sheet: MAP_SPRITE_SHEET,
            stepTime: tile.animation[0].duration,
            frames: frames
        });
    }

};
RenderEngine.prototype.render = function (entities, drawDebug) {
    translate(CAMERA_POS.x, CAMERA_POS.y);
    clear();
    background(10);

    var xd, yd, x, y;

    for (var i = 0; i < this.mapLayers.length; i++) {

        x = y = xd = yd = 0;

        for (var idx = 0; idx < this.mapLayers[i].data.length; idx++) {
            var tileId = this.mapLayers[i].data[idx];
            if (!tileId) continue;

            x = Math.floor(idx % CFG.MAP_WIDTH);
            y = Math.floor(idx / CFG.MAP_WIDTH);

            xd = x * CFG.TILE_WIDTH;
            yd = y * CFG.TILE_HEIGHT;
            if (xd > -CAMERA_POS.x + (width) ||
                xd < -CAMERA_POS.x - (width) ||
                yd > -CAMERA_POS.y + (height) ||
                yd < -CAMERA_POS.y - (height)) continue;

            var tile = this.tileSet[tileId - 1];
            if (tile.animation) {
                tile.animation.animate(xd, yd);
            } else {
                image(
                    MAP_SPRITE_SHEET,
                    tile.x + CFG.MAP_MARGIN + CFG.MAP_TEARING_X,
                    tile.y + CFG.MAP_MARGIN + CFG.MAP_TEARING_X,
                    CFG.TILE_WIDTH + CFG.MAP_TEARING_Y,
                    CFG.TILE_HEIGHT + CFG.MAP_TEARING_Y,
                    xd,
                    yd,
                    CFG.TILE_WIDTH,
                    CFG.TILE_HEIGHT
                );
            }
        }

    }
    var sortedEnt = sortByKey(entities, 'zIndex');
    for (var i = 0; i < sortedEnt.length; i++) {
        if (sortedEnt[i].x * SCALE > -CAMERA_POS.x + (width) ||
            sortedEnt[i].y * SCALE < -CAMERA_POS.x - (width) ||
            sortedEnt[i].x * SCALE > -CAMERA_POS.y + (height) ||
            sortedEnt[i].y * SCALE < -CAMERA_POS.y - (height)) continue;

        sortedEnt[i].draw();
    }
    sortedEnt = [];
    for (var i = 0; i < this.buffered_animations.length; i++) {
        var ani = this.buffered_animations[i];
        if (ani.maxLoops && ani.maxLoops <= ani.currentLoop) {
            this.buffered_animations.splice(this.buffered_animations.indexOf(ani), 1);
            continue;
        }
        ani.animate();
    }

    interface.draw();

    if (drawDebug) physicsEngine.world.DrawDebugData();
};
RenderEngine.prototype.addAnimation = function (anim) {
    this.buffered_animations.push(anim);
};

var renderEngine = new RenderEngine();