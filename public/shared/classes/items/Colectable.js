Colectable.prototype = Object.create(Entity.prototype);
Colectable.prototype.constructor = Colectable;
function Colectable(setup) {
    Entity.call(this);
    this.id = setup.id || "Collectable" + newGuid_short();
    this.zIndex = 1;
    this.position = setup.position;
    this.angle = setup.angle || 0;
    this.collectSfx = 'SFX.EFFECTS.COLLECT';
    this.team = setup.team;
    this.lifetime = setup.lifetime || 60;
    this.halfHeight = 0.5;
    this.halfWidth = 0.5;
}
Colectable.prototype._simply = function () {
    return {
        id: this.id,
        position: this.position,
        lastPosition: this.lastPosition,
        weapon: this.weapon,
        lifetime: this.lifetime,
        angle: this.angle,
        team: this.team,
        life: this.life
    }
};

Colectable.prototype.setup = function (engine) {
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
        damping: 100,
        userData: {
            id: this.id,
            elementType: CFG.COLLISION_GROUPS.ITEM
        }
    };
    this.physBody = physicsEngine.addBody(entityDef);
    this.physBody.SetLinearVelocity(new Vec2(0.0, 0.0));

};
Colectable.prototype.update = function () {
    Entity.prototype.update.call(this);
    if (this.physBody !== null) {
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};
Colectable.prototype.colide = function (body) {
    if(!body.physBody) return false;
    if (body.isPlayer && !body.isDead) {
        return (body.team == this.team || body.team == null);
    } else return false;

};