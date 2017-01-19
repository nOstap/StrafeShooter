CurveGun.prototype = Object.create(Weapon.prototype);
CurveGun.prototype.constructor = CurveGun;
function CurveGun(player) {
    Weapon.call(this, player);
    this.id = "CurveGun" + _guid();
    this.ammoType = "LightBullet";
    this.ammunition = 50;
    this.distance = 2000;
    this.delay = 1000;
    this.anim = 'ANIMATIONS.WEAPONS.CURVEGUN';
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
    this.id = "LightBullet" + _guid();
    this.speed = 5;
    this.damage = 50;
    this.density = 4;
    this.radius = 0.02;
    this.persistence = 0.1;
    this.delay = 100;
    this.delayed = false;
    this.force = new Vec2(0,0);
    this.anim = 'ANIMATIONS.BULLETS.LIGHTBULLET';
}

LightBullet.prototype.update = function () {
    Entity.prototype.update.call(this);
    if (!IS_SERVER && CFG.BULLET_TAIL)
        this.tail.push(this.position);

    if (Date.now()-this.createdAt >= this.delay && !this.delayed) {
        this.delayed = true;
        this.force.Set(
            this.weapon.player.input.pointer.x,
            this.weapon.player.input.pointer.y
        );
        this.force.Subtract(this.target);
        this.force.Multiply(this.engine.delta * this.speed);
    }


    if (this.physBody !== null) {
        var vel = this.physBody.GetLinearVelocity();
        this.physBody.SetAngle(Math.atan2(vel.y, vel.x));
        this.physBody.ApplyForce(this.force, this.physBody.GetWorldCenter());
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
    }
};
