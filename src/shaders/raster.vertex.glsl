uniform vec2 u_tl_parent;
uniform float u_scale_parent;
uniform float u_buffer_scale;
uniform vec4 u_coords_top; // xy = left, zw = right
uniform vec4 u_coords_bottom;

in vec2 a_pos;

out vec2 v_pos0;
out vec2 v_pos1;

void main() {
    // Attribute a_pos always forms a (sometimes subdivided) quad in 0..EXTENT, but actual corner coords may be different.
    // Interpolate the actual desired coordinates to get the final position.
    vec2 fractionalPos = a_pos / 8192.0;
    vec2 position = mix(mix(u_coords_top.xy, u_coords_top.zw, fractionalPos.x), mix(u_coords_bottom.xy, u_coords_bottom.zw, fractionalPos.x), fractionalPos.y);
    gl_Position = projectTile(position, position);

    // We are using Int16 for texture position coordinates to give us enough precision for
    // fractional coordinates. We use 8192 to scale the texture coordinates in the buffer
    // as an arbitrarily high number to preserve adequate precision when rendering.
    // This is also the same value as the EXTENT we are using for our tile buffer pos coordinates,
    // so math for modifying either is consistent.
    v_pos0 = ((fractionalPos - 0.5) / u_buffer_scale) + 0.5;

     // When globe rendering is enabled, pole vertices need special handling to get nice texture coordinates.
    #ifdef GLOBE
    // North pole
    if (a_pos.y < -32767.5) {
        v_pos0.y = 0.0;
    }
    // South pole
    if (a_pos.y > 32766.5) {
        v_pos0.y = 1.0;
    }
    #endif

    v_pos1 = (v_pos0 * u_scale_parent) + u_tl_parent;
}
