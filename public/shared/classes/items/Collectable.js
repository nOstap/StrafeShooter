Collectable.prototype = Object.create(Entity.prototype);
Collectable.prototype.constructor = Collectable;
function Collectable(setup) {
    Entity.call(this);
    this.id = setup.id || "Collectable" + _guid();
    this.zIndex = 1;
    this.position = setup.position;
    this.angle = setup.angle || 0;
    this.sfx = 'SFX.EFFECTS.COLLECT';
    this.team = setup.team;
    this.lifetime = null;
    this.group = 'collectables';
    this.halfHeight = 0.25;
    this.halfWidth = 0.25;
    this.glowColor = [255, 230, 140];
}
Collectable.prototype._simply = function () {
    return {
        id: this.id,
        class: this.class,
        position: this.position,
        lastPosition: this.lastPosition,
        weapon: this.weapon,
        lifetime: this.lifetime,
        angle: this.angle,
        team: this.team,
        life: this.life
    }
};

Collectable.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);
    var entityDef = {
        halfWidth: this.halfWidth,
        halfHeight: this.halfHeight,
        position: this.position,
        allowSleep: true,
        angle: this.angle,
        type: 'dynamic',
        density: 0.5,
        restitution: 0.1,
        categoryBits: CFG.COLLISION_GROUPS.ITEM,
        maskBits: CFG.COLLISION_GROUPS.ALL,
        damping: 10,
        userData: {
            id: this.id,
            elementType: CFG.COLLISION_GROUPS.ITEM
        }
    };
    this.physBody = physicsEngine.addBody(entityDef);
    this.physBody.SetLinearVelocity(new Vec2(0.0, 0.0));

};
Collectable.prototype.update = function () {
    Entity.prototype.update.call(this);
    if (this.physBody !== null) {
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};
Collectable.prototype.draw = function () {
    var pos = this.renderPos();
    var t = Date.now() / 1000 + this.position.x;
    var bob = Math.sin(t * 3) * 4;
    var px = pos.x * SCALE, py = pos.y * SCALE;
    var c = this.glowColor;
    renderEngine.drawShadow(px, py + 6, 28 - bob, 0.28, 0);
    renderEngine.drawGlow(px, py - bob, 110 + Math.sin(t * 5) * 10, c, 0.45);
    Animation.animate(this.anim, null, px, py - 6 - bob, this.angle);
    if (!IS_SERVER && Math.random() < 0.08) particles.sparkle(pos.x, pos.y - 0.1, c);
};

// Pick-ups are decided by the server only (it broadcasts item_collected), so two
// clients can never both "collect" the same box.
Collectable.prototype.colide = function (body) {
    if (!IS_SERVER) return;
    if (!body.physBody || !body.isPlayer || body.isDead) return;
    if (body.team == this.team || body.team == null)
    this.engine.collectItem(body.id, this.id);
};