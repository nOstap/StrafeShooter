Spas.prototype = Object.create(Weapon.prototype);
Spas.prototype.constructor = Spas;
function Spas(player) {
    Weapon.call(this, player);
    this.ammoType = "SpasBullet";
    this.ammoFeed = 20;
    this.ammunition = 20;
    this.bullets = 7;
    this.dispersion = 0.06;
    this.distance = 800;
    this.delay = 800;
    this.anim = 'ANIMATIONS.WEAPONS.SPAS';
    this.sfx = {
        fire: 'SFX.WEAPONS.SPAS.FIRE',
        start: 'SFX.WEAPONS.SPAS.START',
        die: 'SFX.WEAPONS.DIE',
        fly: null,
        hit: null,
        idle: null
    };
}

SpasBullet.prototype = Object.create(Bullet.prototype);
SpasBullet.prototype.constructor = SpasBullet;
function SpasBullet(weapon) {
    Bullet.call(this, weapon);
    this.speed = 4;
    this.radius = 0.03;
    this.damping = 1.5;
    this.damage = 2;
    this.persistence = 1;
    this.friction = 1;
    this.restitution = 0.1;
    this.anim = 'ANIMATIONS.BULLETS.SPASBULLET';
}
