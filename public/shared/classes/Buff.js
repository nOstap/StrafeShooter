function Buff(lifetime, player) {
    this.lifetime = lifetime;
    this.parent = player;
    this.timeLeft = lifetime;
    this.sfx = {
        add: 'SFX.EFFECTS.BUFF_ADDING',
        beforeEnd: 'SFX.EFFECTS.COUNTER'
    };
    this._expired = false;
    SoundManager.play(this.sfx.add);
    this.update = function () {
        this.timeLeft = Date.now() - this.createdAt;
        if (this.timeLeft <= 3000 && this.timeLeft % 1000 == 0) SoundManager.play(this.sfx.beforeEnd);
        if (this.timeLeft == 0) {
            this.expired();
        }
    };
    this.expired = function () {
        this._expired = true;
    };
    this._simply = function () {
        var simp = this;
        delete simp.parent;
        return simp;
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