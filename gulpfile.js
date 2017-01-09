(function(){
    'use strict';
    var gulp = require('gulp'),
        connect = require('gulp-connect'),
        // open = require('gulp-open'),
        // jade = require('gulp-jade'),
        // less = require('gulp-less'),
        // rename = require('gulp-rename'),
        // header = require('gulp-header'),
        // path = require('path'),
        // uglify = require('gulp-uglify'),
        // sourcemaps = require('gulp-sourcemaps'),
        // minifyCSS = require('gulp-minify-css'),
        // tap = require('gulp-tap'),
        // concat = require('gulp-concat'),
        // jshint = require('gulp-jshint'),
        // stylish = require('jshint-stylish'),
        fs = require('fs'),
        paths = {
            root: './public/',
            build: {
                root: 'build/',
                styles: 'build/css/',
                scripts: 'build/js/'
            },
            lib: 'libraries/',
            sfx: 'sfx/',
            classes: 'classes'
        };
    // function addJSIndent (file, t) {
    //     var addIndent = '        ';
    //     var filename = file.path.split('src/js/')[1];
    //     if (filename === 'wrap-start.js' || filename === 'wrap-end.js') {
    //         addIndent = '';
    //     }
    //     var add4spaces = ('f7-intro.js f7-outro.js proto-device.js proto-plugins.js proto-support.js dom7-intro.js dom7-outro.js template7.js swiper.js').split(' ');
    //     if (add4spaces.indexOf(filename) >= 0) {
    //         addIndent = '    ';
    //     }
    //     var add8spaces = ('dom7-methods.js dom7-ajax.js dom7-utils.js').split(' ');
    //     if (add8spaces.indexOf(filename) >= 0) {
    //         addIndent = '        ';
    //     }
    //     if (addIndent !== '') {
    //         var fileLines = fs.readFileSync(file.path).toString().split('\n');
    //         var newFileContents = '';
    //         for (var i = 0; i < fileLines.length; i++) {
    //             newFileContents += addIndent + fileLines[i] + (i === fileLines.length ? '' : '\n');
    //         }
    //         file.contents = new Buffer(newFileContents);
    //     }
    // }




    /* =================================
    Watch
    ================================= */
    // gulp.task('watch', function () {
    //     // Demo App
    //   //  gulp.watch([paths.root + 'templates/*.jade', paths.source.root + 'my-app/*.*', paths.source.root + 'img/*.*'], ['demo-app']);
    // });

    gulp.task('connect', function () {
        return connect.server({
            root: [ paths.root ],
            livereload: true,
            port:'80'
        });
    });
    
    // gulp.task('open', function () {
    //     return gulp.src('./index.html').pipe(open({ uri: 'http://localhost'}));
    // });
    gulp.task('server', ['connect']);
})();