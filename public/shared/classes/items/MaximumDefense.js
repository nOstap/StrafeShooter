MaximumDefense.prototype = Object.create(Colectable.prototype);
MaximumDefense.prototype.constructor = MaximumDefense;
function MaximumDefense(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "MaximumDefense" + _guid();
    this.team = setup.team;
    this.expired = 10000;
    this.sfx = 'SFX.EFFECTS.MAXIMUM_DEFENSE';
    this.collect = function (player) {
        player.addBuff(new MaximumDefenseBuff(this.expired, player));
        this._markToKill = true;
    };
}
