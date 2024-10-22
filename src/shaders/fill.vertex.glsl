uniform vec2 u_fill_translate;

in vec2 a_pos;

#pragma mapbox: define highp vec4 color
#pragma mapbox: define lowp float opacity

void main() {
    #pragma mapbox: initialize highp vec4 color
    #pragma mapbox: initialize lowp float opacity

    gl_Position = projectTile(a_pos + u_fill_translate, a_pos);
}
