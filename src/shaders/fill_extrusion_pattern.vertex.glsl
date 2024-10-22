uniform vec2 u_pixel_coord_upper;
uniform vec2 u_pixel_coord_lower;
uniform float u_height_factor;
uniform vec3 u_scale;
uniform float u_vertical_gradient;
uniform lowp float u_opacity;
uniform vec2 u_fill_translate;

uniform vec3 u_lightcolor;
uniform lowp vec3 u_lightpos;
uniform lowp vec3 u_lightpos_globe;
uniform lowp float u_lightintensity;

in vec2 a_pos;
in vec4 a_normal_ed;

#ifdef TERRAIN3D
    in vec2 a_centroid;
#endif

#ifdef GLOBE
    out vec3 v_sphere_pos;
#endif

out vec2 v_pos_a;
out vec2 v_pos_b;
out vec4 v_lighting;

#pragma mapbox: define lowp float base
#pragma mapbox: define lowp float height
#pragma mapbox: define lowp vec4 pattern_from
#pragma mapbox: define lowp vec4 pattern_to
#pragma mapbox: define lowp float pixel_ratio_from
#pragma mapbox: define lowp float pixel_ratio_to

void main() {
    #pragma mapbox: initialize lowp float base
    #pragma mapbox: initialize lowp float height
    #pragma mapbox: initialize mediump vec4 pattern_from
    #pragma mapbox: initialize mediump vec4 pattern_to
    #pragma mapbox: initialize lowp float pixel_ratio_from
    #pragma mapbox: initialize lowp float pixel_ratio_to

    vec2 pattern_tl_a = pattern_from.xy;
    vec2 pattern_br_a = pattern_from.zw;
    vec2 pattern_tl_b = pattern_to.xy;
    vec2 pattern_br_b = pattern_to.zw;

    float tileRatio = u_scale.x;
    float fromScale = u_scale.y;
    float toScale = u_scale.z;

    vec3 normal = a_normal_ed.xyz;
    float edgedistance = a_normal_ed.w;

    vec2 display_size_a = (pattern_br_a - pattern_tl_a) / pixel_ratio_from;
    vec2 display_size_b = (pattern_br_b - pattern_tl_b) / pixel_ratio_to;

    #ifdef TERRAIN3D
	    // Raise the "ceiling" of elements by the elevation of the centroid, in meters.
        float height_terrain3d_offset = get_elevation(a_centroid);
        // To avoid having buildings "hang above a slope", create a "basement"
        // by lowering the "floor" of ground-level (and below) elements.
        // This is in addition to the elevation of the centroid, in meters.
        float base_terrain3d_offset = height_terrain3d_offset - (base > 0.0 ? 0.0 : 10.0);
    #else
        float height_terrain3d_offset = 0.0;
        float base_terrain3d_offset = 0.0;
    #endif
    // Sub-terranian "floors and ceilings" are clamped to ground-level.
    // 3D Terrain offsets, if applicable, are applied on the result.
    base = max(0.0, base) + base_terrain3d_offset;
    height = max(0.0, height) + height_terrain3d_offset;

    float t = mod(normal.x, 2.0);
    float elevation = t > 0.0 ? height : base;
    vec2 posInTile = a_pos + u_fill_translate;

    #ifdef GLOBE
        vec3 spherePos = projectToSphere(posInTile, a_pos);
        vec3 elevatedPos = spherePos * (1.0 + elevation / GLOBE_RADIUS);
        v_sphere_pos = elevatedPos;
        gl_Position = interpolateProjectionFor3D(posInTile, spherePos, elevation);
    #else
        gl_Position = u_projection_matrix * vec4(posInTile, elevation, 1.0);
    #endif

    vec2 pos = normal.x == 1.0 && normal.y == 0.0 && normal.z == 16384.0
        ? a_pos // extrusion top - note the lack of u_fill_translate, because translation should not affect the pattern
        : vec2(edgedistance, elevation * u_height_factor); // extrusion side

    v_pos_a = get_pattern_pos(u_pixel_coord_upper, u_pixel_coord_lower, fromScale * display_size_a, tileRatio, pos);
    v_pos_b = get_pattern_pos(u_pixel_coord_upper, u_pixel_coord_lower, toScale * display_size_b, tileRatio, pos);

    v_lighting = vec4(0.0, 0.0, 0.0, 1.0);
    float directional = clamp(dot(normal / 16383.0, u_lightpos), 0.0, 1.0);
    directional = mix((1.0 - u_lightintensity), max((0.5 + u_lightintensity), 1.0), directional);

    if (normal.y != 0.0) {
        // This avoids another branching statement, but multiplies by a constant of 0.84 if no vertical gradient,
        // and otherwise calculates the gradient based on base + height
        directional *= (
            (1.0 - u_vertical_gradient) +
            (u_vertical_gradient * clamp((t + base) * pow(height / 150.0, 0.5), mix(0.7, 0.98, 1.0 - u_lightintensity), 1.0)));
    }

    v_lighting.rgb += clamp(directional * u_lightcolor, mix(vec3(0.0), vec3(0.3), 1.0 - u_lightcolor), vec3(1.0));
    v_lighting *= u_opacity;
}
