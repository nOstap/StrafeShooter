const SoundManager = {
    setup: function () {
        SoundManager.play(SFX.BACKGROUND, null, true);
        if(gui.game_settings.mute_sound)
            SFX.BACKGROUND.setVolume(0);
    },
    play: function (sfx, mode, volume) {
        if (!IS_SERVER) {
            if(typeof sfx === "string")
            sfx = eval(sfx);
            if (!sfx) return;
            if (mode == 1) {
                if (!sfx.isPlaying())
                    sfx.play();
            } else if (mode == 2) {
                if (!sfx.isPlaying())
                    sfx.loop();
            } else
                sfx.play();
        }
    },
    worldPlay: function (sfx, pos, mode) {
        if (!IS_SERVER) {
            sfx = eval(sfx);
            var volume = 1;
            if (pos !== 'undefined') {
                volume = new Vec2(CAMERA_POS.x - mouseX / SCALE, CAMERA_POS.x - mouseY / SCALE);
                volume = (volume.Length() * 100) / 10;
            }
            if(sfx)
            sfx.volume = volume;
            this.play(sfx, mode, volume);
        }
    },
    stop: function (sfxName) {
        if (!IS_SERVER) {
            var sfx = eval(sfxName);
            if (sfx.isPlaying()) sfx.stop();
        }
    },
    update: function () {
        if (!IS_SERVER) {
            // masterVolume(gui.game_settings.mute_sound ? 0 : 1);
        }
    }
};