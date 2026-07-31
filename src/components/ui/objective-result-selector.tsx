"use client";

import { Goal } from "lucide-react";
import { useMemo, useState } from "react";

type ObjectiveOption = {
  key: string;
  label: string;
};

type ResultOption = {
  key: string;
  label: string;
  objectiveKeys?: readonly string[];
};

export function ObjectiveResultSelector({
  objective: initialObjective,
  objectives,
  result: initialResult,
  results,
}: {
  objective: string;
  objectives: readonly ObjectiveOption[];
  result?: string;
  results: readonly ResultOption[];
}) {
  const [objective, setObjective] = useState(initialObjective);
  const visibleResults = useMemo(
    () =>
      results.filter(
        (option) =>
          !option.objectiveKeys?.length ||
          option.objectiveKeys.includes(objective),
      ),
    [objective, results],
  );
  const initialResultAvailable = visibleResults.some(
    (option) => option.key === initialResult,
  );
  const [result, setResult] = useState(
    initialResultAvailable ? initialResult : "",
  );

  return (
    <>
      <label className="v2-context-control">
        <Goal aria-hidden="true" size={16} />
        <span className="sr-only">Mục tiêu</span>
        <select
          name="objective"
          value={objective}
          onChange={(event) => {
            const nextObjective = event.currentTarget.value;
            setObjective(nextObjective);
            const nextResults = results.filter(
              (option) =>
                !option.objectiveKeys?.length ||
                option.objectiveKeys.includes(nextObjective),
            );
            if (!nextResults.some((option) => option.key === result)) {
              setResult("");
            }
          }}
        >
          <option value="all">Tất cả mục tiêu</option>
          {objectives.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {objective !== "all" ? (
        <label className="v2-context-control">
          <span className="sr-only">Kết quả chính</span>
          <select
            name="result"
            value={result}
            onChange={(event) => setResult(event.currentTarget.value)}
          >
            <option value="">Kết quả mặc định</option>
            {visibleResults.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
