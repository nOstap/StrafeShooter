CurveGun.prototype = Object.create(Weapon.prototype);
CurveGun.prototype.constructor = CurveGun;
function CurveGun(player) {
    Weapon.call(this, player);
    this.id = "CurveGun" + newGuid_short();
    this.ammoType = "LightBullet";
    this.ammunition = 50;
    this.distance = 2000;
    this.delay = 1000;
    if (!IS_SERVER)
        this.anim = {
            idle: new Animation({
                frames: [
                    SPR_OBJ.frames.curve_gun_idle,
                ]
            }),
            fire: new Animation({
                frames: [
                    SPR_OBJ.frames.curve_gun_idle,
                    SPR_OBJ.frames.curve_gun_0,
                ]
            })
        };
    this.sfx = {
        fire: 'SFX.WEAPONS.CURVEGUN.FIRE',
        start: 'SFX.WEAPONS.CURVEGUN.START',
        die: 'SFX.WEAPONS.DIE',
        fly: null,
        hit: null,
        idle: null
    };
}

LightBullet.prototype = Object.create(Bullet.prototype);
LightBullet.prototype.constructor = LightBullet;
function LightBullet(weapon) {
    Bullet.call(this, weapon);
    this.id = "LightBullet" + newGuid_short();
    this.speed = 4;
    this.density = 10;
    this.damage = 50;
    this.radius = 0.01;
    this.persistence = 0.1;
    this.delay = 0.05;
    this.timeout = 0;
    this.force = new Vec2(0, 0);
    if (!IS_SERVER)
        this.anim = {
            fly: new Animation({
                frames: [
                    SPR_OBJ.frames.light_bullet
                ]
            })
        };
}

LightBullet.prototype.update = function () {
    if (this.timeout != null)
        this.timeout += this.engine.delta;
    this.lifetime -= this.engine.delta;
    if (this.lifetime <= 0 || this._markToKill == true) {
        this.kill();
        return;
    }

    if(!IS_SERVER && CFG.BULLET_TAIL)
        this.tail.push(this.position);

    if (this.timeout >= this.delay) {
        this.timeout = null;
        this.force = new Vec2(this.weapon.player.input.pointer.x, this.weapon.player.input.pointer.y);
        this.force.Subtract(this.target);
        this.force.Multiply(this.engine.delta*this.speed*2);
    }


    if (this.physBody !== null) {
        var vel = this.physBody.GetLinearVelocity();
        this.physBody.SetAngle(Math.atan2(vel.y, vel.x));
        this.physBody.ApplyForce(this.force, this.physBody.GetWorldCenter());
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};

LightBullet.prototype.colide = function (body) {
    Bullet.prototype.colide.call(this, body);
    this._markToKill = true;
};
