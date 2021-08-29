export type ControlPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/* eslint-disable no-use-before-define */
export type IControl = {
  onAdd(map: Map): HTMLElement,
  onRemove(map: Map): void,
  readonly getDefaultPosition?: () => ControlPosition
};
