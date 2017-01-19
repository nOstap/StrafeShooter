const SoundManager = {
    setup: function () {
        SoundManager.play(SFX.BACKGROUND, null, true);
        if (gui.game_settings.mute_sound)
            SFX.BACKGROUND.setVolume(0);
    },
    play: function (sfx, mode, volume) {
        if (IS_SERVER) return;
        if (typeof sfx === "string")
            sfx = eval(sfx);
        if (!sfx) return;
        if (mode == 1) {
            if (!sfx.isPlaying())
                sfx.play(null, null, volume);
        } else if (mode == 2) {
            if (!sfx.isPlaying())
                sfx.loop();
        } else
            sfx.play(null, null, volume);

    },
    worldPlay: function (sfx, pos, mode) {
        if (IS_SERVER) return;
        var volume = 1, lp = gameEngine.players[gameEngine.local_player];
        if (pos && lp) {
            var ppos = new Vec2(lp.position.x, lp.position.y);
            ppos.Subtract(pos);
            volume = 1 / (Math.abs(ppos.Length())/4);
            if (volume == Infinity || volume > 1) volume = 1;
        }
        this.play(sfx, mode, volume);
    },
    stop: function (sfxName) {
        if (IS_SERVER) return;
        var sfx = eval(sfxName);
        if (sfx.isPlaying()) sfx.stop();
    },
    update: function () {
        if (IS_SERVER) return;
        // masterVolume(gui.game_settings.mute_sound ? 0 : 1);

    }
};