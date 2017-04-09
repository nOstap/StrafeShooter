Bow.prototype = Object.create(Weapon.prototype);
Bow.prototype.constructor = Bow;
function Bow(player) {
    Weapon.call(this, player);
    this.id = "Bow" + _guid();
    this.ammoType = "Arrow";
    this.ammunition = 20;
    this.ammoFeed = 10;
    this.distance = 500;
    this.delay = 500;
    this.sfx = {
        fire: 'SFX.WEAPONS.BOW.FIRE',
        start: 'SFX.WEAPONS.BOW.START',
        die: 'SFX.WEAPONS.BOW.DIE',
        fly: null,
        hit: null,
        idle: null
    };
    this.anim = 'ANIMATIONS.WEAPONS.BOW';
}
Arrow.prototype = Object.create(Bullet.prototype);
Arrow.prototype.constructor = Arrow;
function Arrow(weapon) {
    Bullet.call(this, weapon);
    this.id = "Arrow" + _guid();
    this.speed = 1;
    this.damage = 20;
    this._dieAtHit = true;
    this.radius = 0.01;
    this.damping = 200;
    this.persistence = 0.1;
    this.restitution = 0;
    this.anim = 'ANIMATIONS.BULLETS.ARROW';
}


