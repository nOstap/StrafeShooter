RocketLuncher.prototype = Object.create(Weapon.prototype);
RocketLuncher.prototype.constructor = RocketLuncher;
function RocketLuncher(player) {
    Weapon.call(this, player);
    this.id = "RocketLuncher" + _guid();
    this.ammoType = "RocketBullet";
    this.ammunition = 70;
    this.distance = 3000;
    this.delay = 1000;
    this.anim = 'ANIMATIONS.WEAPONS.ROCKETLUNCHER';
    this.sfx = {
        fire: 'SFX.WEAPONS.ROCKETLUNCHER.FIRE',
        start: 'SFX.WEAPONS.ROCKETLUNCHER.START',
        die: 'SFX.WEAPONS.DIE',
        fly: 'SFX.WEAPONS.ROCKETLUNCHER.FLY',
        hit: 'SFX.WEAPONS.ROCKETLUNCHER.HIT',
        idle: null
    };
}

RocketBullet.prototype = Object.create(Bullet.prototype);
RocketBullet.prototype.constructor = RocketBullet;
function RocketBullet(weapon) {
    Bullet.call(this, weapon);
    this.id = "RocketBullet" + _guid();
    this.speed = 17;
    this.radius = 0.09;
    this.damping = 0;
    this.damage = 5;
    this._dieAtHit = true;
    this.restitution = 0;
    this.anim = 'ANIMATIONS.BULLETS.ROCKET';
    this.energy = new Array(CFG.EXPLOSION_PARTICLES);
}

RocketBullet.prototype.kill = function () {
    if (this.energy.length) {
        var x, y, eL = this.energy.length;
        for (var i = 0; i < eL; i++) {
            x = Math.cos(i + eL / TWO_PI);
            y = Math.sin(i + eL / TWO_PI);
            this.energy[i].release(new Vec2(x, y));
        }
    }
    if (!IS_SERVER) {
        eval(this.anim).explode.play(this.position);
        SoundManager.worldPlay(this.weapon.sfx.hit, this.position);
    }
    physicsEngine.removeBody(this.physBody);
    this.physBody = null;
    this.engine.removeEntity(this);
};