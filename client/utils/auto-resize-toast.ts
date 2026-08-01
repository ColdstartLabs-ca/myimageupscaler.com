export interface IAutoResizeToastValues extends Record<string, number> {
  resizedWidth: number;
  resizedHeight: number;
}

export interface IResizeDimensionsInput {
  width: number;
  height: number;
}

export interface IProcessingAutoResizeToastValues extends IAutoResizeToastValues {
  scale: number;
  expectedWidth: number;
  expectedHeight: number;
}

export function buildUploadAutoResizeToastValues(
  values: IResizeDimensionsInput
): IAutoResizeToastValues {
  return {
    resizedWidth: values.width,
    resizedHeight: values.height,
  };
}

export function buildProcessingAutoResizeToastValues({
  resizedWidth,
  resizedHeight,
  scale,
}: IAutoResizeToastValues & { scale: number }): IProcessingAutoResizeToastValues {
  return {
    resizedWidth,
    resizedHeight,
    scale,
    expectedWidth: Math.round(resizedWidth * scale),
    expectedHeight: Math.round(resizedHeight * scale),
  };
}
