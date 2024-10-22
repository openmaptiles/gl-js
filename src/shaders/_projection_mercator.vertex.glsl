float projectLineThickness(float tileY) {
    return 1.0;
}

float projectCircleRadius(float tileY) {
    return 1.0;
}

// Projects a point in tile-local coordinates (usually 0..EXTENT) to screen.
vec4 projectTile(vec2 p) {
    vec4 result = u_projection_matrix * vec4(p, 0.0, 1.0);
    return result;
}

// Projects a point in tile-local coordinates (usually 0..EXTENT) to screen, and handle special pole or planet center vertices.
vec4 projectTile(vec2 p, vec2 rawPos) {
    // Kill pole vertices and triangles by placing the pole vertex so far in Z that
    // the clipping hardware kills the entire triangle.
    vec4 result = u_projection_matrix * vec4(p, 0.0, 1.0);
    if (rawPos.y < -32767.5 || rawPos.y > 32766.5) {
        result.z = -10000000.0;
    }
    return result;
}

vec4 projectTileWithElevation(vec2 posInTile, float elevation) {
    // This function is only used in symbol vertex shaders and symbols never use pole vertices,
    // so no need to detect them.
    return u_projection_matrix * vec4(posInTile, elevation, 1.0);
}

vec4 projectTileFor3D(vec2 posInTile, float elevation) {
    // In globe the `projectTileWithElevation` and `projectTileFor3D` functions differ
    // on what Z value they output. There is no need for this in mercator though,
    // thus here they are the same function.
    return projectTileWithElevation(posInTile, elevation);
}
