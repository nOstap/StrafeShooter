LightGun.prototype = Object.create(Weapon.prototype);
LightGun.prototype.constructor = LightGun;
function LightGun(player) {
    Weapon.call(this, player);
    this.id = "LightGun" + _guid();
    this.ammoType = "Light";
    this.ammunition = 300;
    this.ammoFeed = 150;
    this.sfxMode = 1;
    this.distance = 200;
    this.delay = 10;
    this.anim = 'ANIMATIONS.WEAPONS.LIGHTGUN';
    this.muzzle = [98, 252, 255];
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
    this.id = "Light" + _guid();
    this.speed = 30;
    this.radius = 0.02;
    this.density = 10;
    this.damage = 1.5;
    this.persistence = 0.0;
    this.restitution = 0;
    this.impactColor = [98, 252, 255];
    this.anim = null;
}

Light.prototype.draw = function () {
    var front = this.frontBullet && this.frontBullet.physBody ? this.frontBullet : this;
    var op = front.renderPos(), cp = this.renderPos();
    var ctx = drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(98,252,255,0.25)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(cp.x * SCALE, cp.y * SCALE);
    ctx.lineTo(op.x * SCALE, op.y * SCALE);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(98,252,255,0.9)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
};
