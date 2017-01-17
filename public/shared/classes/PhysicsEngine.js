function PhysicsEngine() {
    this.debugDraw = new DebugDraw;
    this.world = new World(new Vec2(0, 0), true);
    this.setup = function () {
        if (!IS_SERVER) {
            var context = canvas.getContext("2d");
            this.debugDraw.SetSprite(context);
            this.debugDraw.SetDrawScale(SCALE);
            this.debugDraw.SetFillAlpha(0.1);
            this.debugDraw.SetAlpha(0.5);

            this.debugDraw.SetFlags(DebugDraw.e_shapeBit | DebugDraw.e_jointBit);
            this.world.SetDebugDraw(this.debugDraw);
        }
    }
    this.addContactListener = function (callbacks, engine) {
        var listener = new Box2D.Dynamics.b2ContactListener;
        if (callbacks.BeginContact) listener.BeginContact = function (contact) {
            callbacks.BeginContact(contact.GetFixtureA().GetBody(), contact.GetFixtureB().GetBody());
        }
        if (callbacks.EndContact) listener.EndContact = function (contact) {
            callbacks.EndContact(contact.GetFixtureA().GetBody(), contact.GetFixtureB().GetBody());
        }
        if (callbacks.PreSolve) listener.PreSolve = function (contact) {
            callbacks.PreSolve(contact.GetFixtureA().GetBody(), contact.GetFixtureB().GetBody(), contact);
        }
        if (callbacks.PostSolve) listener.PostSolve = function (contact) {
            callbacks.PostSolve(contact.GetFixtureA().GetBody(), contact.GetFixtureB().GetBody(), engine);
        }
        this.world.SetContactListener(listener);
    }
    this.update = function () {
        this.world.Step(CFG.PHYSICS_HZ, 8, 3);
        this.world.ClearForces();
    }

    this.addBody = function (entityDef) {
        var bodyDef = new BodyDef();
        switch (entityDef.type) {
            case 'kinematic':
                bodyDef.type = Body.b2_kinematicBody;
                break;
            case 'static':
                bodyDef.type = Body.b2_staticBody;
                break;
            default:
                bodyDef.type = Body.b2_dynamicBody;
        }
        bodyDef.position = entityDef.position;
        bodyDef.allowSleep = entityDef.allowSleep;
        bodyDef.bullet = entityDef.bullet || false;
        bodyDef.angle = entityDef.angle || 0;
        bodyDef.linearDamping = entityDef.damping || 0;
        bodyDef.angularDamping = entityDef.angularDamping || entityDef.damping || 0;
        bodyDef.userData = entityDef.userData;
        var body = this.world.CreateBody(bodyDef);

        var fixtureDefinition = new FixtureDef();
        fixtureDefinition.density = entityDef.density || 1;
        fixtureDefinition.friction = entityDef.friction || 0.1;
        fixtureDefinition.restitution = entityDef.restitution || 0.0;

        fixtureDefinition.filter.categoryBits = entityDef.categoryBits || CFG.COLLISION_GROUPS.NOTHING;
        fixtureDefinition.filter.maskBits = entityDef.maskBits || CFG.COLLISION_GROUPS.ALL;

        if (entityDef.radius) {
            fixtureDefinition.shape = new CircleShape(entityDef.radius);
            body.CreateFixture(fixtureDefinition);
        } else if (entityDef.polygons) {
            var polygons = entityDef.polygons;
            var vecs = [];
            for (var j = 0; j < polygons.length; j++) {
                var pDef = polygons[j];
                if(pDef.filter) {
                    fixtureDefinition.filter.categoryBits = pDef.filter.categoryBits;
                    fixtureDefinition.filter.maskBits = pDef.filter.maskBits;
                } else {
                    fixtureDefinition.filter.categoryBits = entityDef.categoryBits || CFG.COLLISION_GROUPS.NOTHING;
                    fixtureDefinition.filter.maskBits = entityDef.maskBits || CFG.COLLISION_GROUPS.ALL;
                }
                for (var i = 0; i < pDef.polygon.length; i++) {
                    var vec = new Vec2();
                    vec.Set(pDef.polygon[i].x, pDef.polygon[i].y);
                    vecs[i] = vec;
                }
                fixtureDefinition.shape = new PolygonShape;
                fixtureDefinition.shape.SetAsArray(vecs, vecs.length);
                body.CreateFixture(fixtureDefinition);
            }
        }
        else {
            fixtureDefinition.shape = new PolygonShape;
            fixtureDefinition.shape.SetAsBox(entityDef.halfWidth, entityDef.halfHeight);
            body.CreateFixture(fixtureDefinition);
        }
        return body;
    }
    this.removeBody = function (obj) {
        this.world.DestroyBody(obj);
    }
}
var physicsEngine = new PhysicsEngine();