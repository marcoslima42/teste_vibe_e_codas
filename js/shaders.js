/**
 * WebGL2 (#version 300 es) Shaders for the Programming Contest Arena
 * Works directly via file:// or http:// without bundler/CORS restrictions.
 */
(function (global) {
  const SimuMaratona = (global.SimuMaratona = global.SimuMaratona || {});

  const SHADOW_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 3) in vec4 a_modelCol0;
layout(location = 4) in vec4 a_modelCol1;
layout(location = 5) in vec4 a_modelCol2;
layout(location = 6) in vec4 a_modelCol3;

uniform mat4 u_lightViewProj;

void main() {
  mat4 model = mat4(a_modelCol0, a_modelCol1, a_modelCol2, a_modelCol3);
  gl_Position = u_lightViewProj * model * vec4(a_position, 1.0);
}
`;

  const SHADOW_FS = `#version 300 es
precision highp float;
void main() {
  // Depth is written automatically
}
`;

  const SCENE_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_modelCol0;
layout(location = 4) in vec4 a_modelCol1;
layout(location = 5) in vec4 a_modelCol2;
layout(location = 6) in vec4 a_modelCol3;
layout(location = 7) in vec4 a_colorMat;     // rgb = baseColor, a = matType
layout(location = 8) in vec4 a_emissiveExtra; // rgb = emissive, a = extraParam

uniform mat4 u_viewProj;
uniform mat4 u_lightViewProj;

out vec3 v_worldPos;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_colorMat;
out vec4 v_emissiveExtra;
out vec4 v_lightSpacePos;

void main() {
  mat4 model = mat4(a_modelCol0, a_modelCol1, a_modelCol2, a_modelCol3);
  vec4 worldPos = model * vec4(a_position, 1.0);
  v_worldPos = worldPos.xyz;

  mat3 normalMat = mat3(model);
  v_normal = normalize(normalMat * a_normal);
  v_uv = a_uv;
  v_colorMat = a_colorMat;
  v_emissiveExtra = a_emissiveExtra;
  v_lightSpacePos = u_lightViewProj * worldPos;

  gl_Position = u_viewProj * worldPos;
}
`;

  const SCENE_FS = `#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_colorMat;
in vec4 v_emissiveExtra;
in vec4 v_lightSpacePos;

uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform float u_time;
uniform sampler2D u_shadowMap;
uniform vec3 u_fogColor;
uniform vec3 u_accentColor;
uniform vec4 u_pointLights[6];
uniform vec3 u_pointColors[6];

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float computeShadow(vec4 lightSpacePos, vec3 N, vec3 L) {
  vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
  projCoords = projCoords * 0.5 + 0.5;
  if (projCoords.z > 0.999 || projCoords.x < 0.0 || projCoords.x > 1.0 || projCoords.y < 0.0 || projCoords.y > 1.0) {
    return 1.0;
  }
  float bias = max(0.0022 * (1.0 - dot(N, L)), 0.0007);
  float shadow = 0.0;
  vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0));
  for (int x = -1; x <= 1; ++x) {
    for (int y = -1; y <= 1; ++y) {
      float pcfDepth = texture(u_shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
      shadow += (projCoords.z - bias > pcfDepth) ? 0.25 : 1.0;
    }
  }
  return shadow / 9.0;
}

vec3 renderScreenSurface(vec2 uv, vec3 baseColor, vec3 emissive, float extra) {
  if (extra >= 50.0) {
    vec2 p = uv;
    vec3 bg = vec3(0.025, 0.045, 0.10);
    float border = step(p.x, 0.012) + step(0.988, p.x) + step(p.y, 0.035) + step(0.965, p.y);
    if (border > 0.0) return u_accentColor * 1.15;

    if (p.y > 0.82) {
      float pulse = 0.88 + 0.12 * sin(u_time * 3.0);
      vec3 hdr = mix(vec3(0.04, 0.14, 0.32), vec3(0.06, 0.28, 0.54), p.x) * pulse;
      if (p.x > 0.05 && p.x < 0.42 && p.y > 0.86 && p.y < 0.93) {
        float seg = step(0.25, fract(p.x * 28.0));
        hdr += vec3(0.35, 0.82, 1.0) * seg * 0.75;
      }
      if (p.x > 0.78 && p.x < 0.95 && p.y > 0.85 && p.y < 0.94) {
        float dig = step(0.3, fract(p.x * 36.0 + floor(u_time) * 0.1));
        hdr += vec3(0.15, 0.95, 0.60) * dig * 0.85;
      }
      return hdr;
    }

    float rowCoord = (0.80 - p.y) / 0.74 * 8.0;
    float rowIdx = floor(rowCoord);
    float rowFrac = fract(rowCoord);
    if (rowIdx >= 0.0 && rowIdx < 8.0 && rowFrac > 0.12 && rowFrac < 0.88) {
      vec3 rowBg = (mod(rowIdx, 2.0) < 0.5) ? vec3(0.04, 0.07, 0.15) : vec3(0.03, 0.05, 0.11);
      if (rowIdx < 1.0) rowBg += vec3(0.14, 0.10, 0.02);
      else if (rowIdx < 2.0) rowBg += vec3(0.06, 0.08, 0.12);
      else if (rowIdx < 3.0) rowBg += vec3(0.10, 0.05, 0.02);

      if (p.x > 0.03 && p.x < 0.08) {
        return (rowIdx < 3.0) ? vec3(0.98, 0.75, 0.15) : vec3(0.25, 0.65, 0.95);
      }
      if (p.x > 0.10 && p.x < 0.28 && rowFrac > 0.3 && rowFrac < 0.7) {
        float nameLen = 0.10 + 0.15 * hash21(vec2(rowIdx, 1.0));
        if (p.x < 0.10 + nameLen) return vec3(0.65, 0.80, 0.95);
      }
      if (p.x >= 0.32 && p.x <= 0.94) {
        float colCoord = (p.x - 0.32) / 0.62 * 10.0;
        float colIdx = floor(colCoord);
        vec2 cellUV = vec2(fract(colCoord) - 0.5, rowFrac - 0.5);
        float d = length(cellUV * vec2(1.2, 1.0));
        float solveThreshold = 0.88 - rowIdx * 0.08 + 0.08 * sin(u_time * 0.4 + rowIdx + colIdx);
        float h = hash21(vec2(rowIdx * 3.1, colIdx * 7.3));
        if (h < solveThreshold && d < 0.33) {
          vec3 pCol = 0.52 + 0.48 * cos(6.28318 * (colIdx * 0.11 + vec3(0.0, 0.33, 0.67)));
          float flash = 0.95 + 0.25 * max(0.0, sin(u_time * 5.0 - rowIdx * 1.7 - colIdx * 2.3));
          return pCol * 1.15 * flash;
        }
      }
      return rowBg;
    }
    return bg;
  }

  vec2 p = uv;
  float seed = extra;
  float celebrate = clamp(emissive.r, 0.0, 1.0);

  vec3 col = vec3(0.03, 0.055, 0.12);

  if (p.x < 0.18) {
    col = vec3(0.02, 0.038, 0.08);
    float lineY = floor(p.y * 16.0);
    if (fract(p.y * 16.0) > 0.35 && p.x > 0.03 && p.x < 0.06 + 0.09 * hash21(vec2(lineY, seed))) {
      col = vec3(0.22, 0.42, 0.65);
    }
  } else {
    float scroll = p.y * 18.0 + u_time * (1.8 + mod(seed, 1.7));
    float row = floor(scroll);
    float rowY = fract(scroll);
    float indent = 0.22 + 0.05 * floor(mod(hash21(vec2(row, seed)) * 4.0, 3.0));
    float lineLen = indent + 0.15 + 0.48 * hash21(vec2(row + 13.0, seed));

    if (rowY > 0.25 && rowY < 0.78 && p.x > indent && p.x < min(0.94, lineLen)) {
      float token = floor(p.x * 24.0);
      float th = hash21(vec2(row, token + seed));
      if (th < 0.28) col = vec3(0.20, 0.78, 1.0);
      else if (th < 0.52) col = vec3(1.0, 0.48, 0.18);
      else if (th < 0.75) col = vec3(0.45, 0.92, 0.38);
      else col = vec3(0.72, 0.82, 0.95);
    }

    if (abs(p.y - 0.35) < 0.03 && abs(p.x - 0.55) < 0.012 && fract(u_time * 2.0 + seed) > 0.4) {
      col = vec3(0.1, 0.95, 0.85);
    }
  }

  if (celebrate > 0.05) {
    vec3 acGreen = vec3(0.04, 0.92, 0.46);
    float banner = smoothstep(0.28, 0.31, p.y) * (1.0 - smoothstep(0.69, 0.72, p.y));
    float pulse = 0.88 + 0.12 * sin(u_time * 12.0 + seed);
    vec3 bannerCol = acGreen * (1.15 * pulse);
    if (p.y > 0.42 && p.y < 0.58 && p.x > 0.34 && p.x < 0.66) {
      float charBlock = step(0.25, fract(p.x * 14.0));
      bannerCol = mix(bannerCol, vec3(1.1, 1.2, 1.15), charBlock * 0.8);
    }
    col = mix(col, bannerCol, celebrate * (0.35 + 0.65 * banner));
    float edge = step(p.x, 0.03) + step(0.97, p.x) + step(p.y, 0.05) + step(0.95, p.y);
    col += acGreen * clamp(edge, 0.0, 1.0) * celebrate * 1.1;
  } else {
    col += vec3(0.03, 0.14, 0.28) * 0.35;
  }

  return col * 1.15;
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_worldPos);
  vec3 L = normalize(u_lightDir);
  vec3 H = normalize(L + V);

  vec3 baseColor = v_colorMat.rgb;
  float matType = v_colorMat.a;
  vec3 emissive = v_emissiveExtra.rgb;
  float extra = v_emissiveExtra.a;

  if (matType >= 3.5) {
    vec3 screenCol = renderScreenSurface(v_uv, baseColor, emissive, extra);
    float dist = length(u_cameraPos - v_worldPos);
    float fog = smoothstep(26.0, 62.0, dist);
    outColor = vec4(mix(screenCol, u_fogColor, fog * 0.6), 1.0);
    return;
  }

  if (matType >= 2.5) {
    float shadow = computeShadow(v_lightSpacePos, N, L);
    vec2 wp = v_worldPos.xz;

    vec2 tileUV = fract(wp * 0.5);
    float gridLine = (1.0 - smoothstep(0.0, 0.025, tileUV.x)) + (1.0 - smoothstep(0.0, 0.025, tileUV.y));
    gridLine = clamp(gridLine, 0.0, 1.0);

    vec3 floorCol = baseColor + vec3(0.012, 0.022, 0.045) * gridLine;

    float centralBorder = abs(abs(wp.x) - 0.88);
    float sideBorder = abs(abs(wp.x) - 4.75);
    float stripX = (1.0 - smoothstep(0.015, 0.075, min(centralBorder, sideBorder))) * smoothstep(18.0, 8.0, abs(wp.y));
    float stripFront = (1.0 - smoothstep(0.015, 0.085, abs(abs(wp.y - 4.55) - 0.68))) * smoothstep(14.0, 8.0, abs(wp.x));
    float stripPulse = 0.78 + 0.22 * sin(u_time * 2.2 - wp.y * 0.4);
    vec3 ledStrip = u_accentColor * clamp(stripX + stripFront, 0.0, 1.0) * 0.72 * stripPulse;

    float NdotL = max(dot(N, L), 0.0);
    vec3 lit = floorCol * (0.32 + 0.42 * NdotL * shadow) + ledStrip;

    for (int i = 0; i < 6; ++i) {
      vec3 lp = u_pointLights[i].xyz;
      float intensity = u_pointLights[i].w;
      if (intensity > 0.01) {
        vec3 toLight = lp - v_worldPos;
        float d2 = dot(toLight, toLight);
        float atten = intensity / (1.0 + 0.16 * d2);
        vec3 pL = normalize(toLight);
        vec3 pH = normalize(pL + V);
        float pSpec = pow(max(dot(N, pH), 0.0), 42.0);
        lit += u_pointColors[i] * atten * (0.18 + 0.75 * pSpec);
      }
    }

    float dist = length(u_cameraPos - v_worldPos);
    float fog = smoothstep(18.0, 46.0, dist);
    outColor = vec4(mix(lit, u_fogColor, fog), 1.0);
    return;
  }

  float shadow = computeShadow(v_lightSpacePos, N, L);

  if (matType >= 1.5) {
    float NdotL = dot(N, L);
    float wrapDiff = max(0.0, (NdotL + 0.45) / 1.45);
    float subSurface = pow(max(0.0, dot(-N, L) + 0.35), 2.0) * 0.35;

    float spec1 = pow(max(dot(N, H), 0.0), 88.0) * 0.92;
    float spec2 = pow(max(dot(N, H), 0.0), 18.0) * 0.18;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);

    float knotMask = smoothstep(0.07, 0.13, v_uv.y);
    float verticalShade = 0.72 + 0.28 * smoothstep(0.0, 0.75, v_uv.y);
    vec3 latexColor = baseColor * (0.62 + 0.38 * knotMask) * verticalShade;

    float band = smoothstep(0.56, 0.59, v_uv.y) * (1.0 - smoothstep(0.67, 0.70, v_uv.y));
    float badgeAngle = smoothstep(0.40, 0.43, fract(v_uv.x + 0.25)) * (1.0 - smoothstep(0.57, 0.60, fract(v_uv.x + 0.25)));
    latexColor = mix(latexColor, mix(latexColor, vec3(1.0), 0.75), band * badgeAngle * 0.55);

    vec3 ambient = latexColor * 0.24;
    vec3 diffuse = latexColor * (wrapDiff * (0.52 + 0.48 * shadow) + subSurface);
    vec3 rim = mix(latexColor, vec3(1.0), 0.32) * fresnel * 0.52;
    vec3 spec = vec3(1.0, 0.99, 0.97) * (spec1 + spec2);

    vec3 color = ambient + diffuse + rim + spec + emissive * 0.25;

    float dist = length(u_cameraPos - v_worldPos);
    float fog = smoothstep(26.0, 58.0, dist);
    outColor = vec4(mix(color, u_fogColor, fog * 0.75), 1.0);
    return;
  }

  float isMetallic = smoothstep(0.4, 0.9, matType);
  float NdotL = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 hemiLight = mix(vec3(0.14, 0.17, 0.28), vec3(0.38, 0.44, 0.62), hemi);

  float shininess = mix(24.0, 72.0, isMetallic);
  float specStrength = mix(0.18, 0.65, isMetallic);
  float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.25;

  vec3 litColor = baseColor * (hemiLight + vec3(0.92, 0.92, 0.88) * NdotL * shadow)
                + vec3(0.9, 0.95, 1.0) * spec * shadow
                + u_accentColor * fresnel
                + emissive;

  for (int i = 0; i < 6; ++i) {
    vec3 lp = u_pointLights[i].xyz;
    float intensity = u_pointLights[i].w;
    if (intensity > 0.01) {
      vec3 toLight = lp - v_worldPos;
      float d2 = dot(toLight, toLight);
      float atten = intensity / (1.0 + 0.25 * d2);
      vec3 pL = normalize(toLight);
      float pDiff = max(dot(N, pL), 0.0);
      litColor += baseColor * u_pointColors[i] * pDiff * atten * 0.75;
    }
  }

  float dist = length(u_cameraPos - v_worldPos);
  float fog = smoothstep(22.0, 54.0, dist);
  outColor = vec4(mix(litColor, u_fogColor, fog), 1.0);
}
`;

  const STRING_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_viewProj;

out vec4 v_color;

void main() {
  v_color = a_color;
  gl_Position = u_viewProj * vec4(a_position, 1.0);
}
`;

  const STRING_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

  const PARTICLE_VS = `#version 300 es
layout(location = 0) in vec3 a_quadPos;
layout(location = 1) in vec3 a_instancePos;
layout(location = 2) in vec4 a_instanceColor;
layout(location = 3) in vec3 a_instanceParams;

uniform mat4 u_viewProj;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

out vec4 v_color;
out vec2 v_uv;
out float v_type;

void main() {
  float size = a_instanceParams.x;
  float angle = a_instanceParams.y;
  v_type = a_instanceParams.z;
  v_color = a_instanceColor;
  v_uv = a_quadPos.xy + 0.5;

  float c = cos(angle);
  float s = sin(angle);
  vec2 rotXY = vec2(
    a_quadPos.x * c - a_quadPos.y * s,
    a_quadPos.x * s + a_quadPos.y * c
  );

  vec3 worldPos = a_instancePos
    + u_cameraRight * (rotXY.x * size)
    + u_cameraUp * (rotXY.y * size * (v_type < 0.5 ? (0.45 + 0.55 * abs(cos(angle * 1.7))) : 1.0));

  gl_Position = u_viewProj * vec4(worldPos, 1.0);
}
`;

  const PARTICLE_FS = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;
in float v_type;

out vec4 outColor;

void main() {
  if (v_type > 0.5) {
    float d = length(v_uv - 0.5) * 2.0;
    float alpha = pow(max(0.0, 1.0 - d), 2.2);
    outColor = vec4(v_color.rgb, v_color.a * alpha);
  } else {
    outColor = v_color;
  }
}
`;

  const VOLUMETRIC_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_modelCol0;
layout(location = 4) in vec4 a_modelCol1;
layout(location = 5) in vec4 a_modelCol2;
layout(location = 6) in vec4 a_modelCol3;
layout(location = 7) in vec4 a_colorMat;

uniform mat4 u_viewProj;

out vec2 v_uv;
out vec3 v_normal;
out vec3 v_worldPos;
out vec4 v_color;

void main() {
  mat4 model = mat4(a_modelCol0, a_modelCol1, a_modelCol2, a_modelCol3);
  vec4 wp = model * vec4(a_position, 1.0);
  v_worldPos = wp.xyz;
  v_normal = normalize(mat3(model) * a_normal);
  v_uv = a_uv;
  v_color = a_colorMat;
  gl_Position = u_viewProj * wp;
}
`;

  const VOLUMETRIC_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in vec3 v_worldPos;
in vec4 v_color;

uniform vec3 u_cameraPos;

out vec4 outColor;

void main() {
  vec3 V = normalize(u_cameraPos - v_worldPos);
  vec3 N = normalize(v_normal);
  float edgeFade = pow(abs(dot(N, V)), 2.0);
  float verticalFade = smoothstep(0.25, 0.85, v_uv.y) * v_uv.y;
  float alpha = v_color.a * edgeFade * verticalFade;
  outColor = vec4(v_color.rgb * alpha, alpha);
}
`;

  const POST_VS = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 2) in vec2 a_uv;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position.xy * 2.0, 0.0, 1.0);
}
`;

  const BLOOM_EXTRACT_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_sceneTex;

out vec4 outColor;

void main() {
  vec3 col = texture(u_sceneTex, v_uv).rgb;
  float brightness = max(col.r, max(col.g, col.b));
  vec3 bright = col * smoothstep(0.72, 1.25, brightness);
  outColor = vec4(bright, 1.0);
}
`;

  const BLOOM_BLUR_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_direction;

out vec4 outColor;

void main() {
  vec2 texel = u_direction / vec2(textureSize(u_tex, 0));
  vec3 result = texture(u_tex, v_uv).rgb * 0.227027;
  result += texture(u_tex, v_uv + texel * 1.384615).rgb * 0.316216;
  result += texture(u_tex, v_uv - texel * 1.384615).rgb * 0.316216;
  result += texture(u_tex, v_uv + texel * 3.230769).rgb * 0.070270;
  result += texture(u_tex, v_uv - texel * 3.230769).rgb * 0.070270;
  outColor = vec4(result, 1.0);
}
`;

  const COMPOSITE_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_sceneTex;
uniform sampler2D u_bloomTex;
uniform float u_bloomStrength;
uniform float u_vignette;

out vec4 outColor;

vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 scene = texture(u_sceneTex, v_uv).rgb;
  vec3 bloom = texture(u_sceneTex, v_uv).rgb * 0.0 + texture(u_bloomTex, v_uv).rgb;

  vec3 hdr = scene + bloom * u_bloomStrength;
  vec3 mapped = acesToneMap(hdr);

  float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  mapped = mix(vec3(luma), mapped, 1.18);
  mapped = clamp(mapped, 0.0, 1.0);

  vec2 centered = v_uv - 0.5;
  float vig = 1.0 - dot(centered, centered) * u_vignette;
  mapped *= clamp(vig, 0.38, 1.0);

  outColor = vec4(mapped, 1.0);
}
`;

  function createProgram(gl, vsSource, fsSource) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(vs);
      gl.deleteShader(vs);
      throw new Error('Vertex shader compile error: ' + info);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error('Fragment shader compile error: ' + info);
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('Shader program link error: ' + info);
    }
    return prog;
  }

  Object.assign(SimuMaratona, {
    SHADOW_VS,
    SHADOW_FS,
    SCENE_VS,
    SCENE_FS,
    STRING_VS,
    STRING_FS,
    PARTICLE_VS,
    PARTICLE_FS,
    VOLUMETRIC_VS,
    VOLUMETRIC_FS,
    POST_VS,
    BLOOM_EXTRACT_FS,
    BLOOM_BLUR_FS,
    COMPOSITE_FS,
    createProgram,
  });
})(window);
