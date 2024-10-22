uniform vec2 u_pixel_coord_upper;
uniform vec2 u_pixel_coord_lower;
uniform vec3 u_scale;
uniform vec2 u_fill_translate;

in vec2 a_pos;

out vec2 v_pos_a;
out vec2 v_pos_b;

#pragma mapbox: define lowp float opacity
#pragma mapbox: define lowp vec4 pattern_from
#pragma mapbox: define lowp vec4 pattern_to
#pragma mapbox: define lowp float pixel_ratio_from
#pragma mapbox: define lowp float pixel_ratio_to

void main() {
    #pragma mapbox: initialize lowp float opacity
    #pragma mapbox: initialize mediump vec4 pattern_from
    #pragma mapbox: initialize mediump vec4 pattern_to
    #pragma mapbox: initialize lowp float pixel_ratio_from
    #pragma mapbox: initialize lowp float pixel_ratio_to

    vec2 pattern_tl_a = pattern_from.xy;
    vec2 pattern_br_a = pattern_from.zw;
    vec2 pattern_tl_b = pattern_to.xy;
    vec2 pattern_br_b = pattern_to.zw;

    float tileZoomRatio = u_scale.x;
    float fromScale = u_scale.y;
    float toScale = u_scale.z;

    vec2 display_size_a = (pattern_br_a - pattern_tl_a) / pixel_ratio_from;
    vec2 display_size_b = (pattern_br_b - pattern_tl_b) / pixel_ratio_to;

    gl_Position = projectTile(a_pos + u_fill_translate, a_pos);

    v_pos_a = get_pattern_pos(u_pixel_coord_upper, u_pixel_coord_lower, fromScale * display_size_a, tileZoomRatio, a_pos);
    v_pos_b = get_pattern_pos(u_pixel_coord_upper, u_pixel_coord_lower, toScale * display_size_b, tileZoomRatio, a_pos);
}
