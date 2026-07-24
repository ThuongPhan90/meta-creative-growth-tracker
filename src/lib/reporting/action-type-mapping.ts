const ACTION_TYPE_PATTERN = /^[a-z0-9._]+$/;
const MAX_ACTION_TYPE_LENGTH = 128;
const MAX_ACTION_TYPES_PER_GROUP = 25;

export type ActionTypeMappingErrorCode =
  | "ACTION_TYPE_REQUIRED"
  | "ACTION_TYPE_LIMIT"
  | "ACTION_TYPE_FORMAT"
  | "ACTION_TYPE_MAPPING_CONFLICT";

type NormalizedActionTypeMapping = {
  installActionTypes: string[];
  registrationActionTypes: string[];
};

export type ActionTypeMappingValidation =
  | (NormalizedActionTypeMapping & { ok: true })
  | (NormalizedActionTypeMapping & {
      ok: false;
      code: ActionTypeMappingErrorCode;
      error: string;
    });

export function normalizeActionTypes(
  actionTypes: readonly string[],
): string[] {
  return [
    ...new Set(
      actionTypes.map((actionType) => actionType.trim()).filter(Boolean),
    ),
  ];
}

export function parseActionTypesInput(value: string): string[] {
  return normalizeActionTypes(value.split(","));
}

export function validateActionTypeMapping(input: {
  installActionTypes: readonly string[];
  registrationActionTypes: readonly string[];
}): ActionTypeMappingValidation {
  const installActionTypes = normalizeActionTypes(
    input.installActionTypes,
  );
  const registrationActionTypes = normalizeActionTypes(
    input.registrationActionTypes,
  );
  const normalized = {
    installActionTypes,
    registrationActionTypes,
  };

  if (
    installActionTypes.length === 0 ||
    registrationActionTypes.length === 0
  ) {
    return {
      ...normalized,
      ok: false,
      code: "ACTION_TYPE_REQUIRED",
      error:
        "Install và Registration phải có ít nhất một action type.",
    };
  }

  if (
    installActionTypes.length > MAX_ACTION_TYPES_PER_GROUP ||
    registrationActionTypes.length > MAX_ACTION_TYPES_PER_GROUP
  ) {
    return {
      ...normalized,
      ok: false,
      code: "ACTION_TYPE_LIMIT",
      error:
        "Mỗi nhóm chỉ được có tối đa 25 action type sau khi loại trùng.",
    };
  }

  const invalidActionType = [
    ...installActionTypes,
    ...registrationActionTypes,
  ].find(
    (actionType) =>
      actionType.length > MAX_ACTION_TYPE_LENGTH ||
      !ACTION_TYPE_PATTERN.test(actionType),
  );

  if (invalidActionType) {
    return {
      ...normalized,
      ok: false,
      code: "ACTION_TYPE_FORMAT",
      error:
        `Action type "${invalidActionType}" không hợp lệ. ` +
        "Chỉ dùng tối đa 128 ký tự gồm chữ thường, số, dấu chấm và dấu gạch dưới.",
    };
  }

  const installSet = new Set(installActionTypes);
  const overlappingActionTypes = registrationActionTypes.filter(
    (actionType) => installSet.has(actionType),
  );

  if (overlappingActionTypes.length > 0) {
    return {
      ...normalized,
      ok: false,
      code: "ACTION_TYPE_MAPPING_CONFLICT",
      error:
        `Action type "${overlappingActionTypes.join('", "')}" đang nằm ở cả ` +
        "Install và Registration. Hãy giữ mỗi action type trong đúng một nhóm.",
    };
  }

  return {
    ...normalized,
    ok: true,
  };
}
