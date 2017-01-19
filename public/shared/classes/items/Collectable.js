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
   Animation.animate(this.anim, null, this.position.x*SCALE, this.position.y*SCALE, this.angle);
};

Collectable.prototype.colide = function (body) {
    if (!body.physBody || !body.isPlayer || body.isDead) return;
    if (body.team == this.team || body.team == null)
    this.engine.collectItem(body.id, this.id);
};