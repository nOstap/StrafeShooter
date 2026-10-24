function Weapon(player, setup) {
    if (this.constructor === Weapon) throw new Error("Weapon is a abstract class.");
    if (!setup) setup = {};
    this.player = player;
    this.class = this.constructor.name;
    this.speed = null;
    this.ammoType = false;
    this.ammunition = setup.ammunition || 10;
    this.ammoFeed = this.ammunition;
    this.bullets = 1;
    this.distance = null;
    this.dispersion = 0;
    this.sfx = {
        fire: null,
        start: null,
        die: null,
        fly: null,
        hit: null,
        idle: null
    };
    this.sfxMode = 0;
    this.muzzle = null; // [r, g, b] muzzle flash colour, null = none
    this.timeout = setup.timeout || null;
    this.delay = null;
    this.reloadTime = Date.now();
}
Weapon.prototype._simply = function () {
    return {
        id: this.id,
        class: this.class,
        ammunition: this.ammunition,
        timeout: this.timeout
    }
};
Weapon.prototype._reset = function () {
    this.constructor.call(this, this.player);
};
Weapon.prototype.activate = function () {
    SoundManager.worldPlay(this.sfx.start);
    if (this.player.input.fire)
        this.startFire();
};
Weapon.prototype.disactivate = function () {
    this.stopFire();
    SoundManager.stop(this.sfx.fire);
};
Weapon.prototype.addAmmo = function (count) {
    if (!count)
        this.ammunition += this.ammoFeed;
};
Weapon.prototype.fire = function () {
    if (Date.now() - this.reloadTime >= this.delay) {
        this.reloadTime = Date.now();
        if (this.ammunition > 0) {
            SoundManager.worldPlay(this.sfx.fire, this.player.position, this.sfxMode);
            this.ammunition--;
            if (!IS_SERVER && this.muzzle) {
                var fix = this.player.getShootFix();
                var mx = this.player.position.x + fix.x + Math.cos(this.player.lookAngle) * 0.25,
                    my = this.player.position.y + fix.y + Math.sin(this.player.lookAngle) * 0.25;
                particles.muzzle(mx, my, this.player.lookAngle, this.muzzle);
                if (this.player.id == gameEngine.local_player) renderEngine.shake(this.recoil || 0);
            }
            for (var i = 0; i < this.bullets; i++) {
                var bullet = new global[this.ammoType](this);
                if (this.player.engine.entities.indexOf(this.last_bullet) == -1) this.last_bullet = bullet;
                bullet.frontBullet = this.last_bullet;
                this.last_bullet = bullet;
                this.player.engine.addEntity(bullet);
            }
        } else {
            SoundManager.stop(this.sfx.fire);
            if (!IS_SERVER && this.player.id == gameEngine.local_player) SoundManager.worldPlay(this.sfx.die);
        }
    }
};
Weapon.prototype.startFire = function () {
    this.fire();
};
Weapon.prototype.stopFire = function () {
    if (this.sfxMode)
        SoundManager.stop(this.sfx.fire);
};

Bullet.prototype = Object.create(Entity.prototype);
Bullet.prototype.constructor = Bullet;
function Bullet(weapon) {
    if (this.constructor === Weapon) throw new Error("Bullet is a abstract class.");
    Entity.call(this);
    this.weapon = weapon;
    this._dieAtHit = false;
    // World-space aim point (same on every machine, independent of the shooter's camera).
    this.target = new Vec2(weapon.player.input.aim.x, weapon.player.input.aim.y);
    this.position = weapon.player.position.Copy();
    this.speed = 1;
    this.tail = [];
    this.lifetime = weapon.distance;
    this.timeout = null;
    this._spawned = true;
    this.damage = 1;
    this.bullet = true;
    this.damping = 1;
    this._markToKill = false;
    this.persistence = 0.1;
    this.restitution = 0.1;
    this.radius = 0.01;
    this.energy = null;
    this.zIndex = 1;
    this.tracer = null; // {color: 'r,g,b', width: px, length: seconds of travel}
    this.trail = null;  // particle trail type
    this._lastImpactTick = -1;
    this.animationState = 'fly';
    this.anim = 'ANIMATIONS.BULLETS.REGULARBULLET';
}
Bullet.prototype._simply = function () {
    return null;
};
Bullet.prototype.kill = function () {
    this.tail = null;
    SoundManager.worldPlay(this.weapon.sfx.hit, this.position);
    Entity.prototype.kill.call(this);
};
Bullet.prototype.draw = function () {
    var pos = this.renderPos();
    var px = pos.x * SCALE, py = pos.y * SCALE;
    if (this.tracer && this.physBody) {
        var vel = this.physBody.GetLinearVelocity();
        var speed = vel.Length() || 1;
        var len = Math.min(this.tracer.length, speed * 0.02) * SCALE;
        var ctx = drawingContext;
        var tx = px - vel.x / speed * len, ty = py - vel.y / speed * len;
        var grad = ctx.createLinearGradient(tx, ty, px, py);
        grad.addColorStop(0, 'rgba(' + this.tracer.color + ',0)');
        grad.addColorStop(1, 'rgba(' + this.tracer.color + ',0.9)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = grad;
        ctx.lineWidth = this.tracer.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.restore();
    }
    if (this.glow) renderEngine.drawGlow(px, py, this.glow.size, this.glow.color, this.glow.alpha);
    if (this.anim) Animation.animate(this.anim, this.animationState, px, py, this.angle);
};
Bullet.prototype.update = function () {
    Entity.prototype.update.call(this);
    if (!IS_SERVER && CFG.BULLET_TAIL)
        this.tail.push(this.position);
    if (this.physBody !== null) {
        var vel = this.physBody.GetLinearVelocity();
        this.physBody.SetAngle(Math.atan2(vel.y, vel.x));
        this.angle = this.physBody.GetAngle();
        this.position = this.physBody.GetPosition();
        if (!IS_SERVER && this.trail) particles.trail(this.trail, this.position.x, this.position.y, this.angle);
    }
};
Bullet.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);

    this.direction = new Vec2(
        this.target.x - this.weapon.player.position.x,
        this.target.y - this.weapon.player.position.y
    );
    this.weapon.player.physBody.SetAngle(Math.atan2(this.direction.y, this.direction.x));
    this.weapon.player.lookAngle = this.weapon.player.physBody.GetAngle();
    var pFix = this.weapon.player.getShootFix();
    this.direction.Subtract(pFix);
    this.position.Add(pFix);

    this.direction.Normalize();
    this.angle = Math.atan2(this.direction.y, this.direction.x);


    var entityDef = {
        position: this.position,
        angle: Math.atan2(this.direction.y, this.direction.x),
        radius: this.radius,
        allowSleep: false,
        friction: this.friction,
        categoryBits: CFG.COLLISION_GROUPS.BULLET,
        maskBits: CFG.COLLISION_GROUPS.ALL,
        userData: {
            id: this.id,
            elementType: CFG.COLLISION_GROUPS.BULLET
        },
        density: this.density,
        restitution: this.restitution,
        bullet: this.bullet,
        damping: this.damping * engine.delta
    };
    this.physBody = physicsEngine.addBody(entityDef);
    if (this.energy)
        for (var i = 0; i < this.energy.length; i++) {
            var e = new Energy(this);
            this.energy[i] = e;
            engine.addEntity(e);
        }
    this.direction.x += _superRandom(this.weapon.dispersion) - this.weapon.dispersion * 0.5;
    this.direction.y += _superRandom(this.weapon.dispersion) - this.weapon.dispersion * 0.5;
    this.direction.Normalize();
    this.direction.Multiply(this.speed * this.engine.delta);
    this.physBody.ApplyImpulse(this.direction, this.physBody.GetWorldCenter());
};
Bullet.prototype.colide = function (body) {
    if (!this.physBody) return;
    if (body === this.weapon.player) return;
    var dmgBuf = this.weapon.player.getBuff('DoubleDamageBuff');
    var damage = this.damage;
    if (dmgBuf != null)
        damage *= dmgBuf.multipler;
    if (body.health != null)
        this.engine.dealDamage(body.id, damage, this.weapon.player.id);
    this.damage *= this.persistence;
    if (body.sfx && body.sfx.hurt) SoundManager.worldPlay(body.sfx.hurt, body.position.Copy(), 1);
    if (!IS_SERVER && this._lastImpactTick !== this.engine.tick) {
        this._lastImpactTick = this.engine.tick;
        if (!body.isPlayer) particles.impact(this.position.x, this.position.y, this.angle, this.impactColor || [255, 220, 120]);
    }
    if (this._dieAtHit || body.isPlayer) this._markToKill = true;
};
