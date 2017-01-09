MachineGun.prototype = Object.create(Weapon.prototype);
MachineGun.prototype.constructor = MachineGun;
function MachineGun(player) {
    Weapon.call(this, player);
    this.id = "MachineGun"+newGuid_short();
    this.ammoType = "RegularBullet";
    this.ammunition = 200;
    this.dispersion = 0.06;
    this.distance = 1600;
    this.delay = 70;
    this.sfx = {
        fire: 'SFX.WEAPONS.MACHINEGUN.FIRE',
        start: 'SFX.WEAPONS.MACHINEGUN.START',
        die: 'SFX.WEAPONS.DIE',
        fly: null,
        hit: null,
        idle: null
    };
    if (!IS_SERVER)
        this.anim = {
            idle: new Animation({
                frames: [
                    SPR_OBJ.frames.machine_gun_idle
                ]
            }),
            fire: new Animation({
                frames: [
                    SPR_OBJ.frames.machine_gun_0,
                    SPR_OBJ.frames.machine_gun_1
                ]
            })
        };
}

RegularBullet.prototype = Object.create(Bullet.prototype);
RegularBullet.prototype.constructor = RegularBullet;
function RegularBullet(weapon) {
    Bullet.call(this, weapon);
    this.id = "RegularBullet"+newGuid_short();
    this.speed = 5;
    this.radius = 0.02;
    this.damping = 2;
    this.restitution = 0.5;
    this.damage = 1;
}
