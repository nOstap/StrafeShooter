LightGun.prototype = Object.create(Weapon.prototype);
LightGun.prototype.constructor = LightGun;
function LightGun(player) {
    Weapon.call(this, player);
    this.id = "LightGun" + newGuid_short();
    this.ammoType = "Light";
    this.ammunition = 500;
    this.sfxMode = 1;
    this.distance = 300;
    this.delay = 0.0;
    if (!IS_SERVER)
        this.anim = {
        idle: new Animation({
            frames: [
                SPR_OBJ.frames.light_gun_idle
            ]
        }),
        fire: new Animation({
            frames: [
                SPR_OBJ.frames.light_gun_0,
                SPR_OBJ.frames.light_gun_1
            ]
        })
    };
    this.sfx = {
        fire: 'SFX.WEAPONS.LIGHTGUN.FIRE',
        start: 'SFX.WEAPONS.LIGHTGUN.START',
        die: 'SFX.WEAPONS.DIE',
        fly: null,
        hit: null,
        idle: null
    };
}

Light.prototype = Object.create(Bullet.prototype);
Light.prototype.constructor = Light;
function Light(weapon) {
    Bullet.call(this, weapon);
    this.id = "Light" + newGuid_short();
    this.speed = 30;
    this.radius = 0.02;
    this.density = 10;
    this.damage = 1;
    this.persistence = 0.0;
    this.restitution = 0;
    this.anim = null;
}

Light.prototype.draw = function () {
    var op = this.frontBullet.position.Copy(), cp = this.position.Copy();
    cp.Multiply(SCALE);
    op.Multiply(SCALE);
    push();
    stroke('#62fcff');
    strokeWeight(5);
    line(cp.x, cp.y, op.x, op.y);
    stroke(255);
    strokeWeight(2);
    line(cp.x, cp.y, op.x, op.y);
    pop();
};
