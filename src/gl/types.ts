type BlendFuncConstant = WebGLRenderingContext["ZERO"] | WebGLRenderingContext["ONE"] | WebGLRenderingContext["SRC_COLOR"] | WebGLRenderingContext["ONE_MINUS_SRC_COLOR"] | WebGLRenderingContext["DST_COLOR"] | WebGLRenderingContext["ONE_MINUS_DST_COLOR"] | WebGLRenderingContext["SRC_ALPHA"] | WebGLRenderingContext["ONE_MINUS_SRC_ALPHA"] | WebGLRenderingContext["DST_ALPHA"] | WebGLRenderingContext["ONE_MINUS_DST_ALPHA"] | WebGLRenderingContext["CONSTANT_COLOR"] | WebGLRenderingContext["ONE_MINUS_CONSTANT_COLOR"] | WebGLRenderingContext["CONSTANT_ALPHA"] | WebGLRenderingContext["ONE_MINUS_CONSTANT_ALPHA"] | WebGLRenderingContext["BLEND_COLOR"];

export type BlendFuncType = [BlendFuncConstant, BlendFuncConstant];

export type BlendEquationType = WebGLRenderingContext["FUNC_ADD"] | WebGLRenderingContext["FUNC_SUBTRACT"] | WebGLRenderingContext["FUNC_REVERSE_SUBTRACT"];

export type ColorMaskType = [boolean, boolean, boolean, boolean];

export type CompareFuncType = WebGLRenderingContext["NEVER"] | WebGLRenderingContext["LESS"] | WebGLRenderingContext["EQUAL"] | WebGLRenderingContext["LEQUAL"] | WebGLRenderingContext["GREATER"] | WebGLRenderingContext["NOTEQUAL"] | WebGLRenderingContext["GEQUAL"] | WebGLRenderingContext["ALWAYS"];

export type DepthMaskType = boolean;

export type DepthRangeType = [number, number];

export type DepthFuncType = CompareFuncType;

export type StencilFuncType = {
  func: CompareFuncType,
  ref: number,
  mask: number
};

export type StencilOpConstant = WebGLRenderingContext["KEEP"] | WebGLRenderingContext["ZERO"] | WebGLRenderingContext["REPLACE"] | WebGLRenderingContext["INCR"] | WebGLRenderingContext["INCR_WRAP"] | WebGLRenderingContext["DECR"] | WebGLRenderingContext["DECR_WRAP"] | WebGLRenderingContext["INVERT"];

export type StencilOpType = [StencilOpConstant, StencilOpConstant, StencilOpConstant];

export type TextureUnitType = number;

export type ViewportType = [number, number, number, number];

export type StencilTest = {
  func: WebGLRenderingContext["NEVER"],
  mask: 0
} | {
  func: WebGLRenderingContext["LESS"],
  mask: number
} | {
  func: WebGLRenderingContext["EQUAL"],
  mask: number
} | {
  func: WebGLRenderingContext["LEQUAL"],
  mask: number
} | {
  func: WebGLRenderingContext["GREATER"],
  mask: number
} | {
  func: WebGLRenderingContext["NOTEQUAL"],
  mask: number
} | {
  func: WebGLRenderingContext["GEQUAL"],
  mask: number
} | {
  func: WebGLRenderingContext["ALWAYS"],
  mask: 0
};

export type CullFaceModeType = WebGLRenderingContext["FRONT"] | WebGLRenderingContext["BACK"] | WebGLRenderingContext["FRONT_AND_BACK"];

export type FrontFaceType = WebGLRenderingContext["CW"] | WebGLRenderingContext["CCW"];
