const SoundManager = {
    play: function (sfxName, mode, volume) {
        if (!IS_SERVER) {
            var sfx = eval(sfxName);
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
        var volume = 'fixed';
        this.play(sfx, mode, volume);
        // if (position !== 'undefined') {
        //     volume = new Vec2(player.pos.x - mouseX / SCALE, player.pos.y - mouseY / SCALE);
        //     volume = (volume.Length() * 100) / 10;
        // }
        // sfx.setVolume(volume);
    },
    stop: function (sfxName) {
        if (!IS_SERVER) {
            var sfx = eval(sfxName);
            if (sfx.isPlaying()) sfx.stop();
        }
    },
    update: function () {
        if (!IS_SERVER) {
            masterVolume(gui.game_settings.mute_sound ? 0 : 1);
        }
    }
};