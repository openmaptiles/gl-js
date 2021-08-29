import './stub_loader';
import canvas from 'canvas';
import renderRunner from './integration/lib/render';
import suiteImplementation from './suite_implementation';
import ignores from './ignores.json';

const {registerFont} = canvas;

registerFont('./node_modules/npm-font-open-sans/fonts/Bold/OpenSans-Bold.ttf', {family: 'Open Sans', weight: 'bold'});

renderRunner('js', ignores, suiteImplementation);
