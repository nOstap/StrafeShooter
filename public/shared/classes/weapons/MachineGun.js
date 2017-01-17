MachineGun.prototype = Object.create(Weapon.prototype);
MachineGun.prototype.constructor = MachineGun;
function MachineGun(player) {
    Weapon.call(this, player);
    this.id = "MachineGun" + _guid();
    this.ammoType = "RegularBullet";
    this.ammunition = 200;
    this.dispersion = 0.06;
    this.distance = 1000;
    this.delay = 80;
    this.sfx = {
        fire: 'SFX.WEAPONS.MACHINEGUN.FIRE',
        start: 'SFX.WEAPONS.MACHINEGUN.START',
        die: 'SFX.WEAPONS.DIE',
        fly: null,
        hit: null,
        idle: null
    };
    this.anim = 'ANIMATIONS.WEAPONS.MACHINEGUN';
}

RegularBullet.prototype = Object.create(Bullet.prototype);
RegularBullet.prototype.constructor = RegularBullet;
function RegularBullet(weapon) {
    Bullet.call(this, weapon);
    this.id = "RegularBullet" + _guid();
    this.speed = 5;
    this.radius = 0.02;
    this.damping = 2;
    this.persistence = 0.5;
    this.restitution = 0.5;
    this.damage = 1;
}
