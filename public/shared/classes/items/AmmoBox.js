AmmoBox.prototype = Object.create(Colectable.prototype);
AmmoBox.prototype.constructor = AmmoBox;
function AmmoBox(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "AmmoBox" + newGuid_short();
    this.weapon = setup.weapon;
    this.team = setup.team;
    this.colide = function (body) {
        var valid = Colectable.prototype.colide.call(this, body);
        if (valid) {
            var weapon = body.weapons[this.weapon];
            if (weapon) {
                SoundManager.worldPlay(this.collectSfx, this.position, 1);
                console.log(this.weapon + ' ammo collected by ' + body.displayName);
                weapon.addAmmo();
                this._markToKill = true;
            }
        }
    }
}
