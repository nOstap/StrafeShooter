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
    SoundManager.play(this.sfx.start);
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
            SoundManager.worldPlay(this.sfx.fire, this.position, this.sfxMode);
            this.ammunition--;
            for (var i = 0; i < this.bullets; i++) {
                var bullet = new global[this.ammoType](this);
                if (this.player.engine.entities.indexOf(this.last_bullet) == -1) this.last_bullet = bullet;
                bullet.frontBullet = this.last_bullet;
                this.last_bullet = bullet;
                this.player.engine.addEntity(bullet);
            }
        } else {
            SoundManager.stop(this.sfx.fire);
            SoundManager.worldPlay(this.sfx.die);
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
    this.target = new Vec2(weapon.player.input.pointer.x, weapon.player.input.pointer.y);
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
    Animation.animate(this.anim, this.animationState, this.position.x * SCALE, this.position.y * SCALE, this.angle);
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
    }
};
Bullet.prototype.setup = function (engine) {
    Entity.prototype.setup.call(this, engine);

    this.direction = new Vec2(
        this.target.x - this.weapon.player.getFixedPos().x,
        this.target.y - this.weapon.player.getFixedPos().y
    );
    this.weapon.player.physBody.SetAngle(Math.atan2(this.direction.y, this.direction.x));
    this.weapon.player.lookAngle = this.weapon.player.physBody.GetAngle();
    this.direction.Set(
        this.target.x - this.weapon.player.getFixedPos().x,
        this.target.y - this.weapon.player.getFixedPos().y
    );
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
    var dmgBuf = this.weapon.player.getBuff('damage');
    var damage = this.damage;
    if (dmgBuf != null)
        damage *= dmgBuf.multipler;
    if (body.health != null)
        this.engine.dealDamage(body.id, damage);
    this.damage *= this.persistence;
    SoundManager.worldPlay(body.sfx.hurt, body.position.Copy(), 1);

    if (body.isPlayer && body.health - damage <= 0) {
        this.weapon.player.killsPerMatch++;
        body.deathsPerMatch++;
    }
    if (this._dieAtHit || body.isPlayer) this._markToKill = true;
};
