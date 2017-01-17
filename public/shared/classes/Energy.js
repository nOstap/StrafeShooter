Energy.prototype = Object.create(Entity.prototype);
Energy.prototype.constructor = Energy;
function Energy(parent) {
    Entity.call(this);
    this.id = "Energy" + _guid();
    this.parent = parent;
    this.lifetime = 300;
    this._spawned = true;
    this.physBody = null;
    this.damage = 5;
}
Energy.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);
    var entityDef = {
        position: this.parent.position.Copy(),
        radius: 0.05,
        allowSleep: false,
        friction: 0,
        density: 10000,
        restitution: 1,
        userData: {
            id: this.id,
            elementType: CFG.COLLISION_GROUPS.ENERGY
        },
        categoryBits: CFG.COLLISION_GROUPS.ENERGY,
        maskBits: CFG.COLLISION_GROUPS.WALL | CFG.COLLISION_GROUPS.PLAYER | CFG.COLLISION_GROUPS.ITEM,
        damping: 5,
        bullet: true
    };
    this.physBody = physicsEngine.addBody(entityDef);
    this.physBody.SetActive(false);
};
Energy.prototype.release = function (force) {
    if (this.physBody !== null) {
        this.createdAt = Date.now();
        this.physBody.SetActive(true);
        var energy_value = 2000;
        force.Normalize();
        force.Multiply(energy_value * this.engine.delta);
        this.physBody.ApplyImpulse(force, this.physBody.GetWorldCenter())
    }
}
Energy.prototype.colide = function (body) {
    if (!this.physBody) return;
    var dmgBuf = this.parent.weapon.player.getBuff('damage');
    var damage = this.damage;
    if (dmgBuf != null)
        damage *= dmgBuf.multipler;
    if (body.health != null)
        this.engine.dealDamage(body.id, damage);
    if(body.isPlayer) this._markToKill = true;
};
Energy.prototype.update = function () {
    if (this.physBody.IsActive())
    if (this.lifetime != null) {
        if (Date.now() - this.createdAt >= this.lifetime) {
            _earse(this.parent.energy, this);
            this.kill();
            return;
        }
    }

    if (this.parent.physBody !== null && this.physBody !== null) {
        this.physBody.SetPosition(this.parent.physBody.GetPosition());
        this.position = this.physBody.position;
    }

};
Energy.prototype._simply = function () {
    return null;
};
