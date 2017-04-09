function Entity() {
    this.id = this.constructor.name + _guid();
    this.class = this.constructor.name;
    this.physBody = null;
    this.engine = null;
    this.position = {
        x: 0,
        y: 0
    };
    this.sfx = {};
    this.lifetime = null;
    this.health = null;
    this.maxHealth = null;
    this.group = null;
    this.radius = null;
    this.halfWidth = null;
    this.halfHeight = null;
    this.angle = 0;
    this.createdAt = Date.now();
    this._spawned = false;
    this._killed = false;
    this._markToKill = false;
    this.zIndex = 0;
}
Entity.prototype._reset = function (data) {
    this.health = this.maxHealth;
    this.position = data.position || new Vec2();
    this._spawned = data._spawned || false;
    if(this.physBody) this.physBody.SetPosition(this.position);
};
Entity.prototype.draw = function () {

};
Entity.prototype.setup = function (engine) {
    this.engine = engine;
    this.createdAt = Date.now();
};
Entity.prototype.kill = function () {
    if (this.physBody)
        physicsEngine.removeBody(this.physBody);
    this.physBody = null;
    if (this.engine)
        this.engine.removeEntity(this);
};
Entity.prototype.update = function () {
    if (this.lifetime != null) {
        if (Date.now() - this.createdAt >= this.lifetime) {
            this.kill();
            return;
        }
    }
    if (this._markToKill) {
        this.kill();
        return;
    }
    if (this.health != null) {
        if (this.health <= 0) this.kill();
    }
};
Entity.prototype._simply = function () {
    return {
        id: this.id,
        class: this.class,
        position: this.position,
        health: this.health,
        maxHealth: this.maxHealth,
        radius: this.radius,
        halfWidth: this.halfWidth,
        allowSleep: this.allowSleep,
        type: this.type,
        weapon: this.weapon,
        density: this.density,
        restitution: this.restitution,
        halfHeight: this.halfHeight,
        lifetime: this.lifetime,
        angle: this.angle,
        zIndex: this.zIndex
    }
};