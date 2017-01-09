RocketLuncher.prototype = Object.create(Weapon.prototype);
RocketLuncher.prototype.constructor = RocketLuncher;
function RocketLuncher(player) {
    Weapon.call(this, player);
    this.id = "RocketLuncher" + newGuid_short();
    this.ammoType = "RocketBullet";
    this.ammunition = 70;
    this.distance = 4000;
    this.delay = 1000;
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
    this.id = "RocketBullet" + newGuid_short();
    this.speed = 15;
    this.radius = 0.09;
    this.damping = 0;
    this.damage = 25;
    this._dieAtHit = true;
    this.restitution = 0;
    if(!IS_SERVER)
    this.anim = {
        fly: new Animation({
            frames: [
                SPR_OBJ.frames.rocket_bullet
            ]
        }),
        explode: new Animation({
            frames: [
                SPR_OBJ.frames.exp_1,
                SPR_OBJ.frames.exp_2,
                SPR_OBJ.frames.exp_3,
                SPR_OBJ.frames.exp_4,
                SPR_OBJ.frames.exp_5,
                SPR_OBJ.frames.exp_6,
                SPR_OBJ.frames.exp_7,
                SPR_OBJ.frames.exp_8
            ]
        })
    };
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
        this.anim.explode.play(this.position);
        SoundManager.worldPlay(this.weapon.sfx.hit, this.position);
    }

    physicsEngine.removeBody(this.physBody);
    this.physBody = null;
    this.engine.removeEntity(this);
};