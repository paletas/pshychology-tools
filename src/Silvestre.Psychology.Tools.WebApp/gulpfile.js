/// <binding BeforeBuild='clean' AfterBuild='css' Clean='clean' ProjectOpened='watch' />
const gulp = require('gulp');

gulp.task('clean', () => {
    const clean = require('gulp-clean');

    return gulp.src('./wwwwroot/css/App.css', { read: false }).pipe(clean());
});

gulp.task('css', () => {
    const postcss = require('gulp-postcss');
    const purgecss = require('gulp-purgecss');

    return gulp.src('./Components/App.css')
        .pipe(postcss([
            require('precss'),
            require('tailwindcss'),
            require('autoprefixer')
        ]))
        .pipe(purgecss({
            content: ["../**/*.razor", "../**/*.html"],
            extractors: [
                {
                    extractor: content => content.match(/[A-z0-9-:\/]+/g),
                    extensions: ["html", "razor"]
                }
            ]
        }))
        .pipe(gulp.dest('./wwwroot/css/'));
});

gulp.task('watch', () => {
    return gulp.watch(["../**/*.css", "../**/*.razor"], { delay: 500 }, gulp.series(['clean', 'css']));
});