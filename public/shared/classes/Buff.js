function Buff(lifetime, player) {
    this.lifetime = lifetime;
    this.parent = player;
    this.createdAt = Date.now();
    this.timeLeft = lifetime;
    this._lastCountdown = null;
    this.sfx = {
        add: 'SFX.EFFECTS.BUFF_ADDING',
        beforeEnd: 'SFX.EFFECTS.COUNTER'
    };
    this._expired = false;
    var isLocal = !IS_SERVER && player && player.id == gameEngine.local_player;
    if (isLocal) SoundManager.play(this.sfx.add);
    this.update = function () {
        this.timeLeft = this.lifetime - (Date.now() - this.createdAt);
        var seconds = Math.ceil(this.timeLeft / 1000);
        if (isLocal && seconds <= 3 && seconds > 0 && seconds !== this._lastCountdown) {
            this._lastCountdown = seconds;
            SoundManager.play(this.sfx.beforeEnd);
        }
        if (this.timeLeft <= 0 && !this._expired) {
            this.expired();
        }
    };
    this.expired = function () {
        this._expired = true;
    };
    this._simply = function () {
        return {lifetime: this.lifetime, timeLeft: this.timeLeft};
    };
}
DoubleDamageBuff.prototype = Object.create(Buff.prototype);
DoubleDamageBuff.prototype.constructor = DoubleDamageBuff;
function DoubleDamageBuff(lifetime, player) {
    Buff.call(this, lifetime, player);
    this.multipler = 2;
    this.expired = function () {
        this._expired = true;
    };
}
MaximumDefenseBuff.prototype = Object.create(Buff.prototype);
MaximumDefenseBuff.prototype.constructor = MaximumDefenseBuff;
function MaximumDefenseBuff(lifetime, player) {
    Buff.call(this, lifetime, player);
    player.maxHealth = 200;
    player.health = 200;
    this.expired = function () {
        if (player.health > 100) player.health = 100;
        player.maxHealth = 100;
        this._expired = true;
    }
}
InvisibilityBuff.prototype = Object.create(Buff.prototype);
InvisibilityBuff.prototype.constructor = InvisibilityBuff;
function InvisibilityBuff(lifetime, player) {
    Buff.call(this, lifetime, player);
    player.isInvisible = true;
    this.expired = function () {
        this.parent.isInvisible = false;
        this._expired = true;
    }

}