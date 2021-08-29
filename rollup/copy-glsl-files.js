import fs from 'fs';
import glob from 'glob';

let args = process.argv.slice(2);
let outputBaseDir = args[0];
let minify = args[1];

console.log(`Copying glsl files to ${outputBaseDir}, minify: ${minify}`);

/**
 * This script is intended to copy the glsl file to the compilation output folder,
 * change their extension to .js and export the shaders as strings in javascript.
 * It will also minify them a bit if needed and change the extension to .js
 */

glob("./src/**/*.glsl", null, (err, files) => {
    for (let file of files) {
        let code = fs.readFileSync(file, 'utf8');

        if (minify) {
            code = code.trim() // strip whitespace at the start/end
                .replace(/\s*\/\/[^\n]*\n/g, '\n') // strip double-slash comments
                .replace(/\n+/g, '\n') // collapse multi line breaks
                .replace(/\n\s+/g, '\n') // strip identation
                .replace(/\s?([+-\/*=,])\s?/g, '$1') // strip whitespace around operators
                .replace(/([;\(\),\{\}])\n(?=[^#])/g, '$1'); // strip more line breaks

        }
        let content = `export default ${JSON.stringify(code)};`
        let fileName = outputBaseDir + '/' + file.split('/').splice(-1) + ".js";
        fs.writeFileSync(fileName, content);
    }
    console.log(`Finished converting ${files.length} glsl files`);
});
