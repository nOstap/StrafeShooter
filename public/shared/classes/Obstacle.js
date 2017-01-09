Obstacle.prototype = Object.create(Entity.prototype);
Obstacle.prototype.constructor = Obstacle;
function Obstacle(setup) {
    Entity.call(this);
    this.id = setup.id || "Obstacle" + newGuid_short();
    this.physBody = null;
    this.type = setup.type;
    this.zIndex = setup.zIndex || 0;
    this.position = setup.position;
    this.angle = setup.angle || 0;
    this.allowSleep = setup.allowSleep || true;
    this.health = setup.health;
    this.radius = setup.radius;
    this.polygon = setup.polygon || null;
    this.halfHeight = setup.halfHeight;
    this.halfWidth = setup.halfWidth;
    this.categoryBits = setup.categoryBits || null;
}

Obstacle.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);
    var entityDef = {
        halfWidth: this.halfWidth,
        halfHeight: this.halfHeight,
        position: this.position,
        radius: this.radius,
        polygon: this.polygon,
        allowSleep: this.allowSleep,
        angle: this.angle,
        type: this.type,
        damping: 2,
        density: 10,
        friction: 0.5,
        maskBits: CFG.COLLISION_GROUPS.ALL ^ CFG.COLLISION_GROUPS.BULLET,
        categoryBits: this.categoryBits || CFG.COLLISION_GROUPS.WALL
    }
    this.physBody = physicsEngine.addBody(entityDef);
    this.physBody.SetUserData({
        id: this.id,
        elementType: CFG.COLLISION_GROUPS.WALL
    });
    this.physBody.SetLinearVelocity(new Vec2(0.0, 0.0));
};
Obstacle.prototype._simply = function () {
    return {
        id: this.id,
        class: this.class,
        position: this.position,
        angle: this.angle,
        health: this.health,
        radius: this.radius,
        polygon: this.polygon,
        halfWidth: this.halfWidth,
        halfHeight: this.halfHeight,
        allowSleep: this.allowSleep,
        type: this.type,
        density: this.density,
        restitution: this.restitution,
        lifetime: this.lifetime,
        zIndex: this.zIndex
    }
};
Obstacle.prototype.draw = function () {

};
Obstacle.prototype.update = function () {
    Entity.prototype.update.call(this);

    if (this.physBody !== null) {
        this.position = this.physBody.GetPosition();
        this.angle = this.physBody.GetAngle();
    }
};

