import browserify from 'browserify';
import fs from 'fs';

export default function() {
    return new Promise((resolve, reject) => {
        browserify('./test/util/tape_config.js', { standalone: 'tape' })
            .transform("babelify", {presets: ["@babel/preset-env"], global: true})
            .bundle((err, buff) => {
                if (err) { throw err; }

                fs.writeFile('test/integration/dist/tape.js', buff, { encoding: 'utf8'}, (err) => {
                    if (err) { reject(err); }
                    resolve();
                });
            });
    });
}
