uniform vec2 u_world;
uniform vec2 u_fill_translate;

in vec2 a_pos;

out vec2 v_pos;
#ifdef GLOBE
out float v_depth;
#endif

#pragma mapbox: define highp vec4 outline_color
#pragma mapbox: define lowp float opacity

void main() {
    #pragma mapbox: initialize highp vec4 outline_color
    #pragma mapbox: initialize lowp float opacity

    gl_Position = projectTile(a_pos + u_fill_translate, a_pos);

    v_pos = (gl_Position.xy / gl_Position.w + 1.0) / 2.0 * u_world;
    #ifdef GLOBE
    v_depth = gl_Position.z / gl_Position.w;
    #endif
}
