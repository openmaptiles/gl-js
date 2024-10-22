#define GLOBE_RADIUS 6371008.8

uniform highp vec4 u_projection_tile_mercator_coords;
uniform highp vec4 u_projection_clipping_plane;
uniform highp float u_projection_transition;
uniform mat4 u_projection_fallback_matrix;

vec3 globeRotateVector(vec3 vec, vec2 angles) {
    vec3 axisRight = vec3(vec.z, 0.0, -vec.x); // Equivalent to cross(vec3(0.0, 1.0, 0.0), vec)
    vec3 axisUp = cross(axisRight, vec);
    axisRight = normalize(axisRight);
    axisUp = normalize(axisUp);
    vec2 t = tan(angles);
    return normalize(vec + axisRight * t.x + axisUp * t.y);
}

mat3 globeGetRotationMatrix(vec3 spherePos) {
    vec3 axisRight = vec3(spherePos.z, 0.0, -spherePos.x); // Equivalent to cross(vec3(0.0, 1.0, 0.0), vec)
    vec3 axisDown = cross(axisRight, spherePos);
    axisRight = normalize(axisRight);
    axisDown = normalize(axisDown);
    return mat3(
        axisRight,
        axisDown,
        spherePos
    );
}

// Consider this private, do not use in other shaders directly!
// Use `projectLineThickness` or `projectCircleRadius` instead.
float circumferenceRatioAtTileY(float tileY) {
    float mercator_pos_y = u_projection_tile_mercator_coords.y + u_projection_tile_mercator_coords.w * tileY;
    float spherical_y = 2.0 * atan(exp(PI - (mercator_pos_y * PI * 2.0))) - PI * 0.5;
    return cos(spherical_y);
}

float projectLineThickness(float tileY) {
    float thickness = 1.0 / circumferenceRatioAtTileY(tileY); 
    if (u_projection_transition < 0.999) {
        return mix(1.0, thickness, u_projection_transition);
    } else {
        return thickness;
    }
}

// get position inside the tile in range 0..8192 and project it onto the surface of a unit sphere
vec3 projectToSphere(vec2 posInTile, vec2 rawPos) {
    // Compute position in range 0..1 of the base tile of web mercator
    vec2 mercator_pos = u_projection_tile_mercator_coords.xy + u_projection_tile_mercator_coords.zw * posInTile;

    // Now compute angular coordinates on the surface of a perfect sphere
    vec2 spherical;
    spherical.x = mercator_pos.x * PI * 2.0 + PI;
    spherical.y = 2.0 * atan(exp(PI - (mercator_pos.y * PI * 2.0))) - PI * 0.5;

    float len = cos(spherical.y);
    vec3 pos = vec3(
        sin(spherical.x) * len,
        sin(spherical.y),
        cos(spherical.x) * len
    );

    // North pole
    if (rawPos.y < -32767.5) {
        pos = vec3(0.0, 1.0, 0.0);
    }
    // South pole
    if (rawPos.y > 32766.5) {
        pos = vec3(0.0, -1.0, 0.0);
    }

    return pos;
}

vec3 projectToSphere(vec2 posInTile) {
    return projectToSphere(posInTile, vec2(0.0, 0.0));
}

float globeComputeClippingZ(vec3 spherePos) {
    return (1.0 - (dot(spherePos, u_projection_clipping_plane.xyz) + u_projection_clipping_plane.w));
}

vec4 interpolateProjection(vec2 posInTile, vec3 spherePos, float elevation) {
    vec3 elevatedPos = spherePos * (1.0 + elevation / GLOBE_RADIUS);
    vec4 globePosition = u_projection_matrix * vec4(elevatedPos, 1.0);
    // Z is overwritten by glDepthRange anyway - use a custom z value to clip geometry on the invisible side of the sphere.
    globePosition.z = globeComputeClippingZ(elevatedPos) * globePosition.w;

    if (u_projection_transition < 0.999) {
        vec4 flatPosition = u_projection_fallback_matrix * vec4(posInTile, elevation, 1.0);
        // Only interpolate to globe's Z for the last 50% of the animation.
        // (globe Z hides anything on the backfacing side of the planet)
        const float z_globeness_threshold = 0.2;
        vec4 result = globePosition;
        result.z = mix(0.0, globePosition.z, clamp((u_projection_transition - z_globeness_threshold) / (1.0 - z_globeness_threshold), 0.0, 1.0));
        result.xyw = mix(flatPosition.xyw, globePosition.xyw, u_projection_transition);
        // Gradually hide poles during transition
        if ((posInTile.y < -32767.5) || (posInTile.y > 32766.5)) {
            result = globePosition;
            const float poles_hidden_anim_percentage = 0.02; // Only draw poles in the last 2% of the animation.
            result.z = mix(globePosition.z, 100.0, pow(max((1.0 - u_projection_transition) / poles_hidden_anim_percentage, 0.0), 8.0));
        }
        return result;
    }

    return globePosition;
}

// Unlike interpolateProjection, this variant of the function preserves the Z value of the final vector.
vec4 interpolateProjectionFor3D(vec2 posInTile, vec3 spherePos, float elevation) {
    vec3 elevatedPos = spherePos * (1.0 + elevation / GLOBE_RADIUS);
    vec4 globePosition = u_projection_matrix * vec4(elevatedPos, 1.0);
    vec4 fallbackPosition = u_projection_fallback_matrix * vec4(posInTile, elevation, 1.0);
    return mix(fallbackPosition, globePosition, u_projection_transition);
}

// Computes screenspace projection
// and **replaces Z** with a custom value that clips geometry
// on the backfacing side of the planet.
vec4 projectTile(vec2 posInTile) {
    return interpolateProjection(posInTile, projectToSphere(posInTile), 0.0);
}

// A variant that supports special pole and planet center vertices.
vec4 projectTile(vec2 posInTile, vec2 rawPos) {
    return interpolateProjection(posInTile, projectToSphere(posInTile, rawPos), 0.0);
}

// Uses elevation to compute final screenspace projection
// and **replaces Z** with a custom value that clips geometry
// on the backfacing side of the planet.
vec4 projectTileWithElevation(vec2 posInTile, float elevation) {
    return interpolateProjection(posInTile, projectToSphere(posInTile), elevation);
}

// Projects the tile coordinates+elevation while **preserving Z** value from multiplication with the projection matrix.
vec4 projectTileFor3D(vec2 posInTile, float elevation) {
    vec3 spherePos = projectToSphere(posInTile);
    return interpolateProjectionFor3D(posInTile, spherePos, elevation);
}
